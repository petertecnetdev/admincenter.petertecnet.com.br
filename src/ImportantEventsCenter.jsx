import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ImportantEventsCenter.css'

const POLL_MS = 120000

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
}

function initials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts.at(-1)?.[0] || '' : '')).toUpperCase()
}

function statusLabel(value) {
  const key = String(value || '').toLowerCase()
  return ({ paid: 'Pago', approved: 'Aprovado', pending: 'Pendente', processing: 'Processando', failed: 'Falhou', cancelled: 'Cancelado', refunded: 'Reembolsado', charged_back: 'Chargeback', active: 'Ativo', checked_in: 'Check-in realizado' })[key] || String(value || '—')
}

export default function ImportantEventsCenter({ request }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [events, setEvents] = useState([])
  const [summary, setSummary] = useState({})
  const [severity, setSeverity] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [details, setDetails] = useState({})
  const [detailLoading, setDetailLoading] = useState({})
  const unreadInFlight = useRef(false)
  const listSequence = useRef(0)
  const searchTimer = useRef(null)
  const drawerRef = useRef(null)
  const triggerRef = useRef(null)
  const wasOpenRef = useRef(false)

  const refreshUnread = useCallback(async () => {
    if (unreadInFlight.current || document.visibilityState !== 'visible' || !navigator.onLine) return
    unreadInFlight.current = true
    try {
      const payload = await request('/admin/ecosystem/important-events/unread-count')
      setUnread(Number(payload?.unread) || 0)
    } catch (loadError) {
      if (loadError?.status === 401) setUnread(0)
    } finally {
      unreadInFlight.current = false
    }
  }, [request])

  const loadEvents = useCallback(async () => {
    const sequence = ++listSequence.current
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ per_page: '50' })
    if (severity) params.set('severity', severity)
    if (unreadOnly) params.set('unread', '1')
    if (search.trim()) params.set('search', search.trim())
    try {
      const payload = await request(`/admin/ecosystem/important-events?${params.toString()}`)
      if (sequence !== listSequence.current) return
      setEvents(payload?.events?.data || [])
      setSummary(payload?.summary || {})
      setUnread(Number(payload?.summary?.unread ?? unread) || 0)
    } catch (loadError) {
      if (sequence === listSequence.current) setError(loadError.message)
    } finally {
      if (sequence === listSequence.current) setLoading(false)
    }
  }, [request, search, severity, unreadOnly, unread])

  useEffect(() => {
    void refreshUnread()
    const timer = window.setInterval(() => { void refreshUnread() }, POLL_MS)
    const onFocus = () => { void refreshUnread() }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshUnread])

  useEffect(() => {
    if (!open) return undefined
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => { void loadEvents() }, 300)
    return () => window.clearTimeout(searchTimer.current)
  }, [open, loadEvents])

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      const frame = window.requestAnimationFrame(() => drawerRef.current?.querySelector('button, input, select')?.focus())
      return () => window.cancelAnimationFrame(frame)
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  async function markRead(id) {
    const row = events.find(item => Number(item.id) === Number(id))
    if (!row || row.is_read) return
    try {
      await request(`/admin/ecosystem/important-events/${id}/read`, { method: 'PATCH' })
      setEvents(current => current.map(item => Number(item.id) === Number(id) ? { ...item, is_read: true } : item))
      setUnread(current => Math.max(0, current - 1))
      setSummary(current => ({ ...current, unread: Math.max(0, Number(current.unread ?? unread) - 1) }))
    } catch {
      // Reading a detail should never block the operator because acknowledgement failed.
    }
  }

  async function toggleDetail(id) {
    if (Number(selectedId) === Number(id)) { setSelectedId(null); return }
    setSelectedId(id)
    void markRead(id)
    if (details[id] || detailLoading[id]) return
    setDetailLoading(current => ({ ...current, [id]: true }))
    try {
      const payload = await request(`/admin/ecosystem/important-events/${id}`)
      if (payload?.event) setDetails(current => ({ ...current, [id]: payload.event }))
    } catch (loadError) {
      setDetails(current => ({ ...current, [id]: { _error: loadError.message } }))
    } finally {
      setDetailLoading(current => ({ ...current, [id]: false }))
    }
  }

  async function markAllRead() {
    try {
      await request('/admin/ecosystem/important-events/read-all', { method: 'PATCH' })
      setUnread(0)
      setSummary(current => ({ ...current, unread: 0 }))
      setEvents(current => current.map(item => ({ ...item, is_read: true })))
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  function keydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(drawerRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]') || [])]
    if (!focusable.length) return
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const selected = events.find(item => Number(item.id) === Number(selectedId)) || null
  const selectedFull = selected ? details[selected.id] : null
  const selectedDetail = selectedFull?.details || {}
  const selectedMeta = selected?.metadata || {}
  const buyer = selectedDetail.buyer || (selectedMeta.buyer_name ? { name: selectedMeta.buyer_name, email: selectedMeta.buyer_email } : null)
  const order = selectedDetail.order || null
  const payment = selectedDetail.payment || null
  const event = selectedDetail.event || null
  const items = Array.isArray(selectedDetail.items) ? selectedDetail.items : []
  const holders = Array.isArray(selectedDetail.holders) ? selectedDetail.holders : []

  const counts = useMemo(() => ({
    unread: Number(summary?.unread ?? unread) || 0,
    success: Number(summary?.success) || 0,
    warning: Number(summary?.warning) || 0,
    critical: Number(summary?.critical) || 0,
  }), [summary, unread])

  return <>
    <button ref={triggerRef} type="button" className="important-events-trigger" onClick={() => setOpen(true)} aria-label={unread ? `Eventos importantes, ${unread} não lidos` : 'Eventos importantes'} aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
      {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="important-events-layer">
      <button className="important-events-backdrop" type="button" aria-label="Fechar eventos importantes" onClick={() => setOpen(false)}/>
      <aside ref={drawerRef} className="important-events-drawer" role="dialog" aria-modal="true" aria-labelledby="important-events-title" onKeyDown={keydown}>
        <header>
          <div><small>ECOSSISTEMA / SINAIS</small><h2 id="important-events-title">Eventos importantes</h2><p>Vendas, pagamentos e acontecimentos relevantes sem interromper sua leitura do painel.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
        </header>
        <div className="important-events-summary">
          <article><span>Não lidos</span><b>{counts.unread}</b></article><article><span>Sucesso</span><b>{counts.success}</b></article><article><span>Atenção</span><b>{counts.warning}</b></article><article><span>Críticos</span><b>{counts.critical}</b></article>
        </div>
        <div className="important-events-tools">
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar evento, pedido ou aplicação…" aria-label="Buscar eventos importantes"/>
          <select value={severity} onChange={event => setSeverity(event.target.value)} aria-label="Filtrar severidade"><option value="">Todas as severidades</option><option value="success">Sucesso</option><option value="warning">Atenção</option><option value="critical">Crítico</option><option value="info">Informação</option></select>
          <label><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)}/> Só não lidos</label>
          <button type="button" onClick={markAllRead}>Marcar tudo como lido</button>
        </div>
        <main className="important-events-list" aria-busy={loading}>
          {error && <div className="important-events-empty error" role="alert">{error}</div>}
          {!error && loading && !events.length && <div className="important-events-empty">Carregando eventos…</div>}
          {!error && !loading && !events.length && <div className="important-events-empty">Nenhum evento importante neste filtro.</div>}
          {events.map(item => {
            const meta = item.metadata || {}
            const expanded = Number(selectedId) === Number(item.id)
            return <article className={`important-event ${item.is_read ? '' : 'unread'} ${expanded ? 'expanded' : ''}`} key={item.id}>
              <button type="button" className="important-event-summary" onClick={() => void toggleDetail(item.id)} aria-expanded={expanded}>
                <i className={item.severity || 'info'}/>
                <span><b>{item.title || 'Evento importante'}</b><small>{item.message || ''}</small><em>{item.application?.name || meta.app_slug || 'Ecossistema'}{meta.buyer_name ? ` · ${meta.buyer_name}` : ''}{meta.ticket_count ? ` · ${meta.ticket_count} ingresso(s)` : ''}{meta.total !== undefined ? ` · ${currency(meta.total)}` : ''}</em></span>
                <time>{dateTime(item.occurred_at || item.created_at)}</time>
              </button>
              {expanded && <section className="important-event-detail">
                {detailLoading[item.id] && <p>Carregando detalhes…</p>}
                {selectedFull?._error && <p className="error">{selectedFull._error}</p>}
                {!detailLoading[item.id] && !selectedFull?._error && <div className="important-event-detail-grid">
                  <article><h3>Comprador</h3>{buyer ? <div className="important-event-person"><span>{initials(buyer.name)}</span><div><b>{buyer.name || 'Comprador'}</b><small>{buyer.email || buyer.user_name || 'Identificado no pedido'}</small></div></div> : <p>Comprador não identificado.</p>}</article>
                  <article><h3>Pedido</h3><dl><div><dt>Status</dt><dd>{statusLabel(order?.status || selected?.severity)}</dd></div><div><dt>Total</dt><dd>{currency(order?.total ?? selectedMeta.total)}</dd></div><div><dt>Líquido</dt><dd>{currency(order?.producer_net ?? selectedMeta.producer_net)}</dd></div></dl></article>
                  <article><h3>Pagamento</h3><dl><div><dt>Provedor</dt><dd>{payment?.provider || '—'}</dd></div><div><dt>Método</dt><dd>{payment?.method || order?.payment_method || '—'}</dd></div><div><dt>Status</dt><dd>{statusLabel(payment?.status)}</dd></div></dl></article>
                  <article><h3>Evento</h3><dl><div><dt>Evento</dt><dd>{event?.title || selectedMeta.event_title || '—'}</dd></div><div><dt>Data</dt><dd>{dateTime(event?.start_date)}</dd></div><div><dt>Local</dt><dd>{[event?.venue,event?.city,event?.uf].filter(Boolean).join(' · ') || '—'}</dd></div></dl></article>
                  {(items.length > 0 || holders.length > 0) && <article className="wide"><h3>Itens e participantes</h3><div className="important-event-detail-list">{items.map((row,index) => <span key={row.id || index}><b>{row.name || row.type || 'Item'}</b><small>{Number(row.quantity)||0} × {currency(row.unit_price)} · {currency(row.subtotal)}</small></span>)}{holders.map((row,index) => <span key={row.id || `h-${index}`}><b>{row.holder_name || 'Participante'}</b><small>{row.holder_email || ''} · {statusLabel(row.status)}</small></span>)}</div></article>}
                </div>}
              </section>}
            </article>
          })}
        </main>
      </aside>
    </div>}
  </>
}
