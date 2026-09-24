import { useEffect, useMemo, useRef, useState } from 'react'
import './SupportAdminApp.css'

const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const TOKEN_KEY = 'petertecnet_admin_token'

const statuses = [
  ['open', 'Aberto'], ['in_progress', 'Em atendimento'], ['waiting_customer', 'Aguardando cliente'], ['resolved', 'Resolvido'], ['closed', 'Encerrado'],
]
const priorities = [['low', 'Baixa'], ['normal', 'Normal'], ['high', 'Alta'], ['urgent', 'Urgente']]
const categories = [['general', 'Geral'], ['access', 'Acesso'], ['account', 'Conta'], ['technical', 'Técnico'], ['billing', 'Cobrança'], ['bug', 'Bug'], ['suggestion', 'Sugestão'], ['security', 'Segurança']]

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (response.status === 401 || response.status === 403) {
    if (response.status === 401) localStorage.removeItem(TOKEN_KEY)
    const error = new Error(payload?.message || 'Sessão administrativa inválida.')
    error.status = response.status
    throw error
  }
  if (!response.ok) {
    const error = new Error(payload?.message || Object.values(payload?.errors || {}).flat()?.[0] || 'Falha ao concluir a operação.')
    error.status = response.status
    throw error
  }
  return payload
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

function label(options, value) { return options.find(([key]) => key === value)?.[1] || value || '—' }
function dateTime(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }

function SummaryCard({ label: title, value, detail, tone = '' }) {
  return <article className={`support-admin-metric ${tone}`}><small>{title}</small><strong>{value ?? 0}</strong><span>{detail}</span></article>
}

function TicketRow({ ticket, active, onClick }) {
  return <button className={`support-ticket-row ${active ? 'active' : ''}`} onClick={onClick} type="button">
    <div className="support-ticket-row-top"><span className={`support-priority priority-${ticket.priority}`}>{label(priorities, ticket.priority)}</span><time>{dateTime(ticket.last_message_at || ticket.created_at)}</time></div>
    <b>{ticket.subject}</b>
    <p>{ticket.requester_name || ticket.requester_email}</p>
    <div className="support-ticket-row-meta"><span>{ticket.application?.name || 'Peter Tecnet'}</span><span className={`status-${ticket.status}`}>{label(statuses, ticket.status)}</span></div>
  </button>
}

