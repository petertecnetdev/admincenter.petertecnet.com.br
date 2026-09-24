import { useEffect, useMemo, useState } from 'react'
import './AdminUserDetailPage.css'
import AdminProcessingIndicator from './AdminProcessingIndicator.jsx'
import { confirmAction } from './utils/uiDialog.js'

const EMPTY_ACTIVITY_FILTERS = {
  q: '', app_id: '', type: '', outcome: '', severity: '', environment: '', entity_type: '', from: '', to: '', sort: 'newest', per_page: '50',
}

function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || 'Usuário'
}

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function dateOnly(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR')
}

function money(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed)
}

function compact(value) {
  const parsed = Number(value)
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number.isFinite(parsed) ? parsed : 0)
}

function statusLabel(value) {
  const labels = {
    active: 'Ativo', blocked: 'Bloqueado', suspended: 'Suspenso', pending: 'Pendente',
    success: 'Sucesso', error: 'Erro', failed: 'Falha', approved: 'Aprovado', cancelled: 'Cancelado',
    paid: 'Pago', confirmed: 'Confirmado', attended: 'Atendido', published: 'Publicado',
  }
  return labels[String(value || '').toLowerCase()] || value || '—'
}

function tone(value) {
  const normalized = String(value || '').toLowerCase()
  if (['error', 'failed', 'blocked', 'suspended', 'cancelled', 'critical', 'danger'].some(item => normalized.includes(item))) return 'danger'
  if (['pending', 'warning', 'attention', 'queued'].some(item => normalized.includes(item))) return 'warning'
  if (['active', 'success', 'approved', 'paid', 'confirmed', 'attended', 'published'].some(item => normalized.includes(item))) return 'success'
  return 'neutral'
}

function activityQuery(filters, page = 1) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value))
  })
  params.set('page', String(page))
  return params.toString()
}

function Metric({ label, value, detail }) {
  return <div className="aud-metric"><span>{label}</span><strong>{value ?? 0}</strong><small>{detail}</small></div>
}

function Empty({ children = 'Nenhum dado disponível neste recorte.' }) {
  return <div className="aud-empty">{children}</div>
}

function Field({ label, value }) {
  return <div className="aud-field"><span>{label}</span><b>{value || '—'}</b></div>
}

function ApplicationMark({ application }) {
  return <span className="aud-app-mark">
    {application?.logo ? <img src={application.logo} alt="" onError={event => { event.currentTarget.style.display = 'none' }}/> : <b>{String(application?.name || 'P').slice(0, 1)}</b>}
  </span>
}

function resourceContext(row) {
  if (row.establishment?.name) return row.establishment.name
  if (row.production?.name) return row.production.name
  if (row.event?.title) return row.event.title
  if (row.ticket?.name) return row.ticket.name
  if (row.link_types?.length) return row.link_types.join(' · ')
  if (row.city || row.uf) return [row.city, row.uf].filter(Boolean).join('/')
  return row.category || row.type || '—'
}

function resourceStatus(row) {
  if (row.is_cancelled) return 'Cancelado'
  if (row.status !== undefined && typeof row.status !== 'boolean') return statusLabel(row.status)
  if (row.appointment_status) return statusLabel(row.appointment_status)
  if (row.payment_status) return statusLabel(row.payment_status)
  if (row.is_published !== undefined) return row.is_published ? 'Publicado' : 'Oculto'
  if (typeof row.status === 'boolean') return row.status ? 'Ativo' : 'Inativo'
  if (row.is_approved !== undefined) return row.is_approved ? 'Aprovado' : 'Pendente'
  return '—'
}

function resourceValue(row) {
  if (row.total_price !== undefined && row.total_price !== null) return money(row.total_price)
  if (row.price !== undefined && row.price !== null) return money(row.price)
  if (row.start_date) return dateTime(row.start_date)
  if (row.order_datetime) return dateTime(row.order_datetime)
  if (row.checked_in_at) return `Check-in ${dateTime(row.checked_in_at)}`
  return dateTime(row.created_at)
}

