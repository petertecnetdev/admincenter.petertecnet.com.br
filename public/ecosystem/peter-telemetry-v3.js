(() => {
  'use strict'

  const VERSION = '3.1.0'
  const SCHEMA = '3'
  const API_FALLBACK = 'https://api.petertecnet.com.br/api'
  const TOKEN_KEYS = ['petertecnet_admin_token', 'petertecnet_token', 'token', 'access_token', 'auth_token']
  const SENSITIVE_KEY = /password|token|secret|cookie|card|cpf|document|authorization|code|credential/i
  const PRIVATE_TEXT = /@|\b\d{8,}\b/

  if (window.PeterTecnetTelemetry?.version === VERSION) return

  const nativeFetch = window.fetch?.bind(window)
  const nativeXhrOpen = window.XMLHttpRequest?.prototype?.open
  const nativeXhrSend = window.XMLHttpRequest?.prototype?.send
  const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const clean = (value, limit = 220) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
  const slug = (value, limit = 100) => clean(value, 180)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, limit)
  const token = () => TOKEN_KEYS.map(key => localStorage.getItem(key)).find(Boolean) || null
  const nowIso = () => new Date().toISOString()
  const page = () => window.location.pathname

  let runtime = null

  function safeUrl(value, relativeForSameOrigin = true) {
    if (!value) return ''
    try {
      const url = new URL(String(value), window.location.origin)
      if (relativeForSameOrigin && url.origin === window.location.origin) return url.pathname
      return `${url.origin}${url.pathname}`
    } catch {
      return clean(String(value).split(/[?#]/, 1)[0], 700)
    }
  }

  function inferAppSlug() {
    const current = document.currentScript
    const explicit = current?.dataset?.appSlug
      || document.querySelector('meta[name="peter-app-slug"]')?.content
      || window.__PETER_APP_SLUG
    if (explicit) return slug(explicit, 80)

    const host = window.location.hostname.toLowerCase()
    if (host === 'petertecnet.com.br' || host === 'www.petertecnet.com.br') return 'petertecnet'
    const suffix = '.petertecnet.com.br'
    if (host.endsWith(suffix)) return slug(host.slice(0, -suffix.length), 80)
    return ''
  }

  function inferApiBase() {
    const current = document.currentScript
    return clean(current?.dataset?.apiBase || window.__PETER_API_BASE || API_FALLBACK, 500).replace(/\/+$/, '')
  }

  function sanitizeMetadata(input = {}) {
    const output = {}
    for (const [key, raw] of Object.entries(input || {})) {
      if (SENSITIVE_KEY.test(key) || raw === undefined || raw === null) continue
      if (typeof raw === 'boolean' || typeof raw === 'number') output[key] = raw
      else if (Array.isArray(raw)) output[key] = raw.slice(0, 20).map(value => clean(value, 120))
      else output[key] = clean(raw, 500)
    }
    return output
  }

  function contextOf(element) {
    const container = element?.closest?.('form,article,section,main,aside,header,[role="dialog"],[data-telemetry-context],.panel,.card')
    if (!container) return ''
    const explicit = container.getAttribute?.('data-telemetry-context') || container.getAttribute?.('aria-label')
    if (explicit) return clean(explicit, 160)
    const heading = container.querySelector?.('h1,h2,h3,h4,[data-telemetry-title]')
    return clean(heading?.textContent || '', 160)
  }

  function labelOf(element) {
    const explicit = element?.dataset?.track
      || element?.getAttribute?.('aria-label')
      || element?.getAttribute?.('title')
      || element?.name
      || element?.id
    if (explicit) return clean(explicit, 180)
    const text = clean(element?.textContent || '', 160)
    if (!text || PRIVATE_TEXT.test(text)) return clean(element?.tagName || 'elemento')
    return text
  }

  function screenName() {
    const explicit = document.querySelector('[data-telemetry-screen]')?.getAttribute('data-telemetry-screen')
    if (explicit) return clean(explicit, 160)
    const heading = document.querySelector('main h1, main h2, [role="main"] h1, [role="main"] h2')
    return clean(heading?.textContent || document.title || page(), 160)
  }

  function pathParts(rawUrl, appSlug) {
    let pathname = safeUrl(rawUrl)
    try { pathname = new URL(String(rawUrl), window.location.origin).pathname } catch {}
    const parts = pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part).toLowerCase())
    return parts.filter(part => ![
      'api', 'v1', 'v2', 'v3', 'apps', appSlug,
    ].includes(part) && !/^\d+$/.test(part) && !/^[0-9a-f-]{24,}$/i.test(part))
  }

  function humanize(value) {
    return clean(String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()), 180)
  }

  function classifyRequest(method, rawUrl, appSlug) {
    const verb = String(method || 'GET').toUpperCase()
    let pathname = safeUrl(rawUrl)
    try { pathname = new URL(String(rawUrl), window.location.origin).pathname } catch {}

    if (/\/interactions\/batch$/.test(pathname)) return null
    if (/\/auth\/login$/.test(pathname)) return { type: 'login_attempt', label: 'Tentativa de login' }
    if (/\/auth\/google$/.test(pathname)) return { type: 'google_login_attempt', label: 'Tentativa de login com Google' }
    if (/\/auth\/logout$/.test(pathname)) return { type: 'logout', label: 'Logout do aplicativo' }
    if (/\/auth\/(me|check-auth)$/.test(pathname)) return { type: 'session_validation', label: 'Validação da sessão' }
    if (/\/auth\/refresh$/.test(pathname)) return { type: 'session_refresh', label: 'Renovação da sessão' }

    const parts = pathParts(rawUrl, appSlug)
    const actionWords = new Set([
      'publish', 'unpublish', 'claim', 'validate', 'checkin', 'check-in', 'follow', 'unfollow',
      'comment', 'like', 'share', 'approve', 'reject', 'accept', 'cancel', 'confirm', 'invite',
      'generate', 'simulate', 'analyze', 'search', 'upload', 'download', 'pay', 'checkout', 'sync',
      'activate', 'deactivate', 'archive', 'restore', 'send', 'resend', 'complete', 'verify', 'forecast',
    ])

    let action = ''
    let resource = parts.at(-1) || 'api'
    if (actionWords.has(resource)) {
      action = resource
      resource = parts.at(-2) || 'resource'
    } else if (parts.length >= 2 && actionWords.has(parts.at(-2))) {
      action = parts.at(-2)
    }

    const resourceKey = slug(resource || 'resource', 50) || 'resource'
    const actionKey = slug(action, 40)
    let type
    let actionLabel

    if (actionKey) {
      type = `${resourceKey}_${actionKey}`.slice(0, 80)
      actionLabel = `${humanize(actionKey)} ${humanize(resourceKey)}`
    } else if (verb === 'GET') {
      type = `${resourceKey}_viewed`.slice(0, 80)
      actionLabel = `Visualização de ${humanize(resourceKey)}`
    } else if (verb === 'POST') {
      type = `${resourceKey}_created`.slice(0, 80)
      actionLabel = `Criação de ${humanize(resourceKey)}`
    } else if (verb === 'PUT' || verb === 'PATCH') {
      type = `${resourceKey}_updated`.slice(0, 80)
      actionLabel = `Atualização de ${humanize(resourceKey)}`
    } else if (verb === 'DELETE') {
      type = `${resourceKey}_deleted`.slice(0, 80)
      actionLabel = `Exclusão de ${humanize(resourceKey)}`
    } else {
      type = 'api_action'
      actionLabel = `${verb} ${humanize(resourceKey)}`
    }

    return { type, label: actionLabel, pathname }
  }

  function start(options = {}) {
    if (runtime) return runtime
    if (window.__peterTelemetryStarted && !window.__peterTelemetryV3Started) return null

    const appSlug = slug(options.appSlug || inferAppSlug(), 80)
    if (!appSlug || !nativeFetch) return null

    const apiBase = clean(options.apiBaseUrl || inferApiBase(), 500).replace(/\/+$/, '')
    const endpoint = `${apiBase}/interactions/batch`
    const sessionKey = `peter_telemetry_session_${appSlug}`
    const sessionId = sessionStorage.getItem(sessionKey) || uid()
    try { sessionStorage.setItem(sessionKey, sessionId) } catch {}

    window.__peterTelemetryStarted = true
    window.__peterTelemetryV3Started = true

    const startedAt = Date.now()
    let screen = ''
    let screenStartedAt = Date.now()
    let lastPath = page()
    let queue = []
    let flushing = false
    let ended = false
    let screenTimer = null
    let inputTimer = null
    let scrollMilestones = new Set()

    function enqueue(type, details = {}) {
      const eventType = slug(type || 'interaction', 80) || 'interaction'
      queue.push({
        id: uid(),
        type: eventType,
        timestamp: nowIso(),
        page: page(),
        label: clean(details.label || eventType, 200),
        target: clean(details.target, 200),
        metadata: sanitizeMetadata(details.metadata),
      })
      if (queue.length >= 20) flush()
    }

    async function flush(force = false) {
      if ((!force && flushing) || !queue.length) return
      if (!force) flushing = true
      const events = queue.splice(0, 50)
      const authToken = token()
      try {
        const response = await nativeFetch(endpoint, {
          method: 'POST',
          keepalive: true,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Peter-App': appSlug,
            'X-App-Slug': appSlug,
            'X-Peter-Telemetry': VERSION,
            'X-Telemetry-Schema': SCHEMA,
            'X-Frontend-Page': safeUrl(window.location.href),
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ session_id: sessionId, events }),
        })
        if (response.status === 429 || response.status >= 500) queue.unshift(...events.slice(-20))
      } catch {
        queue.unshift(...events.slice(-20))
      } finally {
        if (!force) flushing = false
      }
    }

    function detectScreen(source = 'dom') {
      const next = screenName()
      if (!next || next === screen) return
      const timestamp = Date.now()
      enqueue('screen_view', {
        label: next,
        target: slug(next),
        metadata: {
          screen: slug(next),
          previous_screen: slug(screen),
          previous_duration_ms: screen ? timestamp - screenStartedAt : 0,
          source,
        },
      })
      screen = next
      screenStartedAt = timestamp
      scrollMilestones = new Set()
    }

    function scheduleScreen(source = 'dom') {
      clearTimeout(screenTimer)
      screenTimer = setTimeout(() => detectScreen(source), 50)
    }

    function navigation(source) {
      const current = page()
      if (current !== lastPath) {
        enqueue('navigation', { label: current, metadata: { from: lastPath, source } })
        lastPath = current
      }
      scheduleScreen(source)
    }

    function onClick(event) {
      const element = event.target?.closest?.("a,button,[role='button'],[data-track]")
      if (!element || element.closest?.('[data-telemetry-ignore]')) return
      const label = labelOf(element)
      const context = contextOf(element)
      const destination = safeUrl(element.getAttribute?.('href'))
      enqueue('click', {
        label,
        target: destination || element.id || element.name || element.tagName,
        metadata: {
          tag: element.tagName,
          destination,
          context,
          ui_action: slug([context, label].filter(Boolean).join(' ')),
          screen: slug(screen),
        },
      })
      scheduleScreen('click')
    }

    function onSubmit(event) {
      const form = event.target
      if (!form || form.closest?.('[data-telemetry-ignore]')) return
      const context = contextOf(form)
      const identity = form.getAttribute?.('aria-label') || form.name || form.id || context || 'formulario'
      const isSearch = /search|busca|pesquisa/i.test(identity)
      enqueue(isSearch ? 'search' : 'form_submit', {
        label: identity,
        target: safeUrl(form.action) || page(),
        metadata: { method: form.method || 'GET', context, screen: slug(screen) },
      })
    }

    function onChange(event) {
      const element = event.target
      if (!element?.matches?.("select,input[type='checkbox'],input[type='radio'],input[type='range']") || element.closest?.('[data-telemetry-ignore]')) return
      const context = contextOf(element)
      const label = element.getAttribute('aria-label') || element.name || element.id || context || element.type
      const metadata = { control: element.type || element.tagName, context, screen: slug(screen) }
      if (element.matches("input[type='checkbox'],input[type='radio']")) metadata.checked = Boolean(element.checked)
      if (element.matches('select')) metadata.selected_index = element.selectedIndex
      if (element.matches("input[type='range']")) {
        const min = Number(element.min || 0); const max = Number(element.max || 100); const val = Number(element.value || min)
        metadata.range_percent = max > min ? Math.round(((val - min) / (max - min)) * 100) : 0
      }
      enqueue(element.matches('select') ? 'filter' : 'field_change', {
        label,
        target: element.id || element.name || element.tagName,
        metadata,
      })
    }

    function onInput(event) {
      const element = event.target
      if (!element?.matches?.("input[type='search'],input[placeholder*='Buscar' i],input[placeholder*='Pesquisar' i]") || element.closest?.('[data-telemetry-ignore]')) return
      clearTimeout(inputTimer)
      inputTimer = setTimeout(() => enqueue('search_input', {
        label: element.getAttribute('aria-label') || element.placeholder || 'Busca',
        target: element.id || element.name || element.tagName,
        metadata: { context: contextOf(element), query_length: String(element.value || '').length, screen: slug(screen) },
      }), 700)
    }

    function onScroll() {
      const height = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
      const percentage = Math.min(100, Math.round((window.scrollY / height) * 100))
      for (const milestone of [25, 50, 75, 100]) {
        if (percentage >= milestone && !scrollMilestones.has(milestone)) {
          scrollMilestones.add(milestone)
          enqueue('scroll', { label: `${milestone}% da tela`, metadata: { milestone, screen: slug(screen) } })
        }
      }
    }

    function onVisibility() {
      enqueue('visibility_change', {
        label: document.visibilityState === 'visible' ? 'Aplicação em foco' : 'Aplicação em segundo plano',
        metadata: { state: document.visibilityState, screen: slug(screen) },
      })
      if (document.visibilityState === 'hidden') flush(true)
    }

    function onError(event) {
      enqueue('frontend_error', {
        label: event.message || 'Erro JavaScript',
        metadata: { source: safeUrl(event.filename, false), line: event.lineno, column: event.colno, screen: slug(screen), outcome: 'error' },
      })
    }

    function onRejection(event) {
      enqueue('frontend_error', {
        label: event.reason?.message || 'Promise rejeitada',
        metadata: { kind: 'unhandledrejection', screen: slug(screen), outcome: 'error' },
      })
    }

    function recordRequest(method, rawUrl, started, status, outcome) {
      const action = classifyRequest(method, rawUrl, appSlug)
      if (!action) return
      enqueue(action.type, {
        label: action.label,
        target: safeUrl(rawUrl),
        metadata: {
          method: String(method || 'GET').toUpperCase(),
          path: action.pathname || safeUrl(rawUrl),
          status: Number(status || 0),
          outcome,
          duration_ms: Math.max(0, Date.now() - started),
          screen: slug(screen),
        },
      })
    }

    const instrumentedFetch = async (input, init = {}) => {
      const rawUrl = typeof input === 'string' ? input : input?.url
      const method = init?.method || input?.method || 'GET'
      const action = classifyRequest(method, rawUrl, appSlug)
      if (!action) return nativeFetch(input, init)
      const started = Date.now()
      try {
        const response = await nativeFetch(input, init)
        recordRequest(method, rawUrl, started, response.status, response.ok ? 'success' : 'error')
        return response
      } catch (error) {
        recordRequest(method, rawUrl, started, 0, 'error')
        throw error
      }
    }
    window.fetch = instrumentedFetch

    if (nativeXhrOpen && nativeXhrSend) {
      window.XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this.__peterTelemetryRequest = { method, url, started: 0 }
        return nativeXhrOpen.call(this, method, url, ...args)
      }
      window.XMLHttpRequest.prototype.send = function (...args) {
        const info = this.__peterTelemetryRequest
        if (info && classifyRequest(info.method, info.url, appSlug)) {
          info.started = Date.now()
          this.addEventListener('loadend', () => {
            recordRequest(info.method, info.url, info.started || Date.now(), this.status, this.status >= 200 && this.status < 400 ? 'success' : 'error')
          }, { once: true })
        }
        return nativeXhrSend.apply(this, args)
      }
    }

    const originalPush = history.pushState
    const originalReplace = history.replaceState
    history.pushState = function (...args) { const result = originalPush.apply(this, args); queueMicrotask(() => navigation('pushState')); return result }
    history.replaceState = function (...args) { const result = originalReplace.apply(this, args); queueMicrotask(() => navigation('replaceState')); return result }

    const observer = new MutationObserver(() => scheduleScreen('dom'))
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })

    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('change', onChange, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('popstate', () => navigation('popstate'))
    window.addEventListener('hashchange', () => navigation('hashchange'))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('scroll', onScroll, { passive: true })

    function endSession() {
      if (ended) return
      ended = true
      enqueue('session_end', {
        label: 'Sessão encerrada',
        metadata: {
          duration_ms: Date.now() - startedAt,
          last_screen: slug(screen),
          last_screen_duration_ms: Date.now() - screenStartedAt,
        },
      })
      flush(true)
    }
    window.addEventListener('pagehide', endSession)

    enqueue('session_start', {
      label: 'Sessão iniciada',
      metadata: {
        referrer: safeUrl(document.referrer, false),
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        telemetry_schema: SCHEMA,
        telemetry_version: VERSION,
      },
    })
    scheduleScreen('session_start')
    flush()
    const flushTimer = setInterval(flush, 5000)

    runtime = {
      version: VERSION,
      schema: SCHEMA,
      appSlug,
      sessionId,
      track: (type, details = {}) => enqueue(type, details),
      flush: () => flush(true),
      stop: () => {
        clearInterval(flushTimer)
        endSession()
        observer.disconnect()
        window.fetch = nativeFetch
        if (nativeXhrOpen) window.XMLHttpRequest.prototype.open = nativeXhrOpen
        if (nativeXhrSend) window.XMLHttpRequest.prototype.send = nativeXhrSend
        history.pushState = originalPush
        history.replaceState = originalReplace
        runtime = null
        window.__peterTelemetryStarted = false
        window.__peterTelemetryV3Started = false
      },
    }

    return runtime
  }

  window.PeterTecnetTelemetry = {
    version: VERSION,
    schema: SCHEMA,
    start,
    track: (type, details) => runtime?.track(type, details) || false,
    flush: () => runtime?.flush(),
    get runtime() { return runtime },
  }

  const autoStart = () => {
    if (!runtime && !window.__peterTelemetryStarted) start()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoStart, { once: true })
  else setTimeout(autoStart, 0)
})()
