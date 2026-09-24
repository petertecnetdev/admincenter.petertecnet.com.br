import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminModuleBoundary from './AdminModuleBoundary.jsx'
import AdminProcessingIndicator from './AdminProcessingIndicator.jsx'
import { connectMissionControlRealtime } from './missionControlRealtime.js'
import { loadGoogleIdentity } from './services/googleIdentity.js'
import { adminRequest as request } from './adminApi.js'
import { useDialogFocus } from './useDialogFocus.js'

const NotificationsCenter = lazy(() => import('./NotificationsCenter.jsx'))
const AdminUsersCenter = lazy(() => import('./AdminUsersCenter.jsx'))
const AdminPayoutCenter = lazy(() => import('./AdminPayoutCenter.jsx'))
const AgentChatPanel = lazy(() => import('./AgentChatPanel.jsx'))
const AdminEstablishmentsPage = lazy(() => import('./AdminEstablishmentsPageV2.jsx'))
const AdminItemsManager = lazy(() => import('./AdminItemsManager.jsx'))
const AdminApplicationsCenter = lazy(() => import('./AdminApplicationsCenter.jsx'))
const ImportantEventsCenter = lazy(() => import('./ImportantEventsCenter.jsx'))

const TOKEN_KEY = 'petertecnet_admin_token'
const OWNER_EMAIL = 'petertecnet@gmail.com'

const navItems = [
  ['users', 'Usuários', 'users'],
  ['operations', 'Operações', 'pulse'],
  ['agents', 'Agentes', 'agents'],
  ['financial', 'Financeiro', 'finance'],
  ['applications', 'Aplicações', 'apps'],
  ['establishments', 'Estabelecimentos', 'building'],
  ['items', 'Itens', 'items'],
  ['notifications', 'Notificações', 'bell'],
  ['activity', 'Atividade', 'activity'],
]

const PAGE_CONFIG = {
  dashboard: { slug: 'visao-geral', label: 'Visão geral' },
  operations: { slug: 'operacoes', label: 'Operações' },
  agents: { slug: 'agentes', label: 'Agentes' },
  financial: { slug: 'financeiro', label: 'Financeiro' },
  applications: { slug: 'aplicacoes', label: 'Aplicações' },
  users: { slug: 'usuarios', label: 'Usuários' },
  establishments: { slug: 'estabelecimentos', label: 'Estabelecimentos' },
  items: { slug: 'itens', label: 'Itens' },
  notifications: { slug: 'notificacoes', label: 'Notificações' },
  activity: { slug: 'atividade', label: 'Atividade' },
}

const PAGE_FROM_SLUG = Object.fromEntries(Object.entries(PAGE_CONFIG).flatMap(([key, config]) => [[key, key], [config.slug, key]]))
const BACKGROUND_REFRESH_PAGES = new Set(['dashboard', 'operations', 'financial', 'applications', 'activity'])
const BACKGROUND_REFRESH_MS = 120000
const SIDEBAR_PREF_KEY = 'petertecnet_admin_sidebar_open'
const DENSITY_PREF_KEY = 'petertecnet_admin_density'
const RECENT_PAGES_KEY = 'petertecnet_admin_recent_pages'
const FAVORITE_PAGES_KEY = 'petertecnet_admin_favorite_pages'
const DASHBOARD_WIDGETS_KEY = 'petertecnet_admin_dashboard_widgets'
const DEFAULT_DASHBOARD_WIDGETS = ['gross', 'platform', 'active-today', 'interactions-30d', 'applications', 'payments-attention']

function desktopNavigation() {
  return window.matchMedia('(min-width: 981px)').matches
}

