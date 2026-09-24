import { useEffect, useMemo, useRef, useState } from 'react'
import { readAdminSessionState, writeAdminSessionState } from './adminPersistence.js'
import './NotificationsCenter.css'

const notificationTypes = [
  ['info', 'Informação'],
  ['success', 'Sucesso'],
  ['warning', 'Atenção'],
  ['critical', 'Crítica'],
  ['maintenance', 'Manutenção'],
  ['marketing', 'Novidade / marketing'],
  ['general', 'Geral'],
]

const audienceOptions = [
  ['application', 'Usuários de uma aplicação', 'Envia somente para usuários com acesso ativo à aplicação selecionada.'],
  ['ecosystem', 'Todo o ecossistema', 'Entrega em cada aplicação ativa à qual cada usuário realmente pertence.'],
  ['users', 'Usuários específicos', 'Selecione uma ou mais pessoas e, opcionalmente, restrinja a uma aplicação.'],
]

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function userName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || `Usuário #${user?.id}`
}

function audienceLabel(campaign) {
  if (campaign?.audience_type === 'ecosystem') return 'Todo o ecossistema'
  if (campaign?.audience_type === 'users') return 'Usuários específicos'
  return campaign?.application?.name || 'Aplicação'
}

function typeLabel(type) {
  return notificationTypes.find(([value]) => value === type)?.[1] || type || 'Geral'
}

