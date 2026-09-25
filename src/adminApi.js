export const ADMIN_API_BASE = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const TOKEN_KEY = 'petertecnet_admin_token'
const DEFAULT_TIMEOUT = 45000
const inflightReads = new Map()
const inflightMutations = new Map()
const replaceableReads = new Map()
const memoryCache = new Map()
const requestHistory = new Map()
const requestStats = new Map()
const lastStormNotice = new Map()
const STORM_WINDOW_MS = 60000
const STORM_THRESHOLD = 25
const MAX_RATE_LIMIT_RETRY_MS = 60000

function routeKey(path) {
  return String(path || '').split('?')[0]
}

function recordRequestStart(path) {
  const key = routeKey(path)
  const now = Date.now()
  const recent = (requestHistory.get(key) || []).filter(time => now - time < STORM_WINDOW_MS)
  recent.push(now)
  requestHistory.set(key, recent)
  if (recent.length >= STORM_THRESHOLD && now - Number(lastStormNotice.get(key) || 0) > STORM_WINDOW_MS) {
    lastStormNotice.set(key, now)
    window.dispatchEvent(new CustomEvent('admin-api-storm', { detail: { route: key, count: recent.length, windowMs: STORM_WINDOW_MS } }))
  }
  return { key, startedAt: performance.now() }
}

function recordRequestEnd(trace, ok) {
  if (!trace) return
  const duration = Math.max(0, performance.now() - trace.startedAt)
  const current = requestStats.get(trace.key) || { count: 0, failures: 0, totalDuration: 0, maxDuration: 0 }
  requestStats.set(trace.key, {
    count: current.count + 1,
    failures: current.failures + (ok ? 0 : 1),
    totalDuration: current.totalDuration + duration,
    maxDuration: Math.max(current.maxDuration, duration),
  })
}

export function getAdminApiDiagnostics() {
  return [...requestStats.entries()].map(([route, stats]) => ({
    route,
    count: stats.count,
    failures: stats.failures,
    averageDuration: stats.count ? Math.round(stats.totalDuration / stats.count) : 0,
    maxDuration: Math.round(stats.maxDuration),
    callsLastMinute: (requestHistory.get(route) || []).filter(time => Date.now() - time < STORM_WINDOW_MS).length,
  })).sort((a, b) => b.callsLastMinute - a.callsLastMinute || b.averageDuration - a.averageDuration)
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)
    if (!signal) return
    if (signal.aborted) {
      window.clearTimeout(timer)
      reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'))
    }, { once: true })
  })
}

function composeSignals(...signals) {
  const activeSignals = signals.filter(Boolean)
  if (activeSignals.length <= 1) return { signal: activeSignals[0] || null, cleanup: () => {} }
  const controller = new AbortController()
  const onAbort = signal => () => {
    if (!controller.signal.aborted) controller.abort(signal.reason)
  }
  const listeners = activeSignals.map(signal => {
    const handler = onAbort(signal)
    if (signal.aborted) handler()
    else signal.addEventListener('abort', handler, { once: true })
    return { signal, handler }
  })
  return {
    signal: controller.signal,
    cleanup: () => listeners.forEach(({ signal, handler }) => signal.removeEventListener('abort', handler)),
  }
}

function parseRetryAfter(value) {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return seconds
  const retryAt = Date.parse(value)
  return Number.isFinite(retryAt) ? Math.max(0, (retryAt - Date.now()) / 1000) : 0
}

function requestError(response, payload) {
  const validation = Object.values(payload?.errors || {}).flat()?.[0]
  const error = new Error(validation || payload?.error || payload?.message || 'Não foi possível concluir a operação.')
  error.status = response.status
  error.retryAfter = parseRetryAfter(response.headers.get('Retry-After')) || Number(payload?.retry_after || 0)
  error.payload = payload
  return error
}

function retryDelay(error) {
  if (error?.status === 429 && Number(error.retryAfter) > 0) return Math.min(Number(error.retryAfter) * 1000, MAX_RATE_LIMIT_RETRY_MS)
  return 350 + Math.round(Math.random() * 150)
}

