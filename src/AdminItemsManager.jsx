import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readAdminSessionState, writeAdminSessionState } from './adminPersistence.js'
import { adminRequest as apiRequest } from './adminApi.js'
import { useDialogFocus } from './useDialogFocus.js'
import './AdminItemsManager.css'

const EMPTY_FILTERS = {
  search: '',
  app_id: '',
  establishment_id: '',
  type: '',
  status: '',
  featured: '',
  category: '',
  min_price: '',
  max_price: '',
}

const EMPTY_FORM = {
  name: '',
  app_id: '',
  entity_id: '',
  type: 'item',
  price: '',
  discount: '',
  sku: '',
  category: '',
  subcategory: '',
  brand: '',
  duration: '',
  stock: '',
  image: '',
  description: '',
  status: true,
  is_featured: false,
}

const TYPE_LABELS = {
  item: 'Item',
  product: 'Produto',
  service: 'Serviço',
  ticket: 'Ingresso',
}

function money(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(amount)
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1'
}

function establishmentName(row) {
  return row?.fantasy || row?.name || `Estabelecimento #${row?.id || '—'}`
}

function linkedApplicationIds(establishment) {
  return Array.from(new Set([
    establishment?.app_id ? Number(establishment.app_id) : null,
    ...(establishment?.applications || []).map(app => Number(app.id)),
  ].filter(Boolean)))
}

function formFromItem(item) {
  return {
    ...EMPTY_FORM,
    name: item?.name || '',
    app_id: item?.app_id ? String(item.app_id) : '',
    entity_id: item?.entity_id ? String(item.entity_id) : (item?.establishment?.id ? String(item.establishment.id) : ''),
    type: item?.type || 'item',
    price: item?.price ?? '',
    discount: item?.discount ?? '',
    sku: item?.sku || '',
    category: item?.category || '',
    subcategory: item?.subcategory || '',
    brand: item?.brand || '',
    duration: item?.duration ?? '',
    stock: item?.stock ?? '',
    image: item?.image || item?.image_url || '',
    description: item?.description || '',
    status: item?.status !== false,
    is_featured: normalizeBoolean(item?.is_featured),
  }
}

function payloadFromForm(form) {
  const nullableText = value => String(value ?? '').trim() || null
  return {
    name: form.name.trim(),
    app_id: Number(form.app_id),
    entity_id: Number(form.entity_id),
    type: form.type,
    price: Number(form.price),
    discount: form.discount === '' ? null : Number(form.discount),
    sku: nullableText(form.sku),
    category: nullableText(form.category),
    subcategory: nullableText(form.subcategory),
    brand: nullableText(form.brand),
    duration: form.duration === '' ? null : Number(form.duration),
    stock: form.stock === '' ? null : Number(form.stock),
    image: nullableText(form.image),
    description: nullableText(form.description),
    status: Boolean(form.status),
    is_featured: Boolean(form.is_featured),
  }
}

function Field({ label, children, className = '' }) {
  return <label className={`itm-field ${className}`}><span>{label}</span>{children}</label>
}

function Metric({ label, value, detail }) {
  return <article className="itm-metric"><span>{label}</span><b>{value}</b><small>{detail}</small></article>
}

function Status({ tone = 'neutral', children }) {
  return <span className={`itm-status ${tone}`}><i />{children}</span>
}

