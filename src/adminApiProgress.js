const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const TOKEN_KEY = 'petertecnet_admin_token'

const errorFromPayload = payload => {
  const validation = Object.values(payload?.errors || {}).flat()?.[0]
  return validation || payload?.error || payload?.message || 'Não foi possível concluir a operação.'
}

const parseFrame = (line, state, onProgress) => {
  const trimmed = String(line || '').trim()
  if (!trimmed) return

  let frame
  try {
    frame = JSON.parse(trimmed)
  } catch {
    return
  }

  if (frame?.type === 'progress') {
    onProgress?.(frame)
    return
  }

  if (frame?.type === 'complete') {
    state.result = frame.result || {}
    return
  }

  if (frame?.type === 'error') {
    state.error = frame.message || 'A operação foi interrompida antes de concluir.'
  }
}

export async function apiProgressRequest(path, options = {}, onProgress) {
  const token = localStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    window.dispatchEvent(new Event('admin-session-expired'))
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(errorFromPayload(payload))
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/x-ndjson')) {
    const payload = await response.json().catch(() => ({}))
    return payload
  }

  const state = { result: null, error: '' }

  if (!response.body?.getReader) {
    const text = await response.text()
    text.split(/\r?\n/).forEach(line => parseFrame(line, state, onProgress))
  } else {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      lines.forEach(line => parseFrame(line, state, onProgress))

      if (state.error) {
        try { await reader.cancel() } catch { /* conexão já encerrada */ }
        break
      }
      if (done) break
    }

    if (buffer.trim()) parseFrame(buffer, state, onProgress)
  }

  if (state.error) throw new Error(state.error)
  if (state.result === null) throw new Error('A operação terminou sem confirmação do servidor. Atualize os dados antes de tentar novamente.')

  return state.result
}
