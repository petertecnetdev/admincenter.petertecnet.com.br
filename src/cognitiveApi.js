const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'

function token() {
  return localStorage.getItem('token') || localStorage.getItem('petertecnet_admin_token') || ''
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const data = await response.json().catch(() => ({}))
  if (response.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('petertecnet_admin_token')
    window.location.assign('/login')
    throw new Error('Sessão expirada.')
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Falha na API cognitiva (${response.status}).`)
    error.status = response.status
    error.validation = data?.errors || null
    throw error
  }
  return data
}

export const fetchDefaultCognitiveAgent = signal => request('/cognition/agents/default', { signal })
export const fetchCognitiveDashboard = (agentId, signal) => request(`/cognition/agents/${agentId}/dashboard`, { signal })
export const fetchCognitiveMemories = (agentId, params = {}, signal) => {
  const query = new URLSearchParams(params).toString()
  return request(`/cognition/agents/${agentId}/memories${query ? `?${query}` : ''}`, { signal })
}
export const fetchCognitiveBeliefs = (agentId, params = {}, signal) => {
  const query = new URLSearchParams(params).toString()
  return request(`/cognition/agents/${agentId}/beliefs${query ? `?${query}` : ''}`, { signal })
}
export const fetchCognitiveLearningEvents = (agentId, params = {}, signal) => {
  const query = new URLSearchParams(params).toString()
  return request(`/cognition/agents/${agentId}/learning-events${query ? `?${query}` : ''}`, { signal })
}
export const fetchCognitiveExperiments = signal => request('/cognition/research/experiments', { signal })
export const bootstrapCognitiveExperiments = () => request('/cognition/research/bootstrap', { method: 'POST' })
export const fetchCognitiveExperimentRuns = (agentId, signal) => request(`/cognition/agents/${agentId}/research/runs?per_page=20`, { signal })
export const captureCognitiveState = agentId => request(`/cognition/agents/${agentId}/state`, { method: 'POST' })
export const updateCognitiveAgent = (agentId, payload) => request(`/cognition/agents/${agentId}`, { method: 'PUT', body: payload })
