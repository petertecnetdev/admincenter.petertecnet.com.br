const API_ORIGIN = 'https://api.petertecnet.com.br'
const API = `${API_ORIGIN}/api`
const DEFAULT_EVENT = 'mission-control.updated'

function parseData(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function normalizeEventName(value) {
  return String(value || '').replace(/^\./, '')
}

function configuredEvents(config, extraEvents = []) {
  const advertised = Array.isArray(config?.events)
    ? config.events
    : [config?.event || DEFAULT_EVENT]
  const extras = Array.isArray(extraEvents) ? extraEvents : [extraEvents]
  return new Set([...advertised, ...extras].filter(Boolean).map(normalizeEventName))
}

function resolveToken(token) {
  if (typeof token === 'function') return token() || null
  try {
    return localStorage.getItem('token') || token || null
  } catch {
    return token || null
  }
}

function websocketUrl(config) {
  const secure = String(config.scheme || 'https').toLowerCase() === 'https'
  const scheme = secure ? 'wss' : 'ws'
  const port = Number(config.port || (secure ? 443 : 80))
  const defaultPort = secure ? 443 : 80
  const portPart = port === defaultPort ? '' : `:${port}`
  return `${scheme}://${config.host}${portPart}/app/${encodeURIComponent(config.key)}?protocol=7&client=js&version=8.4.0&flash=false`
}

async function authorize(config, token, socketId) {
  const endpoint = config.auth_endpoint || `${API_ORIGIN}/broadcasting/auth`
  const body = new URLSearchParams({ socket_id: socketId, channel_name: config.channel })
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body.toString(),
  })
  if (!response.ok) throw new Error(`Realtime auth HTTP ${response.status}`)
  return response.json()
}

export function connectMissionControlRealtime({ token, onUpdate, onState, events = [] }) {
  let disposed = false
  let socket = null
  let retryTimer = null
  let connectInFlight = false
  let reconnectMs = 1000

  const state = value => onState?.(value)

  function scheduleReconnect() {
    if (disposed || retryTimer) return
    if (!navigator.onLine) {
      state('offline')
      return
    }
    state('fallback')
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      void connect()
    }, reconnectMs)
    reconnectMs = Math.min(reconnectMs * 2, 30000)
  }

  async function connect() {
    if (disposed || connectInFlight) return
    connectInFlight = true
    state('connecting')

    try {
      const currentToken = resolveToken(token)
      const response = await fetch(`${API}/admin/ecosystem/command/realtime-config`, {
        headers: { Accept: 'application/json', ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}) },
      })
      if (!response.ok) throw new Error(`Realtime config HTTP ${response.status}`)
      const config = await response.json()
      if (!config?.enabled || !config?.key || !config?.host) {
        scheduleReconnect()
        return
      }
      const eventNames = configuredEvents(config, events)

      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
      socket = new WebSocket(websocketUrl(config))

      socket.onopen = () => state('connecting')
      socket.onerror = () => state('fallback')
      socket.onclose = () => scheduleReconnect()
      socket.onmessage = async message => {
        if (disposed) return
        let envelope
        try { envelope = JSON.parse(message.data) } catch { return }

        if (envelope.event === 'pusher:connection_established') {
          try {
            const connection = parseData(envelope.data)
            const auth = await authorize(config, resolveToken(token), connection.socket_id)
            socket?.send(JSON.stringify({
              event: 'pusher:subscribe',
              data: { auth: auth.auth, channel: config.channel, channel_data: auth.channel_data },
            }))
          } catch {
            socket?.close()
          }
          return
        }

        if (envelope.event === 'pusher_internal:subscription_succeeded') {
          reconnectMs = 1000
          state('connected')
          return
        }

        const eventName = normalizeEventName(envelope.event)
        if (eventNames.has(eventName)) {
          onUpdate?.(parseData(envelope.data), eventName)
        }
      }
    } catch {
      scheduleReconnect()
    } finally {
      connectInFlight = false
    }
  }

  const handleOnline = () => {
    if (disposed) return
    reconnectMs = 1000
    if (retryTimer) window.clearTimeout(retryTimer)
    retryTimer = null
    void connect()
  }
  const handleOffline = () => {
    if (retryTimer) window.clearTimeout(retryTimer)
    retryTimer = null
    state('offline')
    if (socket) {
      socket.onclose = null
      socket.close()
      socket = null
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  void connect()

  return () => {
    disposed = true
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    if (retryTimer) window.clearTimeout(retryTimer)
    retryTimer = null
    if (socket) {
      socket.onclose = null
      socket.close()
    }
    socket = null
  }
}