function ItemForm({ open, editing, form, setForm, applications, establishments, saving, onClose, onSubmit, onApplicationChange }) {
  const dialogRef = useRef(null)
  useDialogFocus(dialogRef, open, onClose)
  if (!open) return null

  return <div className="itm-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} tabIndex="-1" className="itm-modal" role="dialog" aria-modal="true" aria-labelledby="item-form-title">
      <header className="itm-modal-head">
        <div><p className="eyebrow">ITEM / ECOSYSTEM</p><h3 id="item-form-title">{editing ? `Editar item #${editing.id}` : 'Novo item'}</h3><p>Um único modelo genérico para produtos, serviços, itens e ingressos em todo o ecossistema.</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar">×</button>
      </header>

      <form className="itm-form" onSubmit={onSubmit}>
        <section className="itm-form-section">
          <div className="itm-form-title"><span>01</span><div><b>Identidade</b><small>Informações principais do item</small></div></div>
          <div className="itm-form-grid">
            <Field label="Nome *"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required /></Field>
            <Field label="Tipo *"><select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))} required><option value="item">Item</option><option value="product">Produto</option><option value="service">Serviço</option><option value="ticket">Ingresso</option></select></Field>
            <Field label="SKU"><input value={form.sku} onChange={event => setForm(current => ({ ...current, sku: event.target.value }))} /></Field>
            <Field label="Marca"><input value={form.brand} onChange={event => setForm(current => ({ ...current, brand: event.target.value }))} /></Field>
            <Field label="Categoria"><input value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} /></Field>
            <Field label="Subcategoria"><input value={form.subcategory} onChange={event => setForm(current => ({ ...current, subcategory: event.target.value }))} /></Field>
          </div>
        </section>

        <section className="itm-form-section">
          <div className="itm-form-title"><span>02</span><div><b>Vínculo no ecossistema</b><small>Aplicação e estabelecimento responsáveis</small></div></div>
          <div className="itm-form-grid">
            <Field label="Aplicação *"><select value={form.app_id} onChange={event => onApplicationChange(event.target.value)} required><option value="">Selecione uma aplicação</option>{applications.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></Field>
            <Field label="Estabelecimento *"><select value={form.entity_id} onChange={event => setForm(current => ({ ...current, entity_id: event.target.value }))} disabled={!form.app_id} required><option value="">{form.app_id ? 'Selecione um estabelecimento' : 'Selecione primeiro a aplicação'}</option>{establishments.map(row => <option key={row.id} value={row.id}>{establishmentName(row)} · #{row.id}</option>)}</select></Field>
          </div>
          <p className="itm-helper">O item permanece genérico na API; o comportamento específico é determinado pela aplicação, estabelecimento e tipo.</p>
        </section>

        <section className="itm-form-section">
          <div className="itm-form-title"><span>03</span><div><b>Comercial e operação</b><small>Preço, estoque, duração e desconto</small></div></div>
          <div className="itm-form-grid">
            <Field label="Preço (R$) *"><input type="number" min="0" step="0.01" value={form.price} onChange={event => setForm(current => ({ ...current, price: event.target.value }))} required /></Field>
            <Field label="Desconto (R$)"><input type="number" min="0" step="0.01" value={form.discount} onChange={event => setForm(current => ({ ...current, discount: event.target.value }))} /></Field>
            <Field label="Estoque"><input type="number" min="0" step="1" value={form.stock} onChange={event => setForm(current => ({ ...current, stock: event.target.value }))} /></Field>
            <Field label="Duração (min)"><input type="number" min="0" max="1440" step="1" value={form.duration} onChange={event => setForm(current => ({ ...current, duration: event.target.value }))} /></Field>
            <Field label="Imagem (URL)" className="wide"><input type="url" value={form.image} onChange={event => setForm(current => ({ ...current, image: event.target.value }))} placeholder="https://" /></Field>
            <Field label="Descrição" className="wide"><textarea rows="5" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>
          </div>
        </section>

        <section className="itm-form-section">
          <div className="itm-form-title"><span>04</span><div><b>Estado administrativo</b><small>Disponibilidade e prioridade de exibição</small></div></div>
          <div className="itm-toggle-grid">
            <label className={form.status ? 'selected' : ''}><input type="checkbox" checked={Boolean(form.status)} onChange={event => setForm(current => ({ ...current, status: event.target.checked }))} /><span><b>Ativo</b><small>Disponível para uso pela aplicação</small></span></label>
            <label className={form.is_featured ? 'selected' : ''}><input type="checkbox" checked={Boolean(form.is_featured)} onChange={event => setForm(current => ({ ...current, is_featured: event.target.checked }))} /><span><b>Destaque</b><small>Prioridade nas superfícies compatíveis</small></span></label>
          </div>
        </section>

        <footer className="itm-modal-actions"><button className="itm-secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="itm-primary-button" disabled={saving}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar item'}<span>↗</span></button></footer>
      </form>
    </section>
  </div>
}

function DeleteModal({ item, saving, onClose, onConfirm }) {
  const dialogRef = useRef(null)
  useDialogFocus(dialogRef, Boolean(item), onClose)
  if (!item) return null
  return <div className="itm-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} tabIndex="-1" className="itm-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="item-delete-title">
      <p className="eyebrow">HISTÓRICO COMERCIAL PROTEGIDO</p>
      <h3 id="item-delete-title">Excluir ou arquivar {item.name}?</h3>
      <p>Se o item já estiver vinculado a pedidos, a API não apagará o histórico: ele será arquivado. Sem pedidos vinculados, poderá ser removido definitivamente.</p>
      <div className="itm-modal-actions"><button className="itm-secondary-button" onClick={onClose}>Cancelar</button><button className="itm-danger-button" disabled={saving} onClick={onConfirm}>{saving ? 'Processando…' : 'Confirmar'}</button></div>
    </section>
  </div>
}

export default function AdminItemsManager({ applications: parentApplications = [], quickCreateToken = 0 }) {
  const [items, setItems] = useState([])
  const [loadedApplications, setLoadedApplications] = useState([])
  const applications = parentApplications.length ? parentApplications : loadedApplications
  const [establishments, setEstablishments] = useState([])
  const [formEstablishments, setFormEstablishments] = useState([])
  const [filters, setFilters] = useState(() => readAdminSessionState('items-filters', EMPTY_FILTERS))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const loadedOnceRef = useRef(false)
  const loadSequenceRef = useRef(0)

  useEffect(() => { writeAdminSessionState('items-filters', filters) }, [filters])

  useEffect(() => {
    if (parentApplications.length) return undefined
    let cancelled = false
    apiRequest('/admin/applications').then(payload => {
      if (!cancelled) setLoadedApplications(payload?.applications || payload?.data || (Array.isArray(payload) ? payload : []))
    }).catch(err => {
      if (!cancelled) setError(current => current || err.message)
    })
    return () => { cancelled = true }
  }, [parentApplications])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (filters.app_id) params.set('app_id', filters.app_id)
    apiRequest(`/admin/ecosystem/establishments${params.size ? `?${params.toString()}` : ''}`).then(payload => {
      if (!cancelled) setEstablishments(payload?.establishments || [])
    }).catch(err => {
      if (!cancelled) setError(current => current || err.message)
    })
    return () => { cancelled = true }
  }, [filters.app_id])

  const loadFormEstablishments = useCallback(async (appId, selectedId = '') => {
    if (!appId) { setFormEstablishments([]); return [] }
    try {
      const payload = await apiRequest(`/admin/ecosystem/establishments?app_id=${encodeURIComponent(appId)}`)
      let rows = payload?.establishments || []
      if (selectedId && !rows.some(row => Number(row.id) === Number(selectedId))) {
        const selectedPayload = await apiRequest(`/admin/ecosystem/establishments?search=${encodeURIComponent(selectedId)}`)
        const selected = (selectedPayload?.establishments || []).find(row => Number(row.id) === Number(selectedId))
        if (selected) rows = [selected, ...rows]
      }
      setFormEstablishments(rows)
      return rows
    } catch (err) {
      setError(err.message)
      setFormEstablishments([])
      return []
    }
  }, [])

  const loadItems = useCallback(async currentFilters => {
    const sequence = ++loadSequenceRef.current
    if (!loadedOnceRef.current) setLoading(true)
    setError('')
    const params = new URLSearchParams()
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (String(value).trim()) params.set(key, String(value).trim())
    })
    try {
      const payload = await apiRequest(`/admin/ecosystem/items${params.size ? `?${params.toString()}` : ''}`)
      if (sequence !== loadSequenceRef.current) return
      setItems(payload?.items || payload?.data || [])
    } catch (err) {
      if (sequence === loadSequenceRef.current) setError(err.message)
    } finally {
      if (sequence === loadSequenceRef.current) {
        loadedOnceRef.current = true
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => loadItems(filters), 280)
    return () => window.clearTimeout(timer)
  }, [filters, reloadKey, loadItems])

  const visibleEstablishments = useMemo(() => {
    if (!filters.app_id) return establishments
    const appId = Number(filters.app_id)
    return establishments.filter(row => linkedApplicationIds(row).includes(appId))
  }, [establishments, filters.app_id])

  const applicationMap = useMemo(() => new Map(applications.map(app => [Number(app.id), app])), [applications])
  const metrics = useMemo(() => ({
    total: items.length,
    active: items.filter(item => item.status !== false).length,
    archived: items.filter(item => item.status === false).length,
    featured: items.filter(item => normalizeBoolean(item.is_featured)).length,
    orders: items.reduce((sum, item) => sum + Number(item.order_items_count || 0), 0),
    value: items.reduce((sum, item) => sum + Number(item.price || 0), 0),
  }), [items])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormEstablishments([])
    setFormOpen(true)
    setNotice('')
    setError('')
  }

  useEffect(() => {
    if (!quickCreateToken) return
    openCreate()
  }, [quickCreateToken])

  async function openEdit(item) {
    setEditing(item)
    const nextForm = formFromItem(item)
    setForm(nextForm)
    setFormOpen(true)
    setNotice('')
    setError('')
    await loadFormEstablishments(nextForm.app_id, nextForm.entity_id)
  }

  async function changeApplication(appId) {
    setForm(current => ({ ...current, app_id: appId, entity_id: '' }))
    await loadFormEstablishments(appId)
  }

  async function submitForm(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!form.app_id) { setError('Selecione a aplicação do item.'); return }
    if (!form.entity_id) { setError('Selecione o estabelecimento do item.'); return }

    setSaving(true)
    try {
      const payload = payloadFromForm(form)
      if (editing) {
        await apiRequest(`/admin/ecosystem/items/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        setNotice('Item atualizado com sucesso.')
      } else {
        await apiRequest('/admin/ecosystem/items', { method: 'POST', body: JSON.stringify(payload) })
        setNotice('Item criado e vinculado ao ecossistema com sucesso.')
      }
      setFormOpen(false)
      setEditing(null)
      setReloadKey(value => value + 1)
      window.dispatchEvent(new CustomEvent('admin-entity-updated', { detail: { entity: 'item' } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function quickUpdate(item, patch, message) {
    setError('')
    setNotice('')
    try {
      await apiRequest(`/admin/ecosystem/items/${item.id}`, { method: 'PUT', body: JSON.stringify(patch) })
      setNotice(message)
      setReloadKey(value => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteItem() {
    if (!deleteTarget) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest(`/admin/ecosystem/items/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setNotice(result?.message || 'Item removido com sucesso.')
      setReloadKey(value => value + 1)
      window.dispatchEvent(new CustomEvent('admin-entity-updated', { detail: { entity: 'item' } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="itm-manager">
    <div className="itm-heading">
      <div><p className="eyebrow">ITENS</p><h2>Catálogo do ecossistema</h2><p>Gerencie produtos, serviços, ingressos e itens genéricos vinculados às aplicações e estabelecimentos da Peter Tecnet.</p></div>
      <button className="itm-primary-button" type="button" onClick={openCreate}>Novo item <span>＋</span></button>
    </div>

    <div className="itm-metrics-grid">
      <Metric label="Encontrados" value={metrics.total} detail="no filtro atual" />
      <Metric label="Ativos" value={metrics.active} detail={`${metrics.archived} arquivados`} />
      <Metric label="Destaques" value={metrics.featured} detail="prioridade de exibição" />
      <Metric label="Vínculos com pedidos" value={metrics.orders} detail="histórico preservado" />
      <Metric label="Soma dos preços" value={money(metrics.value)} detail="itens retornados" />
    </div>

    <section className="itm-panel">
      <header className="itm-panel-head"><div><h3>Itens cadastrados</h3><p>Filtros consultam diretamente a API administrativa central.</p></div><button className="itm-secondary-button" onClick={() => setReloadKey(value => value + 1)}>Atualizar ↻</button></header>

      <div className="itm-filter-grid">
        <Field label="Pesquisar"><input value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Nome, SKU ou categoria" /></Field>
        <Field label="Aplicação"><select value={filters.app_id} onChange={event => setFilters(current => ({ ...current, app_id: event.target.value, establishment_id: '' }))}><option value="">Todas</option>{applications.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></Field>
        <Field label="Estabelecimento"><select value={filters.establishment_id} onChange={event => setFilters(current => ({ ...current, establishment_id: event.target.value }))}><option value="">Todos</option>{visibleEstablishments.map(row => <option key={row.id} value={row.id}>{establishmentName(row)}</option>)}</select></Field>
        <Field label="Tipo"><select value={filters.type} onChange={event => setFilters(current => ({ ...current, type: event.target.value }))}><option value="">Todos</option><option value="item">Item</option><option value="product">Produto</option><option value="service">Serviço</option><option value="ticket">Ingresso</option></select></Field>
        <Field label="Status"><select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">Todos</option><option value="active">Ativos</option><option value="archived">Arquivados</option></select></Field>
        <Field label="Destaque"><select value={filters.featured} onChange={event => setFilters(current => ({ ...current, featured: event.target.value }))}><option value="">Todos</option><option value="yes">Em destaque</option><option value="no">Sem destaque</option></select></Field>
        <Field label="Categoria"><input value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value }))} /></Field>
        <Field label="Preço mínimo"><input type="number" min="0" step="0.01" value={filters.min_price} onChange={event => setFilters(current => ({ ...current, min_price: event.target.value }))} /></Field>
        <Field label="Preço máximo"><input type="number" min="0" step="0.01" value={filters.max_price} onChange={event => setFilters(current => ({ ...current, max_price: event.target.value }))} /></Field>
        <button className="itm-clear-filters" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</button>
      </div>

      {error && <div className="itm-feedback error" role="alert">{error}</div>}
      {notice && <div className="itm-feedback success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {loading ? <div className="itm-loading"><span />Carregando itens…</div> : !items.length ? <div className="empty-state">Nenhum item encontrado com esses filtros.</div> : <div className="itm-list">{items.map(item => {
        const app = applicationMap.get(Number(item.app_id))
        const image = item.image_url || item.image
        const active = item.status !== false
        return <article className="itm-card" key={item.id}>
          <div className="itm-media">{image ? <img src={image} alt="" onError={event => { event.currentTarget.style.display = 'none' }} /> : <span>{String(item.name || 'I')[0]}</span>}</div>
          <div className="itm-card-body">
            <header><div><small>#{item.id} · {TYPE_LABELS[item.type] || item.type || 'Item'}</small><h4>{item.name}</h4><p>{[item.sku, item.category, item.subcategory, item.brand].filter(Boolean).join(' · ') || item.slug || 'Sem classificação'}</p></div><strong>{money(item.price)}</strong></header>
            <p className="itm-description">{item.description || 'Sem descrição cadastrada.'}</p>
            <div className="itm-meta-grid">
              <span><small>Aplicação</small><b>{app?.name || `App #${item.app_id}`}</b></span>
              <span><small>Estabelecimento</small><b>{establishmentName(item.establishment || { id: item.entity_id })}</b></span>
              <span><small>Estoque</small><b>{item.stock ?? '—'}</b></span>
              <span><small>Pedidos</small><b>{item.order_items_count || 0}</b></span>
            </div>
            <div className="itm-card-footer">
              <div className="itm-statuses"><Status tone={active ? 'success' : 'neutral'}>{active ? 'Ativo' : 'Arquivado'}</Status>{normalizeBoolean(item.is_featured) && <Status tone="cyan">Destaque</Status>}{Number(item.discount) > 0 && <Status tone="warning">Desconto {money(item.discount)}</Status>}</div>
              <div className="itm-actions"><button className="primary" onClick={() => openEdit(item)}>Editar</button><button onClick={() => quickUpdate(item, { status: !active }, active ? 'Item arquivado.' : 'Item reativado.')}>{active ? 'Arquivar' : 'Reativar'}</button><button onClick={() => quickUpdate(item, { is_featured: !normalizeBoolean(item.is_featured) }, normalizeBoolean(item.is_featured) ? 'Destaque removido.' : 'Item destacado.')}>{normalizeBoolean(item.is_featured) ? 'Remover destaque' : 'Destacar'}</button><button className="danger" onClick={() => setDeleteTarget(item)}>Excluir</button></div>
            </div>
          </div>
        </article>
      })}</div>}

      {!loading && <footer className="itm-panel-footer"><span>{items.length} item(ns) retornado(s)</span><span>Limite administrativo atual: 500 registros por consulta</span></footer>}
    </section>

    <ItemForm open={formOpen} editing={editing} form={form} setForm={setForm} applications={applications} establishments={formEstablishments} saving={saving} onClose={() => { setFormOpen(false); setEditing(null) }} onSubmit={submitForm} onApplicationChange={changeApplication} />
    <DeleteModal item={deleteTarget} saving={saving} onClose={() => setDeleteTarget(null)} onConfirm={deleteItem} />
  </div>
}
