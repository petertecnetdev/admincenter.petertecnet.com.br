import { useCallback, useEffect, useMemo, useState } from 'react'
import { confirmAction } from './utils/uiDialog.js'
import './AdminEstablishmentsPage.css'

const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const TOKEN_KEY = 'petertecnet_admin_token'

const EMPTY_FILTERS = { search: '', app_id: '', user_id: '', approval: '', publication: '', city: '', uf: '', type: '' }
const EMPTY_FORM = {
  name: '', fantasy: '', slug: '', cnpj: '', type: '', category: '', phone: '', email: '', description: '',
  city: '', uf: '', cep: '', address: '', website_url: '', instagram_url: '', user_id: '', app_id: '', app_ids: [],
  is_published: false, is_approved: false, is_featured: false, is_cancelled: false,
}

const RESOURCE_REGISTRY = {
  cutinapp: [
    { key: 'event', label: 'Criar evento', description: 'Abra o cadastro de evento já contextualizado para esta produção.', icon: 'EV' },
    { key: 'item', label: 'Criar item', description: 'Cadastre ingresso, produto ou outro item ligado à produção.', icon: 'IT' },
  ],
  rasoio: [
    { key: 'appointment', label: 'Criar agendamento', description: 'Abra a agenda deste estabelecimento no Rasoio.', icon: 'AG' },
    { key: 'employer', label: 'Criar employer', description: 'Cadastre ou vincule um profissional à equipe.', icon: 'EM' },
    { key: 'item', label: 'Criar item', description: 'Cadastre serviço, produto ou item comercial.', icon: 'IT' },
  ],
  nexus: [{ key: 'item', label: 'Criar item', description: 'Cadastre um item diretamente no catálogo deste estabelecimento.', icon: 'IT' }],
}

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeout || 18000)
  try {
    const response = await fetch(`${API}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event('admin-session-expired'))
    }
    if (!response.ok) {
      const validation = Object.values(payload?.errors || {}).flat()?.[0]
      throw new Error(validation || payload?.error || payload?.message || 'Não foi possível concluir a operação.')
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A API demorou para responder.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

const bool = value => value === true || value === 1 || value === '1'
const establishmentName = row => row?.fantasy || row?.name || `Estabelecimento #${row?.id || '—'}`
const userName = user => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || `Usuário #${user?.id || '—'}`
const establishmentLogo = row => (row?.files || []).find(item => ['logo', 'avatar', 'image'].includes(item?.type) && item?.public_url)?.public_url || ''

function formFrom(row) {
  const appIds = Array.from(new Set([...(row?.applications || []).map(app => String(app.id)), row?.app_id ? String(row.app_id) : null].filter(Boolean)))
  return {
    ...EMPTY_FORM,
    name: row?.name || '', fantasy: row?.fantasy || '', slug: row?.slug || '', cnpj: row?.cnpj || '', type: row?.type || '',
    category: row?.category || '', phone: row?.phone || '', email: row?.email || '', description: row?.description || '',
    city: row?.city || '', uf: row?.uf || '', cep: row?.cep || '', address: row?.address || '', website_url: row?.website_url || '',
    instagram_url: row?.instagram_url || '', user_id: row?.user_id ? String(row.user_id) : '',
    app_id: row?.app_id ? String(row.app_id) : (appIds[0] || ''), app_ids: appIds,
    is_published: bool(row?.is_published), is_approved: bool(row?.is_approved), is_featured: bool(row?.is_featured), is_cancelled: bool(row?.is_cancelled),
  }
}

function payloadFrom(form, editing) {
  const nullable = value => String(value ?? '').trim() || null
  const appIds = Array.from(new Set(form.app_ids.map(Number).filter(Boolean)))
  const payload = {
    name: form.name.trim(), fantasy: nullable(form.fantasy), slug: nullable(form.slug), cnpj: nullable(form.cnpj),
    type: nullable(form.type), category: nullable(form.category), phone: nullable(form.phone), email: nullable(form.email),
    description: nullable(form.description), city: nullable(form.city), uf: nullable(form.uf)?.toUpperCase() || null,
    cep: nullable(form.cep), address: nullable(form.address), website_url: nullable(form.website_url), instagram_url: nullable(form.instagram_url),
    app_id: Number(form.app_id) || null, app_ids: appIds,
    is_published: Boolean(form.is_published), is_approved: Boolean(form.is_approved), is_featured: Boolean(form.is_featured), is_cancelled: Boolean(form.is_cancelled),
  }
  if (!editing) payload.user_id = Number(form.user_id)
  return payload
}

function normalizeAppKey(app) {
  const raw = `${app?.slug || ''} ${app?.name || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (raw.includes('cutinapp')) return 'cutinapp'
  if (raw.includes('rasoio')) return 'rasoio'
  if (raw.includes('nexus')) return 'nexus'
  return 'default'
}

function actionsForApp(app) {
  return RESOURCE_REGISTRY[normalizeAppKey(app)] || [
    { key: 'item', label: 'Criar item', description: 'Cadastre um item genérico vinculado a este estabelecimento e aplicação.', icon: 'IT' },
  ]
}

function externalActionUrl(action, app, establishment) {
  const appKey = normalizeAppKey(app)
  const id = encodeURIComponent(establishment?.id || '')
  const slug = encodeURIComponent(establishment?.slug || '')
  if (appKey === 'cutinapp' && action.key === 'event') {
    return `https://cutinapp.petertecnet.com.br/event/create?production_id=${id}&establishment_id=${id}`
  }
  if (appKey === 'rasoio' && action.key === 'appointment') {
    return slug ? `https://rasoio.petertecnet.com.br/establishment/orders/${slug}?action=create` : `https://rasoio.petertecnet.com.br/?action=create-appointment&establishment_id=${id}`
  }
  if (appKey === 'rasoio' && action.key === 'employer') {
    return slug ? `https://rasoio.petertecnet.com.br/establishment/employers/${slug}?action=create` : `https://rasoio.petertecnet.com.br/?action=create-employer&establishment_id=${id}`
  }
  return ''
}

function Field({ label, children, wide = false }) {
  return <label className={`aep-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}

function Metric({ label, value, detail }) {
  return <article className="aep-metric"><span>{label}</span><b>{value}</b><small>{detail}</small></article>
}

function Status({ active, children, tone = '' }) {
  return <span className={`aep-status ${active ? 'active' : ''} ${tone}`}><i />{children}</span>
}

function ItemComposer({ draft, saving, onChange, onClose, onSubmit }) {
  if (!draft) return null
  return <section className="aep-resource-composer" aria-labelledby="aep-resource-title">
    <header>
      <div><p className="eyebrow">CRIAÇÃO CONTEXTUAL</p><h3 id="aep-resource-title">Novo item em {draft.appName}</h3><p>Aplicação e establishment já estão vinculados. Preencha apenas os dados do item.</p></div>
      <button type="button" className="aep-icon-button" onClick={onClose} aria-label="Fechar criação de item">×</button>
    </header>
    <form onSubmit={onSubmit}>
      <div className="aep-grid">
        <Field label="Nome *"><input value={draft.name} onChange={event => onChange({ name: event.target.value })} required /></Field>
        <Field label="Tipo *"><select value={draft.type} onChange={event => onChange({ type: event.target.value })}><option value="item">Item</option><option value="product">Produto</option><option value="service">Serviço</option><option value="ticket">Ingresso</option></select></Field>
        <Field label="Preço (R$) *"><input type="number" min="0" step="0.01" value={draft.price} onChange={event => onChange({ price: event.target.value })} required /></Field>
        <Field label="Categoria"><input value={draft.category} onChange={event => onChange({ category: event.target.value })} /></Field>
        <Field label="Estoque"><input type="number" min="0" step="1" value={draft.stock} onChange={event => onChange({ stock: event.target.value })} /></Field>
        <Field label="Duração (min)"><input type="number" min="0" max="1440" step="1" value={draft.duration} onChange={event => onChange({ duration: event.target.value })} /></Field>
        <Field label="Descrição" wide><textarea rows="4" value={draft.description} onChange={event => onChange({ description: event.target.value })} /></Field>
      </div>
      <div className="aep-composer-context"><span><small>Aplicação</small><b>{draft.appName}</b></span><span><small>Establishment</small><b>{draft.establishmentName}</b></span></div>
      <footer><button type="button" className="aep-secondary" onClick={onClose}>Cancelar</button><button className="aep-primary" disabled={saving}>{saving ? 'Criando item…' : 'Criar item'}</button></footer>
    </form>
  </section>
}

export default function AdminEstablishmentsPage() {
  const [rows, setRows] = useState([])
  const [applications, setApplications] = useState([])
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })
  const [mode, setMode] = useState('list')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resourceSaving, setResourceSaving] = useState(false)
  const [itemDraft, setItemDraft] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const loadOptions = useCallback(async () => {
    const [appsResult, usersResult] = await Promise.allSettled([apiRequest('/admin/applications'), apiRequest('/admin/ecosystem/users')])
    if (appsResult.status === 'fulfilled') {
      const payload = appsResult.value
      setApplications(payload?.applications || payload?.data || (Array.isArray(payload) ? payload : []))
    }
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value?.users || [])
  }, [])

  const loadRows = useCallback(async currentFilters => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    Object.entries(currentFilters).forEach(([key, value]) => { if (String(value || '').trim()) params.set(key, String(value).trim()) })
    try {
      const payload = await apiRequest(`/admin/ecosystem/establishments${params.size ? `?${params.toString()}` : ''}`)
      setRows(payload?.establishments || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadOptions() }, [loadOptions])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRows(filters) }, 280)
    return () => window.clearTimeout(timer)
  }, [filters, reloadKey, loadRows])

  const metrics = useMemo(() => ({
    total: rows.length,
    approved: rows.filter(row => bool(row.is_approved)).length,
    published: rows.filter(row => bool(row.is_published)).length,
    featured: rows.filter(row => bool(row.is_featured)).length,
    multiApp: rows.filter(row => (row.applications || []).length > 1).length,
  }), [rows])

  const selectedApps = useMemo(() => applications.filter(app => form.app_ids.includes(String(app.id))), [applications, form.app_ids])
  const scrollTop = () => document.getElementById('establishments-admin-integration')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  function startCreate() {
    const first = applications[0]?.id ? String(applications[0].id) : ''
    setEditing(null); setForm({ ...EMPTY_FORM, app_id: first, app_ids: first ? [first] : [] }); setItemDraft(null); setError(''); setNotice(''); setMode('editor')
    window.setTimeout(scrollTop, 0)
  }

  function startEdit(row) {
    setEditing(row); setForm(formFrom(row)); setItemDraft(null); setError(''); setNotice(''); setMode('editor')
    window.setTimeout(scrollTop, 0)
  }

  function backToList() {
    setMode('list'); setEditing(null); setItemDraft(null); setError(''); window.setTimeout(scrollTop, 0)
  }

  function toggleApp(id) {
    const value = String(id)
    setForm(current => {
      const appIds = current.app_ids.includes(value) ? current.app_ids.filter(item => item !== value) : [...current.app_ids, value]
      return { ...current, app_ids: appIds, app_id: appIds.includes(String(current.app_id)) ? current.app_id : (appIds[0] || '') }
    })
  }

  async function save(event) {
    event.preventDefault(); setError(''); setNotice('')
    if (!form.app_ids.length) { setError('Selecione pelo menos uma aplicação.'); return }
    if (!form.app_ids.includes(String(form.app_id))) { setError('A aplicação principal precisa estar entre as aplicações vinculadas.'); return }
    if (!form.user_id) { setError('Selecione o proprietário do estabelecimento.'); return }
    setSaving(true)
    try {
      const editingId = editing?.id
      const result = await apiRequest(`/admin/ecosystem/establishments${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payloadFrom(form, Boolean(editingId))),
      })
      const id = editingId || result?.establishment?.id || result?.data?.id
      if (editingId && Number(form.user_id) !== Number(editing.user_id)) {
        await apiRequest(`/admin/ecosystem/establishments/${editingId}/owner`, { method: 'PUT', body: JSON.stringify({ user_id: Number(form.user_id) }) })
      }
      setNotice(editingId ? 'Establishment atualizado com sucesso.' : `Establishment #${id || ''} criado com sucesso.`)
      setMode('list'); setEditing(null); setItemDraft(null); setReloadKey(value => value + 1)
      document.querySelector('.top-actions .icon-button')?.click(); window.setTimeout(scrollTop, 0)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function quickUpdate(row, patch, message) {
    setError(''); setNotice('')
    try {
      await apiRequest(`/admin/ecosystem/establishments/${row.id}`, { method: 'PUT', body: JSON.stringify(patch) })
      setNotice(message); setReloadKey(value => value + 1)
    } catch (err) { setError(err.message) }
  }

  async function remove(row) {
    const confirmed = await confirmAction({
      tone: 'danger',
      eyebrow: 'EXCLUSÃO DE ESTABLISHMENT',
      title: `Excluir ${establishmentName(row)}?`,
      message: 'O registro será removido, mas a trilha de auditoria continuará preservada no ecossistema.',
      confirmLabel: 'Excluir establishment',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setSaving(true); setError('')
    try {
      await apiRequest(`/admin/ecosystem/establishments/${row.id}`, { method: 'DELETE' })
      setNotice('Establishment excluído.'); setReloadKey(value => value + 1)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  function launchResource(action, app) {
    if (!editing?.id) { setError('Salve o establishment antes de criar recursos vinculados.'); return }
    if (action.key === 'item') {
      setItemDraft({
        appId: Number(app.id), appName: app.name || app.slug || `App #${app.id}`, establishmentId: Number(editing.id),
        establishmentName: establishmentName(editing), name: '', type: normalizeAppKey(app) === 'rasoio' ? 'service' : 'item',
        price: '', category: '', stock: '', duration: '', description: '',
      })
      window.setTimeout(() => document.getElementById('aep-resource-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
      return
    }
    const url = externalActionUrl(action, app, editing)
    if (!url) { setError(`A ação "${action.label}" ainda não possui rota configurada para ${app.name || app.slug}.`); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function createItem(event) {
    event.preventDefault()
    if (!itemDraft) return
    setResourceSaving(true); setError('')
    try {
      const nullable = value => String(value ?? '').trim() || null
      await apiRequest('/admin/ecosystem/items', {
        method: 'POST',
        body: JSON.stringify({
          name: itemDraft.name.trim(), app_id: itemDraft.appId, entity_id: itemDraft.establishmentId, type: itemDraft.type,
          price: Number(itemDraft.price), discount: null, sku: null, category: nullable(itemDraft.category), subcategory: null, brand: null,
          duration: itemDraft.duration === '' ? null : Number(itemDraft.duration), stock: itemDraft.stock === '' ? null : Number(itemDraft.stock),
          image: null, description: nullable(itemDraft.description), status: true, is_featured: false,
        }),
      })
      setNotice(`Item criado em ${itemDraft.appName} e vinculado a ${itemDraft.establishmentName}.`)
      setItemDraft(null); document.querySelector('.top-actions .icon-button')?.click()
    } catch (err) { setError(err.message) }
    finally { setResourceSaving(false) }
  }

  if (mode === 'editor') {
    return <div className="aep-page aep-editor-page">
      <header className="aep-editor-header">
        <button className="aep-back" type="button" onClick={backToList}>← Estabelecimentos</button>
        <div className="aep-editor-title"><p className="eyebrow">ESTABLISHMENT / EDITOR</p><h2>{editing ? `Editar ${establishmentName(editing)}` : 'Novo establishment'}</h2><p>Página completa de edição, responsiva e com operações específicas das aplicações vinculadas.</p></div>
        {editing && <div className="aep-editor-id"><small>ID</small><strong>#{editing.id}</strong></div>}
      </header>

      {error && <div className="aep-feedback error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="aep-feedback success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

      <form className="aep-editor" onSubmit={save}>
        <section className="aep-card">
          <header className="aep-section-title"><span>01</span><div><h3>Identidade</h3><p>Dados principais e classificação do establishment.</p></div></header>
          <div className="aep-grid">
            <Field label="Nome *"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required /></Field>
            <Field label="Nome fantasia"><input value={form.fantasy} onChange={event => setForm(current => ({ ...current, fantasy: event.target.value }))} /></Field>
            <Field label="Slug"><input value={form.slug} onChange={event => setForm(current => ({ ...current, slug: event.target.value }))} placeholder="gerado automaticamente se vazio" /></Field>
            <Field label="CNPJ"><input value={form.cnpj} onChange={event => setForm(current => ({ ...current, cnpj: event.target.value }))} /></Field>
            <Field label="Tipo"><input value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))} placeholder="production, barbershop, company..." /></Field>
            <Field label="Categoria"><input value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} /></Field>
            <Field label="Descrição" wide><textarea rows="5" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>
          </div>
        </section>

        <section className="aep-card">
          <header className="aep-section-title"><span>02</span><div><h3>Proprietário</h3><p>Responsável pelo establishment dentro do ecossistema.</p></div></header>
          <div className="aep-grid"><Field label="Proprietário *" wide><select value={form.user_id} onChange={event => setForm(current => ({ ...current, user_id: event.target.value }))} required><option value="">Selecione um usuário</option>{users.map(user => <option key={user.id} value={user.id}>{userName(user)} · {user.email}</option>)}</select></Field></div>
        </section>

        <section className="aep-card aep-applications-card">
          <header className="aep-section-title"><span>03</span><div><h3>Aplicações e ações</h3><p>Vincule aplicações e crie recursos diretamente no contexto deste establishment.</p></div></header>
          <div className="aep-app-selector">
            {applications.map(app => {
              const selected = form.app_ids.includes(String(app.id))
              return <label key={app.id} className={selected ? 'selected' : ''}>
                <input type="checkbox" checked={selected} onChange={() => toggleApp(app.id)} />
                <span className="aep-app-logo">{app.logo ? <img src={app.logo} alt="" /> : String(app.name || 'P')[0]}</span>
                <span><b>{app.name}</b><small>{app.slug || `ID ${app.id}`}</small></span><i>{selected ? 'Vinculado' : 'Vincular'}</i>
              </label>
            })}
          </div>
          <div className="aep-grid aep-primary-app"><Field label="Aplicação principal *" wide><select value={form.app_id} onChange={event => setForm(current => ({ ...current, app_id: event.target.value }))} required><option value="">Selecione</option>{selectedApps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></Field></div>

          <div className="aep-resource-center">
            <div className="aep-resource-center-head"><div><h4>Criar recursos por aplicação</h4><p>Os botões respeitam o produto e mantêm o establishment como contexto.</p></div>{!editing && <span>Disponível após salvar</span>}</div>
            {!selectedApps.length && <div className="aep-resource-empty">Vincule uma aplicação para liberar as ações específicas.</div>}
            <div className="aep-app-action-grid">
              {selectedApps.map(app => <article className="aep-app-action-card" key={app.id}>
                <header><span className="aep-app-logo">{app.logo ? <img src={app.logo} alt="" /> : String(app.name || 'P')[0]}</span><div><b>{app.name}</b><small>{app.slug || `App #${app.id}`}</small></div></header>
                <div className="aep-action-buttons">{actionsForApp(app).map(action => <button key={action.key} type="button" disabled={!editing} onClick={() => launchResource(action, app)}><span>{action.icon}</span><div><b>{action.label}</b><small>{action.description}</small></div><i>↗</i></button>)}</div>
              </article>)}
            </div>
          </div>
        </section>

        <div id="aep-resource-composer"><ItemComposer draft={itemDraft} saving={resourceSaving} onChange={patch => setItemDraft(current => current ? ({ ...current, ...patch }) : current)} onClose={() => setItemDraft(null)} onSubmit={createItem} /></div>

        <section className="aep-card">
          <header className="aep-section-title"><span>04</span><div><h3>Contato e localização</h3><p>Informações operacionais e públicas.</p></div></header>
          <div className="aep-grid">
            <Field label="Telefone"><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></Field>
            <Field label="E-mail"><input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></Field>
            <Field label="CEP"><input value={form.cep} onChange={event => setForm(current => ({ ...current, cep: event.target.value }))} /></Field>
            <Field label="Cidade"><input value={form.city} onChange={event => setForm(current => ({ ...current, city: event.target.value }))} /></Field>
            <Field label="UF"><input maxLength="2" value={form.uf} onChange={event => setForm(current => ({ ...current, uf: event.target.value.toUpperCase() }))} /></Field>
            <Field label="Endereço"><input value={form.address} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} /></Field>
            <Field label="Site"><input type="url" value={form.website_url} onChange={event => setForm(current => ({ ...current, website_url: event.target.value }))} placeholder="https://" /></Field>
            <Field label="Instagram"><input type="url" value={form.instagram_url} onChange={event => setForm(current => ({ ...current, instagram_url: event.target.value }))} placeholder="https://" /></Field>
          </div>
        </section>

        <section className="aep-card">
          <header className="aep-section-title"><span>05</span><div><h3>Estado administrativo</h3><p>Publicação, aprovação, destaque e cancelamento.</p></div></header>
          <div className="aep-toggle-grid">{[
            ['is_approved', 'Aprovado', 'Liberado administrativamente'], ['is_published', 'Publicado', 'Visível nas experiências públicas'],
            ['is_featured', 'Destaque', 'Prioridade nas superfícies compatíveis'], ['is_cancelled', 'Cancelado', 'Bloqueia operação normal'],
          ].map(([key, label, detail]) => <label key={key} className={form[key] ? 'selected' : ''}><input type="checkbox" checked={Boolean(form[key])} onChange={event => setForm(current => ({ ...current, [key]: event.target.checked }))} /><span><b>{label}</b><small>{detail}</small></span></label>)}</div>
        </section>

        <footer className="aep-editor-actions"><button type="button" className="aep-secondary" onClick={backToList}>Cancelar</button><button className="aep-primary" disabled={saving}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar establishment'}</button></footer>
      </form>
    </div>
  }

  return <div className="aep-page">
    <header className="aep-list-header"><div><p className="eyebrow">ESTABELECIMENTOS</p><h2>Gestão de establishments</h2><p>Empresas, produções, barbearias e demais estabelecimentos do ecossistema.</p></div><button className="aep-primary" type="button" onClick={startCreate}>Novo establishment <span>＋</span></button></header>
    <div className="aep-metrics"><Metric label="Encontrados" value={metrics.total} detail="no filtro atual" /><Metric label="Aprovados" value={metrics.approved} detail="liberados" /><Metric label="Publicados" value={metrics.published} detail="visíveis" /><Metric label="Destaques" value={metrics.featured} detail="prioridade ativa" /><Metric label="Multi-app" value={metrics.multiApp} detail="2+ aplicações" /></div>
    {error && <div className="aep-feedback error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="aep-feedback success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

    <section className="aep-card aep-filter-card"><div className="aep-filter-grid">
      <Field label="Pesquisar"><input value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Nome, CNPJ, e-mail, telefone ou ID" /></Field>
      <Field label="Aplicação"><select value={filters.app_id} onChange={event => setFilters(current => ({ ...current, app_id: event.target.value }))}><option value="">Todas</option>{applications.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></Field>
      <Field label="Proprietário"><select value={filters.user_id} onChange={event => setFilters(current => ({ ...current, user_id: event.target.value }))}><option value="">Todos</option>{users.map(user => <option key={user.id} value={user.id}>{userName(user)}</option>)}</select></Field>
      <Field label="Aprovação"><select value={filters.approval} onChange={event => setFilters(current => ({ ...current, approval: event.target.value }))}><option value="">Todos</option><option value="approved">Aprovados</option><option value="pending">Pendentes</option></select></Field>
      <Field label="Publicação"><select value={filters.publication} onChange={event => setFilters(current => ({ ...current, publication: event.target.value }))}><option value="">Todos</option><option value="published">Publicados</option><option value="hidden">Ocultos</option></select></Field>
      <Field label="Cidade"><input value={filters.city} onChange={event => setFilters(current => ({ ...current, city: event.target.value }))} /></Field>
      <Field label="UF"><input maxLength="2" value={filters.uf} onChange={event => setFilters(current => ({ ...current, uf: event.target.value.toUpperCase() }))} /></Field>
      <Field label="Tipo"><input value={filters.type} onChange={event => setFilters(current => ({ ...current, type: event.target.value }))} /></Field>
      <button className="aep-secondary aep-filter-clear" type="button" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</button>
    </div></section>

    <section className="aep-card aep-table-card"><div className="aep-table-wrap"><table className="aep-table"><thead><tr><th>Establishment</th><th>Proprietário</th><th>Aplicações</th><th>Localização</th><th>Estado</th><th>Ações</th></tr></thead><tbody>
      {loading && <tr><td colSpan="6" className="aep-empty">Carregando establishments…</td></tr>}
      {!loading && !rows.length && <tr><td colSpan="6" className="aep-empty">Nenhum establishment encontrado.</td></tr>}
      {!loading && rows.map(row => {
        const logo = establishmentLogo(row)
        const linkedApps = row.applications?.length ? row.applications : (row.app ? [row.app] : [])
        return <tr key={row.id}>
          <td data-label="Establishment"><div className="aep-identity"><span className="aep-row-logo">{logo ? <img src={logo} alt="" /> : String(establishmentName(row))[0]}</span><div><b>{establishmentName(row)}</b><small>#{row.id} · {row.type || row.category || 'sem classificação'}</small></div></div></td>
          <td data-label="Proprietário"><b>{row.user ? userName(row.user) : `Usuário #${row.user_id || '—'}`}</b><small className="aep-block">{row.user?.email || ''}</small></td>
          <td data-label="Aplicações"><div className="aep-tags">{linkedApps.length ? linkedApps.map(app => <span key={app.id}>{app.name || app.slug}</span>) : <span>Sem vínculo</span>}</div></td>
          <td data-label="Localização"><b>{[row.city, row.uf].filter(Boolean).join(' / ') || '—'}</b><small className="aep-block">{row.address || row.cep || ''}</small></td>
          <td data-label="Estado"><div className="aep-statuses"><Status active={bool(row.is_approved)}>Aprovado</Status><Status active={bool(row.is_published)} tone="cyan">Publicado</Status>{bool(row.is_featured) && <Status active tone="warning">Destaque</Status>}</div></td>
          <td data-label="Ações"><div className="aep-row-actions"><button className="primary" type="button" onClick={() => startEdit(row)}>Editar</button><button type="button" onClick={() => quickUpdate(row, { is_approved: !bool(row.is_approved) }, bool(row.is_approved) ? 'Aprovação revogada.' : 'Establishment aprovado.')}>{bool(row.is_approved) ? 'Revogar' : 'Aprovar'}</button><button type="button" onClick={() => quickUpdate(row, { is_published: !bool(row.is_published) }, bool(row.is_published) ? 'Establishment ocultado.' : 'Establishment publicado.')}>{bool(row.is_published) ? 'Ocultar' : 'Publicar'}</button><button className="danger" type="button" disabled={saving} onClick={() => remove(row)}>Excluir</button></div></td>
        </tr>
      })}
    </tbody></table></div></section>
  </div>
}
