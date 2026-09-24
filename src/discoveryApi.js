const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const SESSION_KEY = 'peter_discovery_session'

function token() {
  return localStorage.getItem('token') || localStorage.getItem('petertecnet_admin_token') || ''
}

async function request(path, { method = 'GET', body, auth = false, signal, keepalive = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    signal,
    keepalive,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (auth && response.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('petertecnet_admin_token')
    window.location.assign('/login')
    throw new Error('Sessão expirada.')
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Falha na API (${response.status}).`)
    error.status = response.status
    error.validation = data?.errors || null
    throw error
  }
  return data
}

function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

export const fetchContentEntries = (params = {}, signal) => request(`/v1/content${queryString(params)}`, { signal })
export const fetchContentEntry = (slug, params = {}, signal) => request(`/v1/content/${encodeURIComponent(slug)}${queryString(params)}`, { signal })
export const fetchDiscoveryCategories = (params = {}, signal) => request(`/v1/discovery/categories${queryString(params)}`, { signal })
export const fetchDiscoveryCategory = (slug, params = {}, signal) => request(`/v1/discovery/categories/${encodeURIComponent(slug)}${queryString(params)}`, { signal })
export const fetchDiscoveryEstablishment = (identifier, params = {}, signal) => request(`/v1/discovery/establishments/${encodeURIComponent(identifier)}${queryString(params)}`, { signal })
export const fetchDiscoveryItem = (identifier, params = {}, signal) => request(`/v1/discovery/items/${encodeURIComponent(identifier)}${queryString(params)}`, { signal })
export const fetchDiscoverySearch = (params = {}, signal) => request(`/v1/discovery/search${queryString(params)}`, { signal })
export const fetchDiscoveryLanding = (params = {}, signal) => request(`/v1/discovery/landing${queryString(params)}`, { signal })
export const fetchDiscoveryLandingCandidates = (params = {}, signal) => request(`/v1/discovery/landing-candidates${queryString(params)}`, { signal })
export const fetchMediaCapabilities = signal => request('/v1/discovery/media/capabilities', { signal })

export const fetchAdminContent = (params = {}, signal) => request(`/admin/content${queryString(params)}`, { auth: true, signal })
export const createAdminContent = payload => request('/admin/content', { method: 'POST', body: payload, auth: true })
export const updateAdminContent = (id, payload) => request(`/admin/content/${id}`, { method: 'PATCH', body: payload, auth: true })
export const publishAdminContent = id => request(`/admin/content/${id}/publish`, { method: 'POST', auth: true })
export const deleteAdminContent = id => request(`/admin/content/${id}`, { method: 'DELETE', auth: true })
export const fetchDiscoveryAnalytics = (params = {}, signal) => request(`/admin/discovery/analytics${queryString(params)}`, { auth: true, signal })
export const fetchWebVitalAnalytics = (params = {}, signal) => request(`/admin/discovery/web-vitals${queryString(params)}`, { auth: true, signal })
export const fetchSeoDiagnostics = (params = {}, signal) => request(`/admin/discovery/seo-diagnostics${queryString(params)}`, { auth: true, signal })

export function getDiscoverySessionId() {
  let value = sessionStorage.getItem(SESSION_KEY)
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
    sessionStorage.setItem(SESSION_KEY, value)
  }
  return value
}

function deviceClass() {
  return window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1100 ? 'tablet' : 'desktop'
}

function acquisitionSource() {
  const params = new URLSearchParams(window.location.search)
  const campaign = params.get('utm_campaign') || undefined
  const medium = params.get('utm_medium') || undefined
  const term = params.get('utm_term') || undefined
  const content = params.get('utm_content') || undefined
  const explicit = params.get('utm_source')
  if (explicit) return { source: explicit.slice(0, 80), campaign, medium, term, content }

  try {
    const referrer = document.referrer ? new URL(document.referrer) : null
    if (!referrer || referrer.host === window.location.host) return { source: 'direto', campaign, medium, term, content }
    const host = referrer.hostname.toLowerCase()
    if (host.includes('google.')) return { source: 'google', campaign, medium, term, content }
    if (host.includes('instagram.')) return { source: 'instagram', campaign, medium, term, content }
    if (host.includes('facebook.') || host.includes('fb.')) return { source: 'facebook', campaign, medium, term, content }
    if (host.includes('whatsapp.')) return { source: 'whatsapp', campaign, medium, term, content }
    return { source: 'referral', campaign, medium, term, content }
  } catch {
    return { source: 'direto', campaign, medium, term, content }
  }
}

export function trackDiscoveryEvent(eventType, { entityType, entityId, application, metadata = {} } = {}) {
  const acquisition = acquisitionSource()
  const payload = {
    application,
    session_id: getDiscoverySessionId(),
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : undefined,
    path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
    source: acquisition.source,
    referrer: document.referrer || undefined,
    metadata: {
      ...metadata,
      campaign: metadata.campaign || acquisition.campaign,
      medium: metadata.medium || acquisition.medium,
      term: metadata.term || acquisition.term,
      content: metadata.content || acquisition.content,
      device_class: deviceClass(),
    },
  }

  const send = () => request('/v1/discovery/events', { method: 'POST', body: payload, keepalive: true }).catch(() => null)
  if ('requestIdleCallback' in window) window.requestIdleCallback(send, { timeout: 1400 })
  else window.setTimeout(send, 180)
}

function metricRating(name, value) {
  const thresholds = {
    LCP: [2500, 4000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
  }
  const [good, poor] = thresholds[name] || [Infinity, Infinity]
  return value <= good ? 'good' : value > poor ? 'poor' : 'needs-improvement'
}

export function reportWebVital(metricName, metricValue, application = 'peter-tecnet') {
  const value = Number(metricValue)
  if (!Number.isFinite(value) || value < 0) return
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  const navigation = performance.getEntriesByType?.('navigation')?.[0]
  const payload = {
    application,
    session_id: getDiscoverySessionId(),
    metric_name: metricName,
    metric_value: Number(value.toFixed(metricName === 'CLS' ? 4 : 2)),
    rating: metricRating(metricName, value),
    path: window.location.pathname.slice(0, 500),
    device_class: deviceClass(),
    connection_type: connection?.effectiveType || undefined,
    navigation_type: navigation?.type || undefined,
  }
  request('/v1/discovery/web-vitals', { method: 'POST', body: payload, keepalive: true }).catch(() => null)
}

export function installWebVitals(application = 'peter-tecnet') {
  if (!('PerformanceObserver' in window)) return () => {}
  const observers = []
  let lcp = null
  let cls = 0
  let inp = 0
  let flushed = false

  const observe = (type, handler, options = { type, buffered: true }) => {
    try {
      const observer = new PerformanceObserver(list => handler(list.getEntries()))
      observer.observe(options)
      observers.push(observer)
    } catch { /* unsupported entry type */ }
  }

  observe('largest-contentful-paint', entries => { lcp = entries.at(-1)?.startTime ?? lcp })
  observe('layout-shift', entries => {
    entries.forEach(entry => { if (!entry.hadRecentInput) cls += entry.value || 0 })
  })
  observe('event', entries => {
    entries.forEach(entry => { if ((entry.duration || 0) > inp) inp = entry.duration || 0 })
  }, { type: 'event', buffered: true, durationThreshold: 40 })
  observe('paint', entries => {
    const fcp = entries.find(entry => entry.name === 'first-contentful-paint')
    if (fcp) reportWebVital('FCP', fcp.startTime, application)
  })

  const navigation = performance.getEntriesByType?.('navigation')?.[0]
  if (navigation?.responseStart) reportWebVital('TTFB', navigation.responseStart, application)

  const flush = () => {
    if (flushed) return
    flushed = true
    if (lcp !== null) reportWebVital('LCP', lcp, application)
    reportWebVital('CLS', cls, application)
    if (inp > 0) reportWebVital('INP', inp, application)
  }
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
  document.addEventListener('visibilitychange', onVisibility, { passive: true })
  window.addEventListener('pagehide', flush, { passive: true })

  return () => {
    observers.forEach(observer => observer.disconnect())
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
  }
}

export function optimizedMediaUrl(uuid, { width = 960, format = 'auto', quality = 78 } = {}) {
  if (!uuid) return null
  return `${API}/v1/discovery/media/${encodeURIComponent(uuid)}${queryString({ width, format, quality })}`
}