export default function AdminUserDetailPage({ userId, apiRequest, applications = [], onBack, detailActions = null }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyAppId, setBusyAppId] = useState(null)
  const [tab, setTab] = useState('overview')
  const [resourceFilters, setResourceFilters] = useState({ q: '', app_id: '', resource: 'all' })
  const [activityFilters, setActivityFilters] = useState({ ...EMPTY_ACTIVITY_FILTERS })
  const [activityRows, setActivityRows] = useState([])
  const [activityPagination, setActivityPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [emailDeferralState, setEmailDeferralState] = useState(null)
  const [emailDeferralBusy, setEmailDeferralBusy] = useState(false)
  const [emailDeferralNotice, setEmailDeferralNotice] = useState('')
  const [passwordResetBusy, setPasswordResetBusy] = useState(false)
  const [passwordResetNotice, setPasswordResetNotice] = useState('')

  async function loadDetail({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const payload = await apiRequest(`/admin/ecosystem/users/${userId}`)
      setDetail(payload)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  async function loadEmailDeferralState() {
    try {
      const payload = await apiRequest(`/admin/ecosystem/users/${userId}/email-verification-deferrals`)
      setEmailDeferralState(payload?.email_verification || null)
    } catch {
      setEmailDeferralState(null)
    }
  }

  async function loadActivity(page = 1, filters = activityFilters) {
    setActivityLoading(true)
    setActivityError('')
    try {
      const payload = await apiRequest(`/admin/ecosystem/users/${userId}/activity?${activityQuery(filters, page)}`)
      setActivityRows(payload?.activity || [])
      setActivityPagination(payload?.pagination || { current_page: page, last_page: 1, total: payload?.activity?.length || 0 })
    } catch (err) {
      setActivityError(err.message)
    } finally {
      setActivityLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDetail()
      void loadEmailDeferralState()
      void loadActivity(1, { ...EMPTY_ACTIVITY_FILTERS })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [userId])

  const user = detail?.user
  const summary = detail?.summary || {}
  const platforms = detail?.platforms || []
  const resources = detail?.resources || {}
  const facets = detail?.activity_facets || {}

  const applicationOptions = useMemo(() => {
    const all = [...applications]
    platforms.forEach(platform => {
      const app = platform.application
      if (app?.id && !all.some(candidate => Number(candidate.id) === Number(app.id))) all.push(app)
    })
    return all.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
  }, [applications, platforms])

  const resourceGroups = useMemo(() => Object.entries(resources)
    .filter(([, group]) => Number(group?.total || 0) > 0)
    .map(([key, group]) => ({ key, ...group })), [resources])

  const filteredResources = useMemo(() => {
    const query = resourceFilters.q.trim().toLocaleLowerCase('pt-BR')
    const groups = resourceFilters.resource === 'all'
      ? resourceGroups
      : resourceGroups.filter(group => group.key === resourceFilters.resource)

    return groups.map(group => ({
      ...group,
      data: (group.data || []).filter(row => {
        if (resourceFilters.app_id && Number(row.app_id) !== Number(resourceFilters.app_id)) return false
        if (!query) return true
        const haystack = [
          row.name, row.title, row.slug, row.type, row.category, row.role, row.status,
          row.application?.name, row.establishment?.name, row.production?.name, row.event?.title,
          row.user?.name, row.user?.email, ...(row.link_types || []),
        ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
        return haystack.includes(query)
      }),
    })).filter(group => group.data.length > 0)
  }, [resourceFilters, resourceGroups])

  async function toggleAccess(application) {
    const platform = platforms.find(item => Number(item.application?.id) === Number(application.id))
    const currentStatus = platform?.access?.status
    const nextStatus = currentStatus === 'active' ? 'blocked' : 'active'
    setBusyAppId(application.id)
    setError('')
    try {
      await apiRequest(`/admin/ecosystem/users/${userId}/applications/${application.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus, role: platform?.access?.role || 'member' }),
      })
      await loadDetail({ quiet: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAppId(null)
    }
  }

  async function submitActivityFilters(event) {
    event.preventDefault()
    await loadActivity(1, activityFilters)
  }

  async function clearActivityFilters() {
    const next = { ...EMPTY_ACTIVITY_FILTERS }
    setActivityFilters(next)
    await loadActivity(1, next)
  }

  async function sendPasswordReset() {
    if (!user?.email) return

    const confirmed = await confirmAction({
      tone: 'warning',
      eyebrow: 'SEGURANÇA DA CONTA',
      title: 'Enviar redefinição de senha?',
      message: `Será enviado para ${user.email} um link seguro e um código de validação para o cliente cadastrar uma nova senha.`,
      confirmLabel: 'Enviar redefinição',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setPasswordResetBusy(true)
    setPasswordResetNotice('')
    setError('')

    try {
      const payload = await apiRequest('/auth/password-email', {
        method: 'POST',
        body: JSON.stringify({ email: user.email }),
      })
      setPasswordResetNotice(payload?.message || `E-mail de redefinição enviado para ${user.email}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setPasswordResetBusy(false)
    }
  }

  async function resetEmailVerificationDeferrals() {
    const used = Number(emailDeferralState?.deferrals_used || 0)
    const confirmed = await confirmAction({
      tone: 'warning',
      eyebrow: 'SUPORTE DE CONTA',
      title: 'Resetar adiamentos de e-mail?',
      message: `O usuário já utilizou ${used} adiamento(s). Ao resetar, ele poderá adiar a confirmação do e-mail novamente até o limite configurado.`,
      confirmLabel: 'Resetar adiamentos',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setEmailDeferralBusy(true)
    setEmailDeferralNotice('')
    setError('')

    try {
      const payload = await apiRequest(`/admin/ecosystem/users/${userId}/email-verification-deferrals/reset`, { method: 'POST' })
      setEmailDeferralState(payload?.email_verification || null)
      setEmailDeferralNotice(payload?.message || 'Adiamentos da confirmação de e-mail resetados com sucesso.')
    } catch (err) {
      setError(err.message)
    } finally {
      setEmailDeferralBusy(false)
    }
  }

  function switchTab(event, nextTab) {
    event.preventDefault()
    if (nextTab === tab) return

    const page = event.currentTarget.closest('.aud-page')
    const currentScrollY = window.scrollY
    const currentScrollX = window.scrollX

    if (page) {
      const currentHeight = Math.ceil(page.getBoundingClientRect().height)
      if (currentHeight > 0) page.style.minHeight = `${currentHeight}px`
    }

    setTab(nextTab)
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: currentScrollY, left: currentScrollX, behavior: 'auto' })
    })
  }

  if (loading) return <div className="aud-page">
    <AdminProcessingIndicator
      title="Carregando usuário"
      messages="Consultando os dados do usuário…|Sincronizando acessos, recursos e atividade…|Organizando a ficha administrativa…"
      detail="Aguarde enquanto as informações são carregadas."
    />
  </div>

  if (!user) return <div className="aud-page"><button type="button" className="aud-back" onClick={onBack}>← Voltar para usuários</button><div className="aud-error">{error || 'Não foi possível carregar este usuário.'}</div></div>

  const roleLabels = {
    producer: 'Produtor', participant: 'Participante', promoter: 'Promoter', barber: 'Barbeiro',
    barbershop_owner: 'Dono de barbearia', partner: 'Parceiro', ticket_seller: 'Vendedor de ingressos',
  }
  const activeRoles = Object.entries(user.roles || {}).filter(([, active]) => active).map(([key]) => roleLabels[key] || key)

  return <div className="aud-page">
    <div className="aud-page-head">
      <button type="button" className="aud-back" onClick={onBack}>← Voltar para usuários</button>
      <div className="aud-head-actions"><button type="button" className="aud-secondary" onClick={() => { void loadDetail(); void loadEmailDeferralState() }} disabled={loading}>↻ Atualizar ficha</button></div>
    </div>

    {error && <div className="aud-error">{error}</div>}

    <section className="aud-hero aud-hero--compact">
      <div className="aud-identity">
        <div className="aud-avatar">{user.avatar ? <img src={user.avatar} alt=""/> : fullName(user).slice(0, 2).toUpperCase()}</div>
        <div>
          <p className="aud-kicker">USUÁRIO #{user.id}</p>
          <h2>{fullName(user)}</h2>
          <p>{user.email} <span>·</span> @{user.user_name || 'sem-usuario'}</p>
          <div className="aud-chips">
            <span>{user.profile?.name || 'Sem perfil'}</span>
            <span className={user.email_verified_at ? 'is-success' : 'is-warning'}>{user.email_verified_at ? 'E-mail verificado' : 'E-mail não verificado'}</span>
            {activeRoles.map(role => <span key={role}>{role}</span>)}
          </div>
        </div>
      </div>

      <div className="aud-hero-side">
        {detailActions && <div className="aud-hero-actions">{detailActions}</div>}
        <div className="aud-hero-meta aud-hero-meta--compact">
          <Field label="Última atividade" value={dateTime(summary.last_activity_at)}/>
          <Field label="Último login" value={dateTime(summary.last_login_at)}/>
        </div>
      </div>
    </section>

    <div className="aud-metrics aud-metrics--compact">
      <Metric label="Interações" value={compact(summary.total_interactions)} detail={`${compact(summary.interactions_30d)} nos últimos 30 dias`}/>
      <Metric label="Aplicações" value={summary.applications || 0} detail="vínculos de acesso"/>
      {Number(summary.establishments || 0) > 0 && <Metric label="Estabelecimentos" value={summary.establishments} detail="vínculos ativos"/>}
      {Number(summary.productions || 0) > 0 && <Metric label="Produções" value={summary.productions} detail="produções vinculadas"/>}
      {Number(summary.events || 0) > 0 && <Metric label="Eventos" value={summary.events} detail="eventos vinculados"/>}
      {Number(summary.orders || 0) > 0 && <Metric label="Pedidos" value={summary.orders} detail="compras, vendas e agendamentos"/>}
    </div>

    <nav className="aud-tabs" aria-label="Seções do usuário">
      {[
        ['overview', 'Resumo'], ['resources', 'Recursos'], ['activity', 'Atividade'], ['security', 'Segurança'],
      ].map(([key, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={event => switchTab(event, key)}>{label}</button>)}
    </nav>

    {tab === 'overview' && <div className="aud-section-stack">
      <section className="aud-card">
        <header><div><span>IDENTIDADE</span><h3>Dados do usuário</h3></div></header>
        <div className="aud-fields-grid aud-fields-grid--essential">
          <Field label="ID" value={`#${user.id}`}/>
          <Field label="E-mail" value={user.email}/>
          <Field label="Telefone" value={user.phone}/>
          <Field label="Usuário" value={user.user_name ? `@${user.user_name}` : '—'}/>
          <Field label="Cidade/UF" value={[user.city, user.uf].filter(Boolean).join('/')}/>
          <Field label="Perfil" value={user.profile?.name}/>
        </div>
        <details className="aud-more-details">
          <summary>Mais dados cadastrais</summary>
          <div className="aud-fields-grid">
            <Field label="Criado em" value={dateTime(user.created_at)}/>
            <Field label="CPF" value={user.cpf_masked}/>
            <Field label="Nascimento" value={dateOnly(user.birthdate)}/>
            <Field label="Ocupação" value={user.occupation}/>
            <Field label="CEP" value={user.postal_code}/>
            <Field label="Endereço" value={user.address}/>
          </div>
          {user.about && <div className="aud-about"><span>Sobre</span><p>{user.about}</p></div>}
        </details>
      </section>

      <section className="aud-card">
        <header><div><span>PLATAFORMAS</span><h3>Uso e acesso por aplicação</h3><p>A mesma ficha acompanha o usuário em todo o ecossistema.</p></div></header>
        <div className="aud-platform-grid">
          {platforms.length ? platforms.map(platform => {
            const application = platform.application || {}
            const accessStatus = platform.access?.status || 'none'
            return <article className="aud-platform" key={application.id || application.name}>
              <div className="aud-platform-head"><ApplicationMark application={application}/><div><b>{application.name || `Aplicação #${application.id}`}</b><small>{application.slug || 'Peter Tecnet'}</small></div><span className={`aud-status ${tone(accessStatus)}`}>{accessStatus === 'none' ? 'Sem acesso' : statusLabel(accessStatus)}</span></div>
              <div className="aud-platform-stats"><div><span>Interações</span><b>{compact(platform.usage?.total)}</b></div><div><span>Último uso</span><b>{dateTime(platform.usage?.last_activity_at)}</b></div><div><span>Função</span><b>{platform.access?.role || '—'}</b></div></div>
              <div className="aud-resource-pills">{Object.entries(platform.resources || {}).map(([key, count]) => <span key={key}>{resources[key]?.label || key}: <b>{count}</b></span>)}</div>
            </article>
          }) : <Empty>Nenhuma aplicação possui atividade ou vínculo registrado.</Empty>}
        </div>
      </section>

      <section className="aud-card">
        <header><div><span>CONTROLE DE ACESSO</span><h3>Aplicações disponíveis</h3><p>Gerencie o vínculo sem sair da ficha do usuário.</p></div></header>
        <div className="aud-access-list">
          {applicationOptions.length ? applicationOptions.map(application => {
            const platform = platforms.find(item => Number(item.application?.id) === Number(application.id))
            const access = platform?.access
            const isActive = access?.status === 'active'
            return <div key={application.id} className="aud-access-row"><div><ApplicationMark application={application}/><span><b>{application.name}</b><small>{access ? `${statusLabel(access.status)} · ${access.role || 'member'} · desde ${dateOnly(access.joined_at)}` : 'Sem vínculo atual'}</small></span></div><button type="button" className={isActive ? 'aud-danger' : 'aud-primary'} disabled={busyAppId === application.id} onClick={() => toggleAccess(application)}>{busyAppId === application.id ? 'Salvando…' : isActive ? 'Bloquear' : 'Liberar acesso'}</button></div>
          }) : <Empty>Nenhuma aplicação cadastrada.</Empty>}
        </div>
      </section>
    </div>}

    {tab === 'resources' && <div className="aud-section-stack">
      <section className="aud-card aud-filter-card">
        <header><div><span>FILTROS</span><h3>Vínculos e recursos do ecossistema</h3></div><button type="button" className="aud-secondary" onClick={() => setResourceFilters({ q: '', app_id: '', resource: 'all' })}>Limpar</button></header>
        <div className="aud-resource-filters">
          <label className="aud-filter-wide">Buscar<input value={resourceFilters.q} onChange={event => setResourceFilters({ ...resourceFilters, q: event.target.value })} placeholder="Nome, categoria, estabelecimento, evento, função…"/></label>
          <label>Plataforma<select value={resourceFilters.app_id} onChange={event => setResourceFilters({ ...resourceFilters, app_id: event.target.value })}><option value="">Todas</option>{applicationOptions.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
          <label>Tipo de vínculo<select value={resourceFilters.resource} onChange={event => setResourceFilters({ ...resourceFilters, resource: event.target.value })}><option value="all">Todos</option>{resourceGroups.map(group => <option key={group.key} value={group.key}>{group.label} ({group.total})</option>)}</select></label>
        </div>
      </section>

      {filteredResources.length ? filteredResources.map(group => <section className="aud-card" key={group.key}>
        <header><div><span>RECURSO</span><h3>{group.label}</h3><p>{group.total} vínculo(s) encontrado(s){group.truncated ? ' · exibindo os registros mais recentes' : ''}</p></div></header>
        <div className="aud-resource-table"><table><thead><tr><th>Registro</th><th>Plataforma</th><th>Contexto</th><th>Status</th><th>Data/valor</th></tr></thead><tbody>{group.data.map((row, index) => <tr key={row.id || index}><td><b>{row.name || row.title || `#${row.id}`}</b><small>#{row.id}{row.slug ? ` · ${row.slug}` : ''}</small></td><td>{row.application?.name || '—'}</td><td>{resourceContext(row)}</td><td><span className={`aud-status ${tone(resourceStatus(row))}`}>{resourceStatus(row)}</span></td><td>{resourceValue(row)}</td></tr>)}</tbody></table></div>
      </section>) : <section className="aud-card"><Empty>Nenhum vínculo corresponde aos filtros atuais.</Empty></section>}
    </div>}

    {tab === 'activity' && <div className="aud-section-stack">
      <section className="aud-card aud-filter-card">
        <header><div><span>TELEMETRIA</span><h3>Filtros avançados de atividade</h3><p>Consulte a linha do tempo do usuário diretamente na API central.</p></div></header>
        <form className="aud-activity-filters" onSubmit={submitActivityFilters}>
          <label className="aud-filter-wide">Buscar<input value={activityFilters.q} onChange={event => setActivityFilters({ ...activityFilters, q: event.target.value })} placeholder="Ação, rota, entidade, request ID…"/></label>
          <label>Aplicação<select value={activityFilters.app_id} onChange={event => setActivityFilters({ ...activityFilters, app_id: event.target.value })}><option value="">Todas</option>{applicationOptions.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
          <label>Tipo<select value={activityFilters.type} onChange={event => setActivityFilters({ ...activityFilters, type: event.target.value })}><option value="">Todos</option>{(facets.types || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Resultado<select value={activityFilters.outcome} onChange={event => setActivityFilters({ ...activityFilters, outcome: event.target.value })}><option value="">Todos</option>{(facets.outcomes || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Severidade<select value={activityFilters.severity} onChange={event => setActivityFilters({ ...activityFilters, severity: event.target.value })}><option value="">Todas</option>{(facets.severities || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Ambiente<select value={activityFilters.environment} onChange={event => setActivityFilters({ ...activityFilters, environment: event.target.value })}><option value="">Todos</option>{(facets.environments || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Entidade<select value={activityFilters.entity_type} onChange={event => setActivityFilters({ ...activityFilters, entity_type: event.target.value })}><option value="">Todas</option>{(facets.entity_types || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>De<input type="date" value={activityFilters.from} onChange={event => setActivityFilters({ ...activityFilters, from: event.target.value })}/></label>
          <label>Até<input type="date" value={activityFilters.to} onChange={event => setActivityFilters({ ...activityFilters, to: event.target.value })}/></label>
          <label>Ordenar<select value={activityFilters.sort} onChange={event => setActivityFilters({ ...activityFilters, sort: event.target.value })}><option value="newest">Mais recentes</option><option value="oldest">Mais antigas</option></select></label>
          <label>Por página<select value={activityFilters.per_page} onChange={event => setActivityFilters({ ...activityFilters, per_page: event.target.value })}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label>
          <div className="aud-filter-actions aud-filter-wide"><button type="submit" className="aud-primary" disabled={activityLoading}>{activityLoading ? 'Filtrando…' : 'Aplicar filtros'}</button><button type="button" className="aud-secondary" onClick={clearActivityFilters}>Limpar</button></div>
        </form>
      </section>

      <section className="aud-card">
        <header><div><span>LINHA DO TEMPO</span><h3>{activityPagination.total || 0} atividade(s)</h3><p>Página {activityPagination.current_page || 1} de {activityPagination.last_page || 1}</p></div></header>
        {activityError && <div className="aud-error">{activityError}</div>}
        {activityLoading ? <AdminProcessingIndicator
          title="Carregando atividades"
          messages="Consultando a linha do tempo do usuário…|Sincronizando filtros e telemetria…|Organizando as atividades mais recentes…"
          detail="Aguarde enquanto a atividade é carregada."
        /> : activityRows.length ? <div className="aud-timeline">{activityRows.map(row => <article key={row.id} className="aud-activity-row">
          <i className={`aud-activity-dot ${tone(row.outcome || row.severity)}`}/>
          <div className="aud-activity-main"><div className="aud-activity-title"><b>{row.name || row.type || 'Interação'}</b><span className={`aud-status ${tone(row.outcome || row.severity)}`}>{row.outcome || row.severity || 'registrada'}</span></div><p>{row.application?.name || 'Peter Tecnet'} · {dateTime(row.created_at)}</p><div className="aud-activity-meta">{row.route && <span>{row.method || 'GET'} {row.route}</span>}{row.entity_type && <span>{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</span>}{row.environment && <span>{row.environment}</span>}{row.request_id && <span>req {row.request_id}</span>}</div></div>
        </article>)}</div> : <Empty>Nenhuma atividade corresponde aos filtros atuais.</Empty>}
        <footer className="aud-pagination"><span>{activityPagination.from && activityPagination.to ? `${activityPagination.from}–${activityPagination.to} de ${activityPagination.total}` : `${activityPagination.total || 0} registros`}</span><div><button type="button" className="aud-secondary" disabled={!activityPagination.previous_page || activityLoading} onClick={() => loadActivity(activityPagination.previous_page, activityFilters)}>← Anterior</button><button type="button" className="aud-secondary" disabled={!activityPagination.next_page || activityLoading} onClick={() => loadActivity(activityPagination.next_page, activityFilters)}>Próxima →</button></div></footer>
      </section>
    </div>}

    {tab === 'security' && <div className="aud-section-stack">
      <section className="aud-card">
        <header><div><span>SEGURANÇA</span><h3>Sinais da conta</h3><p>Leitura baseada na telemetria recente.</p></div></header>
        <div className="aud-security-alerts">{detail.security?.alerts?.length ? detail.security.alerts.map((alert, index) => <div key={index} className={`aud-security-alert ${tone(alert.level)}`}>{alert.message}</div>) : <div className="aud-security-alert success">Nenhum alerta de segurança detectado no recorte recente.</div>}</div>
        <div className="aud-security-metrics"><Metric label="Logins · 7d" value={summary.logins_7d || 0} detail="últimos 7 dias"/><Metric label="Logins · 30d" value={summary.logins_30d || 0} detail="últimos 30 dias"/><Metric label="Logins · 90d" value={summary.logins_90d || 0} detail="últimos 90 dias"/><Metric label="Primeira atividade" value={dateOnly(summary.first_activity_at)} detail={dateTime(summary.first_activity_at)}/></div>
      </section>

      <section className="aud-card">
        <header><div><span>REDEFINIÇÃO DE SENHA</span><h3>Enviar nova senha ao cliente</h3><p>O cliente recebe um link seguro e um código para validar o e-mail e cadastrar uma nova senha em um único fluxo.</p></div></header>
        {passwordResetNotice && <div className="aud-security-alert success">{passwordResetNotice}</div>}
        <div className="aud-filter-actions">
          <button type="button" className="aud-primary" onClick={sendPasswordReset} disabled={passwordResetBusy || !user.email}>
            {passwordResetBusy ? 'Enviando…' : 'Resetar senha'}
          </button>
          <span>Destino: {user.email || 'e-mail indisponível'}</span>
        </div>
      </section>

      <section className="aud-card">
        <header><div><span>CONFIRMAÇÃO DE E-MAIL</span><h3>Adiamentos da confirmação</h3><p>Use este controle quando o usuário atingir a 3ª solicitação e precisar voltar a adiar a confirmação.</p></div></header>
        <div className="aud-security-metrics">
          <Metric label="Adiamentos usados" value={emailDeferralState ? `${emailDeferralState.deferrals_used}/${emailDeferralState.max_deferrals}` : '—'} detail={emailDeferralState?.confirmation_required ? 'Confirmação obrigatória no próximo acesso' : 'limite atual da conta'}/>
          <Metric label="Adiamentos restantes" value={emailDeferralState?.deferrals_remaining ?? '—'} detail={emailDeferralState?.can_defer ? 'usuário ainda pode adiar' : 'nenhum adiamento disponível'}/>
          <Metric label="Último adiamento" value={dateOnly(emailDeferralState?.last_deferred_at)} detail={dateTime(emailDeferralState?.last_deferred_at)}/>
        </div>
        {emailDeferralNotice && <div className="aud-security-alert success">{emailDeferralNotice}</div>}
        <div className="aud-filter-actions">
          <button type="button" className="aud-primary" onClick={resetEmailVerificationDeferrals} disabled={emailDeferralBusy || emailDeferralState?.verified || !Number(emailDeferralState?.deferrals_used || 0)}>
            {emailDeferralBusy ? 'Resetando…' : 'Resetar adiamentos de e-mail'}
          </button>
          {emailDeferralState?.verified && <span>O e-mail deste usuário já está confirmado.</span>}
        </div>
      </section>

      <div className="aud-security-grid">
        <section className="aud-card"><header><div><span>REDE</span><h3>IPs recentes</h3></div></header><div className="aud-ranked-list">{detail.security?.ips?.length ? detail.security.ips.map(row => <div key={row.value}><code>{row.value}</code><b>{row.count}×</b></div>) : <Empty/>}</div></section>
        <section className="aud-card"><header><div><span>LOCALIZAÇÃO</span><h3>Locais observados</h3></div></header><div className="aud-ranked-list">{detail.security?.locations?.length ? detail.security.locations.map(row => <div key={row.value}><span>{row.value}</span><b>{row.count}×</b></div>) : <Empty/>}</div></section>
        <section className="aud-card"><header><div><span>DISPOSITIVOS</span><h3>Navegadores e sistemas</h3></div></header><div className="aud-ranked-list">{detail.security?.devices?.length ? detail.security.devices.map(row => <div key={row.value}><span>{row.value}</span><b>{row.count}×</b></div>) : <Empty/>}</div></section>
      </div>
    </div>}
  </div>
}
