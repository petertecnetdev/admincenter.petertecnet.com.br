(() => {
  'use strict'

  const SDK_VERSION = '3.0.0'
  const ELEMENT_NAME = 'peter-ecosystem-launcher'
  const TOKEN_KEYS = ['petertecnet_admin_token', 'petertecnet_token', 'token', 'access_token', 'auth_token']
  const PUBLIC_CACHE_KEY = 'peter.ecosystem.public-apps.v3'
  const SESSION_ID_KEY = 'peter.ecosystem.session.v3'
  const SYNC_INTERVAL_MS = 1500
  const API_FALLBACK = 'https://api.petertecnet.com.br/api'
  const PORTAL_URL = 'https://petertecnet.com.br'
  const TELEMETRY_VERSION = '3.1.0'
  const TELEMETRY_URL = `${PORTAL_URL}/ecosystem/peter-telemetry-v3.js?v=${TELEMETRY_VERSION}`

  if (window.PeterTecnetEcosystem?.version === SDK_VERSION && customElements.get(ELEMENT_NAME)) return

  const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const readJson = (storage, key, fallback) => {
    try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback } catch { return fallback }
  }
  const writeJson = (storage, key, value) => {
    try { storage.setItem(key, JSON.stringify(value)) } catch {}
  }
  const getToken = () => TOKEN_KEYS.map(key => localStorage.getItem(key)).find(Boolean) || null
  const cleanSlug = value => String(value || '').trim().toLowerCase()
  const messageOf = (payload, fallback) => payload?.message || payload?.error || fallback
  const appInitial = app => String(app?.name || app?.slug || 'P').slice(0, 1).toUpperCase()
  const initialsOf = account => `${account?.first_name?.[0] || ''}${account?.last_name?.[0] || ''}`.toUpperCase() || 'PT'

  const safePeterUrl = value => {
    try {
      const url = new URL(value)
      const host = url.hostname.toLowerCase()
      return url.protocol === 'https:' && (host === 'petertecnet.com.br' || host.endsWith('.petertecnet.com.br'))
    } catch { return false }
  }

  const assetUrl = value => {
    if (!value) return ''
    if (/^https:\/\//i.test(value)) return safePeterUrl(value) ? value : ''
    return `https://api.petertecnet.com.br/${String(value).replace(/^\/+/, '')}`
  }

  const statusLabel = value => ({
    operational: 'Operacional', degraded: 'Instável', maintenance: 'Manutenção', down: 'Indisponível',
  }[value] || 'Operacional')

  const normalizeApp = app => ({
    ...app,
    slug: cleanSlug(app?.slug),
    name: String(app?.name || app?.slug || 'Aplicativo'),
    url: String(app?.url || ''),
    logo: assetUrl(app?.logo),
    launcher_order: Number(app?.launcher_order ?? 100),
    operational_status: String(app?.operational_status || 'operational'),
    has_access: app?.has_access !== false,
    available: app?.available !== false,
  })

  const sortApps = apps => [...apps]
    .filter(app => app?.slug && safePeterUrl(app?.url))
    .map(normalizeApp)
    .sort((a, b) => (a.launcher_order - b.launcher_order) || a.name.localeCompare(b.name, 'pt-BR'))

  const sessionId = () => {
    let id = sessionStorage.getItem(SESSION_ID_KEY)
    if (!id) {
      id = uid()
      try { sessionStorage.setItem(SESSION_ID_KEY, id) } catch {}
    }
    return id
  }

  let telemetryPromise = null

  const startGlobalTelemetry = ({ apiBaseUrl, appSlug }) => {
    const normalizedSlug = cleanSlug(appSlug)
    const api = String(apiBaseUrl || API_FALLBACK).replace(/\/+$/, '')
    if (!normalizedSlug) return Promise.resolve(null)

    const start = () => {
      if (window.PeterTecnetTelemetry?.version !== TELEMETRY_VERSION) return null
      return window.PeterTecnetTelemetry.start({ apiBaseUrl: api, appSlug: normalizedSlug })
    }

    if (window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION) {
      return Promise.resolve(start())
    }
    if (telemetryPromise) return telemetryPromise.then(() => start())

    telemetryPromise = new Promise((resolve, reject) => {
      const ready = () => resolve(start())
      const failed = () => reject(new Error('Não foi possível carregar a telemetria Peter Tecnet.'))
      let existing = Array.from(document.scripts).find(script => script.src?.includes('/ecosystem/peter-telemetry-v3.js'))

      if (existing && window.PeterTecnetTelemetry && window.PeterTecnetTelemetry.version !== TELEMETRY_VERSION) {
        existing.remove()
        existing = null
      }

      if (existing) {
        if (window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION) ready()
        else {
          existing.addEventListener('load', ready, { once: true })
          existing.addEventListener('error', failed, { once: true })
        }
        return
      }

      const script = document.createElement('script')
      script.src = TELEMETRY_URL
      script.async = true
      script.dataset.peterTelemetrySdk = TELEMETRY_VERSION
      script.dataset.appSlug = normalizedSlug
      script.dataset.apiBase = api
      script.addEventListener('load', ready, { once: true })
      script.addEventListener('error', failed, { once: true })
      document.head.appendChild(script)
    }).catch(error => {
      telemetryPromise = null
      console.warn('[Peter Tecnet Telemetry]', error)
      return null
    })

    return telemetryPromise
  }

  class PeterEcosystemLauncher extends HTMLElement {
    static get observedAttributes() { return ['api-base', 'app-slug'] }

    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this.api = API_FALLBACK
      this.slug = ''
      this.token = null
      this.account = null
      this.apps = []
      this.open = false
      this.loading = false
      this.error = ''
      this.search = ''
      this.switching = ''
      this.abortController = null
      this.intervalId = null
      this.boundSync = () => this.syncSession()
      this.boundDocumentClick = event => this.onDocumentClick(event)
      this.boundKeyDown = event => this.onKeyDown(event)
    }

    connectedCallback() {
      this.configure()
      startGlobalTelemetry({ apiBaseUrl: this.api, appSlug: this.slug })
      this.loadCachedPublicApps()
      this.render()
      this.startSessionSync()
      this.handleIncomingHandoff().catch(() => {}).finally(() => this.syncSession(true))
    }

    disconnectedCallback() {
      this.stopSessionSync()
      this.abortController?.abort()
    }

    attributeChangedCallback() {
      if (!this.isConnected) return
      const before = `${this.api}|${this.slug}`
      this.configure()
      if (`${this.api}|${this.slug}` !== before) this.syncSession(true)
    }

    configure() {
      this.api = String(this.getAttribute('api-base') || API_FALLBACK).replace(/\/+$/, '')
      this.slug = cleanSlug(this.getAttribute('app-slug'))
    }

    startSessionSync() {
      window.addEventListener('storage', this.boundSync)
      window.addEventListener('authChanged', this.boundSync)
      window.addEventListener('peter:auth-changed', this.boundSync)
      window.addEventListener('focus', this.boundSync)
      window.addEventListener('pageshow', this.boundSync)
      document.addEventListener('mousedown', this.boundDocumentClick)
      document.addEventListener('keydown', this.boundKeyDown)
      this.intervalId = window.setInterval(this.boundSync, SYNC_INTERVAL_MS)
    }

    stopSessionSync() {
      window.removeEventListener('storage', this.boundSync)
      window.removeEventListener('authChanged', this.boundSync)
      window.removeEventListener('peter:auth-changed', this.boundSync)
      window.removeEventListener('focus', this.boundSync)
      window.removeEventListener('pageshow', this.boundSync)
      document.removeEventListener('mousedown', this.boundDocumentClick)
      document.removeEventListener('keydown', this.boundKeyDown)
      if (this.intervalId) window.clearInterval(this.intervalId)
    }

    onDocumentClick(event) {
      if (!this.open) return
      const path = event.composedPath?.() || []
      if (!path.includes(this)) {
        this.open = false
        this.render()
      }
    }

    onKeyDown(event) {
      if (event.key === 'Escape' && this.open) {
        this.open = false
        this.render()
      }
    }

    loadCachedPublicApps() {
      const cached = readJson(localStorage, PUBLIC_CACHE_KEY, null)
      if (Array.isArray(cached?.applications)) this.apps = sortApps(cached.applications)
    }

    async syncSession(force = false) {
      const nextToken = getToken()
      if (!force && nextToken === this.token) return
      this.token = nextToken
      this.error = ''
      if (this.token) await this.loadEcosystem()
      else {
        this.account = null
        await this.loadPublicApps()
      }
    }

    async loadPublicApps() {
      this.loading = true
      this.abortController?.abort()
      this.abortController = new AbortController()
      this.render()
      try {
        const response = await fetch(`${this.api}/applications`, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'X-Peter-App': this.slug || 'ecosystem' },
          signal: this.abortController.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(messageOf(payload, 'Não foi possível carregar as plataformas.'))
        const applications = Array.isArray(payload) ? payload : (payload?.applications || payload?.data?.applications || [])
        this.apps = sortApps(applications)
        writeJson(localStorage, PUBLIC_CACHE_KEY, { saved_at: new Date().toISOString(), applications: this.apps })
        this.error = ''
      } catch (error) {
        if (error?.name !== 'AbortError') {
          this.error = this.apps.length ? 'Usando a última lista de plataformas disponível.' : (error?.message || 'Não foi possível carregar as plataformas.')
          this.telemetry('frontend_error', 'ecosystem_public_load_failed', null, { message: this.error })
        }
      } finally {
        this.loading = false
        this.render()
      }
    }

    async loadEcosystem() {
      if (!this.token) return this.loadPublicApps()
      this.loading = true
      this.abortController?.abort()
      this.abortController = new AbortController()
      this.render()
      try {
        const response = await fetch(`${this.api}/account/ecosystem`, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.token}`,
            'X-Peter-App': this.slug,
            'X-Peter-Ecosystem-SDK': SDK_VERSION,
          },
          signal: this.abortController.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.data) throw new Error(messageOf(payload, 'Não foi possível carregar o ecossistema da conta.'))
        this.account = payload.data.account || readJson(localStorage, 'user', {}) || null
        this.apps = sortApps(payload.data.applications || [])
        this.error = ''
      } catch (error) {
        if (error?.name === 'AbortError') return
        this.error = error?.message || 'Não foi possível carregar o ecossistema da conta.'
        this.telemetry('frontend_error', 'ecosystem_account_load_failed', null, { message: this.error })
        await this.loadPublicApps()
      } finally {
        this.loading = false
        this.render()
      }
    }

    async handleIncomingHandoff() {
      if (!this.api || !this.slug) return
      const url = new URL(window.location.href)
      const code = url.searchParams.get('peter_sso')
      if (!code) return

      this.loading = true
      this.renderTransfer('Conectando sua Conta Peter Tecnet…')
      try {
        const response = await fetch(`${this.api}/account/sso/exchange`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Peter-App': this.slug,
            'X-Peter-Ecosystem-SDK': SDK_VERSION,
          },
          body: JSON.stringify({ handoff_code: code, application: this.slug }),
        })
        const payload = await response.json().catch(() => ({}))
        const data = payload?.data
        if (!response.ok || !data?.access_token) throw new Error(messageOf(payload, 'Não foi possível concluir o acesso entre aplicativos.'))

        localStorage.setItem('token', data.access_token)
        if (this.slug === 'payflow') localStorage.setItem('petertecnet_token', data.access_token)
        if (this.slug === 'peter-tecnet') localStorage.setItem('petertecnet_admin_token', data.access_token)
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user))
        this.token = data.access_token

        url.searchParams.delete('peter_sso')
        url.searchParams.delete('peter_from')
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
        window.dispatchEvent(new Event('authChanged'))
        window.dispatchEvent(new CustomEvent('peter:auth-changed', { detail: { source: 'ecosystem-sso' } }))
        this.telemetry('click', 'ecosystem_handoff_exchange_success', this.slug)
      } catch (error) {
        this.error = error?.message || 'Código de acesso inválido ou expirado.'
        this.telemetry('frontend_error', 'ecosystem_handoff_exchange_failed', this.slug, { message: this.error })
        this.renderTransfer(this.error, true)
        throw error
      } finally {
        this.loading = false
      }
    }

    async openApp(app) {
      if (!app || app.slug === this.slug || this.switching) return
      const unavailable = app.available === false || ['maintenance', 'down'].includes(app.operational_status)
      if (unavailable) {
        this.error = app.maintenance_message || 'Esta plataforma está temporariamente indisponível.'
        this.render()
        return
      }
      if (!safePeterUrl(app.url)) return

      if (!this.token) {
        this.telemetry('click', 'ecosystem_public_app_selected', app.slug)
        window.location.assign(app.url)
        return
      }

      if (app.has_access === false) {
        this.error = 'Sua conta ainda não possui acesso a esta plataforma.'
        this.render()
        return
      }

      this.switching = app.slug
      this.error = ''
      this.telemetry('click', 'ecosystem_app_selected', app.slug)
      this.render()
      try {
        const response = await fetch(`${this.api}/account/sso/handoff`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
            'X-Peter-App': this.slug,
            'X-Peter-Ecosystem-SDK': SDK_VERSION,
          },
          body: JSON.stringify({ application: app.slug }),
        })
        const payload = await response.json().catch(() => ({}))
        const code = payload?.data?.handoff_code
        const destination = payload?.data?.application?.url || app.url
        if (!response.ok || !code) throw new Error(messageOf(payload, 'Não foi possível abrir a plataforma.'))
        if (!safePeterUrl(destination)) throw new Error('Endereço da plataforma inválido.')
        const target = new URL(destination)
        target.searchParams.set('peter_sso', code)
        target.searchParams.set('peter_from', this.slug)
        this.telemetry('click', 'ecosystem_handoff_success', app.slug)
        window.location.assign(target.toString())
      } catch (error) {
        this.switching = ''
        this.error = error?.message || 'Não foi possível trocar de plataforma.'
        this.telemetry('frontend_error', 'ecosystem_handoff_failed', app.slug, { message: this.error })
        this.render()
      }
    }

    telemetry(type, eventName, targetApp = null, metadata = {}) {
      if (!this.api) return
      const details = {
        label: eventName,
        target: targetApp || 'ecosystem-launcher',
        metadata: {
          ecosystem_event: eventName,
          source_app: this.slug,
          target_app: targetApp,
          sdk_version: SDK_VERSION,
          ...metadata,
        },
      }
      const track = () => {
        if (window.PeterTecnetTelemetry?.version !== TELEMETRY_VERSION) return false
        window.PeterTecnetTelemetry.track(type, details)
        return true
      }
      if (track()) return
      startGlobalTelemetry({ apiBaseUrl: this.api, appSlug: this.slug }).then(() => track()).catch(() => {})
    }

    filteredApps() {
      const query = this.search.trim().toLocaleLowerCase('pt-BR')
      if (!query) return this.apps
      return this.apps.filter(app => `${app.name} ${app.slug} ${app.category || ''}`.toLocaleLowerCase('pt-BR').includes(query))
    }

    toggleOpen() {
      this.open = !this.open
      if (this.open) {
        this.telemetry('click', 'ecosystem_launcher_opened')
        if (!this.apps.length && !this.loading) this.token ? this.loadEcosystem() : this.loadPublicApps()
      }
      this.render()
    }

    appCard(app) {
      const current = app.slug === this.slug
      const unavailable = app.available === false || ['maintenance', 'down'].includes(app.operational_status)
      const noAccess = Boolean(this.token && app.has_access === false)
      const disabled = current || unavailable || noAccess
      const subtitle = current ? 'Atual' : unavailable ? statusLabel(app.operational_status) : noAccess ? 'Sem acesso' : this.switching === app.slug ? 'Abrindo…' : (app.category || 'Abrir')
      const logo = app.logo ? `<img src="${this.attr(app.logo)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : ''
      return `<button class="app ${current ? 'current' : ''} ${unavailable ? 'unavailable' : ''}" data-app="${this.attr(app.slug)}" type="button" ${disabled ? 'disabled' : ''} aria-label="${this.attr(current ? `${app.name}, plataforma atual` : `Abrir ${app.name}`)}">
        <span class="mark">${logo}<span class="fallback" style="display:${logo ? 'none' : 'grid'}">${this.escape(appInitial(app))}</span><i class="status ${this.attr(app.operational_status)}"></i></span>
        <strong>${this.escape(app.name)}</strong><small>${this.escape(subtitle)}</small>
      </button>`
    }

    bind() {
      const root = this.shadowRoot
      root.querySelector('.launcher-button')?.addEventListener('click', () => this.toggleOpen())
      root.querySelector('.refresh')?.addEventListener('click', () => this.token ? this.loadEcosystem() : this.loadPublicApps())
      const input = root.querySelector('.search')
      input?.addEventListener('input', event => {
        this.search = event.target.value
        this.render()
        queueMicrotask(() => this.shadowRoot.querySelector('.search')?.focus())
      })
      root.querySelectorAll('.app').forEach(button => {
        const app = this.apps.find(item => item.slug === button.dataset.app)
        button.addEventListener('click', () => this.openApp(app))
      })
    }

    render() {
      if (!this.shadowRoot) return
      const apps = this.filteredApps()
      const account = this.account || readJson(localStorage, 'user', {}) || {}
      const authenticated = Boolean(this.token)
      const showSearch = this.apps.length >= 7

      this.shadowRoot.innerHTML = `${this.styles()}
        <div class="launcher">
          <button class="launcher-button" type="button" aria-label="Navegar pelo ecossistema Peter Tecnet" aria-expanded="${this.open}" title="Ecossistema Peter Tecnet">
            <span class="dots" aria-hidden="true">${'<i></i>'.repeat(9)}</span>
          </button>
          ${this.open ? `<div class="panel" role="dialog" aria-label="Ecossistema Peter Tecnet">
            <header class="account">
              <div class="avatar">${authenticated && account?.avatar ? `<img src="${this.attr(account.avatar)}" alt="">` : authenticated ? this.escape(initialsOf(account)) : 'PT'}</div>
              <div class="identity"><strong>${authenticated ? this.escape([account?.first_name, account?.last_name].filter(Boolean).join(' ') || account?.user_name || 'Conta Peter Tecnet') : 'Ecossistema Peter Tecnet'}</strong><small>${authenticated ? this.escape(account?.email || 'Conta conectada') : 'Navegue entre nossas plataformas'}</small></div>
              <span class="sdk">v${SDK_VERSION}</span>
            </header>
            ${this.error ? `<div class="notice"><span>${this.escape(this.error)}</span><button class="refresh" type="button">Atualizar</button></div>` : ''}
            ${showSearch ? `<label class="search-wrap"><span>⌕</span><input class="search" type="search" value="${this.attr(this.search)}" placeholder="Buscar plataforma" aria-label="Buscar plataforma"></label>` : ''}
            <div class="scroll">
              ${this.loading && !this.apps.length ? '<div class="empty">Carregando plataformas…</div>' : ''}
              <div class="grid">${apps.map(app => this.appCard(app)).join('')}</div>
              ${!this.loading && !apps.length ? '<div class="empty">Nenhuma plataforma disponível agora.</div>' : ''}
            </div>
            <footer>
              <a href="${PORTAL_URL}">Peter Tecnet</a>
              <small>${authenticated ? 'Conta unificada · SSO' : 'Acesso público ao ecossistema'}</small>
            </footer>
          </div>` : ''}
        </div>`
      this.bind()
    }

    renderTransfer(message, failed = false) {
      this.shadowRoot.innerHTML = `${this.styles()}<div class="transfer"><div class="transfer-card"><div class="transfer-mark">PT</div><h2>${failed ? 'Não foi possível conectar sua conta' : 'Conta Peter Tecnet'}</h2><p>${this.escape(message)}</p>${failed ? `<a href="${PORTAL_URL}">Ir para Peter Tecnet</a>` : '<span class="spinner"></span>'}</div></div>`
    }

    escape(value) {
      return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))
    }
    attr(value) { return this.escape(value).replace(/`/g, '&#96;') }

    styles() {
      return `<style>
        :host{--pt-bg:#fff;--pt-text:#0b1830;--pt-muted:#64748b;--pt-border:#dbe5f0;--pt-soft:#f3f7fb;--pt-shadow:0 24px 70px rgba(2,12,27,.25);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--pt-text)}
        *{box-sizing:border-box}.launcher{position:fixed;right:max(14px,env(safe-area-inset-right));top:max(76px,calc(env(safe-area-inset-top) + 64px));z-index:2147483000}.launcher-button{width:46px;height:46px;border:1px solid var(--pt-border);border-radius:50%;background:rgba(255,255,255,.96);box-shadow:0 10px 30px rgba(2,12,27,.2);display:grid;place-items:center;cursor:pointer;backdrop-filter:blur(12px);transition:transform .15s ease,box-shadow .15s ease}.launcher-button:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(2,12,27,.25)}.dots{width:20px;height:20px;display:grid;grid-template-columns:repeat(3,4px);grid-auto-rows:4px;gap:4px}.dots i{width:4px;height:4px;border-radius:50%;background:#24364e}.panel{position:absolute;right:0;top:56px;width:min(370px,calc(100vw - 24px));max-height:min(640px,calc(100vh - 145px));background:var(--pt-bg);border:1px solid var(--pt-border);border-radius:24px;box-shadow:var(--pt-shadow);overflow:hidden;display:flex;flex-direction:column;animation:enter .16s ease-out}.account{display:flex;align-items:center;gap:11px;padding:16px;border-bottom:1px solid var(--pt-border);position:relative}.identity{min-width:0;flex:1}.identity strong,.identity small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.identity strong{font-size:15px}.identity small{font-size:12px;color:var(--pt-muted);margin-top:2px}.avatar{width:42px;height:42px;border-radius:14px;background:#0f172a;color:white;display:grid;place-items:center;font-weight:800;overflow:hidden;flex:none;font-size:12px}.avatar img{width:100%;height:100%;object-fit:cover}.sdk{position:absolute;right:13px;top:8px;font-size:9px;color:#94a3b8}.notice{margin:10px 14px 0;border-radius:11px;padding:9px 10px;font-size:11px;line-height:1.35;background:#fff7e6;color:#835400;display:flex;align-items:center;gap:8px}.notice span{flex:1}.refresh{border:0;border-radius:8px;background:#fff;color:#835400;padding:6px 8px;cursor:pointer;font-weight:700}.search-wrap{margin:12px 14px 2px;height:39px;border:1px solid var(--pt-border);border-radius:12px;display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--pt-soft)}.search-wrap span{color:var(--pt-muted);font-size:18px}.search{border:0;outline:0;background:transparent;width:100%;font:inherit;color:var(--pt-text)}.scroll{padding:12px;overflow:auto;overscroll-behavior:contain}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.app{min-width:0;min-height:100px;border:0;border-radius:15px;background:transparent;padding:9px 4px 8px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;cursor:pointer;color:var(--pt-text)}.app:not(:disabled):hover{background:#f4f7fa}.app:disabled{cursor:default}.app.current{background:#eef3f8}.app.unavailable{background:#fff8ef}.mark{width:46px;height:46px;border:1px solid var(--pt-border);border-radius:13px;display:grid;place-items:center;background:white;box-shadow:0 4px 12px rgba(2,12,27,.08);position:relative;margin-bottom:7px}.mark img,.fallback{width:100%;height:100%;border-radius:12px;object-fit:contain}.fallback{place-items:center;background:#0f172a;color:white;font-weight:800}.status{position:absolute;width:10px;height:10px;border:2px solid white;border-radius:50%;right:-3px;bottom:-3px;background:#16a34a}.status.degraded{background:#f59e0b}.status.maintenance{background:#f97316}.status.down{background:#dc2626}.app strong{max-width:100%;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.app small{font-size:9px;color:var(--pt-muted);margin-top:3px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.empty{text-align:center;padding:28px 12px;color:var(--pt-muted);font-size:12px}footer{margin:0 14px 14px;border-radius:12px;background:#0f172a;color:#fff;min-height:39px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;gap:10px}footer a{color:#fff;text-decoration:none;font-size:11px;font-weight:800}footer small{font-size:8px;color:#b8c3d4;white-space:nowrap}.transfer{position:fixed;inset:0;background:#07101f;display:grid;place-items:center;z-index:2147483640;padding:20px}.transfer-card{width:min(420px,100%);background:#fff;border-radius:22px;padding:30px;text-align:center;box-shadow:var(--pt-shadow)}.transfer-mark{width:58px;height:58px;margin:0 auto 15px;border-radius:18px;background:#0f172a;color:#fff;display:grid;place-items:center;font-size:18px;font-weight:900}.transfer-card h2{font-size:20px;margin:0 0 8px}.transfer-card p{color:var(--pt-muted);font-size:13px}.transfer-card a{color:#0f172a;font-weight:700}.spinner{width:26px;height:26px;border:3px solid #d9e2ec;border-top-color:#0f172a;border-radius:50%;display:block;margin:18px auto 0;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes enter{from{opacity:0;transform:translateY(-5px) scale(.985)}to{opacity:1;transform:none}}
        @media(max-width:600px){.launcher{top:auto;right:max(12px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom))}.panel{position:fixed;left:12px;right:12px;top:auto;bottom:76px;width:auto;max-height:min(72vh,620px);border-radius:22px}.launcher-button{width:50px;height:50px}.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(prefers-reduced-motion:reduce){.launcher-button,.panel{animation:none;transition:none}}
      </style>`
    }
  }

  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, PeterEcosystemLauncher)
  window.PeterTecnetEcosystem = Object.freeze({ version: SDK_VERSION, element: ELEMENT_NAME })
})()