function TicketDetail({ ticket, onChanged }) {
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setReply(''); setInternal(false); setError('') }, [ticket?.id])

  async function patch(field, value) {
    setSaving(true); setError('')
    try {
      const payload = await request(`/admin/support/tickets/${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) })
      onChanged(payload.ticket)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function sendReply(event) {
    event.preventDefault()
    if (!reply.trim() || saving) return
    setSaving(true); setError('')
    try {
      const payload = await request(`/admin/support/tickets/${ticket.id}/messages`, {
        method: 'POST', body: JSON.stringify({ message: reply.trim(), is_internal: internal }),
      })
      setReply('')
      onChanged(payload.ticket)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return <section className="support-detail">
    <header className="support-detail-head">
      <div><p>#{ticket.public_id?.slice(0, 8).toUpperCase()} · {ticket.application?.name || 'Peter Tecnet'}</p><h2>{ticket.subject}</h2></div>
      <a href={ticket.source_url || `https://petertecnet.com.br/suporte`} target="_blank" rel="noreferrer">Abrir origem ↗</a>
    </header>

    <div className="support-control-grid">
      <label>Status<select disabled={saving} value={ticket.status} onChange={e => patch('status', e.target.value)}>{statuses.map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label>
      <label>Prioridade<select disabled={saving} value={ticket.priority} onChange={e => patch('priority', e.target.value)}>{priorities.map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label>
      <label>Categoria<select disabled={saving} value={ticket.category} onChange={e => patch('category', e.target.value)}>{categories.map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label>
    </div>

    <div className="support-requester-grid">
      <div><small>Solicitante</small><b>{ticket.requester_name || '—'}</b><span>{ticket.requester_email}</span>{ticket.requester_phone && <span>{ticket.requester_phone}</span>}</div>
      <div><small>Aplicação</small><b>{ticket.application?.name || 'Peter Tecnet'}</b><span>{ticket.establishment?.name || 'Sem estabelecimento vinculado'}</span></div>
      <div><small>Abertura</small><b>{dateTime(ticket.created_at)}</b><span>1ª resposta: {dateTime(ticket.first_response_at)}</span></div>
    </div>

    {error && <div className="support-admin-error">{error}</div>}

    <div className="support-thread">
      {(ticket.messages || []).map(message => <article key={message.id} className={`support-thread-message author-${message.author_type} ${message.is_internal ? 'internal' : ''}`}>
        <header><b>{message.author_name || 'Sistema'}</b><div>{message.is_internal && <span>NOTA INTERNA</span>}<time>{dateTime(message.created_at)}</time></div></header>
        <p>{message.body}</p>
        {message.metadata?.changes && <dl>{Object.entries(message.metadata.changes).map(([key, change]) => <div key={key}><dt>{key}</dt><dd>{String(change.from ?? '—')} → {String(change.to ?? '—')}</dd></div>)}</dl>}
      </article>)}
    </div>

    <form className="support-admin-reply" onSubmit={sendReply}>
      <div className="support-reply-head"><b>{internal ? 'Adicionar nota interna' : 'Responder ao cliente'}</b><label className="support-switch"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)}/><span/>Nota interna</label></div>
      <textarea rows="5" maxLength="12000" value={reply} onChange={e => setReply(e.target.value)} placeholder={internal ? 'Essa nota só aparece no Admin Center…' : 'Escreva a resposta para o usuário…'} required/>
      <button disabled={saving}>{saving ? 'Salvando…' : internal ? 'Salvar nota' : 'Enviar resposta'} <span>↗</span></button>
    </form>
  </section>
}

export default function SupportAdminApp() {
  const [summary, setSummary] = useState({})
  const [applications, setApplications] = useState([])
  const [tickets, setTickets] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ q: '', status: 'open,in_progress,waiting_customer', priority: '', application_id: '' })
  const listRequestRef = useRef(null)
  const listSequenceRef = useRef(0)
  const detailRequestRef = useRef(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ per_page: '80' })
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
    return params.toString()
  }, [filters])

  async function loadList({ keepSelected = true } = {}) {
    listRequestRef.current?.abort()
    const controller = new AbortController()
    listRequestRef.current = controller
    const requestSequence = ++listSequenceRef.current
    setLoading(true); setError('')
    try {
      const signal = controller.signal
      const [summaryPayload, ticketPayload, appsPayload] = await Promise.all([
        request('/admin/support/summary', { signal }),
        request(`/admin/support/tickets?${queryString}`, { signal }),
        applications.length ? Promise.resolve({ applications }) : request('/admin/applications', { signal }),
      ])
      if (controller.signal.aborted || requestSequence !== listSequenceRef.current) return
      const rows = ticketPayload?.data || []
      setSummary(summaryPayload?.summary || {})
      setTickets(rows)
      if (!applications.length) setApplications(appsPayload?.applications || appsPayload?.data || [])
      if (!keepSelected) setSelected(null)
      else if (selected) {
        const stillVisible = rows.some(row => row.id === selected.id)
        if (!stillVisible) setSelected(null)
      }
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted || requestSequence !== listSequenceRef.current) return
      setError(err.message)
      if (err.status === 401 || err.status === 403) window.location.assign('/')
    } finally {
      if (requestSequence === listSequenceRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) { window.location.assign('/'); return undefined }
    void loadList({ keepSelected: false })
    return () => {
      listRequestRef.current?.abort()
      detailRequestRef.current?.abort()
    }
  }, [queryString])

  async function openTicket(row) {
    detailRequestRef.current?.abort()
    const controller = new AbortController()
    detailRequestRef.current = controller
    setError('')
    try {
      const payload = await request(`/admin/support/tickets/${row.id}`, { signal: controller.signal })
      if (!controller.signal.aborted) setSelected(payload.ticket)
    } catch (err) {
      if (!isAbortError(err) && !controller.signal.aborted) setError(err.message)
    }
  }

  async function changed(updated) {
    setSelected(updated)
    setTickets(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))
    const s = await request('/admin/support/summary').catch(() => null)
    if (s?.summary) setSummary(s.summary)
  }

  return <div className="support-admin-shell">
    <header className="support-admin-topbar">
      <a className="support-admin-brand" href="/"><img src="/petertecnet-brand.svg" alt=""/><span><b>Peter Tecnet</b><small>Admin Center / Support</small></span></a>
      <div><a href="https://petertecnet.com.br/suporte" target="_blank" rel="noreferrer">Ver central pública ↗</a><button onClick={() => loadList()}>↻ Atualizar</button><a className="back-link" href="/">← Dashboard</a></div>
    </header>

    <main className="support-admin-workspace">
      <section className="support-admin-hero"><div><p>ECOSYSTEM SUPPORT / CONTROL PLANE</p><h1>Central de suporte</h1><span>Todos os chamados do ecossistema, em uma fila operacional única.</span></div><div className="support-live"><i/><span>SUPPORT API</span><b>ONLINE</b></div></section>

      <section className="support-admin-metrics">
        <SummaryCard label="Ativos" value={summary.active} detail="Fila atual" tone="accent"/>
        <SummaryCard label="Novos" value={summary.open} detail="Aguardando atendimento"/>
        <SummaryCard label="Em atendimento" value={summary.in_progress} detail="Em andamento"/>
        <SummaryCard label="Aguardando cliente" value={summary.waiting_customer} detail="Resposta pendente"/>
        <SummaryCard label="Alta prioridade" value={summary.high_priority} detail={`${summary.urgent || 0} urgentes`} tone={summary.high_priority ? 'danger' : ''}/>
        <SummaryCard label="Resolvidos hoje" value={summary.resolved_today} detail={`${summary.created_today || 0} abertos hoje`} tone="success"/>
      </section>

      <section className="support-admin-layout">
        <aside className="support-queue">
          <div className="support-filter-bar">
            <input placeholder="Buscar chamado, usuário, e-mail…" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })}/>
            <div><select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="open,in_progress,waiting_customer">Fila ativa</option><option value="">Todos os status</option>{statuses.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select><select value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })}><option value="">Todas prioridades</option>{priorities.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></div>
            <select value={filters.application_id} onChange={e => setFilters({ ...filters, application_id: e.target.value })}><option value="">Todas aplicações</option>{applications.map(app => <option value={app.id} key={app.id}>{app.name}</option>)}</select>
          </div>
          {loading ? <div className="support-queue-state">Atualizando fila…</div> : tickets.length ? <div className="support-ticket-list">{tickets.map(ticket => <TicketRow key={ticket.id} ticket={ticket} active={selected?.id === ticket.id} onClick={() => openTicket(ticket)}/>)}</div> : <div className="support-queue-state">Nenhum chamado corresponde aos filtros.</div>}
        </aside>

        <div className="support-detail-wrap">
          {error && <div className="support-admin-error global">{error}</div>}
          {selected ? <TicketDetail ticket={selected} onChanged={changed}/> : <div className="support-empty-detail"><span>?</span><h2>Selecione um chamado</h2><p>Abra um item da fila para ver contexto, histórico e responder ao usuário.</p></div>}
        </div>
      </section>
    </main>
  </div>
}