async function execute(path, options, attempt = 0) {
  const trace = attempt === 0 ? recordRequestStart(path) : null
  const { publicRequest = false, ...requestOptions } = options
  const token = publicRequest ? null : localStorage.getItem(TOKEN_KEY)
  const method = String(requestOptions.method || 'GET').toUpperCase()
  const timeoutController = new AbortController()
  const externalSignal = requestOptions.signal
  const onExternalAbort = () => timeoutController.abort(externalSignal.reason)
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  const timeout = window.setTimeout(() => timeoutController.abort(), Number(requestOptions.timeout || DEFAULT_TIMEOUT))
  let succeeded = false
  try {
    const response = await fetch(`${ADMIN_API_BASE}${path}`, {
      ...requestOptions,
      method,
      signal: timeoutController.signal,
      cache: method === 'GET' ? 'no-store' : requestOptions.cache,
      headers: {
        Accept: 'application/json',
        ...(requestOptions.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...requestOptions.headers,
      },
    })
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
    if (!publicRequest && response.status === 401 && path !== '/auth/login' && path !== '/auth/google') {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event('admin-session-expired'))
    }
    if (!response.ok) {
      const error = requestError(response, payload)
      const retryable = method === 'GET' && attempt < 1 && (response.status >= 500 || response.status === 408 || response.status === 429)
      if (retryable && navigator.onLine) {
        await delay(retryDelay(error), externalSignal)
        const retried = await execute(path, options, attempt + 1)
        succeeded = true
        return retried
      }
      throw error
    }
    succeeded = true
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (externalSignal?.aborted) throw error
      const timeoutError = new Error('A API demorou para responder. Tente novamente; seus dados não foram perdidos.')
      timeoutError.code = 'ADMIN_API_TIMEOUT'
      throw timeoutError
    }
    const retryableNetwork = method === 'GET' && attempt < 1 && navigator.onLine && error instanceof TypeError
    if (retryableNetwork) {
      await delay(350 + Math.round(Math.random() * 150), externalSignal)
      const retried = await execute(path, options, attempt + 1)
      succeeded = true
      return retried
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', onExternalAbort)
    if (attempt === 0) recordRequestEnd(trace, succeeded)
  }
}

export function invalidateAdminApi(prefix = '') {
  for (const key of memoryCache.keys()) {
    if (!prefix || key.includes(prefix)) memoryCache.delete(key)
  }
}

export function cancelAdminRequest(cancelKey) {
  const key = String(cancelKey || '').trim()
  if (!key) return false
  const controller = replaceableReads.get(key)
  if (!controller) return false
  controller.abort()
  replaceableReads.delete(key)
  return true
}

export function adminRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const cacheMs = Math.max(0, Number(options.cacheMs || 0))
  const requestKey = `${method}:${path}`
  const cancelKey = method === 'GET' ? String(options.cancelKey || (path.startsWith('/admin/ecosystem/command/search?') ? 'global-admin-search' : '')).trim() : ''
  if (method === 'GET') {
    const cached = memoryCache.get(requestKey)
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
    if (!options.force && inflightReads.has(requestKey)) return inflightReads.get(requestKey)
    const controller = cancelKey ? new AbortController() : null
    if (controller) {
      const previous = replaceableReads.get(cancelKey)
      if (previous) previous.abort()
      replaceableReads.set(cancelKey, controller)
    }
    const composed = composeSignals(options.signal, controller?.signal)
    const requestOptions = composed.signal ? { ...options, signal: composed.signal } : options
    const promise = execute(path, requestOptions).then(payload => {
      if (cacheMs > 0) memoryCache.set(requestKey, { value: payload, expiresAt: Date.now() + cacheMs })
      return payload
    })
    inflightReads.set(requestKey, promise)
    return promise.finally(() => {
      composed.cleanup()
      if (inflightReads.get(requestKey) === promise) inflightReads.delete(requestKey)
      if (controller && replaceableReads.get(cancelKey) === controller) replaceableReads.delete(cancelKey)
    })
  }
  invalidateAdminApi()
  const mutationKey = `${requestKey}:${String(options.body || '')}`
  if (!options.force && inflightMutations.has(mutationKey)) return inflightMutations.get(mutationKey)
  const mutationPromise = execute(path, options)
  inflightMutations.set(mutationKey, mutationPromise)
  return mutationPromise.finally(() => {
    if (inflightMutations.get(mutationKey) === mutationPromise) inflightMutations.delete(mutationKey)
  })
}

export function adminPublicRequest(path, options = {}) {
  return adminRequest(path, { ...options, publicRequest: true })
}