function pageFromLocation() {
  const url = new URL(window.location.href)
  const queryToken = String(url.searchParams.get('page') || '').trim().toLowerCase()
  const pathToken = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '').trim().toLowerCase()
  const hashToken = decodeURIComponent(url.hash.replace(/^#/, '')).trim().toLowerCase()
  const requestedPage = PAGE_FROM_SLUG[queryToken] || PAGE_FROM_SLUG[pathToken] || PAGE_FROM_SLUG[hashToken]
  return !requestedPage || requestedPage === 'dashboard' ? 'users' : requestedPage
}

function writePageHistory(page, mode = 'pushState') {
  const url = new URL(window.location.href)
  const config = PAGE_CONFIG[page] || PAGE_CONFIG.users
  if (page === 'users') url.searchParams.delete('page')
  else url.searchParams.set('page', config.slug)
  url.hash = ''
  window.history[mode]({ ...(window.history.state || {}), adminPage: page }, '', `${url.pathname}${url.search}`)
}

function AdminIcon({ name }) {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5z"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    agents: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.5-4 2.7-6 5.5-6s5 2 5.5 6M14 15c3.2-.8 5.7 1.2 6.5 4"/>',
    finance: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    apps: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c.7-4 2.8-6 6-6s5.3 2 6 6M16 5.5a3 3 0 0 1 0 5.8M17 14c2.5.3 4 2.1 4 5"/>',
    building: '<path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M18 13h1"/>',
    items: '<path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    activity: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: paths[name] || paths.home }} />
}

const groupLabels = {
  users: 'Usuários', applications: 'Aplicações', establishments: 'Estabelecimentos',
  items: 'Itens', events: 'Eventos', orders: 'Pedidos', payments: 'Pagamentos',
}

function tokenFrom(payload) {
  return payload?.token?.access_token || payload?.access_token || payload?.token || ''
}

function userFrom(payload) {
  return payload?.token?.user || payload?.user || null
}

function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || 'Usuário'
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function compactNumber(value) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value))
}

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(number(value))
}

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function Login({ onAuthenticated }) {
  const [form, setForm] = useState({ email: OWNER_EMAIL, password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryAfter, setRetryAfter] = useState(0)
  const [googleStatus, setGoogleStatus] = useState('loading')
  const submittingRef = useRef(false)
  const googleBusyRef = useRef(false)
  const googleButtonRef = useRef(null)

  useEffect(() => {
    if (retryAfter <= 0) return undefined
    const timer = window.setTimeout(() => {
      setRetryAfter(current => {
        if (current <= 1) {
          setError(message => message.startsWith('Muitas tentativas') ? '' : message)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [retryAfter])

  const completeAuthentication = useCallback((payload) => {
    const token = tokenFrom(payload)
    const user = userFrom(payload)
    if (!token) throw new Error('A API não retornou uma sessão válida.')
    if (String(user?.email || '').toLowerCase() !== OWNER_EMAIL) throw new Error('Usuário sem acesso ao Admin Center.')
    localStorage.setItem(TOKEN_KEY, token)
    onAuthenticated(user)
  }, [onAuthenticated])

  useEffect(() => {
    let active = true

    async function bootGoogle() {
      try {
        const providers = await request('/account/identity/providers')
        const clientId = String(providers?.google?.client_id || '').trim()
        if (!providers?.google?.enabled || !clientId) {
          if (active) setGoogleStatus('unavailable')
          return
        }

        const identity = await loadGoogleIdentity()
        if (!active || !googleButtonRef.current) return

        identity.initialize({
          client_id: clientId,
          cancel_on_tap_outside: false,
          callback: async ({ credential }) => {
            if (!credential || googleBusyRef.current || submittingRef.current) return
            googleBusyRef.current = true
            setLoading(true)
            setError('')
            try {
              const payload = await request('/auth/google', {
                method: 'POST',
                body: JSON.stringify({ token_id: credential }),
              })
              if (!active) return
              completeAuthentication(payload)
            } catch (err) {
              localStorage.removeItem(TOKEN_KEY)
              if (active) setError(err?.message || 'Não foi possível entrar com o Google.')
            } finally {
              googleBusyRef.current = false
              if (active) setLoading(false)
            }
          },
        })

        googleButtonRef.current.replaceChildren()
        const buttonWidth = Math.max(220, Math.min(346, Math.floor(googleButtonRef.current.getBoundingClientRect().width || 346)))
        identity.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: buttonWidth,
          locale: 'pt-BR',
        })
        if (active) setGoogleStatus('ready')
      } catch {
        if (active) setGoogleStatus('unavailable')
      }
    }

    void bootGoogle()
    return () => { active = false }
  }, [completeAuthentication])

  async function submit(event) {
    event.preventDefault()
    if (submittingRef.current || loading || retryAfter > 0) return
    setError('')
    if (form.email.trim().toLowerCase() !== OWNER_EMAIL) {
      setError('Este Admin Center é restrito ao administrador da Peter Tecnet.')
      return
    }
    submittingRef.current = true
    setLoading(true)
    try {
      const payload = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.email.trim().toLowerCase(), password: form.password }),
      })
      completeAuthentication(payload)
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY)
      if (err?.status === 429) {
        const seconds = Math.max(1, Number(err.retryAfter) || 60)
        setRetryAfter(seconds)
        setError('Muitas tentativas de acesso. Aguarde antes de tentar novamente.')
      } else {
        setError(err.message)
      }
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  return <main className="login-screen">
    <div className="login-aura aura-one"/><div className="login-aura aura-two"/>
    <section className="login-copy">
      <a className="brand brand-large" href="https://petertecnet.com.br/" target="_blank" rel="noreferrer">
        <span className="brand-logo"><img src="/petertecnet-brand.svg" alt=""/></span>
        <span><b>Peter Tecnet</b><small>Admin Center</small></span>
      </a>
      <div>
        <p className="eyebrow">ECOSYSTEM CONTROL / PRIVATE</p>
        <h1>Gestão do ecossistema em uma única visão.</h1>
        <p>Operações, receita, usuários, aplicações e sinais críticos conectados à API central da Peter Tecnet.</p>
      </div>
      <small className="login-security">Sessão autenticada pela API Peter Tecnet · acesso administrativo restrito</small>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark"><img src="/petertecnet-brand.svg" alt="Peter Tecnet"/></div>
        <p className="eyebrow">ADMIN CENTER</p>
        <h2>Entrar</h2>
        <p className="muted">Entre com a conta Google da Peter Tecnet ou use sua senha administrativa.</p>
        {googleStatus !== 'unavailable' && <div className={`admin-google-login status-${googleStatus}`}>
          <div ref={googleButtonRef}/>
          {googleStatus === 'loading' && <AdminProcessingIndicator
            title="Preparando acesso Google"
            messages="Inicializando autenticação segura…|Conectando ao Google…|Preparando o acesso administrativo…"
            detail="Aguarde enquanto o provedor de identidade é carregado."
          />}
        </div>}
        {googleStatus === 'ready' && <div className="login-divider"><span>ou use sua senha</span></div>}
        <label>E-mail<input type="email" autoComplete="username" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required/></label>
        <label>Senha<input type="password" autoComplete="current-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required autoFocus/></label>
        {error && <div className="form-error" role="alert">{error}{retryAfter > 0 ? ` Tente novamente em ${retryAfter}s.` : ''}</div>}
        <button className="primary-button" disabled={loading || retryAfter > 0}>{loading ? 'Autenticando…' : retryAfter > 0 ? `Aguarde ${retryAfter}s` : 'Acessar dashboard'}<span>↗</span></button>
      </form>
    </section>
  </main>
}

function MetricCard({ label, value, detail, trend, tone = 'neutral' }) {
  return <article className={`metric-card tone-${tone}`}>
    <div className="metric-head"><span>{label}</span>{trend && <small>{trend}</small>}</div>
    <strong>{value}</strong>
    <p>{detail}</p>
  </article>
}

function LineChart({ rows = [], valueKey = 'gross', labelKey = 'day', formatter = compactNumber }) {
  const values = rows.map(row => number(row?.[valueKey]))
  const max = Math.max(...values, 1)
  const points = rows.map((row, index) => {
    const x = rows.length <= 1 ? 50 : (index / (rows.length - 1)) * 100
    const y = 92 - (number(row?.[valueKey]) / max) * 78
    return `${x},${y}`
  }).join(' ')
  return <div className="line-chart">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="25" x2="100" y2="25"/><line x1="0" y1="50" x2="100" y2="50"/><line x1="0" y1="75" x2="100" y2="75"/>
      {points && <><polyline className="chart-area" points={`0,100 ${points} 100,100`}/><polyline className="chart-line" points={points}/></>}
    </svg>
    <div className="chart-labels">
      {rows.length ? <><span>{String(rows[0]?.[labelKey] || '').slice(5)}</span><b>{formatter(max)}</b><span>{String(rows.at(-1)?.[labelKey] || '').slice(5)}</span></> : <span>Sem dados no período</span>}
    </div>
  </div>
}

function Bars({ rows = [] }) {
  const normalized = rows.slice(0, 7).map(row => ({
    label: row.name || row.application_name || row.app_slug || 'Aplicação',
    value: number(row.activity_count_30d ?? row.users_count ?? row.gross ?? row.transactions),
  }))
  const max = Math.max(...normalized.map(row => row.value), 1)
  return <div className="bars">
    {normalized.length ? normalized.map(row => <div className="bar-row" key={row.label}>
      <div><span>{row.label}</span><b>{compactNumber(row.value)}</b></div>
      <i><span style={{ width: `${Math.max((row.value / max) * 100, row.value ? 5 : 0)}%` }}/></i>
    </div>) : <Empty text="Sem dados de engajamento ainda."/>}
  </div>
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return <article className={`panel ${className}`}>
    <header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</header>
    {children}
  </article>
}

function Empty({ text = 'Nenhum dado disponível.' }) {
  return <div className="empty-state">{text}</div>
}

function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (['critical', 'down', 'failed', 'error', 'unhealthy'].some(key => value.includes(key))) return 'danger'
  if (['warning', 'degraded', 'pending', 'attention'].some(key => value.includes(key))) return 'warning'
  return 'success'
}

function Dashboard({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => desktopNavigation() ? localStorage.getItem(SIDEBAR_PREF_KEY) !== 'false' : false)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [widgetPrefsOpen, setWidgetPrefsOpen] = useState(false)
  const [widgetPrefs, setWidgetPrefs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DASHBOARD_WIDGETS_KEY) || '{}')
      const order = Array.isArray(saved.order) ? saved.order.filter(id => DEFAULT_DASHBOARD_WIDGETS.includes(id)) : []
      const missing = DEFAULT_DASHBOARD_WIDGETS.filter(id => !order.includes(id))
      return { order: [...order, ...missing], hidden: Array.isArray(saved.hidden) ? saved.hidden.filter(id => DEFAULT_DASHBOARD_WIDGETS.includes(id)) : [] }
    } catch {
      return { order: [...DEFAULT_DASHBOARD_WIDGETS], hidden: [] }
    }
  })
  const [dashboard, setDashboard] = useState(null)
  const [activity, setActivity] = useState(null)
  const [financial, setFinancial] = useState(null)
  const [command, setCommand] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem(DENSITY_PREF_KEY) === 'compact')
  const [quickCreate, setQuickCreate] = useState({ target: '', token: 0 })
  const [favoritePages, setFavoritePages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITE_PAGES_KEY) || '[]').filter(page => PAGE_CONFIG[page]) }
    catch { return [] }
  })
  const [recentPages, setRecentPages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_PAGES_KEY) || '[]') }
    catch { return [] }
  })
  const [activePage, setActivePage] = useState(pageFromLocation)
  const [realtimeState, setRealtimeState] = useState('connecting')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [apiStorm, setApiStorm] = useState(null)
  const [lastRefreshAt, setLastRefreshAt] = useState(null)
  const searchTimer = useRef(null)
  const searchSequenceRef = useRef(0)
  const refreshTimerRef = useRef(null)
  const refreshInFlightRef = useRef(false)
  const refreshSequenceRef = useRef(0)
  const dashboardLoadedOnceRef = useRef(false)
  const payloadFingerprintRef = useRef(new Map())
  const pendingRefreshModulesRef = useRef(new Set())
  const activePageRef = useRef(activePage)
  const sidebarRef = useRef(null)
  const menuButtonRef = useRef(null)
  const searchWrapRef = useRef(null)
  const launcherWrapRef = useRef(null)
  const sidebarWasOpenRef = useRef(false)

  useEffect(() => { activePageRef.current = activePage }, [activePage])

  useEffect(() => {
    setRecentPages(current => {
      const next = [activePage, ...current.filter(page => page !== activePage && PAGE_CONFIG[page])].slice(0, 5)
      try { localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [activePage])

  useEffect(() => {
    try { localStorage.setItem(DENSITY_PREF_KEY, compactMode ? 'compact' : 'comfortable') } catch {}
  }, [compactMode])

  useEffect(() => {
    try { localStorage.setItem(FAVORITE_PAGES_KEY, JSON.stringify(favoritePages)) } catch {}
  }, [favoritePages])

  useEffect(() => {
    try { localStorage.setItem(DASHBOARD_WIDGETS_KEY, JSON.stringify(widgetPrefs)) } catch {}
  }, [widgetPrefs])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 981px)')
    const syncSidebarMode = event => {
      const desktop = event?.matches ?? media.matches
      if (desktop) setSidebarOpen(localStorage.getItem(SIDEBAR_PREF_KEY) !== 'false')
      else setSidebarOpen(false)
    }

    syncSidebarMode()
    media.addEventListener?.('change', syncSidebarMode)
    return () => media.removeEventListener?.('change', syncSidebarMode)
  }, [])

  useEffect(() => {
    if (!desktopNavigation()) return
    localStorage.setItem(SIDEBAR_PREF_KEY, sidebarOpen ? 'true' : 'false')
  }, [sidebarOpen])

  const loadAll = useCallback(async ({ quiet = false, indicate = false, force = false, modules = null } = {}) => {
    if (!force && refreshInFlightRef.current) return
    if (!force && quiet && document.visibilityState !== 'visible') return

    const sequence = ++refreshSequenceRef.current
    refreshInFlightRef.current = true
    if (!quiet && !dashboardLoadedOnceRef.current) setLoading(true)
    if (indicate || (!quiet && dashboardLoadedOnceRef.current)) setRefreshing(true)

    const requested = modules ? new Set(modules) : null
    const endpoints = [
      ['/admin/ecosystem/dashboard', 'dashboard'],
      ['/admin/ecosystem/activity', 'activity'],
      ['/admin/ecosystem/financial/dashboard', 'financial'],
      ['/admin/ecosystem/command/overview', 'command'],
      ['/admin/applications', 'applications'],
    ].filter(([, key]) => !requested || requested.has(key))

    try {
      const settled = await Promise.allSettled(endpoints.map(([path]) => request(path)))
      if (sequence !== refreshSequenceRef.current) return

      let failures = 0
      settled.forEach((result, index) => {
        const key = endpoints[index][1]
        if (result.status !== 'fulfilled') { failures += 1; return }
        const normalized = key === 'applications'
          ? (result.value?.applications || result.value?.data || (Array.isArray(result.value) ? result.value : []))
          : result.value
        let fingerprint = ''
        try { fingerprint = JSON.stringify(normalized) } catch { fingerprint = String(Date.now()) }
        if (payloadFingerprintRef.current.get(key) === fingerprint) return
        payloadFingerprintRef.current.set(key, fingerprint)
        if (key === 'dashboard') setDashboard(normalized)
        if (key === 'activity') setActivity(normalized)
        if (key === 'financial') setFinancial(normalized)
        if (key === 'command') setCommand(normalized)
        if (key === 'applications') setApplications(normalized)
      })

      if (endpoints.length && failures === endpoints.length) setLoadError('Não foi possível atualizar as fontes administrativas solicitadas. Os dados anteriores foram preservados.')
      else if (failures) setLoadError(`${failures} fonte${failures > 1 ? 's' : ''} não respondeu. Os dados disponíveis foram preservados.`)
      else setLoadError('')
      dashboardLoadedOnceRef.current = true
      setLastRefreshAt(new Date())
    } finally {
      if (sequence === refreshSequenceRef.current) {
        setLoading(false)
        setRefreshing(false)
        refreshInFlightRef.current = false
      }
    }
  }, [])

  const reloadApplications = useCallback(async () => {
    const payload = await request('/admin/applications')
    const rows = payload?.applications || payload?.data || (Array.isArray(payload) ? payload : [])
    setApplications(rows)
    return rows
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let socketState = 'connecting'

    const queueRefresh = (modules = []) => {
      if (document.visibilityState !== 'visible') return
      if (!BACKGROUND_REFRESH_PAGES.has(activePageRef.current)) return
      const pending = pendingRefreshModulesRef.current
      if (!modules.length) {
        pending.clear()
        pending.add('*')
      } else if (!pending.has('*')) {
        modules.forEach(module => pending.add(module))
      }
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => {
        const all = pending.has('*')
        const nextModules = all ? null : [...pending]
        pending.clear()
        void loadAll({ quiet: true, modules: nextModules })
      }, 1600)
    }

    const disconnect = connectMissionControlRealtime({
      token: () => localStorage.getItem(TOKEN_KEY),
      events: ['ecosystem.updated'],
      onUpdate: (payload, eventName) => {
        const modules = Array.isArray(payload?.modules) ? payload.modules : []
        if (eventName !== 'ecosystem.updated' || modules.length === 0) {
          queueRefresh()
          return
        }
        const targets = new Set()
        modules.forEach(module => {
          if (module === 'dashboard') targets.add('dashboard')
          if (module === 'activity' || module === 'audit') targets.add('activity')
          if (module === 'applications') { targets.add('applications'); targets.add('dashboard') }
          if (module === 'operations' || module === 'command') { targets.add('command'); targets.add('dashboard') }
          if (module === 'financial') { targets.add('financial'); targets.add('dashboard') }
        })
        if (targets.size) queueRefresh([...targets])
      },
      onState: state => {
        socketState = state
        setRealtimeState(state)
      },
    })

    const fallback = window.setInterval(() => {
      if (socketState !== 'connected') queueRefresh()
    }, BACKGROUND_REFRESH_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && socketState !== 'connected') queueRefresh()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      window.clearInterval(fallback)
      document.removeEventListener('visibilitychange', onVisibility)
      disconnect?.()
    }
  }, [loadAll])

  useEffect(() => {
    const onStorm = event => {
      setApiStorm(event?.detail || null)
      window.setTimeout(() => setApiStorm(null), 12000)
    }
    window.addEventListener('admin-api-storm', onStorm)
    return () => window.removeEventListener('admin-api-storm', onStorm)
  }, [])

  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      if (BACKGROUND_REFRESH_PAGES.has(activePageRef.current)) void loadAll({ quiet: true })
    }
    const onOffline = () => {
      setOnline(false)
      setRealtimeState('offline')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [loadAll])

  useEffect(() => {
    if (sidebarOpen) {
      sidebarWasOpenRef.current = true
      const frame = window.requestAnimationFrame(() => {
        sidebarRef.current?.querySelector('button.active')?.focus()
      })
      return () => window.cancelAnimationFrame(frame)
    }
    if (sidebarWasOpenRef.current) {
      sidebarWasOpenRef.current = false
      window.requestAnimationFrame(() => menuButtonRef.current?.focus())
    }
    return undefined
  }, [sidebarOpen])

  useEffect(() => {
    const handlePopState = () => setActivePage(pageFromLocation())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const config = PAGE_CONFIG[activePage] || PAGE_CONFIG.users
    document.title = `${config.label} · Admin Center · Peter Tecnet`
    window.dispatchEvent(new CustomEvent('admin-page-change', { detail: { page: activePage } }))
  }, [activePage])

  useEffect(() => {
    if (!sidebarOpen || !window.matchMedia('(max-width: 980px)').matches) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [sidebarOpen])

  useEffect(() => {
    function shortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        window.requestAnimationFrame(() => searchWrapRef.current?.querySelector('input')?.focus())
        return
      }
      if (event.key !== 'Escape') return
      if (searchOpen) {
        event.preventDefault()
        setSearchResult(null)
        setSearchOpen(false)
        return
      }
      if (launcherOpen) {
        event.preventDefault()
        setLauncherOpen(false)
        return
      }
      if (!desktopNavigation() && sidebarOpen) {
        event.preventDefault()
        setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [launcherOpen, searchOpen, sidebarOpen])

  useEffect(() => {
    if (!searchOpen && !launcherOpen) return undefined
    const dismiss = event => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (searchOpen && !searchWrapRef.current?.contains(target)) setSearchOpen(false)
      if (launcherOpen && !launcherWrapRef.current?.contains(target)) setLauncherOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [searchOpen, launcherOpen])

  useEffect(() => {
    window.clearTimeout(searchTimer.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      searchSequenceRef.current += 1
      setSearchResult(null)
      setSearching(false)
      return undefined
    }

    const sequence = ++searchSequenceRef.current
    searchTimer.current = window.setTimeout(async () => {
      try {
        const payload = await request(`/admin/ecosystem/command/search?q=${encodeURIComponent(trimmed)}`)
        if (sequence === searchSequenceRef.current) setSearchResult(payload)
      } catch (error) {
        if (sequence === searchSequenceRef.current) setSearchResult({ error: error.message, groups: {}, total: 0 })
      } finally {
        if (sequence === searchSequenceRef.current) setSearching(false)
      }
    }, 320)

    return () => window.clearTimeout(searchTimer.current)
  }, [query])

  function handleSidebarKeyDown(event) {
    if (event.key === 'Escape' && !desktopNavigation()) {
      event.preventDefault()
      setSidebarOpen(false)
      return
    }
    if (event.key !== 'Tab' || !sidebarOpen) return
    const focusable = [...(sidebarRef.current?.querySelectorAll('a[href], button:not([disabled])') || [])]
      .filter(node => node.tabIndex !== -1)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function go(section, { replace = false } = {}) {
    const next = PAGE_CONFIG[section] && section !== 'dashboard' ? section : 'users'
    setActivePage(next)
    writePageHistory(next, replace ? 'replaceState' : 'pushState')
    if (window.matchMedia('(max-width: 980px)').matches) setSidebarOpen(false)
    setLauncherOpen(false)
    setSearchResult(null)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
  }

  function toggleFavoritePage() {
    setFavoritePages(current => current.includes(activePage)
      ? current.filter(page => page !== activePage)
      : [activePage, ...current].slice(0, 6))
  }

  function runQuickAction(action) {
    if (action === 'new-establishment') {
      setQuickCreate(current => ({ target: 'establishments', token: current.token + 1 }))
      go('establishments')
      return
    }
    if (action === 'new-item') {
      setQuickCreate(current => ({ target: 'items', token: current.token + 1 }))
      go('items')
      return
    }
    if (action === 'users') {
      go('users')
      return
    }
    if (action === 'refresh') {
      void loadAll({ quiet: true, indicate: true, force: true })
    }
  }

  const summary = dashboard?.summary || {}
  const financialSummary = financial?.summary || {}
  const totals = financialSummary?.totals || {}
  const approved = financialSummary?.approved || {}
  const failed = financialSummary?.failed || {}
  const pending = financialSummary?.pending || {}
  const appRows = dashboard?.applications || applications || []
  const activityRows = activity?.activity || dashboard?.recent_activity || []
  const issueRows = command?.issues?.data || command?.issues || []
  const financialAlerts = financial?.alerts || []
  const operationalStatus = command?.overall_status || command?.status || command?.health?.status || (issueRows.some(issue => statusTone(issue.severity) === 'danger') ? 'Atenção' : 'Operacional')
  const status = statusTone(operationalStatus)
  const activeApps = summary.active_applications ?? appRows.filter(app => app.is_active !== false).length

  const highestApp = useMemo(() => [...appRows].sort((a, b) => number(b.activity_count_30d) - number(a.activity_count_30d))[0], [appRows])

  const dashboardMetricCards = {
    gross: <MetricCard label="Receita bruta" value={currency(totals.gross)} detail={`${compactNumber(approved.count)} pagamentos confirmados`} tone="accent"/>,
    platform: <MetricCard label="Receita Peter Tecnet" value={currency(totals.platform_fees)} detail="Taxas da plataforma no período" tone="success"/>,
    'active-today': <MetricCard label="Usuários ativos hoje" value={compactNumber(summary.active_users_today)} detail={`${compactNumber(summary.interactions_today)} interações hoje`}/>,
    'interactions-30d': <MetricCard label="Interações · 30 dias" value={compactNumber(summary.interactions_30d)} detail={`${compactNumber(summary.active_users_30d)} usuários ativos`}/>,
    applications: <MetricCard label="Aplicações ativas" value={compactNumber(activeApps)} detail={`${compactNumber(summary.applications ?? appRows.length)} cadastradas`}/>,
    'payments-attention': <MetricCard label="Pagamentos em atenção" value={compactNumber(number(failed.count) + number(pending.count))} detail={`${compactNumber(failed.count)} falhas · ${compactNumber(pending.count)} pendentes`} tone={number(failed.count) ? 'danger' : 'warning'}/>,
  }

  return <div className="admin-shell" data-admin-page={activePage} data-sidebar-open={sidebarOpen ? "true" : "false"} data-density={compactMode ? "compact" : "comfortable"}>
    <div className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true"/>
    <aside ref={sidebarRef} id="admin-navigation" className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Navegação administrativa" aria-hidden={!sidebarOpen} onKeyDown={handleSidebarKeyDown}>
      <a className="brand" href="?page=usuarios" tabIndex={sidebarOpen ? 0 : -1} onClick={event => { event.preventDefault(); go('users') }}>
        <span className="brand-logo"><img src="/petertecnet-brand.svg" alt=""/></span>
        <span><b>Peter Tecnet</b><small>Admin Center</small></span>
      </a>
      <nav>
        <p>GESTÃO</p>
        {navItems.map(([id, label, icon]) => <button key={id} type="button" className={activePage === id ? 'active' : ''} data-admin-page-target={id} aria-current={activePage === id ? 'page' : undefined} tabIndex={sidebarOpen ? 0 : -1} onClick={() => go(id)}><span><AdminIcon name={icon}/></span><b>{label}</b><i>→</i></button>)}
      </nav>
      <div className="sidebar-status">
        <span className={`status-dot ${status}`}/><div><b>{operationalStatus}</b><small>Estado do ecossistema</small></div>
      </div>
      <div className="sidebar-user">
        <div className="avatar">{fullName(user).slice(0, 2).toUpperCase()}</div>
        <div><b>{fullName(user)}</b><small>{user?.email}</small></div>
        <button onClick={onLogout} aria-label="Sair" tabIndex={sidebarOpen ? 0 : -1}>↪</button>
      </div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <button ref={menuButtonRef} className="hamburger" onClick={() => setSidebarOpen(value => !value)} aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={sidebarOpen} aria-controls="admin-navigation"><span/><span/><span/></button>
        <div ref={searchWrapRef} className="top-search">
          <span>⌕</span><input value={query} onFocus={() => setSearchOpen(true)} onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              const first = event.currentTarget.closest('.top-search')?.querySelector('.search-popover button:not(.search-popover-head button)')
              if (first) { event.preventDefault(); first.focus() }
            }
          }} onChange={event => {
            const value = event.target.value
            setQuery(value)
            if (value.trim().length < 2) {
              setSearchResult(null)
              setSearching(false)
            } else {
              setSearching(true)
            }
          }} placeholder="Pesquisar em todo o ecossistema…" aria-label="Pesquisar no ecossistema"/><kbd>Ctrl K</kbd>
          {searchOpen && <SearchPopover query={query} result={searchResult} searching={searching} recentPages={recentPages} favoritePages={favoritePages} onQuickAction={action => { runQuickAction(action); setSearchOpen(false); setQuery(''); setSearchResult(null) }} onClose={() => { setSearchOpen(false); setQuery(''); setSearchResult(null) }} onPageNavigate={page => { go(page); setSearchOpen(false); setQuery(''); setSearchResult(null) }} onNavigate={group => {
            const destination = ({ users: 'users', applications: 'applications', establishments: 'establishments', items: 'items', events: 'establishments', orders: 'financial', payments: 'financial' })[group]
            if (destination) go(destination)
            setSearchOpen(false)
            setQuery('')
            setSearchResult(null)
          }}/>} 
        </div>
      </header>

      {!online && <div className="admin-offline-banner" role="status"><span>Sem conexão</span><p>Os dados já carregados continuam disponíveis. A sincronização será retomada automaticamente quando a internet voltar.</p></div>}
      {apiStorm && <div className="admin-network-warning" role="status"><span>Rede protegida</span><p>A rota <b>{apiStorm.route}</b> fez {apiStorm.count} chamadas em um minuto. O diagnóstico foi registrado para evitar regressões de atualização excessiva.</p><button type="button" onClick={() => setApiStorm(null)} aria-label="Fechar aviso de rede">×</button></div>}
      <div className="content">
        <section className="hero-section" id="dashboard" data-admin-page-key="dashboard">
          <div><p className="eyebrow">PETER TECNET / ECOSYSTEM INTELLIGENCE</p><h1>Dashboard administrativo</h1><p>Acompanhe operação, adoção e receita do ecossistema em tempo real.</p></div>
          <div className="hero-admin-actions"><div className={`health-chip ${status}`}><span/><div><small>ECOSYSTEM HEALTH</small><b>{operationalStatus}</b></div></div><button type="button" className="hero-customize" onClick={() => setWidgetPrefsOpen(true)}>Personalizar</button></div>
        </section>

        {loadError && <div className="notice" data-admin-page-key="dashboard">{loadError}<button onClick={() => loadAll()}>Tentar novamente</button></div>}
        {loading ? <DashboardSkeleton/> : <>
          <section className="metrics-grid" data-admin-page-key="dashboard">
            {widgetPrefs.order.filter(id => !widgetPrefs.hidden.includes(id)).map(id => <div className="metric-slot" key={id}>{dashboardMetricCards[id]}</div>)}
          </section>

          <section className="analytics-grid" data-admin-page-key="dashboard">
            <Panel title="Receita nos últimos 30 dias" subtitle="Volume bruto processado pelo ecossistema" className="chart-panel">
              <LineChart rows={financial?.timeline || []} valueKey="gross" formatter={currency}/>
              <div className="chart-summary"><span><i className="dot approved"/>Aprovado <b>{currency(approved.amount)}</b></span><span><i className="dot fees"/>Taxas Peter <b>{currency(totals.platform_fees)}</b></span><span><i className="dot net"/>Líquido vendedores <b>{currency(totals.seller_net)}</b></span></div>
            </Panel>
            <Panel title="Engajamento por aplicação" subtitle="Interações registradas nos últimos 30 dias">
              <Bars rows={appRows}/>
              {highestApp && <div className="insight"><span>↗</span><p><b>{highestApp.name}</b> concentra o maior volume recente de atividade.</p></div>}
            </Panel>
          </section>
        </>}

          <section id="operations" className="section-anchor" data-admin-page-key="operations" hidden={activePage !== 'operations'} aria-hidden={activePage !== 'operations'}>
            <SectionHeading kicker="OPERAÇÕES" title="Saúde e sinais críticos" text="Alertas financeiros e operacionais que merecem atenção imediata."/>
            <div className="operations-grid">
              <Panel title="Alertas ativos" subtitle={`${issueRows.length + financialAlerts.length} sinais encontrados`}>
                <div className="alerts-list">
                  {[...issueRows.slice(0, 5), ...financialAlerts.slice(0, 4)].length ? [...issueRows.slice(0, 5), ...financialAlerts.slice(0, 4)].map((item, index) => <div className="alert-row" key={item.id || item.public_id || `${item.title}-${index}`}>
                    <span className={`severity ${statusTone(item.severity || item.status)}`}/><div><b>{item.title || item.name || item.message || 'Sinal operacional'}</b><small>{item.message || item.description || item.status || item.severity}</small></div>
                  </div>) : <Empty text="Nenhum alerta crítico no momento."/>}
                </div>
              </Panel>
              <Panel title="Pulso do ecossistema" subtitle="Indicadores de adoção e operação">
                <div className="pulse-grid">
                  <div><span>Novos usuários · 30d</span><b>{compactNumber(summary.new_users_30d)}</b></div>
                  <div><span>Inativos · 30d</span><b>{compactNumber(summary.inactive_users_30d)}</b></div>
                  <div><span>Estabelecimentos</span><b>{compactNumber(summary.establishments)}</b></div>
                  <div><span>Vínculos de acesso</span><b>{compactNumber(summary.access_links)}</b></div>
                </div>
              </Panel>
            </div>
          </section>

          <section id="financial" className="section-anchor" data-admin-page-key="financial" hidden={activePage !== 'financial'} aria-hidden={activePage !== 'financial'}>
            <SectionHeading kicker="FINANCEIRO" title="Performance de receita" text="Distribuição financeira por aplicação e status de pagamentos."/>
            <div className="financial-strip">
              <div><span>Transações</span><b>{compactNumber(totals.transactions)}</b></div><div><span>Volume bruto</span><b>{currency(totals.gross)}</b></div><div><span>Taxas do provedor</span><b>{currency(totals.provider_fees)}</b></div><div><span>Líquido ao vendedor</span><b>{currency(totals.seller_net)}</b></div>
            </div>
            <Panel title="Receita por aplicação" subtitle="Ranking por volume bruto processado">
              <div className="table-wrap"><table><thead><tr><th scope="col">Aplicação</th><th scope="col">Transações</th><th scope="col">Volume bruto</th><th scope="col">Taxa Peter</th><th scope="col">Líquido</th></tr></thead><tbody>{financial?.applications?.length ? financial.applications.map(row => <tr key={row.app_slug || row.application_name}><td><b>{row.application_name || row.app_slug}</b></td><td>{compactNumber(row.transactions)}</td><td>{currency(row.gross)}</td><td>{currency(row.platform_fees)}</td><td>{currency(row.seller_net)}</td></tr>) : <tr><td colSpan="5"><Empty text="Ainda não há movimentação financeira consolidada por aplicação."/></td></tr>}</tbody></table></div>
            </Panel>
            {activePage === 'financial' && <AdminModuleBoundary name="Financeiro"><Suspense fallback={<ModuleSkeleton title="Carregando repasses…" />}><AdminPayoutCenter request={request}/></Suspense></AdminModuleBoundary>}
          </section>

          <section id="applications" className="section-anchor" data-admin-page-key="applications" hidden={activePage !== 'applications'} aria-hidden={activePage !== 'applications'}>
            <SectionHeading kicker="APLICAÇÕES" title="Ecossistema em produção" text="Adoção, atividade, configuração e estado operacional das aplicações conectadas à API central."/>
            {activePage === 'applications' && <AdminModuleBoundary name="Aplicações"><Suspense fallback={<ModuleSkeleton title="Carregando aplicações…" />}><AdminApplicationsCenter applications={applications} dashboard={dashboard} financial={financial} activity={activity} command={command} request={request} onReload={reloadApplications}/></Suspense></AdminModuleBoundary>}
          </section>

          <section id="users" className="section-anchor" data-admin-page-key="users" hidden={activePage !== 'users'} aria-hidden={activePage !== 'users'}>
            <SectionHeading kicker="USUÁRIOS" title="Usuários" text="Consulte os usuários do ecossistema e convide novos acessos rapidamente."/>
            {activePage === 'users' && <AdminModuleBoundary name="Usuários"><Suspense fallback={<ModuleSkeleton title="Carregando usuários…" />}><AdminUsersCenter apiRequest={request} applications={applications}/></Suspense></AdminModuleBoundary>}
          </section>

          <section id="establishments-admin-integration" className="section-anchor admin-native-module" data-admin-page-key="establishments" hidden={activePage !== 'establishments'} aria-hidden={activePage !== 'establishments'}>
            <SectionHeading kicker="ESTABELECIMENTOS" title="Estabelecimentos" text="Consulte os estabelecimentos do ecossistema e cadastre novos registros rapidamente."/>
            {activePage === 'establishments' && <AdminModuleBoundary name="Estabelecimentos"><Suspense fallback={<ModuleSkeleton title="Carregando estabelecimentos…" />}>
              <AdminEstablishmentsPage quickCreateToken={quickCreate.target === 'establishments' ? quickCreate.token : 0} />
            </Suspense></AdminModuleBoundary>}
          </section>

          <section id="items-admin-integration" className="section-anchor admin-native-module" data-admin-page-key="items" hidden={activePage !== 'items'} aria-hidden={activePage !== 'items'}>
            {activePage === 'items' && <AdminModuleBoundary name="Itens"><Suspense fallback={<ModuleSkeleton title="Carregando itens…" />}>
              <AdminItemsManager applications={applications} quickCreateToken={quickCreate.target === 'items' ? quickCreate.token : 0} />
            </Suspense></AdminModuleBoundary>}
          </section>

          <section id="agents" className="section-anchor" data-admin-page-key="agents" hidden={activePage !== 'agents'} aria-hidden={activePage !== 'agents'}>
            <SectionHeading kicker="AGENTES" title="Central de comunicação" text="Envie ordens e acompanhe respostas dos agentes pelo histórico compartilhado do GitHub."/>
            {activePage === 'agents' && <AdminModuleBoundary name="Agentes"><Suspense fallback={<ModuleSkeleton title="Carregando central de agentes…" />}><AgentChatPanel request={request}/></Suspense></AdminModuleBoundary>}
          </section>

          <section id="notifications" className="section-anchor" data-admin-page-key="notifications" hidden={activePage !== 'notifications'} aria-hidden={activePage !== 'notifications'}>
            {activePage === 'notifications' && <AdminModuleBoundary name="Notificações"><Suspense fallback={<ModuleSkeleton title="Carregando notificações…" />}><NotificationsCenter request={request} applications={applications}/></Suspense></AdminModuleBoundary>}
          </section>

          <section id="activity" className="section-anchor" data-admin-page-key="activity" hidden={activePage !== 'activity'} aria-hidden={activePage !== 'activity'}>
            <SectionHeading kicker="ATIVIDADE" title="Linha do tempo recente" text="Últimas ações registradas pela telemetria do ecossistema."/>
            <Panel title="Atividade recente" subtitle={`${compactNumber(activity?.summary?.total ?? summary.interactions_30d)} interações no recorte atual`}>
              <div className="timeline">
                {activityRows.length ? activityRows.slice(0, 16).map((row, index) => <div className="timeline-row" key={row.id || `${row.created_at}-${index}`}><span className="timeline-dot"/><div><b>{row.name || row.interaction_type || row.type || 'Interação'}</b><small>{row.user_email || row.email || row.application_name || row.app_name || 'Ecossistema Peter Tecnet'}</small></div><time>{dateTime(row.created_at || row.occurred_at)}</time></div>) : <Empty text="Nenhuma interação recente retornada pela API."/>}
              </div>
            </Panel>
          </section>
      </div>
    </main>
    <DashboardWidgetPreferences open={widgetPrefsOpen} prefs={widgetPrefs} onChange={setWidgetPrefs} onClose={() => setWidgetPrefsOpen(false)} />
  </div>
}

