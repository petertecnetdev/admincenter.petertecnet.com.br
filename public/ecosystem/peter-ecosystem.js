(() => {
  'use strict'

  const SDK_VERSION = '2.0.0'
  const TELEMETRY_SCHEMA = '2'
  const ELEMENT_NAME = 'peter-ecosystem-launcher'
  const TOKEN_KEYS = ['petertecnet_admin_token', 'petertecnet_token', 'token', 'access_token', 'auth_token']
  const FAVORITES_KEY = 'peter.ecosystem.favorites.v2'
  const RECENTS_KEY = 'peter.ecosystem.recents.v2'
  const SESSION_ID_KEY = 'peter.ecosystem.session.v2'
  const CACHE_PREFIX = 'peter.ecosystem.cache.v2:'
  const AUTH_SYNC_INTERVAL_MS = 1000

  if (window.PeterTecnetEcosystem?.version === SDK_VERSION && customElements.get(ELEMENT_NAME)) return

  const uid = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  }

  const readJson = (storage, key, fallback) => {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null')
      return value ?? fallback
    } catch {
      return fallback
    }
  }

  const writeJson = (storage, key, value) => {
    try { storage.setItem(key, JSON.stringify(value)) } catch {}
  }

  const getToken = () => TOKEN_KEYS.map(key => localStorage.getItem(key)).find(Boolean) || null
  const messageOf = (payload, fallback) => payload?.message || payload?.error || fallback
  const normalizeSlug = value => String(value || '').trim().toLowerCase()
  const initialsOf = account => `${account?.first_name?.[0] || ''}${account?.last_name?.[0] || ''}`.toUpperCase() || 'PT'
  const appInitial = app => String(app?.name || app?.slug || 'P').slice(0, 1).toUpperCase()

  const safePeterUrl = value => {
    try {
      const url = new URL(value)
      const host = url.hostname.toLowerCase()
      return url.protocol === 'https:' && (host === 'petertecnet.com.br' || host.endsWith('.petertecnet.com.br'))
    } catch {
      return false
    }
  }

  const statusLabel = status => ({
    operational: 'Operacional',
    degraded: 'Instável',
    maintenance: 'Manutenção',
    down: 'Indisponível',
  }[status] || 'Operacional')

  const sessionId = () => {
    let id = sessionStorage.getItem(SESSION_ID_KEY)
    if (!id) {
      id = uid()
      try { sessionStorage.setItem(SESSION_ID_KEY, id) } catch {}
    }
    return id
  }

  class PeterEcosystemLauncher extends HTMLElement {
    static get observedAttributes() { return ['api-base', 'app-slug'] }

    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this.api = ''
      this.slug = ''
      this.token = null
      this.ecosystem = null
      this.cached = false
      this.open = false
      this.loading = false
      this.switching = ''
      this.error = ''
      this.search = ''
      this.abortController = null
      this.intervalId = null
      this.boundSync = () => this.syncSession()
      this.boundDocumentClick = event => this.onDocumentClick(event)
      this.boundKeyDown = event => this.onKeyDown(event)
    }

    connectedCallback() {
      this.configure()
      this.render()
      this.startSessionSync()
      this.handleIncomingHandoff().finally(() => this.syncSession(true))
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
      this.api = String(this.getAttribute('api-base') || 'https://api.petertecnet.com.br/api').replace(/\/+$/, '')
      this.slug = normalizeSlug(this.getAttribute('app-slug'))
    }

    startSessionSync() {
      window.addEventListener('storage', this.boundSync)
      window.addEventListener('authChanged', this.boundSync)
      window.addEventListener('peter:auth-changed', this.boundSync)
      window.addEventListener('focus', this.boundSync)
      window.addEventListener('pageshow', this.boundSync)
      document.addEventListener('mousedown', this.boundDocumentClick)
      document.addEventListener('keydown', this.boundKeyDown)
      this.intervalId = window.setInterval(this.boundSync, AUTH_SYNC_INTERVAL_MS)
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

    async syncSession(force = false) {
      const nextToken = getToken()
      if (!force && nextToken === this.token) return
      this.token = nextToken
      this.error = ''

      if (!this.token) {
        this.ecosystem = null
        this.cached = false
        this.open = false
        this.render()
        return
      }

      await this.loadEcosystem()
    }

    cacheKey() { return `${CACHE_PREFIX}${this.slug || 'unknown'}` }

    cachedEcosystem() {
      const value = readJson(sessionStorage, this.cacheKey(), null)
      return value?.data || null
    }

    saveCache(data) {
      writeJson(sessionStorage, this.cacheKey(), { saved_at: new Date().toISOString(), data })
    }

    async loadEcosystem() {
      if (!this.token || !this.api || !this.slug) return
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
        if (!response.ok || !payload?.data) throw new Error(messageOf(payload, 'Não foi possível carregar o ecossistema Peter Tecnet.'))
        this.ecosystem = payload.data
        this.cached = false
        this.error = ''
        this.saveCache(payload.data)
      } catch (error) {
        if (error?.name === 'AbortError') return
        const cached = this.cachedEcosystem()
        if (cached) {
          this.ecosystem = cached
          this.cached = true
          this.error = 'Mostrando a última configuração disponível. A API será consultada novamente automaticamente.'
        } else {
          this.ecosystem = null
          this.cached = false
          this.error = error?.message || 'Não foi possível carregar as ferramentas.'
        }
        this.telemetry('frontend_error', 'ecosystem_launcher_load_failed', null, { message: this.error })
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
      this.error = ''
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

    accountFallback() {
      return readJson(localStorage, 'user', {}) || {}
    }

    get applications() {
      const source = Array.isArray(this.ecosystem?.applications) ? this.ecosystem.applications : []
      return [...source].sort((a, b) => {
        const order = Number(a.launcher_order || 100) - Number(b.launcher_order || 100)
        return order || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
      })
    }

    favorites() {
      return readJson(localStorage, FAVORITES_KEY, []).filter(Boolean)
    }

    recents() {
      return readJson(localStorage, RECENTS_KEY, []).filter(Boolean)
    }

    toggleFavorite(slug) {
      const current = new Set(this.favorites())
      if (current.has(slug)) current.delete(slug)
      else current.add(slug)
      writeJson(localStorage, FAVORITES_KEY, [...current].slice(0, 20))
      this.telemetry('click', current.has(slug) ? 'ecosystem_favorite_added' : 'ecosystem_favorite_removed', slug)
      this.render()
    }

    rememberRecent(slug) {
      const next = [slug, ...this.recents().filter(item => item !== slug)].slice(0, 8)
      writeJson(localStorage, RECENTS_KEY, next)
    }

    async openApp(application) {
      if (!application || application.slug === this.slug || this.switching) return
      if (!application.has_access) {
        this.error = 'Sua conta ainda não possui acesso a esta ferramenta.'
        this.render()
        return
      }
      if (application.available === false || ['maintenance', 'down'].includes(application.operational_status)) {
        this.error = application.maintenance_message || 'Esta ferramenta está temporariamente indisponível.'
        this.render()
        return
      }
      if (!safePeterUrl(application.url)) {
        this.error = 'O endereço desta ferramenta não está configurado com segurança.'
        this.render()
        return
      }

      const token = getToken() || this.token
      if (!token) return
      this.switching = application.slug
      this.error = ''
      this.telemetry('click', 'ecosystem_app_selected', application.slug, { status: application.operational_status })
      this.render()

      try {
        const response = await fetch(`${this.api}/account/sso/handoff`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Peter-App': this.slug,
            'X-Peter-Ecosystem-SDK': SDK_VERSION,
          },
          body: JSON.stringify({ application: application.slug }),
        })
        const payload = await response.json().catch(() => ({}))
        const code = payload?.data?.handoff_code
        const destination = payload?.data?.application?.url || application.url
        if (!response.ok || !code) throw new Error(messageOf(payload, 'Não foi possível abrir o aplicativo.'))
        if (!safePeterUrl(destination)) throw new Error('O endereço deste aplicativo não está configurado com segurança.')

        this.rememberRecent(application.slug)
        this.telemetry('click', 'ecosystem_handoff_success', application.slug)
        const target = new URL(destination)
        target.searchParams.set('peter_sso', code)
        target.searchParams.set('peter_from', this.slug)
        window.location.assign(target.toString())
      } catch (error) {
        this.switching = ''
        this.error = error?.message || 'Não foi possível trocar de aplicativo.'
        this.telemetry('frontend_error', 'ecosystem_handoff_failed', application.slug, { message: this.error })
        this.render()
      }
    }

    telemetry(type, eventName, targetApp = null, metadata = {}) {
      if (!this.api || !this.slug) return
      const token = getToken() || this.token
      const event = {
        id: uid(),
        type,
        timestamp: new Date().toISOString(),
        page: `${window.location.pathname}${window.location.search}`.slice(0, 1000),
        label: eventName,
        target: targetApp || 'ecosystem-launcher',
        metadata: {
          ecosystem_event: eventName,
          source_app: this.slug,
          target_app: targetApp,
          sdk_version: SDK_VERSION,
          cached_configuration: this.cached,
          ...metadata,
        },
      }

      fetch(`${this.api}/interactions/batch`, {
        method: 'POST',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Peter-App': this.slug,
          'X-Telemetry-Schema': TELEMETRY_SCHEMA,
          'X-Peter-Ecosystem-SDK': SDK_VERSION,
        },
        body: JSON.stringify({ session_id: sessionId(), events: [event] }),
      }).catch(() => {})
    }

    toggleOpen() {
      this.open = !this.open
      if (this.open) {
        this.search = ''
        this.error = this.cached ? this.error : ''
        this.telemetry('click', 'ecosystem_launcher_opened')
        if (!this.ecosystem && this.token) this.loadEcosystem()
      }
      this.render()
    }

    filteredApps() {
      const query = this.search.trim().toLocaleLowerCase('pt-BR')
      if (!query) return this.applications
      return this.applications.filter(app => `${app.name || ''} ${app.slug || ''} ${app.category || ''}`.toLocaleLowerCase('pt-BR').includes(query))
    }

    section(title, apps, favoriteSet) {
      if (!apps.length) return ''
      return `<section class="section"><h3>${this.escape(title)}</h3><div class="grid">${apps.map(app => this.appCard(app, favoriteSet)).join('')}</div></section>`
    }

    appCard(app, favoriteSet) {
      const current = app.slug === this.slug
      const unavailable = app.available === false || ['maintenance', 'down'].includes(app.operational_status)
      const disabled = current || !app.has_access || unavailable
      const status = app.operational_status || 'operational'
      const subtitle = current
        ? 'Atual'
        : !app.has_access
          ? 'Sem acesso'
          : unavailable
            ? statusLabel(status)
            : this.switching === app.slug
              ? 'Abrindo…'
              : app.category || 'Abrir'
      const logo = app.logo && safePeterUrl(app.logo) ? `<img src="${this.attr(app.logo)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : ''
      const fallbackDisplay = logo ? 'none' : 'grid'
      return `<div class="app-card ${current ? 'current' : ''} ${unavailable ? 'unavailable' : ''}" data-app="${this.attr(app.slug)}">
        <button class="app-main" type="button" ${disabled ? 'disabled' : ''} aria-label="${this.attr(current ? `${app.name}, aplicativo atual` : `Abrir ${app.name}`)}">
          <span class="app-mark">${logo}<span class="app-fallback" style="display:${fallbackDisplay}">${this.escape(appInitial(app))}</span><i class="status ${this.attr(status)}" title="${this.attr(statusLabel(status))}"></i></span>
          <strong>${this.escape(app.name)}</strong><small>${this.escape(subtitle)}</small>
        </button>
        ${!current ? `<button class="favorite ${favoriteSet.has(app.slug) ? 'active' : ''}" type="button" aria-label="${favoriteSet.has(app.slug) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" title="Favorito">${favoriteSet.has(app.slug) ? '★' : '☆'}</button>` : ''}
      </div>`
    }

    bind() {
      const root = this.shadowRoot
      root.querySelector('.launcher-button')?.addEventListener('click', () => this.toggleOpen())
      root.querySelector('.retry')?.addEventListener('click', () => this.loadEcosystem())
      const input = root.querySelector('.search')
      if (input) {
        input.addEventListener('input', event => {
          this.search = event.target.value
          this.render()
          queueMicrotask(() => {
            const next = this.shadowRoot.querySelector('.search')
            next?.focus()
            next?.setSelectionRange(this.search.length, this.search.length)
          })
        })
      }
      root.querySelectorAll('.app-card').forEach(card => {
        const slug = card.dataset.app
        const app = this.applications.find(item => item.slug === slug)
        card.querySelector('.app-main')?.addEventListener('click', () => this.openApp(app))
        card.querySelector('.favorite')?.addEventListener('click', event => {
          event.stopPropagation()
          this.toggleFavorite(slug)
        })
      })
    }

    render() {
      if (!this.shadowRoot) return
      if (!this.token) {
        this.shadowRoot.innerHTML = ''
        return
      }

      const account = this.ecosystem?.account || this.accountFallback()
      const favorites = new Set(this.favorites())
      const recentSlugs = this.recents()
      const all = this.filteredApps()
      const searching = Boolean(this.search.trim())
      const favoriteApps = searching ? [] : all.filter(app => favorites.has(app.slug) && app.slug !== this.slug).slice(0, 6)
      const recentApps = searching ? [] : recentSlugs.map(slug => all.find(app => app.slug === slug)).filter(app => app && !favorites.has(app.slug) && app.slug !== this.slug).slice(0, 4)
      const sdkInfo = this.ecosystem?.sdk
      const showSearch = this.applications.length >= 7

      this.shadowRoot.innerHTML = `${this.styles()}
        <div class="launcher">
          <button class="launcher-button" type="button" aria-label="Abrir aplicativos Peter Tecnet" aria-expanded="${this.open}">
            <span class="dots" aria-hidden="true">${'<i></i>'.repeat(9)}</span>
          </button>
          ${this.open ? `<div class="backdrop"></div><div class="panel" role="dialog" aria-label="Ecossistema Peter Tecnet">
            <header class="account"><div class="avatar">${account?.avatar ? `<img src="${this.attr(account.avatar)}" alt="">` : this.escape(initialsOf(account))}</div><div><strong>${this.escape([account?.first_name, account?.last_name].filter(Boolean).join(' ') || account?.user_name || 'Conta Peter Tecnet')}</strong><small>${this.escape(account?.email || '')}</small></div><span class="sdk">SDK ${this.escape(SDK_VERSION)}</span></header>
            ${this.cached ? '<div class="warning">Configuração em cache — reconectando com a API.</div>' : ''}
            ${this.error ? `<div class="error"><span>${this.escape(this.error)}</span><button class="retry" type="button">Tentar novamente</button></div>` : ''}
            ${showSearch ? `<label class="search-wrap"><span>⌕</span><input class="search" type="search" value="${this.attr(this.search)}" placeholder="Buscar ferramenta" aria-label="Buscar ferramenta Peter Tecnet"></label>` : ''}
            <div class="scroll">
              ${this.loading && !this.ecosystem ? '<div class="loading">Carregando ferramentas…</div>' : ''}
              ${this.section('Favoritos', favoriteApps, favorites)}
              ${this.section('Recentes', recentApps, favorites)}
              ${this.section(searching ? 'Resultados' : 'Todos os aplicativos', all, favorites)}
              ${!this.loading && all.length === 0 ? '<div class="empty">Nenhuma ferramenta disponível para esta conta.</div>' : ''}
            </div>
            <footer><a href="https://petertecnet.com.br">Ecossistema Peter Tecnet</a><small>${sdkInfo?.minimum_version ? `Compatibilidade ${this.escape(sdkInfo.minimum_version)}+` : 'Conta unificada'}</small></footer>
          </div>` : ''}
        </div>`
      this.bind()
    }

    renderTransfer(message, failed = false) {
      this.shadowRoot.innerHTML = `${this.styles()}<div class="transfer"><div class="transfer-card"><div class="transfer-mark">P</div><h2>${failed ? 'Não foi possível conectar sua conta' : 'Conta Peter Tecnet'}</h2><p>${this.escape(message)}</p>${failed ? '<a href="/login">Ir para o login</a>' : '<span class="spinner"></span>'}</div></div>`
    }

    escape(value) {
      return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))
    }

    attr(value) { return this.escape(value).replace(/`/g, '&#96;') }

    styles() {
      return `<style>
        :host{--pt-bg:#fff;--pt-text:#0b1830;--pt-muted:#64748b;--pt-border:#dbe5f0;--pt-soft:#f3f7fb;--pt-accent:#0f172a;--pt-shadow:0 24px 70px rgba(2,12,27,.25);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--pt-text)}
        *{box-sizing:border-box}.launcher{position:fixed;right:14px;top:94px;z-index:2147483000}.launcher-button{width:44px;height:44px;border:1px solid var(--pt-border);border-radius:50%;background:var(--pt-bg);box-shadow:0 8px 24px rgba(2,12,27,.18);display:grid;place-items:center;cursor:pointer}.launcher-button:hover{transform:translateY(-1px)}.dots{width:20px;height:20px;display:grid;grid-template-columns:repeat(3,4px);grid-auto-rows:4px;gap:4px}.dots i{width:4px;height:4px;border-radius:50%;background:#34445d}.panel{position:absolute;right:0;top:54px;width:min(360px,calc(100vw - 28px));max-height:min(620px,calc(100vh - 150px));background:var(--pt-bg);border:1px solid var(--pt-border);border-radius:24px;box-shadow:var(--pt-shadow);overflow:hidden;display:flex;flex-direction:column;animation:enter .16s ease-out}.account{display:flex;align-items:center;gap:11px;padding:16px;border-bottom:1px solid var(--pt-border);position:relative}.account>div:nth-child(2){min-width:0;flex:1}.account strong,.account small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account strong{font-size:15px}.account small{font-size:12px;color:var(--pt-muted);margin-top:2px}.avatar{width:42px;height:42px;border-radius:50%;background:#e7f2fb;display:grid;place-items:center;font-weight:800;overflow:hidden;flex:none}.avatar img{width:100%;height:100%;object-fit:cover}.sdk{position:absolute;right:14px;top:9px;font-size:9px;color:#94a3b8}.search-wrap{margin:12px 14px 2px;height:39px;border:1px solid var(--pt-border);border-radius:12px;display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--pt-soft)}.search-wrap span{color:var(--pt-muted);font-size:18px}.search{border:0;outline:0;background:transparent;width:100%;font:inherit;color:var(--pt-text)}.scroll{padding:8px 12px 12px;overflow:auto;overscroll-behavior:contain}.section h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#718096;margin:11px 5px 7px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.app-card{position:relative;border-radius:14px}.app-card.current{background:#eef3f8}.app-card.unavailable{background:#fff8ef}.app-main{width:100%;min-height:94px;border:0;border-radius:14px;background:transparent;padding:9px 4px 7px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;cursor:pointer;color:var(--pt-text)}.app-main:disabled{cursor:default}.app-main:not(:disabled):hover{background:#f4f7fa}.app-mark{width:43px;height:43px;border:1px solid var(--pt-border);border-radius:12px;display:grid;place-items:center;background:white;box-shadow:0 4px 12px rgba(2,12,27,.08);position:relative;margin-bottom:6px;overflow:visible}.app-mark img,.app-fallback{width:100%;height:100%;border-radius:11px;object-fit:contain}.app-fallback{place-items:center;background:#0f172a;color:white;font-weight:800}.app-main strong{max-width:100%;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.app-main small{font-size:9px;color:var(--pt-muted);margin-top:3px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.favorite{position:absolute;right:3px;top:2px;border:0;background:transparent;color:#94a3b8;font-size:16px;cursor:pointer;z-index:2;padding:2px}.favorite.active{color:#c28a00}.status{position:absolute;width:10px;height:10px;border:2px solid white;border-radius:50%;right:-3px;bottom:-3px;background:#16a34a}.status.degraded{background:#f59e0b}.status.maintenance{background:#f97316}.status.down{background:#dc2626}.warning,.error{margin:10px 14px 0;border-radius:10px;padding:9px 10px;font-size:11px;line-height:1.35}.warning{background:#fff7e6;color:#8a5700}.error{background:#fff0f0;color:#a52222;display:flex;gap:8px;align-items:center}.error span{flex:1}.retry{border:0;border-radius:8px;background:#fff;color:#a52222;padding:6px 8px;cursor:pointer;font-weight:700}.loading,.empty{text-align:center;padding:28px 12px;color:var(--pt-muted);font-size:12px}footer{margin:0 14px 14px;border-radius:12px;background:#0f172a;color:#fff;min-height:37px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;gap:10px}footer a{color:#fff;text-decoration:none;font-size:11px;font-weight:700}footer small{font-size:8px;color:#b8c3d4;white-space:nowrap}.backdrop{display:none}.transfer{position:fixed;inset:0;background:#07101f;display:grid;place-items:center;z-index:2147483640;padding:20px}.transfer-card{width:min(420px,100%);background:#fff;border-radius:22px;padding:30px;text-align:center;box-shadow:var(--pt-shadow)}.transfer-mark{width:54px;height:54px;margin:0 auto 15px;border-radius:16px;background:#0f172a;color:#fff;display:grid;place-items:center;font-size:24px;font-weight:800}.transfer-card h2{font-size:20px;margin:0 0 8px}.transfer-card p{color:var(--pt-muted);font-size:13px}.transfer-card a{color:#0f172a;font-weight:700}.spinner{width:26px;height:26px;border:3px solid #d9e2ec;border-top-color:#0f172a;border-radius:50%;display:block;margin:18px auto 0;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes enter{from{opacity:0;transform:translateY(-5px) scale(.98)}to{opacity:1;transform:none}}
        @media(max-width:640px){.launcher{right:12px;top:82px}.launcher-button{width:42px;height:42px}.backdrop{display:block;position:fixed;inset:0;background:rgba(2,12,27,.45);backdrop-filter:blur(2px);z-index:-1}.panel{position:fixed;left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:82vh;border-radius:24px 24px 18px 18px;animation:sheet .2s ease-out}.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.app-main{min-height:96px}.scroll{padding-bottom:16px}@keyframes sheet{from{opacity:.5;transform:translateY(30px)}to{opacity:1;transform:none}}}
        @media(prefers-color-scheme:dark){:host{--pt-bg:#0d1728;--pt-text:#edf5ff;--pt-muted:#93a4ba;--pt-border:#263750;--pt-soft:#142238;--pt-accent:#edf5ff}.launcher-button{background:#f7fbff}.dots i{background:#34445d}.panel{box-shadow:0 25px 80px rgba(0,0,0,.5)}.avatar{background:#1a2b45}.app-card.current{background:#16263d}.app-card.unavailable{background:#2a2118}.app-main:not(:disabled):hover{background:#142238}.app-mark{background:#f7fbff}.warning{background:#2d2618;color:#ffd88a}.error{background:#311c22;color:#ffb5bf}.retry{background:#45232b;color:#ffd4da}}
      </style>`
    }
  }

  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, PeterEcosystemLauncher)

  window.PeterTecnetEcosystem = Object.freeze({
    version: SDK_VERSION,
    telemetrySchema: TELEMETRY_SCHEMA,
    element: ELEMENT_NAME,
  })
})()
