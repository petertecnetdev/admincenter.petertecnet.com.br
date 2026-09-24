import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminRequest as apiRequest } from './adminApi.js'
import './AdminEstablishmentEvents.css'
import './AdminEstablishmentEventsBulk.css'
import { apiProgressRequest } from './adminApiProgress'

const pad = value => String(value).padStart(2, '0')
const toDateInput = value => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const toDateTimeInput = value => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const formatDate = value => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Data não informada'
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const number = value => Number(value || 0).toLocaleString('pt-BR')

function suggestedDate(event) {
  const source = new Date(event?.start_date)
  const candidate = Number.isNaN(source.getTime()) ? new Date() : new Date(source)
  candidate.setDate(candidate.getDate() + 7)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return toDateInput(candidate < tomorrow ? tomorrow : candidate)
}

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const emptyTicketForm = { name: '', ticket_type: '', type: '', price: '', quantity: '', limit_date: '', description: '' }
const WEEKDAYS = [
  { value: 0, label: 'Dom' }, { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' },
]

export default function AdminEstablishmentEvents({ establishment, app, onSuccess, ticketsOnly = false }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [seriesMode, setSeriesMode] = useState('dates')
  const [seriesDates, setSeriesDates] = useState([''])
  const [seriesWeekdays, setSeriesWeekdays] = useState([])
  const [seriesRangeStart, setSeriesRangeStart] = useState('')
  const [seriesRangeEnd, setSeriesRangeEnd] = useState('')
  const [seriesProgress, setSeriesProgress] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [expandedEventId, setExpandedEventId] = useState(null)
  const [ticketDetails, setTicketDetails] = useState({})
  const [ticketLoading, setTicketLoading] = useState(null)
  const [ticketError, setTicketError] = useState('')
  const [ticketFormEvent, setTicketFormEvent] = useState(null)
  const [editingTicket, setEditingTicket] = useState(null)
  const [ticketForm, setTicketForm] = useState(emptyTicketForm)
  const [selectedEventIds, setSelectedEventIds] = useState([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState('')
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState(null)

  const appId = Number(app?.id)
  const establishmentId = Number(establishment?.id)
  const endpoint = useMemo(() => `/admin/ecosystem/establishments/${establishmentId}/resources/events?app_id=${appId}`, [establishmentId, appId])

  const load = useCallback(async () => {
    if (!establishmentId || !appId) return
    setLoading(true)
    setError('')
    try {
      const payload = await apiRequest(endpoint)
      setEvents(payload?.events || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [endpoint, establishmentId, appId])

  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => {
    const now = Date.now()
    return {
      total: events.length,
      upcoming: events.filter(event => !event.is_cancelled && new Date(event.start_date).getTime() >= now).length,
      drafts: events.filter(event => !event.is_cancelled && !event.is_published).length,
      published: events.filter(event => !event.is_cancelled && event.is_published).length,
    }
  }, [events])

  const visibleEvents = useMemo(() => {
    const now = Date.now()
    const term = normalize(query.trim())
    return events.filter(event => {
      const start = new Date(event.start_date).getTime()
      const matchesFilter = filter === 'all'
        || (filter === 'upcoming' && !event.is_cancelled && start >= now)
        || (filter === 'drafts' && !event.is_cancelled && !event.is_published)
        || (filter === 'published' && !event.is_cancelled && event.is_published)
        || (filter === 'cancelled' && event.is_cancelled)
      if (!matchesFilter) return false
      if (!term) return true
      return normalize([event.title, event.venue, event.city, event.uf, event.id].filter(Boolean).join(' ')).includes(term)
    })
  }, [events, filter, query])

  const visibleEventIds = useMemo(() => visibleEvents.map(event => Number(event.id)).filter(Boolean), [visibleEvents])
  const selectedEvents = useMemo(() => {
    const selectedSet = new Set(selectedEventIds)
    return events.filter(event => selectedSet.has(Number(event.id)))
  }, [events, selectedEventIds])
  const selectedVisibleCount = useMemo(() => {
    const selectedSet = new Set(selectedEventIds)
    return visibleEventIds.filter(id => selectedSet.has(id)).length
  }, [selectedEventIds, visibleEventIds])
  const allVisibleSelected = visibleEventIds.length > 0 && selectedVisibleCount === visibleEventIds.length

  useEffect(() => {
    const existingIds = new Set(events.map(event => Number(event.id)))
    setSelectedEventIds(current => current.filter(id => existingIds.has(Number(id))))
  }, [events])

  const openDuplicate = event => {
    const firstDate = suggestedDate(event)
    const rangeEnd = new Date(`${firstDate}T12:00:00`)
    rangeEnd.setDate(rangeEnd.getDate() + 56)
    const sourceDay = new Date(event?.start_date).getDay()
    setSelected(event)
    setSeriesMode('dates')
    setSeriesDates([firstDate])
    setSeriesWeekdays([Number.isNaN(sourceDay) ? 6 : sourceDay])
    setSeriesRangeStart(firstDate)
    setSeriesRangeEnd(toDateInput(rangeEnd))
    setSeriesProgress(null)
    setDialogError('')
  }

  const close = () => {
    if (saving) return
    setSelected(null)
    setSeriesMode('dates')
    setSeriesDates([''])
    setSeriesWeekdays([])
    setSeriesRangeStart('')
    setSeriesRangeEnd('')
    setSeriesProgress(null)
    setDialogError('')
  }

  const updateSeriesDate = (index, value) => {
    setSeriesDates(current => current.map((item, itemIndex) => itemIndex === index ? value : item))
    setDialogError('')
  }

  const addSeriesDate = () => {
    setSeriesDates(current => current.length >= 120 ? current : [...current, ''])
    setDialogError('')
  }

  const removeSeriesDate = index => {
    setSeriesDates(current => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))
    setDialogError('')
  }

  const toggleWeekday = weekday => {
    setSeriesWeekdays(current => current.includes(weekday) ? current.filter(value => value !== weekday) : [...current, weekday].sort())
    setDialogError('')
  }

  const seriesPreviewCount = useMemo(() => {
    if (seriesMode === 'dates') return new Set(seriesDates.filter(Boolean)).size
    if (!seriesRangeStart || !seriesRangeEnd || !seriesWeekdays.length) return 0
    const cursor = new Date(`${seriesRangeStart}T12:00:00`)
    const end = new Date(`${seriesRangeEnd}T12:00:00`)
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return 0
    let count = 0
    let guard = 0
    while (cursor <= end && guard <= 366) {
      if (seriesWeekdays.includes(cursor.getDay())) count += 1
      cursor.setDate(cursor.getDate() + 1)
      guard += 1
    }
    return count
  }, [seriesDates, seriesMode, seriesRangeEnd, seriesRangeStart, seriesWeekdays])

  const createSeries = async () => {
    if (!selected) return
    const payload = { app_id: appId, mode: seriesMode }
    if (seriesMode === 'dates') {
      const dates = [...new Set(seriesDates.filter(Boolean))]
      if (!dates.length) { setDialogError('Adicione pelo menos uma data para a nova agenda.'); return }
      if (dates.includes(toDateInput(selected.start_date))) { setDialogError('Remova a data do evento original para não duplicar a edição atual.'); return }
      payload.dates = dates
    } else {
      if (!seriesWeekdays.length) { setDialogError('Selecione pelo menos um dia da semana.'); return }
      if (!seriesRangeStart || !seriesRangeEnd) { setDialogError('Informe o início e o fim da agenda semanal.'); return }
      if (seriesPreviewCount > 120) { setDialogError('A agenda gera mais de 120 ocorrências. Reduza o período ou os dias selecionados.'); return }
      payload.weekdays = seriesWeekdays
      payload.range_start = seriesRangeStart
      payload.range_end = seriesRangeEnd
    }

    setSaving(true)
    setDialogError('')
    setSeriesProgress({
      processed_count: 0,
      total_count: seriesPreviewCount,
      remaining_count: seriesPreviewCount,
      created_count: 0,
      existing_count: 0,
    })
    try {
      const result = await apiProgressRequest(
        `/admin/ecosystem/establishments/${establishmentId}/resources/events/${selected.id}/series`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        progress => setSeriesProgress({
          processed_count: Number(progress?.processed_count || 0),
          total_count: Number(progress?.total_count || seriesPreviewCount),
          remaining_count: Number(progress?.remaining_count || 0),
          created_count: Number(progress?.created_count || 0),
          existing_count: Number(progress?.existing_count || 0),
          date: progress?.date || null,
          status: progress?.status || null,
        })
      )
      setSelected(null)
      await load()
      const message = result?.message || `${result?.created_count || 0} ocorrência(s) criada(s) como rascunho.`
      setNotice(message)
      onSuccess?.(message)
    } catch (err) {
      setDialogError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const loadTickets = useCallback(async event => {
    setTicketLoading(event.id)
    setTicketError('')
    try {
      const payload = await apiRequest(`/admin/ecosystem/establishments/${establishmentId}/resources/events/${event.id}/tickets?app_id=${appId}`)
      setTicketDetails(current => ({ ...current, [event.id]: payload }))
      return payload
    } catch (err) {
      setTicketError(err.message)
      return null
    } finally {
      setTicketLoading(null)
    }
  }, [appId, establishmentId])

  const toggleTickets = async event => {
    const next = expandedEventId === event.id ? null : event.id
    setExpandedEventId(next)
    if (next && !ticketDetails[event.id]) await loadTickets(event)
  }

  const openTicketForm = (event, ticket = null) => {
    setTicketFormEvent(event)
    setEditingTicket(ticket)
    setTicketError('')
    setTicketForm(ticket ? {
      name: ticket.name || '',
      ticket_type: ticket.ticket_type || '',
      type: ticket.type || '',
      price: ticket.price ?? '',
      quantity: ticket.capacity ?? '',
      limit_date: toDateTimeInput(ticket.limit_date),
      description: ticket.description || '',
    } : emptyTicketForm)
  }

  const closeTicketForm = () => {
    if (saving) return
    setTicketFormEvent(null)
    setEditingTicket(null)
    setTicketForm(emptyTicketForm)
    setTicketError('')
  }

  const saveTicket = async event => {
    event.preventDefault()
    if (!ticketFormEvent) return
    setSaving(true)
    setTicketError('')
    try {
      const payload = {
        app_id: appId,
        name: ticketForm.name.trim(),
        ticket_type: ticketForm.ticket_type.trim(),
        type: ticketForm.type.trim() || null,
        price: Number(ticketForm.price),
        quantity: Number(ticketForm.quantity),
        limit_date: ticketForm.limit_date || null,
        description: ticketForm.description.trim() || null,
      }
      const basePath = `/admin/ecosystem/establishments/${establishmentId}/resources/events/${ticketFormEvent.id}/tickets`
      const result = await apiRequest(editingTicket ? `${basePath}/${editingTicket.id}` : basePath, {
        method: editingTicket ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      setTicketDetails(current => ({ ...current, [ticketFormEvent.id]: result }))
      setNotice(result?.message || (editingTicket ? 'Lote atualizado.' : 'Lote criado.'))
      closeTicketForm()
      await load()
    } catch (err) {
      setTicketError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleEventSelection = eventId => {
    const id = Number(eventId)
    setSelectedEventIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const toggleAllVisible = () => {
    setSelectedEventIds(current => {
      const next = new Set(current.map(Number))
      if (allVisibleSelected) visibleEventIds.forEach(id => next.delete(id))
      else visibleEventIds.forEach(id => next.add(id))
      return [...next]
    })
  }

  const openBulkDelete = () => {
    if (!selectedEventIds.length) return
    setBulkDeleteError('')
    setBulkDeleteProgress(null)
    setBulkDeleteOpen(true)
  }

  const closeBulkDelete = () => {
    if (bulkDeleteBusy) return
    setBulkDeleteOpen(false)
    setBulkDeleteError('')
    setBulkDeleteProgress(null)
  }

  const deleteSelectedEvents = async () => {
    if (!selectedEventIds.length || bulkDeleteBusy) return

    const requestedIds = [...selectedEventIds]
    setBulkDeleteBusy(true)
    setBulkDeleteError('')
    setBulkDeleteProgress({
      processed_count: 0,
      total_count: requestedIds.length,
      remaining_count: requestedIds.length,
      deleted_count: 0,
      failed_count: 0,
    })

    try {
      const result = await apiProgressRequest(
        `/admin/ecosystem/establishments/${establishmentId}/resources/events/bulk`,
        {
          method: 'DELETE',
          body: JSON.stringify({ app_id: appId, event_ids: requestedIds }),
        },
        progress => setBulkDeleteProgress({
          processed_count: Number(progress?.processed_count || 0),
          total_count: Number(progress?.total_count || requestedIds.length),
          remaining_count: Number(progress?.remaining_count || 0),
          deleted_count: Number(progress?.deleted_count || 0),
          failed_count: Number(progress?.failed_count || 0),
          event_id: progress?.event_id || null,
          event_title: progress?.event_title || null,
          status: progress?.status || null,
        })
      )

      const deletedIds = new Set((result?.deleted_ids || []).map(Number))
      setEvents(current => current.filter(event => !deletedIds.has(Number(event.id))))
      setSelectedEventIds(current => current.filter(id => !deletedIds.has(Number(id))))
      setExpandedEventId(current => deletedIds.has(Number(current)) ? null : current)

      const message = result?.message || `${deletedIds.size} evento(s) excluído(s).`
      setNotice(message)
      onSuccess?.(message)

      if (Number(result?.failed_count || 0) > 0) {
        const firstFailure = result?.failures?.[0]?.message
        setBulkDeleteError(firstFailure || `${result.failed_count} evento(s) não puderam ser excluídos e continuam selecionados.`)
      } else {
        setBulkDeleteOpen(false)
        setBulkDeleteProgress(null)
      }

      await load()
    } catch (err) {
      setBulkDeleteError(err.message)
      await load()
    } finally {
      setBulkDeleteBusy(false)
    }
  }

  const goToCreate = () => document.getElementById('admin-event-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const progressProcessed = Number(seriesProgress?.processed_count || 0)
  const progressTotal = Number(seriesProgress?.total_count || seriesPreviewCount || 0)
  const progressRemaining = Number(seriesProgress?.remaining_count ?? Math.max(0, progressTotal - progressProcessed))
  const progressCreated = Number(seriesProgress?.created_count || 0)
  const progressExisting = Number(seriesProgress?.existing_count || 0)
  const deleteProcessed = Number(bulkDeleteProgress?.processed_count || 0)
  const deleteTotal = Number(bulkDeleteProgress?.total_count || selectedEventIds.length || 0)
  const deleteRemaining = Number(bulkDeleteProgress?.remaining_count ?? Math.max(0, deleteTotal - deleteProcessed))
  const deleteDeleted = Number(bulkDeleteProgress?.deleted_count || 0)
  const deleteFailed = Number(bulkDeleteProgress?.failed_count || 0)

  return <section className="aee-panel">
    <header className="aee-head">
      <div><span>{ticketsOnly ? 'INGRESSOS / VENDAS / CHECK-IN' : 'EVENTOS DO ESTABELECIMENTO'}</span><h4>{ticketsOnly ? 'Operação de ingressos da Cutinapp' : 'Programação da Cutinapp'}</h4><p>{ticketsOnly ? 'Abra um evento para gerenciar lotes reais, acompanhar vendas, reservas, cortesias, disponibilidade, receita e check-ins.' : 'Liste a agenda deste establishment, acompanhe a operação de ingressos e reutilize eventos sem refazer toda a programação.'}</p></div>
      <div className="aee-head-actions"><button type="button" className="aee-refresh" onClick={() => void load()} disabled={loading}>↻ Atualizar</button>{!ticketsOnly && <button type="button" className="aee-new" onClick={goToCreate}>＋ Novo evento</button>}</div>
    </header>

    {notice && <div className="aee-feedback success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

    {!loading && <div className="aee-stats" aria-label="Resumo dos eventos">
      <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><b>{stats.total}</b><span>Total</span></button>
      <button type="button" className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')}><b>{stats.upcoming}</b><span>Próximos</span></button>
      <button type="button" className={filter === 'drafts' ? 'active' : ''} onClick={() => setFilter('drafts')}><b>{stats.drafts}</b><span>Rascunhos</span></button>
      <button type="button" className={filter === 'published' ? 'active' : ''} onClick={() => setFilter('published')}><b>{stats.published}</b><span>Publicados</span></button>
    </div>}

    {!loading && events.length > 0 && <div className="aee-toolbar">
      <label><span className="sr-only">Pesquisar eventos</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar por nome, local, cidade ou ID…" /></label>
      <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filtrar eventos"><option value="all">Todos os eventos</option><option value="upcoming">Próximos</option><option value="drafts">Rascunhos</option><option value="published">Publicados</option><option value="cancelled">Cancelados</option></select>
    </div>}

    {!loading && !ticketsOnly && visibleEvents.length > 0 && <div className="aee-bulk-toolbar">
      <div className="aee-bulk-selection">
        <label><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /><strong>Selecionar todos visíveis</strong></label>
        <span>{selectedEventIds.length} evento(s) selecionado(s){query || filter !== 'all' ? ` · ${selectedVisibleCount} nesta lista` : ''}</span>
      </div>
      <button type="button" className="aee-bulk-delete-button" onClick={openBulkDelete} disabled={!selectedEventIds.length}>Excluir selecionados ({selectedEventIds.length})</button>
    </div>}

    {error && <div className="aee-feedback error">{error}</div>}
    {ticketError && !ticketFormEvent && <div className="aee-feedback error">{ticketError}</div>}
    {loading && <div className="aee-empty">Carregando eventos…</div>}
    {!loading && !events.length && <div className="aee-empty"><b>Nenhum evento neste establishment.</b><span>Crie o primeiro evento para liberar a operação de ingressos.</span>{!ticketsOnly && <button type="button" onClick={goToCreate}>Criar primeiro evento</button>}</div>}
    {!loading && events.length > 0 && !visibleEvents.length && <div className="aee-empty"><b>Nenhum evento encontrado com esses filtros.</b><span>Limpe a pesquisa ou selecione outro status.</span></div>}

    {!loading && visibleEvents.length > 0 && <div className="aee-list">
      {visibleEvents.map(event => {
        const details = ticketDetails[event.id]
        const summary = details?.summary
        const isBulkSelected = selectedEventIds.includes(Number(event.id))
        return <article className={`aee-event-shell ${expandedEventId === event.id ? 'expanded' : ''} ${isBulkSelected ? 'bulk-selected' : ''}`} key={event.id}>
          <div className="aee-event">
            {!ticketsOnly && <label className="aee-event-select"><input type="checkbox" checked={isBulkSelected} onChange={() => toggleEventSelection(event.id)} /><span>Selecionar</span></label>}
            <div className="aee-event-main">
              <div className="aee-event-title"><b>{event.title}</b><span className={event.is_cancelled ? 'cancelled' : event.is_published ? 'published' : 'draft'}>{event.is_cancelled ? 'Cancelado' : event.is_published ? 'Publicado' : 'Rascunho'}</span></div>
              <p>{formatDate(event.start_date)} · {event.venue || [event.city, event.uf].filter(Boolean).join(' / ') || 'Local não informado'}</p>
              <div className="aee-event-metrics"><span><b>{number(event.ticket_types_count ?? event.tickets_count)}</b> lotes</span><span><b>{number(event.tickets_sold_count)}</b> vendidos</span><span><b>{number(event.tickets_available_count)}</b> disponíveis</span><span><b>{money(event.gross_ticket_revenue)}</b> receita</span><span><b>{number(event.checked_in_count)}</b> check-ins</span></div>
              <small>{event.artists_count || 0} artista(s) · ID #{event.id}</small>
            </div>
            <div className="aee-event-actions"><button className="aee-tickets" type="button" onClick={() => void toggleTickets(event)}>{ticketLoading === event.id ? 'Carregando…' : expandedEventId === event.id ? 'Fechar ingressos' : 'Ingressos e vendas'}</button>{!ticketsOnly && <button className="aee-duplicate" type="button" onClick={() => openDuplicate(event)}>⧉ Agenda / duplicar</button>}</div>
          </div>

          {expandedEventId === event.id && <div className="aee-ticket-panel">
            {ticketLoading === event.id && <div className="aee-empty">Carregando lotes e vendas…</div>}
            {!ticketLoading && details && <>
              <div className="aee-ticket-summary">
                <div><span>Capacidade</span><b>{number(summary?.capacity)}</b></div><div><span>Vendidos</span><b>{number(summary?.sold_count)}</b></div><div><span>Disponíveis</span><b>{number(summary?.available_count)}</b></div><div><span>Reservados</span><b>{number(summary?.reserved_count)}</b></div><div><span>Cortesias</span><b>{number(summary?.courtesy_count)}</b></div><div><span>Check-ins</span><b>{number(summary?.checked_in_count)}</b></div><div><span>Pedidos pagos</span><b>{number(summary?.paid_orders_count)}</b></div><div><span>Receita bruta</span><b>{money(summary?.gross_revenue)}</b></div>
              </div>
              <div className="aee-ticket-head"><div><b>Lotes / ingressos</b><span>{details.tickets?.length || 0} tipo(s) neste evento</span></div><button type="button" onClick={() => openTicketForm(event)}>＋ Novo lote</button></div>
              {!details.tickets?.length && <div className="aee-empty"><b>Nenhum lote cadastrado.</b><span>Crie o primeiro ingresso real deste evento.</span></div>}
              {!!details.tickets?.length && <div className="aee-ticket-list">{details.tickets.map(ticket => <div className="aee-ticket-row" key={ticket.id}><div><b>{ticket.name}</b><small>{ticket.ticket_type || ticket.type || 'Ingresso'} · #{ticket.id}</small></div><div><span>Preço</span><b>{money(ticket.price)}</b></div><div><span>Capacidade</span><b>{number(ticket.capacity)}</b></div><div><span>Vendidos</span><b>{number(ticket.sold_count)}</b></div><div><span>Disponíveis</span><b>{number(ticket.available_count)}</b></div><div><span>Receita</span><b>{money(ticket.gross_revenue)}</b></div><button type="button" onClick={() => openTicketForm(event, ticket)}>Editar</button></div>)}</div>}
              <div className="aee-sales-head"><b>Vendas recentes</b><span>Últimos ingressos pagos deste evento</span></div>
              {!details.recent_sales?.length && <div className="aee-empty"><span>Ainda não há vendas pagas para exibir.</span></div>}
              {!!details.recent_sales?.length && <div className="aee-sales-list">{details.recent_sales.slice(0, 12).map(sale => <div key={sale.pass_id}><span><b>{sale.holder_name || sale.holder_email || 'Participante'}</b><small>{sale.ticket_name} · {sale.order_public_id || `Pass #${sale.pass_id}`}</small></span><span><b>{money(sale.unit_price)}</b><small>{sale.checked_in_at ? 'Check-in realizado' : 'Aguardando check-in'}</small></span></div>)}</div>}
            </>}
          </div>}
        </article>
      })}
    </div>}

    {ticketFormEvent && <div className="aee-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeTicketForm() }}>
      <form className="aee-dialog aee-ticket-dialog" role="dialog" aria-modal="true" onSubmit={saveTicket}>
        <header><div><span>{editingTicket ? 'EDITAR LOTE' : 'NOVO LOTE / INGRESSO'}</span><h3>{ticketFormEvent.title}</h3></div><button type="button" onClick={closeTicketForm} disabled={saving} aria-label="Fechar">×</button></header>
        <div className="aee-dialog-body aee-ticket-form">
          <label><span>Nome do lote *</span><input value={ticketForm.name} onChange={event => setTicketForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: 1º lote, Pista, VIP" required /></label>
          <label><span>Tipo / categoria *</span><input value={ticketForm.ticket_type} onChange={event => setTicketForm(current => ({ ...current, ticket_type: event.target.value }))} placeholder="Ex.: Inteira, Meia, Cortesia" required /></label>
          <label><span>Classificação interna</span><input value={ticketForm.type} onChange={event => setTicketForm(current => ({ ...current, type: event.target.value }))} placeholder="Opcional" /></label>
          <label><span>Preço (R$) *</span><input type="number" min="0" step="0.01" value={ticketForm.price} onChange={event => setTicketForm(current => ({ ...current, price: event.target.value }))} required /></label>
          <label><span>Capacidade *</span><input type="number" min="0" step="1" value={ticketForm.quantity} onChange={event => setTicketForm(current => ({ ...current, quantity: event.target.value }))} required /></label>
          <label><span>Limite de retirada/venda</span><input type="datetime-local" value={ticketForm.limit_date} onChange={event => setTicketForm(current => ({ ...current, limit_date: event.target.value }))} /></label>
          <label className="wide"><span>Descrição</span><textarea rows="4" value={ticketForm.description} onChange={event => setTicketForm(current => ({ ...current, description: event.target.value }))} /></label>
          {ticketError && <div className="aee-feedback error wide">{ticketError}</div>}
        </div>
        <footer><button type="button" className="secondary" onClick={closeTicketForm} disabled={saving}>Cancelar</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Salvando…' : editingTicket ? 'Salvar lote' : 'Criar lote'}</button></footer>
      </form>
    </div>}

    {bulkDeleteOpen && <div className="aee-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeBulkDelete() }}>
      <div className="aee-dialog aee-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="aee-bulk-dialog-title">
        <header><div><span>EXCLUSÃO EM MASSA</span><h3 id="aee-bulk-dialog-title">Excluir {selectedEventIds.length} evento(s)?</h3></div><button type="button" onClick={closeBulkDelete} disabled={bulkDeleteBusy} aria-label="Fechar">×</button></header>
        <div className="aee-dialog-body">
          <div className="aee-bulk-warning"><b>Atenção:</b> esta é uma operação destrutiva e não possui desfazer. Cada evento será processado individualmente; registros protegidos por vínculos do sistema serão mantidos e informados como falha.</div>
          <div className="aee-bulk-summary"><span>Eventos selecionados para exclusão</span><b>{selectedEventIds.length}</b></div>
          <div className="aee-bulk-list">
            {selectedEvents.slice(0, 8).map(event => <div className="aee-bulk-item" key={event.id}><b>{event.title}</b><small>{formatDate(event.start_date)} · #{event.id}</small></div>)}
            {selectedEvents.length > 8 && <div className="aee-bulk-more">+ {selectedEvents.length - 8} evento(s) selecionado(s)</div>}
          </div>
          {bulkDeleteBusy && <pt-processing-indicator
            compact="true"
            title="Excluindo eventos"
            messages="Excluindo os eventos selecionados com segurança…|Registrando cada exclusão na auditoria…|Preservando eventos que tenham vínculos protegidos…|Atualizando a lista do Admin Center…"
            progress={String(deleteProcessed)}
            total={String(deleteTotal)}
            progress-label={`${deleteProcessed} ${deleteProcessed === 1 ? 'evento processado' : 'eventos processados'} de ${deleteTotal} selecionados`}
            progress-detail={`${deleteRemaining} ${deleteRemaining === 1 ? 'evento falta' : 'eventos faltam'} • ${deleteDeleted} excluído(s) • ${deleteFailed} falha(s)`}
          ></pt-processing-indicator>}
          {bulkDeleteError && <div className="aee-feedback error">{bulkDeleteError}</div>}
        </div>
        <footer><button type="button" className="secondary" onClick={closeBulkDelete} disabled={bulkDeleteBusy}>Cancelar</button><button type="button" className="danger" onClick={() => void deleteSelectedEvents()} disabled={bulkDeleteBusy || !selectedEventIds.length}>{bulkDeleteBusy ? `${deleteProcessed} de ${deleteTotal} processados…` : `Excluir ${selectedEventIds.length} evento(s)`}</button></footer>
      </div>
    </div>}

    {selected && <div className="aee-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
      <div className="aee-dialog aee-series-dialog" role="dialog" aria-modal="true" aria-labelledby="aee-dialog-title">
        <header><div><span>CRIAR AGENDA / DUPLICAR EM LOTE</span><h3 id="aee-dialog-title">{selected.title}</h3></div><button type="button" onClick={close} disabled={saving} aria-label="Fechar">×</button></header>
        <div className="aee-dialog-body">
          <p>Use este evento como modelo para criar várias edições. Cada nova ocorrência será um <b>rascunho independente</b>, preservando duração, capa, local, line-up e lotes, com horários e prazos deslocados para a nova data.</p>
          <div className="aee-warning"><b>Não serão copiados:</b> vendas, passes, participantes, check-ins, avaliações ou interações.</div>
          <div className="aee-series-mode" role="group" aria-label="Modo de criação da agenda">
            <button type="button" className={seriesMode === 'dates' ? 'active' : ''} onClick={() => { setSeriesMode('dates'); setDialogError('') }} disabled={saving}><b>Datas específicas</b><span>Escolha cada edição manualmente</span></button>
            <button type="button" className={seriesMode === 'weekly' ? 'active' : ''} onClick={() => { setSeriesMode('weekly'); setDialogError('') }} disabled={saving}><b>Agenda semanal</b><span>Repita em dias fixos da semana</span></button>
          </div>

          {seriesMode === 'dates' && <div className="aee-series-dates">
            <div className="aee-series-date-list">
              {seriesDates.map((value, index) => <div className="aee-series-date-row" key={`${index}-${value}`}>
                <label><span>Data {index + 1}</span><input type="date" min={toDateInput(new Date())} value={value} onChange={event => updateSeriesDate(index, event.target.value)} disabled={saving} /></label>
                {seriesDates.length > 1 && <button type="button" className="aee-series-remove" onClick={() => removeSeriesDate(index)} disabled={saving} aria-label={`Remover data ${index + 1}`}>×</button>}
              </div>)}
            </div>
            <button type="button" className="aee-series-add" onClick={addSeriesDate} disabled={saving || seriesDates.length >= 120}>＋ Adicionar outra data</button>
          </div>}

          {seriesMode === 'weekly' && <div className="aee-series-weekly">
            <div><span className="aee-field-label">Dias da semana *</span><div className="aee-weekday-grid">{WEEKDAYS.map(day => <button type="button" key={day.value} className={seriesWeekdays.includes(day.value) ? 'active' : ''} onClick={() => toggleWeekday(day.value)} disabled={saving}>{day.label}</button>)}</div></div>
            <div className="aee-range-grid">
              <label><span>Início da agenda *</span><input type="date" min={toDateInput(new Date())} value={seriesRangeStart} onChange={event => { setSeriesRangeStart(event.target.value); setDialogError('') }} disabled={saving} /></label>
              <label><span>Fim da agenda *</span><input type="date" min={seriesRangeStart || toDateInput(new Date())} value={seriesRangeEnd} onChange={event => { setSeriesRangeEnd(event.target.value); setDialogError('') }} disabled={saving} /></label>
            </div>
          </div>}

          <div className={`aee-series-summary ${seriesPreviewCount > 120 ? 'warning' : ''}`}><span>Ocorrências previstas</span><b>{seriesPreviewCount}</b><small>Limite de 120 por operação. Duplicidades existentes são reutilizadas, não recriadas.</small></div>
          {saving && <pt-processing-indicator
            compact="true"
            title="Criando agenda de eventos"
            messages="Criando cada edição como rascunho…|Copiando capa, local, line-up e lotes com segurança…|Conferindo duplicidades para não recriar eventos existentes…|Finalizando a agenda e sincronizando os eventos…"
            progress={String(progressProcessed)}
            total={String(progressTotal)}
            progress-label={`${progressProcessed} ${progressProcessed === 1 ? 'evento processado' : 'eventos processados'} de ${progressTotal} solicitados`}
            progress-detail={`${progressRemaining} ${progressRemaining === 1 ? 'evento falta' : 'eventos faltam'} • ${progressCreated} criado(s) • ${progressExisting} já existente(s)`}
          ></pt-processing-indicator>}
          {dialogError && <div className="aee-feedback error">{dialogError}</div>}
        </div>
        <footer><button type="button" className="secondary" onClick={close} disabled={saving}>Cancelar</button><button type="button" className="primary" onClick={createSeries} disabled={saving || seriesPreviewCount < 1 || seriesPreviewCount > 120}>{saving ? `${progressProcessed} de ${progressTotal} processados…` : 'Criar agenda como rascunho'}</button></footer>
      </div>
    </div>}
  </section>
}
