(() => {
  'use strict'

  const CORE_VERSION = '1.0.0'
  const INSTALL_ELEMENT = 'peter-install-button'
  const DEFAULT_API_BASE = 'https://api.petertecnet.com.br/api'
  const DEFAULT_TOKEN_KEYS = ['petertecnet_admin_token', 'petertecnet_token', 'token', 'access_token', 'auth_token']
  const DEFAULT_FEATURES = Object.freeze({
    api: false,
    auth: false,
    notifications: false,
    pwa: false,
    telemetry: false,
  })

  if (window.PeterTecnetFrontendCore?.version === CORE_VERSION) return

  const events = new EventTarget()
  const state = {
    config: null,
    installPrompt: null,
    installed: window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true,
  }

  const cleanSlug = value => String(value || '').trim().toLowerCase()
  const trimSlash = value => String(value || '').replace(/\/+$/, '')
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))

  const emit = (name, detail = {}) => {
    const payload = { ...detail, appSlug: state.config?.appSlug || null, coreVersion: CORE_VERSION }
    events.dispatchEvent(new CustomEvent(name, { detail: payload }))
    window.dispatchEvent(new CustomEvent(`peter:frontend-core:${name}`, { detail: payload }))
  }

  const on = (name, listener) => {
    events.addEventListener(name, listener)
    return () => events.removeEventListener(name, listener)
  }

  const isTrustedPeterUrl = value => {
    try {
      const url = new URL(value, window.location.origin)
      const host = url.hostname.toLowerCase()
      const local = host === 'localhost' || host === '127.0.0.1'
      const peter = host === 'petertecnet.com.br' || host.endsWith('.petertecnet.com.br')
      return (url.protocol === 'https:' && peter) || ((url.protocol === 'http:' || url.protocol === 'https:') && local)
    } catch {
      return false
    }
  }

  const requireConfig = () => {
    if (!state.config) throw new Error('Peter Tecnet Frontend Core ainda não foi configurado.')
    return state.config
  }

  const isEnabled = feature => Boolean(state.config?.features?.[feature])

  const tokenKeys = () => {
    const config = state.config?.auth || {}
    return [...new Set([config.tokenKey, ...(config.tokenKeys || []), ...DEFAULT_TOKEN_KEYS].filter(Boolean))]
  }

  const getToken = () => {
    if (!isEnabled('auth')) return null
    for (const key of tokenKeys()) {
      try {
        const value = localStorage.getItem(key)
        if (value) return value
      } catch {}
    }
    return null
  }

  const getUser = () => {
    if (!isEnabled('auth')) return null
    const key = state.config?.auth?.userKey || 'user'
    try {
      return JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  }

  const setSession = ({ accessToken, user, tokenKey, userKey } = {}) => {
    requireConfig()
    if (!isEnabled('auth')) throw new Error('O módulo de autenticação do Frontend Core está desabilitado.')
    if (!accessToken) throw new Error('accessToken é obrigatório para registrar a sessão.')

    const resolvedTokenKey = tokenKey || state.config.auth?.tokenKey || 'token'
    const resolvedUserKey = userKey || state.config.auth?.userKey || 'user'
    localStorage.setItem(resolvedTokenKey, accessToken)
    if (user !== undefined) localStorage.setItem(resolvedUserKey, JSON.stringify(user))
    emit('auth-changed', { authenticated: true, user: user || null })
    window.dispatchEvent(new CustomEvent('peter:auth-changed', { detail: { source: 'frontend-core', user: user || null } }))
    window.dispatchEvent(new Event('authChanged'))
  }

  const clearSession = () => {
    requireConfig()
    if (!isEnabled('auth')) return
    for (const key of tokenKeys()) {
      try { localStorage.removeItem(key) } catch {}
    }
    try { localStorage.removeItem(state.config.auth?.userKey || 'user') } catch {}
    emit('auth-changed', { authenticated: false, user: null })
    window.dispatchEvent(new CustomEvent('peter:auth-changed', { detail: { source: 'frontend-core', user: null } }))
    window.dispatchEvent(new Event('authChanged'))
  }

  const request = async (path, options = {}) => {
    const config = requireConfig()
    if (!isEnabled('api')) throw new Error('O módulo de API do Frontend Core está desabilitado.')

    const apiBaseUrl = trimSlash(config.apiBaseUrl || DEFAULT_API_BASE)
    if (!isTrustedPeterUrl(apiBaseUrl)) throw new Error('apiBaseUrl não pertence a um domínio confiável da Peter Tecnet.')

    const base = new URL(`${apiBaseUrl}/`)
    const target = new URL(String(path || '').replace(/^\/+/, ''), `${apiBaseUrl}/`)
    if (target.origin !== base.origin) throw new Error('Requisição cross-origin bloqueada pelo Frontend Core.')

    const controller = new AbortController()
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || config.api?.timeoutMs || 15000))
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    const externalSignal = options.signal
    const abortFromExternal = () => controller.abort()
    externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true })

    const headers = new Headers(options.headers || {})
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    headers.set('X-Peter-App', config.appSlug)
    headers.set('X-Peter-Frontend-Core', CORE_VERSION)

    const token = getToken()
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

    let body = options.body
    const isPlainObject = body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams)
    if (isPlainObject) {
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      body = JSON.stringify(body)
    }

    const startedAt = performance.now()
    try {
      const response = await fetch(target, {
        ...options,
        body,
        headers,
        signal: controller.signal,
      })
      const contentType = response.headers.get('content-type') || ''
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => '')

      const result = { ok: response.ok, status: response.status, data: payload, response }
      emit('api-response', { method: options.method || 'GET', path: target.pathname, status: response.status, durationMs: Math.round(performance.now() - startedAt) })

      if (!response.ok && options.throwOnError !== false) {
        const error = new Error(payload?.message || payload?.error || `HTTP ${response.status}`)
        error.status = response.status
        error.payload = payload
        throw error
      }
      return result
    } catch (error) {
      emit('api-error', { method: options.method || 'GET', path: target.pathname, message: error?.message || 'Erro de rede', durationMs: Math.round(performance.now() - startedAt) })
      throw error
    } finally {
      window.clearTimeout(timeout)
      externalSignal?.removeEventListener?.('abort', abortFromExternal)
    }
  }

  const isMobile = () => {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches
    const narrow = window.matchMedia?.('(max-width: 900px)')?.matches
    return Boolean(coarse || narrow)
  }

  const pwaState = () => ({
    available: Boolean(state.installPrompt),
    installed: Boolean(state.installed),
    mobile: isMobile(),
  })

  const install = async () => {
    requireConfig()
    if (!isEnabled('pwa')) throw new Error('O módulo PWA do Frontend Core está desabilitado.')
    if (!state.installPrompt) return { outcome: 'unavailable' }

    const prompt = state.installPrompt
    state.installPrompt = null
    await prompt.prompt()
    const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }))
    emit('pwa-install-result', { outcome: choice?.outcome || 'dismissed' })
    emit('pwa-state', pwaState())
    return choice
  }

  const requestNotificationPermission = async () => {
    requireConfig()
    if (!isEnabled('notifications')) throw new Error('O módulo de notificações do Frontend Core está desabilitado.')
    if (!('Notification' in window)) return 'unsupported'
    if (Notification.permission !== 'default') return Notification.permission
    const permission = await Notification.requestPermission()
    emit('notification-permission', { permission })
    return permission
  }

  const track = (type, details = {}) => {
    if (!isEnabled('telemetry')) return false
    if (window.PeterTecnetTelemetry?.track) {
      window.PeterTecnetTelemetry.track(type, {
        ...details,
        metadata: {
          ...(details.metadata || {}),
          frontend_core_version: CORE_VERSION,
          app_slug: state.config?.appSlug || null,
        },
      })
      return true
    }
    emit('telemetry', { type, details })
    return false
  }

  const configure = options => {
    const appSlug = cleanSlug(options?.appSlug)
    if (!appSlug) throw new Error('appSlug é obrigatório para configurar o Peter Tecnet Frontend Core.')

    const apiBaseUrl = trimSlash(options?.apiBaseUrl || DEFAULT_API_BASE)
    if (!isTrustedPeterUrl(apiBaseUrl)) throw new Error('apiBaseUrl não pertence a um domínio confiável da Peter Tecnet.')

    state.config = {
      appSlug,
      apiBaseUrl,
      environment: String(options?.environment || 'production'),
      features: { ...DEFAULT_FEATURES, ...(options?.features || {}) },
      auth: { ...(options?.auth || {}) },
      api: { ...(options?.api || {}) },
      metadata: clone(options?.metadata || {}),
    }

    emit('configured', { config: clone(state.config) })
    emit('pwa-state', pwaState())
    return clone(state.config)
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    state.installPrompt = event
    emit('pwa-state', pwaState())
  })

  window.addEventListener('appinstalled', () => {
    state.installed = true
    state.installPrompt = null
    emit('pwa-state', pwaState())
  })

  class PeterInstallButton extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this.unsubscribe = null
      this.boundResize = () => this.render()
    }

    connectedCallback() {
      this.unsubscribe = on('pwa-state', () => this.render())
      window.addEventListener('resize', this.boundResize)
      this.render()
    }

    disconnectedCallback() {
      this.unsubscribe?.()
      window.removeEventListener('resize', this.boundResize)
    }

    render() {
      const visible = isEnabled('pwa') && pwaState().available && pwaState().mobile && !pwaState().installed
      this.style.display = visible ? 'inline-block' : 'none'
      if (!visible) {
        this.shadowRoot.innerHTML = ''
        return
      }
      const label = this.getAttribute('label') || 'Instalar aplicativo'
      this.shadowRoot.innerHTML = `<style>:host{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button{appearance:none;border:1px solid rgba(148,163,184,.35);border-radius:14px;padding:10px 14px;background:#0f172a;color:#fff;font:inherit;font-weight:700;display:inline-flex;align-items:center;gap:8px;box-shadow:0 10px 28px rgba(15,23,42,.2);cursor:pointer}button:focus-visible{outline:3px solid rgba(59,130,246,.4);outline-offset:2px}</style><button type="button" aria-label="${label.replace(/[&<>\"]/g, '')}"><span aria-hidden="true">⇩</span><span>${label.replace(/[&<>]/g, '')}</span></button>`
      this.shadowRoot.querySelector('button')?.addEventListener('click', () => install().catch(error => emit('pwa-install-error', { message: error?.message || 'Falha ao instalar' })), { once: true })
    }
  }

  const core = {
    version: CORE_VERSION,
    configure,
    getConfig: () => clone(state.config),
    features: { isEnabled },
    events: { on, emit },
    auth: {
      getToken,
      getUser,
      isAuthenticated: () => Boolean(getToken()),
      setSession,
      clearSession,
    },
    api: { request },
    pwa: {
      getState: pwaState,
      canInstall: () => isEnabled('pwa') && pwaState().available && pwaState().mobile && !pwaState().installed,
      install,
    },
    notifications: {
      getPermission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
      requestPermission: requestNotificationPermission,
    },
    telemetry: { track },
  }

  window.PeterTecnetFrontendCore = core
  if (!customElements.get(INSTALL_ELEMENT)) customElements.define(INSTALL_ELEMENT, PeterInstallButton)
  window.dispatchEvent(new CustomEvent('peter:frontend-core:ready', { detail: { version: CORE_VERSION } }))
})()