function SectionHeading({ kicker, title, text }) {
  return <div className="section-heading"><div><p className="eyebrow">{kicker}</p><h2>{title}</h2></div><p>{text}</p></div>
}

function DashboardWidgetPreferences({ open, prefs, onChange, onClose }) {
  const ref = useRef(null)
  useDialogFocus(ref, open, onClose)
  if (!open) return null

  const labels = {
    gross: 'Receita bruta',
    platform: 'Receita Peter Tecnet',
    'active-today': 'Usuários ativos hoje',
    'interactions-30d': 'Interações · 30 dias',
    applications: 'Aplicações ativas',
    'payments-attention': 'Pagamentos em atenção',
  }

  const move = (id, direction) => {
    const index = prefs.order.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= prefs.order.length) return
    const order = [...prefs.order]
    ;[order[index], order[target]] = [order[target], order[index]]
    onChange({ ...prefs, order })
  }

  const toggle = id => {
    const hidden = prefs.hidden.includes(id) ? prefs.hidden.filter(item => item !== id) : [...prefs.hidden, id]
    onChange({ ...prefs, hidden })
  }

  return <div className="admin-preferences-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={ref} tabIndex="-1" className="admin-preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-preferences-title">
      <header><div><p className="eyebrow">VISÃO GERAL</p><h3 id="dashboard-preferences-title">Personalizar indicadores</h3><p>Escolha o que aparece e a ordem dos KPIs. A preferência fica salva neste navegador.</p></div><button type="button" onClick={onClose} aria-label="Fechar personalização">×</button></header>
      <div className="admin-preferences-list">{prefs.order.map((id, index) => <article key={id}>
        <label><input type="checkbox" checked={!prefs.hidden.includes(id)} onChange={() => toggle(id)}/><span><b>{labels[id] || id}</b><small>{prefs.hidden.includes(id) ? 'Oculto' : 'Visível'}</small></span></label>
        <div><button type="button" onClick={() => move(id, -1)} disabled={index === 0} aria-label={`Mover ${labels[id] || id} para cima`}>↑</button><button type="button" onClick={() => move(id, 1)} disabled={index === prefs.order.length - 1} aria-label={`Mover ${labels[id] || id} para baixo`}>↓</button></div>
      </article>)}</div>
      <footer><button type="button" onClick={() => onChange({ order: [...DEFAULT_DASHBOARD_WIDGETS], hidden: [] })}>Restaurar padrão</button><button type="button" className="primary-button" onClick={onClose}>Concluir</button></footer>
    </section>
  </div>
}

