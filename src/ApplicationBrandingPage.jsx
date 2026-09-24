import { useEffect, useState } from 'react'
import ApplicationBrandingManager from './ApplicationBrandingManager.jsx'

const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'

async function loadApplications() {
  const token = localStorage.getItem('token')
  const response = await fetch(`${API}/admin/applications`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Sessão expirada.')
  }
  if (!response.ok) throw new Error(data?.message || data?.error || 'Não foi possível carregar as aplicações.')
  return data?.applications || []
}

export default function ApplicationBrandingPage() {
  const [applications, setApplications] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadApplications()
      .then(rows => active && setApplications(rows))
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  return <main className="ecosystem-main" style={{ minHeight: '100vh', padding: 'clamp(16px, 3vw, 34px)' }}>
    <header className="ecosystem-top" style={{ marginBottom: 18 }}>
      <div>
        <p className="admin-kicker">Peter Tecnet Admin Center</p>
        <h1>Branding dos aplicativos</h1>
      </div>
      <div className="top-actions"><a href="/admin/applications">← Aplicações</a></div>
    </header>
    {loading && <div className="notice">Carregando aplicativos…</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {!loading && !error && <ApplicationBrandingManager applications={applications} />}
  </main>
}
