import { useEffect, useMemo, useRef, useState } from 'react'
import './AdminImpersonation.css'
import AdminProcessingIndicator from './AdminProcessingIndicator.jsx'

const OWNER_EMAIL = 'petertecnet@gmail.com'
const DEFAULT_REASON = 'Configuração inicial e suporte ao cliente'

const displayName = user => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || 'Usuário'

const dateTime = value => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const sessionStatus = session => {
  if (session?.ended_at) return ['Encerrada', 'ended']
  if (!session?.active) return ['Expirada', 'expired']
  return ['Ativa', 'active']
}

const normalizeApplications = payload => payload?.applications || payload?.data || (Array.isArray(payload) ? payload : [])

export function AdminImpersonationDialog({ user, applications = [], apiRequest, onClose, onStarted }) {
  const incomingApplications = Array.isArray(applications) ? applications : []
  const [resolvedApplications, setResolvedApplications] = useState(incomingApplications)
  const [applicationsLoading, setApplicationsLoading] = useState(!incomingApplications.length)
  const [applicationsError, setApplicationsError] = useState('')
  const applicationsSequence = useRef(0)

  const eligibleApplications = useMemo(
    () => resolvedApplications.filter(app => app?.is_active !== false && app?.id),
    [resolvedApplications],
  )
  const userApplicationIds = useMemo(
    () => new Set((user?.applications || []).map(app => Number(app.id))),
    [user],
  )
  const preferredApplicationId = eligibleApplications.find(app => userApplicationIds.has(Number(app.id)))?.id
    || eligibleApplications[0]?.id
    || ''

  const [applicationId, setApplicationId] = useState(preferredApplicationId)
  const [reason, setReason] = useState(DEFAULT_REASON)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!incomingApplications.length) return
    setResolvedApplications(incomingApplications)
    setApplicationsLoading(false)
    setApplicationsError('')
  }, [applications])

  useEffect(() => {
    if (!user || incomingApplications.length) return undefined
    const sequence = ++applicationsSequence.current
    let active = true
    setApplicationsLoading(true)
    setApplicationsError('')

    Promise.resolve(apiRequest('/admin/applications'))
      .then(payload => {
        if (!active || sequence !== applicationsSequence.current) return
        const rows = normalizeApplications(payload)
        setResolvedApplications(Array.isArray(rows) ? rows : [])
      })
      .catch(err => {
        if (!active || sequence !== applicationsSequence.current) return
        setApplicationsError(err?.message || 'Não foi possível carregar os aplicativos disponíveis.')
      })
      .finally(() => {
        if (!active || sequence !== applicationsSequence.current) return
        setApplicationsLoading(false)
      })

    return () => { active = false }
  }, [user?.id, apiRequest, incomingApplications.length])

  useEffect(() => {
    setApplicationId(preferredApplicationId)
    setReason(DEFAULT_REASON)
    setError('')
  }, [user?.id, preferredApplicationId])

  useEffect(() => {
    if (!user || typeof document === 'undefined') return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('aim-modal-open')
    const handleKeyDown = event => { if (event.key === 'Escape' && !busy) onClose?.() }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('aim-modal-open')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [user, busy, onClose])

  if (!user) return null

  async function start(event) {
    event.preventDefault()
    if (!applicationId || reason.trim().length < 3) return
    const popup = window.open('about:blank', '_blank')
    if (popup) {
      try { popup.opener = null } catch {}
      try { popup.document.title = 'Abrindo acesso temporário…' } catch {}
    }
    setBusy(true)
    setError('')
    try {
      const payload = await apiRequest(`/admin/ecosystem/users/${user.id}/impersonate`, {
        method: 'POST',
        body: JSON.stringify({ application_id: Number(applicationId), reason: reason.trim() }),
      })
      if (!payload?.handoff_url) throw new Error('A API não retornou o endereço temporário de acesso.')
      if (popup && !popup.closed) popup.location.replace(payload.handoff_url)
      else window.location.assign(payload.handoff_url)
      onStarted?.(payload.impersonation)
      onClose?.()
    } catch (err) {
      if (popup && !popup.closed) popup.close()
      setError(err.message || 'Não foi possível iniciar o acesso temporário.')
    } finally { setBusy(false) }
  }

  return <div className="aim-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !busy && onClose?.()}>
    <section className="aim-dialog" role="dialog" aria-modal="true" aria-labelledby="aim-title" aria-describedby="aim-description">
      <header><div><span>ACESSO ADMINISTRATIVO TEMPORÁRIO</span><h3 id="aim-title">Entrar como {displayName(user)}</h3><p id="aim-description">Você navegará com as permissões deste usuário sem alterar senha, Google SSO ou credenciais dele.</p></div><button type="button" className="aim-close" onClick={onClose} disabled={busy} aria-label="Fechar">×</button></header>
      {error && <div className="aim-alert aim-alert--danger">{error}</div>}
      {applicationsError && <div className="aim-alert aim-alert--danger">{applicationsError}</div>}
      <div className="aim-identity"><div className="aim-avatar">{displayName(user).slice(0, 2).toUpperCase()}</div><div><strong>{displayName(user)}</strong><span>#{user.id} · {user.email}</span></div></div>
      <form onSubmit={start} className="aim-form">
        <label>Aplicativo
          {applicationsLoading ? <AdminProcessingIndicator
            title="Carregando aplicativos"
            messages="Consultando os aplicativos do ecossistema…|Validando os acessos disponíveis para este usuário…|Preparando as opções de acesso temporário…"
            detail="Aguarde enquanto a lista de aplicativos é sincronizada."
          /> : <>
            <select value={applicationId} onChange={event => setApplicationId(event.target.value)} required disabled={!eligibleApplications.length}>
              <option value="">{eligibleApplications.length ? 'Selecione' : 'Nenhum aplicativo disponível'}</option>
              {eligibleApplications.map(app => <option key={app.id} value={app.id}>{app.name}{userApplicationIds.has(Number(app.id)) ? ' · acesso vinculado' : ' · sem vínculo atual'}</option>)}
            </select>
            <small>O aplicativo é usado para limitar a sessão e registrar onde você atuou.</small>
          </>}
        </label>
        <label>Motivo do acesso<textarea rows="3" maxLength="500" value={reason} onChange={event => setReason(event.target.value)} required/><small>O motivo fica gravado no histórico de auditoria.</small></label>
        <div className="aim-security-note"><strong>Proteções ativas</strong><span>Sessão temporária, handoff de uso único, auditoria actor/effective_user e bloqueio de operações sensíveis.</span></div>
        {busy && <AdminProcessingIndicator
          title="Preparando acesso temporário"
          messages="Criando a sessão segura…|Gerando o handoff de uso único…|Abrindo o aplicativo com as permissões do usuário…"
          detail="Não feche esta janela até o acesso ser concluído."
        />}
        <div className="aim-actions"><button type="button" className="aim-secondary" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="aim-primary" disabled={busy || applicationsLoading || !eligibleApplications.length || !applicationId || reason.trim().length < 3}>{busy ? 'Criando acesso…' : 'Entrar como usuário'}</button></div>
      </form>
    </section>
  </div>
}