function SearchPopover({ query, result, searching, recentPages = [], favoritePages = [], onClose, onNavigate, onPageNavigate, onQuickAction }) {
  const groups = result?.groups || {}
  const term = String(query || '').trim().toLowerCase()
  const pageMatches = term.length >= 2
    ? navItems.filter(([id, label]) => id.includes(term) || label.toLowerCase().includes(term)).slice(0, 6)
    : navItems.filter(([id]) => !recentPages.includes(id)).slice(0, 6)
  const recentMatches = recentPages.map(page => navItems.find(([id]) => id === page)).filter(Boolean)
  const favoriteMatches = favoritePages.map(page => navItems.find(([id]) => id === page)).filter(Boolean)

  function keyboardNavigation(event) {
    const movingDown = event.key === 'ArrowDown'
    const movingUp = event.key === 'ArrowUp'
    if (!movingDown && !movingUp) return
    const buttons = [...event.currentTarget.querySelectorAll('button')].filter(button => !button.disabled && !button.classList.contains('search-close'))
    const index = buttons.indexOf(document.activeElement)
    if (index < 0) return
    event.preventDefault()
    const direction = movingDown ? 1 : -1
    buttons[(index + direction + buttons.length) % buttons.length]?.focus()
  }

  return <div className="search-popover" onKeyDown={keyboardNavigation}>
    <div className="search-popover-head"><span>{term.length < 2 ? "Comandos rápidos" : searching ? "Pesquisando…" : `${result?.total || 0} resultado(s)`}</span><button className="search-close" onClick={onClose} aria-label="Fechar busca">×</button></div>
    {term.length < 2 && <section className="search-commands search-quick-actions"><h4>Ações rápidas</h4>
      <button type="button" onClick={() => onQuickAction?.('new-establishment')}><span>＋</span><b>Novo estabelecimento</b><i>↗</i></button>
      <button type="button" onClick={() => onQuickAction?.('new-item')}><span>＋</span><b>Novo item</b><i>↗</i></button>
      <button type="button" onClick={() => onQuickAction?.('users')}><span>◎</span><b>Gerenciar usuários</b><i>↗</i></button>
      <button type="button" onClick={() => onQuickAction?.('refresh')}><span>↻</span><b>Atualizar visão</b><i>↗</i></button>
    </section>}
    {term.length < 2 && favoriteMatches.length > 0 && <section className="search-commands"><h4>Favoritos</h4>{favoriteMatches.map(([id, label, icon]) => <button key={`favorite-${id}`} type="button" onClick={() => onPageNavigate?.(id)}><span><AdminIcon name={icon}/></span><b>{label}</b><i>★</i></button>)}</section>}
    {term.length < 2 && recentMatches.length > 0 && <section className="search-commands"><h4>Recentes</h4>{recentMatches.map(([id, label, icon]) => <button key={`recent-${id}`} type="button" onClick={() => onPageNavigate?.(id)}><span><AdminIcon name={icon}/></span><b>{label}</b><i>↗</i></button>)}</section>}
    {pageMatches.length > 0 && <section className="search-commands"><h4>Ir para</h4>{pageMatches.map(([id, label, icon]) => <button key={id} type="button" onClick={() => onPageNavigate?.(id)}><span><AdminIcon name={icon}/></span><b>{label}</b><i>→</i></button>)}</section>}
    {result?.error && <div className="search-error">{result.error}</div>}
    {term.length >= 2 && !searching && !result?.error && !result?.total && <Empty text="Nenhum resultado encontrado."/>}
    <div className="search-groups">
      {Object.entries(groups).map(([group, rows]) => <section key={group}><h4>{groupLabels[group] || group}<span>{rows.length}</span></h4>{rows.map((row, index) => <button type="button" className="search-result" key={row.id || index} onClick={() => onNavigate?.(group)}><div><b>{row.name || row.title || row.first_name || row.email || row.public_id || row.reference || `#${row.id}`}</b><small>{row.email || row.slug || row.status || row.category || row.application_name || row.url || `ID ${row.id}`}</small></div><span>#{row.id}</span></button>)}</section>)}
    </div>
  </div>
}

function EcosystemLauncher({ applications, onClose }) {
  return <div className="launcher-popover">
    <div className="launcher-head"><div><p className="eyebrow">ECOSYSTEM</p><b>Navegar nas aplicações</b></div><button onClick={onClose}>×</button></div>
    <div className="launcher-grid">
      <a href="https://petertecnet.com.br/" target="_blank" rel="noreferrer"><span className="launcher-logo"><img src="/petertecnet-brand.svg" alt=""/></span><div><b>Peter Tecnet</b><small>Site institucional</small></div><i>↗</i></a>
      {applications.filter(app => app.is_active !== false && app.url).map(app => <a key={app.id || app.slug} href={app.url} target="_blank" rel="noreferrer"><span className="launcher-logo">{app.logo ? <img src={app.logo} alt=""/> : String(app.name || 'P')[0]}</span><div><b>{app.name}</b><small>{app.slug || 'Aplicação'}</small></div><i>↗</i></a>)}
    </div>
  </div>
}

function ModuleSkeleton({ title = 'Carregando módulo…' }) {
  return <AdminProcessingIndicator
    title={title}
    messages="Carregando os recursos necessários…|Sincronizando o módulo com a API central…|Preparando a interface administrativa…"
    detail="Aguarde enquanto o conteúdo é preparado."
  />
}

function DashboardSkeleton() {
  return <div className="skeleton-wrap" data-admin-page-key="dashboard"><div className="metrics-grid">{Array.from({ length: 6 }, (_, index) => <div className="skeleton metric-card" key={index}/>)}</div><div className="analytics-grid"><div className="skeleton panel tall"/><div className="skeleton panel tall"/></div></div>
}

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(localStorage.getItem(TOKEN_KEY)))

  useEffect(() => {
    async function validate() {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) { setChecking(false); return }
      try {
        const payload = await request('/auth/me')
        const current = payload?.user || payload
        if (String(current?.email || '').toLowerCase() !== OWNER_EMAIL) throw new Error('Acesso não autorizado.')
        setUser(current)
      } catch {
        localStorage.removeItem(TOKEN_KEY)
      } finally { setChecking(false) }
    }
    validate()
    const expired = () => { setUser(null); setChecking(false) }
    const storage = event => {
      if (event.key !== TOKEN_KEY) return
      if (!event.newValue) { setUser(null); setChecking(false); return }
      setChecking(true)
      validate()
    }
    window.addEventListener('admin-session-expired', expired)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener('admin-session-expired', expired)
      window.removeEventListener('storage', storage)
    }
  }, [])

  function logout() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) request('/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }

  if (checking) return <AdminProcessingIndicator
    screen
    title="Validando sessão administrativa"
    messages="Verificando sua sessão…|Confirmando as permissões administrativas…|Preparando o Admin Center…"
    detail="Aguarde enquanto seu acesso é validado com segurança."
  />
  return user ? <Dashboard user={user} onLogout={logout}/> : <Login onAuthenticated={setUser}/>
}