export default function NotificationsCenter({ request, applications = [] }) {
  const [form, setForm] = useState({
    audience_type: 'application',
    app_id: '',
    user_ids: [],
    type: 'info',
    title: '',
    message: '',
    reference_url: '',
  })
  const [campaigns, setCampaigns] = useState([])
  const [summary, setSummary] = useState({})
  const [pagination, setPagination] = useState(null)
  const savedHistory = useMemo(() => readAdminSessionState('notifications-history', { page: 1, search: '', app: '' }), [])
  const [page, setPage] = useState(() => Number(savedHistory.page || 1))
  const [historySearch, setHistorySearch] = useState(() => savedHistory.search || '')
  const [historyApp, setHistoryApp] = useState(() => savedHistory.app || '')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState([])
  const [userSearching, setUserSearching] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState([])
  const searchTimer = useRef(null)
  const campaignSequenceRef = useRef(0)
  const userSearchSequenceRef = useRef(0)
  const campaignsLoadedRef = useRef(false)

  useEffect(() => {
    writeAdminSessionState('notifications-history', { page, search: historySearch, app: historyApp })
  }, [page, historySearch, historyApp])

  const activeApplications = useMemo(
    () => applications.filter(application => application?.is_active !== false).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    [applications],
  )

  const audiencePayload = useMemo(() => ({
    audience_type: form.audience_type,
    app_id: form.app_id ? Number(form.app_id) : null,
    user_ids: form.audience_type === 'users' ? selectedUsers.map(user => Number(user.id)) : [],
  }), [form.audience_type, form.app_id, selectedUsers])

  async function loadCampaigns(targetPage = page) {
    const sequence = ++campaignSequenceRef.current
    if (!campaignsLoadedRef.current) setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(targetPage), per_page: '25' })
      if (historySearch.trim()) params.set('search', historySearch.trim())
      if (historyApp) params.set('app_id', historyApp)
      const payload = await request(`/admin/ecosystem/notifications?${params.toString()}`)
      if (sequence !== campaignSequenceRef.current) return
      setCampaigns(payload?.campaigns?.data || [])
      setPagination(payload?.campaigns || null)
      setSummary(payload?.summary || {})
      setPage(Number(payload?.campaigns?.current_page || targetPage))
    } catch (err) {
      if (sequence === campaignSequenceRef.current) setError(err.message)
    } finally {
      if (sequence === campaignSequenceRef.current) {
        campaignsLoadedRef.current = true
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(page), per_page: '25' })
        if (historySearch.trim()) params.set('search', historySearch.trim())
        if (historyApp) params.set('app_id', historyApp)
        const payload = await request(`/admin/ecosystem/notifications?${params.toString()}`)
        if (!active) return
        setCampaigns(payload?.campaigns?.data || [])
        setPagination(payload?.campaigns || null)
        setSummary(payload?.summary || {})
        setPage(Number(payload?.campaigns?.current_page || 1))
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [request])

  useEffect(() => {
    window.clearTimeout(searchTimer.current)
    const term = userSearch.trim()
    if (form.audience_type !== 'users' || term.length < 2) return undefined

    const sequence = ++userSearchSequenceRef.current
    searchTimer.current = window.setTimeout(async () => {
      setUserSearching(true)
      try {
        const payload = await request(`/admin/ecosystem/users?search=${encodeURIComponent(term)}`)
        if (sequence === userSearchSequenceRef.current) setUserResults((payload?.users || []).slice(0, 12))
      } catch (err) {
        if (sequence === userSearchSequenceRef.current) {
          setError(err.message)
          setUserResults([])
        }
      } finally {
        if (sequence === userSearchSequenceRef.current) setUserSearching(false)
      }
    }, 300)
    return () => window.clearTimeout(searchTimer.current)
  }, [userSearch, form.audience_type, request])

  function change(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setPreview(null)
    setSuccess('')
  }

  function selectAudience(value) {
    setForm(current => ({ ...current, audience_type: value, app_id: value === 'ecosystem' ? '' : current.app_id }))
    if (value !== 'users') {
      setUserResults([])
      setUserSearching(false)
    }
    setPreview(null)
    setSuccess('')
  }

  function changeUserSearch(value) {
    setUserSearch(value)
    if (value.trim().length < 2) {
      setUserResults([])
      setUserSearching(false)
    }
  }

  function toggleUser(user) {
    setSelectedUsers(current => current.some(item => Number(item.id) === Number(user.id))
      ? current.filter(item => Number(item.id) !== Number(user.id))
      : [...current, user])
    setPreview(null)
  }

  async function calculatePreview() {
    setError('')
    setSuccess('')
    if (form.audience_type === 'application' && !form.app_id) {
      setError('Selecione a aplicação que receberá a notificação.')
      return
    }
    if (form.audience_type === 'users' && selectedUsers.length === 0) {
      setError('Selecione pelo menos um usuário.')
      return
    }
    setPreviewing(true)
    try {
      const payload = await request('/admin/ecosystem/notifications/preview', {
        method: 'POST',
        body: JSON.stringify(audiencePayload),
      })
      setPreview(payload)
    } catch (err) {
      setError(err.message)
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  async function sendNotification(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!form.title.trim() || !form.message.trim()) {
      setError('Informe o título e a mensagem da notificação.')
      return
    }
    if (!preview?.deliveries_count) {
      setError('Calcule o alcance antes de enviar. Isso evita disparos acidentais.')
      return
    }

    setSending(true)
    try {
      const payload = await request('/admin/ecosystem/notifications', {
        method: 'POST',
        body: JSON.stringify({
          ...audiencePayload,
          type: form.type,
          title: form.title.trim(),
          message: form.message.trim(),
          reference_url: form.reference_url.trim() || null,
        }),
      })
      setSuccess(`${payload?.message || 'Notificação enviada.'} ${formatNumber(payload?.deliveries_count)} entrega${Number(payload?.deliveries_count) === 1 ? '' : 's'} criada${Number(payload?.deliveries_count) === 1 ? '' : 's'}.`)
      setForm(current => ({ ...current, title: '', message: '', reference_url: '' }))
      setPreview(null)
      await loadCampaigns(1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return <>
    <div className="notifications-heading">
      <div>
        <p className="eyebrow">COMUNICAÇÃO / ECOSSISTEMA</p>
        <h2>Notificações</h2>
        <p>Envie comunicados para usuários do ecossistema usando a caixa de notificações central da Peter Tecnet.</p>
      </div>
      <button className="notification-refresh" type="button" onClick={() => loadCampaigns(page)} disabled={loading}>↻ Atualizar</button>
    </div>

    <div className="notification-metrics">
      <div><span>Campanhas</span><b>{formatNumber(summary.campaigns)}</b><small>{formatNumber(summary.campaigns_sent)} enviadas</small></div>
      <div><span>Entregas</span><b>{formatNumber(summary.deliveries)}</b><small>notificações individuais</small></div>
      <div><span>Lidas</span><b>{formatNumber(summary.read)}</b><small>{summary.deliveries ? `${Math.round((Number(summary.read || 0) / Number(summary.deliveries)) * 100)}% de leitura` : 'sem dados ainda'}</small></div>
      <div><span>Não lidas</span><b>{formatNumber(summary.unread)}</b><small>aguardando abertura</small></div>
    </div>

    <div className="notifications-layout">
      <form className="notification-composer" onSubmit={sendNotification}>
        <header><div><span className="composer-icon">✦</span><div><h3>Novo comunicado</h3><p>Defina público, conteúdo e destino antes do disparo.</p></div></div><span className="composer-badge">IN-APP</span></header>

        <fieldset>
          <legend>Público-alvo</legend>
          <div className="audience-options">
            {audienceOptions.map(([value, label, description]) => <button type="button" key={value} className={form.audience_type === value ? 'selected' : ''} onClick={() => selectAudience(value)}>
              <span className="audience-radio"/><div><b>{label}</b><small>{description}</small></div>
            </button>)}
          </div>

          {form.audience_type !== 'ecosystem' && <label className="notification-field">
            <span>Aplicação {form.audience_type === 'users' && <small>opcional</small>}</span>
            <select value={form.app_id} onChange={event => change('app_id', event.target.value)} required={form.audience_type === 'application'}>
              <option value="">{form.audience_type === 'users' ? 'Todas as aplicações dos usuários selecionados' : 'Selecione uma aplicação'}</option>
              {activeApplications.map(application => <option key={application.id} value={application.id}>{application.name}</option>)}
            </select>
          </label>}

          {form.audience_type === 'users' && <div className="user-picker">
            <label className="notification-field"><span>Buscar usuários</span><input value={userSearch} onChange={event => changeUserSearch(event.target.value)} placeholder="Nome, e-mail, username ou ID"/></label>
            {selectedUsers.length > 0 && <div className="selected-users">{selectedUsers.map(user => <button key={user.id} type="button" onClick={() => toggleUser(user)} title="Remover usuário"><span>{userName(user)}</span><i>×</i></button>)}</div>}
            {(userSearching || userResults.length > 0) && <div className="user-results">
              {userSearching ? <div className="user-searching">Buscando usuários…</div> : userResults.map(user => {
                const selected = selectedUsers.some(item => Number(item.id) === Number(user.id))
                return <button type="button" key={user.id} className={selected ? 'selected' : ''} onClick={() => toggleUser(user)}>
                  <span className="user-result-avatar">{userName(user).slice(0, 2).toUpperCase()}</span><span><b>{userName(user)}</b><small>{user.email}</small></span><i>{selected ? '✓' : '+'}</i>
                </button>
              })}
            </div>}
          </div>}

          <div className="preview-row">
            <button type="button" className="secondary-notification-button" onClick={calculatePreview} disabled={previewing}>{previewing ? 'Calculando…' : 'Calcular alcance'}</button>
            {preview && <div className="audience-preview"><b>{formatNumber(preview.users_count)} usuário{Number(preview.users_count) === 1 ? '' : 's'}</b><span>{formatNumber(preview.deliveries_count)} entrega{Number(preview.deliveries_count) === 1 ? '' : 's'} efetiva{Number(preview.deliveries_count) === 1 ? '' : 's'}</span></div>}
          </div>
        </fieldset>

        <fieldset>
          <legend>Conteúdo</legend>
          <div className="notification-form-grid">
            <label className="notification-field"><span>Tipo</span><select value={form.type} onChange={event => change('type', event.target.value)}>{notificationTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="notification-field wide"><span>Título <small>{form.title.length}/180</small></span><input maxLength="180" value={form.title} onChange={event => change('title', event.target.value)} placeholder="Ex.: Nova atualização disponível" required/></label>
            <label className="notification-field wide"><span>Mensagem <small>{form.message.length}/5000</small></span><textarea maxLength="5000" rows="6" value={form.message} onChange={event => change('message', event.target.value)} placeholder="Escreva uma mensagem objetiva para o usuário…" required/></label>
            <label className="notification-field wide"><span>Link ao abrir <small>opcional · HTTPS ou rota /interna</small></span><input value={form.reference_url} onChange={event => change('reference_url', event.target.value)} placeholder="https://… ou /minha-rota"/></label>
          </div>
        </fieldset>

        {error && <div className="notification-message error" role="alert">{error}</div>}
        {success && <div className="notification-message success" role="status">{success}</div>}

        <footer>
          <div><b>{preview?.deliveries_count ? `${formatNumber(preview.deliveries_count)} entregas prontas` : 'Alcance ainda não calculado'}</b><small>O envio cria uma notificação individual rastreável para cada destino.</small></div>
          <button className="send-notification-button" type="submit" disabled={sending || !preview?.deliveries_count}>{sending ? 'Enviando…' : preview?.deliveries_count ? `Enviar agora · ${formatNumber(preview.deliveries_count)}` : 'Enviar agora'}</button>
        </footer>
      </form>

      <aside className="notification-guidance">
        <div className="guidance-mark">!</div><h3>Envio controlado</h3><p>O Admin Center não envia para usuários sem vínculo ativo. Em um comunicado global, a mesma pessoa pode receber a mensagem em mais de uma aplicação que utiliza.</p>
        <div className="guidance-list"><span><i>1</i> Escolha o público</span><span><i>2</i> Calcule o alcance</span><span><i>3</i> Revise título, mensagem e link</span><span><i>4</i> Envie e acompanhe a leitura</span></div>
      </aside>
    </div>

    <div className="notification-history">
      <div className="history-head"><div><p className="eyebrow">HISTÓRICO</p><h3>Campanhas enviadas</h3><p>Entrega e leitura consolidadas a partir das notificações individuais.</p></div><div className="history-filters"><input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Pesquisar campanha…"/><select value={historyApp} onChange={event => setHistoryApp(event.target.value)}><option value="">Todas as aplicações</option>{activeApplications.map(application => <option key={application.id} value={application.id}>{application.name}</option>)}</select><button type="button" onClick={() => loadCampaigns(1)}>Filtrar</button></div></div>
      <div className="notification-table-wrap">
        <table className="notification-table"><thead><tr><th>Campanha</th><th>Público</th><th>Tipo</th><th>Entrega</th><th>Leitura</th><th>Enviada em</th><th>Status</th></tr></thead><tbody>
          {loading ? <tr><td colSpan="7"><div className="notification-empty">Carregando campanhas…</div></td></tr> : campaigns.length ? campaigns.map(campaign => <tr key={campaign.id}>
            <td><b>{campaign.title}</b><small>{campaign.message}</small></td>
            <td><b>{audienceLabel(campaign)}</b><small>{campaign.audience_type === 'users' ? `${campaign.recipient_user_ids?.length || 0} selecionado(s)` : campaign.application?.slug || 'alcance global'}</small></td>
            <td><span className={`notification-type type-${campaign.type}`}>{typeLabel(campaign.type)}</span></td>
            <td><b>{formatNumber(campaign.recipients_count)}</b><small>entregas</small></td>
            <td><b>{formatNumber(campaign.read_count)}</b><small>{Number(campaign.read_rate || 0).toLocaleString('pt-BR')}%</small></td>
            <td><b>{formatDate(campaign.sent_at || campaign.created_at)}</b></td>
            <td><span className={`campaign-status status-${campaign.status}`}>{campaign.status === 'sent' ? 'Enviada' : campaign.status === 'failed' ? 'Falhou' : 'Enviando'}</span></td>
          </tr>) : <tr><td colSpan="7"><div className="notification-empty">Nenhuma campanha administrativa foi enviada ainda.</div></td></tr>}
        </tbody></table>
      </div>
      {pagination && Number(pagination.last_page || 1) > 1 && <div className="history-pagination"><button type="button" disabled={page <= 1 || loading} onClick={() => loadCampaigns(page - 1)}>← Anterior</button><span>Página {page} de {pagination.last_page}</span><button type="button" disabled={page >= pagination.last_page || loading} onClick={() => loadCampaigns(page + 1)}>Próxima →</button></div>}
    </div>
  </>
}
