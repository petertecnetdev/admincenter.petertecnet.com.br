const MAX_ERRORS = 40
const MAX_EVENTS = 100

const diagnostics = {
  startedAt: new Date().toISOString(),
  errors: [],
  apiStorms: [],
  vitals: {
    lcp: null,
    cls: 0,
    inp: null,
  },
  events: [],
}

function push(list, value, max) {
  list.push(value)
  if (list.length > max) list.splice(0, list.length - max)
}

function serializableError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error || 'Erro desconhecido'),
    stack: String(error?.stack || '').slice(0, 4000),
  }
}

function recordError(kind, error, extra = {}) {
  push(diagnostics.errors, {
    at: new Date().toISOString(),
    kind,
    ...serializableError(error),
    ...extra,
  }, MAX_ERRORS)
}

function installPerformanceObservers() {
  if (!('PerformanceObserver' in window)) return []

  const observers = []
  const observe = (type, handler, options = {}) => {
    try {
      const observer = new PerformanceObserver(list => handler(list.getEntries()))
      observer.observe({ type, buffered: true, ...options })
      observers.push(observer)
    } catch {
      // Browser may not expose every performance entry type.
    }
  }

  observe('largest-contentful-paint', entries => {
    const last = entries.at(-1)
    if (last) diagnostics.vitals.lcp = Math.round(last.startTime)
  })

  observe('layout-shift', entries => {
    entries.forEach(entry => {
      if (!entry.hadRecentInput) diagnostics.vitals.cls = Number((diagnostics.vitals.cls + entry.value).toFixed(4))
    })
  })

  observe('event', entries => {
    entries.forEach(entry => {
      if (!entry.interactionId || !entry.duration) return
      const duration = Math.round(entry.duration)
      diagnostics.vitals.inp = Math.max(Number(diagnostics.vitals.inp || 0), duration)
    })
  }, { durationThreshold: 40 })

  return observers
}

export function getAdminRuntimeDiagnostics() {
  return JSON.parse(JSON.stringify(diagnostics))
}

export function recordAdminRuntimeEvent(type, detail = {}) {
  push(diagnostics.events, {
    at: new Date().toISOString(),
    type,
    detail,
  }, MAX_EVENTS)
}

export function installAdminRuntimeMonitor() {
  if (window.__PT_ADMIN_RUNTIME_MONITOR__) return window.__PT_ADMIN_RUNTIME_MONITOR__

  const onError = event => recordError('window-error', event.error || new Error(event.message), {
    source: event.filename || '',
    line: event.lineno || 0,
    column: event.colno || 0,
  })
  const onRejection = event => recordError('unhandled-rejection', event.reason)
  const onStorm = event => {
    push(diagnostics.apiStorms, {
      at: new Date().toISOString(),
      ...(event?.detail || {}),
    }, 30)
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  window.addEventListener('admin-api-storm', onStorm)
  const observers = installPerformanceObservers()

  const runtime = {
    getSnapshot: getAdminRuntimeDiagnostics,
    record: recordAdminRuntimeEvent,
    dispose() {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('admin-api-storm', onStorm)
      observers.forEach(observer => observer.disconnect())
      delete window.__PT_ADMIN_RUNTIME_MONITOR__
    },
  }

  window.__PT_ADMIN_RUNTIME_MONITOR__ = runtime
  window.__PT_ADMIN_DIAGNOSTICS__ = () => ({
    runtime: getAdminRuntimeDiagnostics(),
  })
  return runtime
}