export function AdminImpersonationHistory({ apiRequest, refreshKey = 0 }) {
  const [sessions, setSessions] = useState([])
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [auditSession, setAuditSession] = useState(null)
  const [auditRows, setAuditRows] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const requestSequence = useRef(0)
  const auditSequence = useRef(0)

  async function load(page = 1, { quiet = false } = {}) {
    const sequence = ++requestSequence.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const payload = await apiRequest(`/admin/ecosystem/impersonations?page=${page}&per_page=10`)
      if (sequence !== requestSequence.current) return
      setSessions(payload?.sessions || [])
      setPagination(payload?.pagination || { current_page: page, last_page: 1, total: 0 })
    } catch (err) {
      if (sequence !== requestSequence.current) return
      setError(err.message || 'Não foi possível carregar o histórico de acessos.')
    } finally { if (sequence === requestSequence.current && !quiet) setLoading(false) }
  }

  useEffect(() => { load(1).catch(() => {}) }, [refreshKey])

  async function endSession(session) {
    setError('')
    try {
      await apiRequest(`/admin/ecosystem/impersonations/${session.id}/end`, { method: 'POST' })
      await load(pagination.current_page || 1, { quiet: true })
      if (auditSession?.id === session.id) setAuditSession(null)
    } catch (err) { setError(err.message || 'Não foi possível encerrar a sessão.') }
  }

  async function showAudit(session) {
    const sequence = ++auditSequence.current
    setAuditSession(session); setAuditRows([]); setAuditLoading(true); setError('')
    try {
      const payload = await apiRequest(`/admin/ecosystem/impersonations/${session.id}/audit?per_page=100`)
      if (sequence !== auditSequence.current) return
      setAuditRows(payload?.audit || [])
    } catch (err) {
      if (sequence !== auditSequence.current) return
      setError(err.message || 'Não foi possível carregar as ações auditadas.')
    } finally { if (sequence === auditSequence.current) setAuditLoading(false) }
  }

  return <section className="acu-card aim-history">
    <header><div><span>SEGURANÇA E AUDITORIA</span><h3>Histórico de acessos como usuário</h3><p>{pagination.total || 0} sessão(ões) registrada(s)</p></div><button className="acu-secondary" onClick={() => load(pagination.current_page || 1)} disabled={loading}>↻ Atualizar</button></header>
    {error && <div className="aim-alert aim-alert--danger">{error}</div>}
    {loading ? <AdminProcessingIndicator title="Carregando histórico" messages="Consultando as sessões administrativas…|Organizando os registros de auditoria…|Preparando o histórico de acessos…"/> : sessions.length ? <div className="acu-table-wrap"><table><thead><tr><th>Sessão</th><th>Administrador → usuário</th><th>Aplicativo</th><th>Período</th><th>Status</th><th>Ações</th></tr></thead><tbody>{sessions.map(session => { const [label, tone] = sessionStatus(session); return <tr key={session.id}><td><b>#{session.id}</b><small>{session.reason || 'Sem motivo informado'}</small></td><td><b>{session.actor?.name || session.actor?.email || 'Administrador'}</b><small>→ {session.effective_user?.name || session.effective_user?.email || 'Usuário removido'}</small></td><td><b>{session.application?.name || '—'}</b><small>{session.application?.slug || '—'}</small></td><td><b>{dateTime(session.started_at)}</b><small>expira {dateTime(session.expires_at)}</small></td><td><span className={`aim-status aim-status--${tone}`}>{label}</span><small>{session.audit_logs_count || 0} ação(ões)</small></td><td><div className="acu-actions"><button onClick={() => showAudit(session)}>Ver ações</button>{session.active && <button className="acu-danger" onClick={() => endSession(session)}>Encerrar</button>}</div></td></tr> })}</tbody></table></div> : <div className="acu-empty">Nenhuma sessão de impersonação registrada.</div>}
    <footer className="acu-pagination"><span>Página {pagination.current_page || 1} de {pagination.last_page || 1}</span><div><button className="acu-secondary" disabled={(pagination.current_page || 1) <= 1 || loading} onClick={() => load((pagination.current_page || 1) - 1)}>← Anterior</button><button className="acu-secondary" disabled={(pagination.current_page || 1) >= (pagination.last_page || 1) || loading} onClick={() => load((pagination.current_page || 1) + 1)}>Próxima →</button></div></footer>
    {auditSession && <div className="aim-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setAuditSession(null)}><section className="aim-dialog aim-dialog--audit" role="dialog" aria-modal="true"><header><div><span>AUDITORIA DA SESSÃO #{auditSession.id}</span><h3>Actor → effective user</h3><p>{auditSession.actor?.email || 'Administrador'} → {auditSession.effective_user?.email || 'Usuário'}</p></div><button className="aim-close" onClick={() => setAuditSession(null)} aria-label="Fechar">×</button></header>{auditLoading ? <AdminProcessingIndicator title="Carregando ações auditadas" messages="Consultando as ações da sessão…|Validando rotas, entidades e respostas…|Organizando a trilha de auditoria…"/> : auditRows.length ? <div className="aim-audit-list">{auditRows.map(row => <article key={row.id}><div><span className="aim-method">{row.method}</span><strong>{row.action || 'request'}</strong><small>{dateTime(row.created_at)}</small></div><code>{row.path}</code><footer><span>HTTP {row.status_code || '—'}</span><span>{row.entity_type ? `${row.entity_type}${row.entity_id ? ` #${row.entity_id}` : ''}` : 'sem entidade'}</span></footer></article>)}</div> : <div className="acu-empty">Nenhuma ação auditada nesta sessão.</div>}</section></div>}
  </section>
}

export function canImpersonate(user) {
  return Boolean(user?.id) && String(user?.email || '').toLowerCase() !== OWNER_EMAIL
}
