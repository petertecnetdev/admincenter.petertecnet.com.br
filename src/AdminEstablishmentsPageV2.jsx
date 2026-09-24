import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readAdminSessionState, writeAdminSessionState } from './adminPersistence.js'
import { adminRequest as apiRequest } from './adminApi.js'
import AdminEstablishmentCatalog from './AdminEstablishmentCatalog.jsx'
import AdminEstablishmentEvents from './AdminEstablishmentEvents.jsx'
import AdminEstablishmentResourceEditor from './AdminEstablishmentResourceEditor.jsx'
import AdminProcessingIndicator from './AdminProcessingIndicator.jsx'
import './AdminEstablishmentsPage.css'

const EMPTY_FILTERS = { search: '' }
const EMPTY_FORM = {
  name: '', fantasy: '', slug: '', cnpj: '', type: '', category: '', phone: '', email: '', description: '',
  city: '', uf: '', cep: '', address: '', website_url: '', instagram_url: '', user_id: '', app_id: '', app_ids: [],
  is_published: false, is_approved: false, is_featured: false, is_cancelled: false,
}

const GENERIC_ITEM_RESOURCES = [
  { key: 'product', resourceKind: 'item', defaultType: 'product', entityLabel: 'produto', label: 'Criar produto', description: 'Cadastre um produto já classificado e vinculado a esta aplicação.', icon: 'PR' },
  { key: 'service', resourceKind: 'item', defaultType: 'service', entityLabel: 'serviço', label: 'Criar serviço', description: 'Cadastre um serviço reutilizando o modelo genérico de Item.', icon: 'SV' },
  { key: 'item', label: 'Criar item', description: 'Cadastre um item genérico dentro do Admin Center.', icon: 'IT' },
]

const RESOURCE_REGISTRY = {
  cutinapp: [
    { key: 'event', label: 'Criar evento', description: 'Cadastre o evento aqui no Admin Center.', icon: 'EV' },
    { key: 'events-list', mode: 'events', label: 'Listar eventos', description: 'Veja e gerencie todos os eventos deste establishment.', icon: 'LE' },
    { key: 'ticket-ops', mode: 'tickets', label: 'Ingressos e vendas', description: 'Gerencie lotes reais, vendas, disponibilidade, receita e check-ins por evento.', icon: 'IV' },
    { key: 'product', resourceKind: 'item', defaultType: 'product', entityLabel: 'produto', label: 'Criar produto', description: 'Cadastre um produto para venda antecipada ou catálogo do establishment.', icon: 'PR' },
    { key: 'catalog-list', mode: 'catalog', label: 'Listar catálogo', description: 'Veja produtos e itens já cadastrados para este establishment.', icon: 'LC' },
    { key: 'item', label: 'Criar item', description: 'Cadastre qualquer outro item sem sair do painel.', icon: 'IT' },
  ],
  rasoio: [
    { key: 'appointment', label: 'Criar agendamento', description: 'Agende cliente, profissional e serviço no Admin Center.', icon: 'AG' },
    { key: 'employer', label: 'Criar employer', description: 'Vincule um profissional à equipe sem abrir o Rasoio.', icon: 'EM' },
    { key: 'service', resourceKind: 'item', defaultType: 'service', entityLabel: 'serviço', label: 'Criar serviço', description: 'Cadastre um serviço pronto para ser usado nos agendamentos.', icon: 'SV' },
    { key: 'product', resourceKind: 'item', defaultType: 'product', entityLabel: 'produto', label: 'Criar produto', description: 'Cadastre um produto comercializado pelo establishment.', icon: 'PR' },
    { key: 'item', label: 'Criar item', description: 'Cadastre qualquer outro item diretamente aqui.', icon: 'IT' },
  ],
  nexus: [
    { key: 'product', resourceKind: 'item', defaultType: 'product', entityLabel: 'produto', label: 'Criar produto', description: 'Cadastre um produto já pronto para o catálogo.', icon: 'PR' },
    { key: 'service', resourceKind: 'item', defaultType: 'service', entityLabel: 'serviço', label: 'Criar serviço', description: 'Cadastre um serviço comercializado no catálogo.', icon: 'SV' },
    { key: 'item', label: 'Criar item', description: 'Cadastre um item genérico no catálogo pelo Admin Center.', icon: 'IT' },
  ],
}

const bool = value => value === true || value === 1 || value === '1'
const asArray = value => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []
const establishmentName = row => row?.fantasy || row?.name || `Establishment #${row?.id || '—'}`
const userName = user => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || `Usuário #${user?.id || '—'}`
const linkedAppIds = row => Array.from(new Set([row?.app_id, ...asArray(row?.applications).map(app => app.id)].map(Number).filter(Boolean)))
const establishmentOwnerId = row => Number(row?.user_id || row?.owner_id || row?.owner?.id || row?.user?.id) || null
const establishmentApplications = row => {
  const apps = asArray(row?.applications)
  const names = apps.map(app => app?.name || app?.slug).filter(Boolean)
  if (!names.length) return row?.app_id ? `App #${row.app_id}` : 'Nenhuma'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}
const establishmentStatus = row => {
  if (bool(row?.is_cancelled)) return 'Cancelado'
  if (bool(row?.is_published)) return bool(row?.is_approved) ? 'Publicado' : 'Publicado · pendente'
  if (bool(row?.is_approved)) return 'Aprovado'
  return 'Pendente'
}
const establishmentLocation = row => [row?.city, row?.uf].filter(Boolean).join(' / ') || 'Não informado'

function formFrom(row) {
  const appIds = linkedAppIds(row).map(String)
  const ownerId = establishmentOwnerId(row)
  return {
    ...EMPTY_FORM,
    name: row?.name || '', fantasy: row?.fantasy || '', slug: row?.slug || '', cnpj: row?.cnpj || '', type: row?.type || '',
    category: row?.category || '', phone: row?.phone || '', email: row?.email || '', description: row?.description || '',
    city: row?.city || '', uf: row?.uf || '', cep: row?.cep || '', address: row?.address || '', website_url: row?.website_url || '',
    instagram_url: row?.instagram_url || '', user_id: ownerId ? String(ownerId) : '',
    app_id: row?.app_id ? String(row.app_id) : (appIds[0] || ''), app_ids: appIds,
    is_published: bool(row?.is_published), is_approved: bool(row?.is_approved), is_featured: bool(row?.is_featured), is_cancelled: bool(row?.is_cancelled),
  }
}

function payloadFrom(form, editing) {
  const nullable = value => String(value ?? '').trim() || null
  const appIds = Array.from(new Set(asArray(form?.app_ids).map(Number).filter(Boolean)))
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
  return RESOURCE_REGISTRY[normalizeAppKey(app)] || GENERIC_ITEM_RESOURCES
}

function Field({ label, children, wide = false }) {
  return <label className={`aep-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}

export default function AdminEstablishmentsPageV2({ quickCreateToken = 0 }) {
  const [rows, setRows] = useState([])
  const [applications, setApplications] = useState([])
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState(() => ({ search: String(readAdminSessionState('establishments-filters', EMPTY_FILTERS)?.search || '') }))
  const [mode, setMode] = useState('list')
  const [editing, setEditing] = useState(null)
  const [resourceEditor, setResourceEditor] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const loadedOnceRef = useRef(false)
  const loadSequenceRef = useRef(0)

  useEffect(() => { writeAdminSessionState('establishments-filters', filters) }, [filters])

  const loadOptions = useCallback(async () => {
    const [appsResult, usersResult] = await Promise.allSettled([apiRequest('/admin/applications'), apiRequest('/admin/ecosystem/users')])
    if (appsResult.status === 'fulfilled') {
      const payload = appsResult.value
      setApplications(asArray(payload?.applications ?? payload?.data ?? payload))
    }
    if (usersResult.status === 'fulfilled') setUsers(asArray(usersResult.value?.users ?? usersResult.value?.data ?? usersResult.value))
  }, [])

  const loadRows = useCallback(async currentFilters => {
    const sequence = ++loadSequenceRef.current
    if (!loadedOnceRef.current) setLoading(true)
    setError('')
    const params = new URLSearchParams()
    Object.entries(currentFilters && typeof currentFilters === 'object' ? currentFilters : EMPTY_FILTERS).forEach(([key, value]) => { if (String(value || '').trim()) params.set(key, String(value).trim()) })
    try {
      const payload = await apiRequest(`/admin/ecosystem/establishments${params.size ? `?${params.toString()}` : ''}`)
      if (sequence !== loadSequenceRef.current) return
      setRows(asArray(payload?.establishments ?? payload?.data ?? payload))
    } catch (err) {
      if (sequence === loadSequenceRef.current) setError(err.message)
    } finally {
      if (sequence === loadSequenceRef.current) {
        loadedOnceRef.current = true
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => { void loadOptions() }, [loadOptions])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRows(filters) }, 280)
    return () => window.clearTimeout(timer)
  }, [filters, reloadKey, loadRows])

  const selectedApps = useMemo(() => applications.filter(app => asArray(form?.app_ids).includes(String(app.id))), [applications, form.app_ids])
  const savedAppIds = useMemo(() => new Set(linkedAppIds(editing)), [editing])
  const scrollTop = () => document.getElementById('establishments-admin-integration')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  function startCreate() {
    const first = applications[0]?.id ? String(applications[0].id) : ''
    setEditing(null); setResourceEditor(null); setForm({ ...EMPTY_FORM, app_id: first, app_ids: first ? [first] : [] }); setError(''); setNotice(''); setMode('editor')
    window.setTimeout(scrollTop, 0)
  }

  useEffect(() => {
    if (!quickCreateToken) return
    startCreate()
  }, [quickCreateToken])

  function startEdit(row) {
    setEditing(row); setResourceEditor(null); setForm(formFrom(row)); setError(''); setNotice(''); setMode('editor')
    window.setTimeout(scrollTop, 0)
  }

  function backToList() {
    setMode('list'); setEditing(null); setResourceEditor(null); setError(''); window.setTimeout(scrollTop, 0)
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
    if (!form.user_id) { setError('Selecione o proprietário do establishment.'); return }
    setSaving(true)
    try {
      const editingId = editing?.id
      const result = await apiRequest(`/admin/ecosystem/establishments${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payloadFrom(form, Boolean(editingId))),
      })
      const id = editingId || result?.establishment?.id || result?.data?.id
      if (editingId && Number(form.user_id) !== establishmentOwnerId(editing)) {
        await apiRequest(`/admin/ecosystem/establishments/${editingId}/owner`, { method: 'PUT', body: JSON.stringify({ user_id: Number(form.user_id) }) })
      }
      setNotice(editingId ? 'Establishment atualizado com sucesso.' : `Establishment #${id || ''} criado com sucesso.`)
      setMode('list'); setEditing(null); setResourceEditor(null); setReloadKey(value => value + 1)
      window.dispatchEvent(new CustomEvent('admin-entity-updated', { detail: { entity: 'establishment' } })); window.setTimeout(scrollTop, 0)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  function launchResource(action, app) {
    if (!editing?.id) { setError('Salve o establishment antes de criar recursos vinculados.'); return }
    if (!savedAppIds.has(Number(app.id))) { setError(`Salve o vínculo com ${app.name || app.slug} antes de criar recursos.`); return }
    setResourceEditor({ action, app, establishment: { ...editing, ...form, id: editing.id, user_id: Number(form.user_id) || establishmentOwnerId(editing) } })
    setMode(action.mode || 'resource'); setError(''); setNotice(''); window.setTimeout(scrollTop, 0)
  }

  if (['events', 'tickets', 'catalog'].includes(mode) && resourceEditor) {
    const { action, app, establishment } = resourceEditor
    return <div className="aep-page aep-editor-page">
      <header className="aep-editor-header">
        <button className="aep-back" type="button" onClick={() => { setMode('editor'); setResourceEditor(null); window.setTimeout(scrollTop, 0) }}>← Voltar ao establishment</button>
        <div className="aep-editor-title"><p className="eyebrow">CUTINAPP / OPERAÇÃO</p><h2>{action.label}</h2><p>{action.description}</p></div>
        <div className="aep-editor-id"><small>ESTABLISHMENT</small><strong>#{establishment.id}</strong></div>
      </header>
      {mode === 'events' && <AdminEstablishmentEvents establishment={establishment} app={app} />}
      {mode === 'tickets' && <AdminEstablishmentEvents establishment={establishment} app={app} ticketsOnly />}
      {mode === 'catalog' && <AdminEstablishmentCatalog establishment={establishment} app={app} />}
    </div>
  }

  if (mode === 'resource' && resourceEditor) {
    return <AdminEstablishmentResourceEditor
      {...resourceEditor}
      users={users}
      onBack={() => { setMode('editor'); setResourceEditor(null); window.setTimeout(scrollTop, 0) }}
      onCreated={message => { setNotice(message); setMode('editor'); setResourceEditor(null); window.dispatchEvent(new CustomEvent('admin-entity-updated', { detail: { entity: 'establishment' } })); window.setTimeout(scrollTop, 0) }}
    />
  }

  if (mode === 'editor') {
    return <div className="aep-page aep-editor-page">
      <header className="aep-editor-header">
        <button className="aep-back" type="button" onClick={backToList}>← Estabelecimentos</button>
        <div className="aep-editor-title"><p className="eyebrow">ESTABLISHMENT / EDITOR</p><h2>{editing ? `Editar ${establishmentName(editing)}` : 'Novo establishment'}</h2><p>Editor em página. Recursos de cada aplicação também são criados em páginas do próprio Admin Center.</p></div>
        {editing && <div className="aep-editor-id"><small>ID</small><strong>#{editing.id}</strong></div>}
      </header>

      {error && <div className="aep-feedback error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="aep-feedback success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

      <form className="aep-editor" onSubmit={save}>
        <section className="aep-card"><header className="aep-section-title"><span>01</span><div><h3>Identidade</h3><p>Dados principais e classificação.</p></div></header><div className="aep-grid">
          <Field label="Nome *"><input value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} required /></Field>
          <Field label="Nome fantasia"><input value={form.fantasy} onChange={e => setForm(current => ({ ...current, fantasy: e.target.value }))} /></Field>
          <Field label="Slug"><input value={form.slug} onChange={e => setForm(current => ({ ...current, slug: e.target.value }))} placeholder="gerado automaticamente se vazio" /></Field>
          <Field label="CNPJ"><input value={form.cnpj} onChange={e => setForm(current => ({ ...current, cnpj: e.target.value }))} /></Field>
          <Field label="Tipo"><input value={form.type} onChange={e => setForm(current => ({ ...current, type: e.target.value }))} placeholder="production, barbershop, company..." /></Field>
          <Field label="Categoria"><input value={form.category} onChange={e => setForm(current => ({ ...current, category: e.target.value }))} /></Field>
          <Field label="Descrição" wide><textarea rows="5" value={form.description} onChange={e => setForm(current => ({ ...current, description: e.target.value }))} /></Field>
        </div></section>

        <section className="aep-card"><header className="aep-section-title"><span>02</span><div><h3>Proprietário</h3><p>Responsável dentro do ecossistema.</p></div></header><div className="aep-grid"><Field label="Proprietário *" wide><select value={form.user_id} onChange={e => setForm(current => ({ ...current, user_id: e.target.value }))} required><option value="">Selecione um usuário</option>{users.map(user => <option key={user.id} value={user.id}>{userName(user)} · {user.email}</option>)}</select></Field></div></section>

        <section className="aep-card aep-applications-card">
          <header className="aep-section-title"><span>03</span><div><h3>Aplicações e ações</h3><p>Vincule aplicações e crie seus recursos sem sair do Admin Center.</p></div></header>
          <div className="aep-app-selector">{applications.map(app => {
            const selected = form.app_ids.includes(String(app.id))
            return <label key={app.id} className={selected ? 'selected' : ''}><input type="checkbox" checked={selected} onChange={() => toggleApp(app.id)} /><span className="aep-app-logo">{app.logo ? <img src={app.logo} alt="" /> : String(app.name || 'P')[0]}</span><span><b>{app.name}</b><small>{app.slug || `ID ${app.id}`}</small></span><i>{selected ? 'Vinculado' : 'Vincular'}</i></label>
          })}</div>
          <div className="aep-grid aep-primary-app"><Field label="Aplicação principal *" wide><select value={form.app_id} onChange={e => setForm(current => ({ ...current, app_id: e.target.value }))} required><option value="">Selecione</option>{selectedApps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></Field></div>
          <div className="aep-resource-center">
            <div className="aep-resource-center-head"><div><h4>Recursos por aplicação</h4><p>Crie, liste e gerencie os recursos desta aplicação sem sair do establishment.</p></div>{!editing && <span>Disponível após salvar</span>}</div>
            {!selectedApps.length && <div className="aep-resource-empty">Vincule uma aplicação para liberar as ações específicas.</div>}
            <div className="aep-app-action-grid">{selectedApps.map(app => {
              const linked = savedAppIds.has(Number(app.id))
              return <article className="aep-app-action-card" key={app.id}><header><span className="aep-app-logo">{app.logo ? <img src={app.logo} alt="" /> : String(app.name || 'P')[0]}</span><div><b>{app.name}</b><small>{app.slug || `App #${app.id}`}</small></div></header><div className="aep-action-buttons">{actionsForApp(app).map(action => <button key={action.key} type="button" disabled={!editing || !linked} onClick={() => launchResource(action, app)}><span>{action.icon}</span><div><b>{action.label}</b><small>{linked ? action.description : 'Salve o vínculo desta aplicação primeiro.'}</small></div><i>→</i></button>)}</div></article>
            })}</div>
          </div>
        </section>

        <section className="aep-card"><header className="aep-section-title"><span>04</span><div><h3>Contato e localização</h3><p>Informações operacionais e públicas.</p></div></header><div className="aep-grid">
          <Field label="Telefone"><input value={form.phone} onChange={e => setForm(current => ({ ...current, phone: e.target.value }))} /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} /></Field>
          <Field label="CEP"><input value={form.cep} onChange={e => setForm(current => ({ ...current, cep: e.target.value }))} /></Field>
          <Field label="Cidade"><input value={form.city} onChange={e => setForm(current => ({ ...current, city: e.target.value }))} /></Field>
          <Field label="UF"><input maxLength="2" value={form.uf} onChange={e => setForm(current => ({ ...current, uf: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Endereço"><input value={form.address} onChange={e => setForm(current => ({ ...current, address: e.target.value }))} /></Field>
          <Field label="Site"><input type="url" value={form.website_url} onChange={e => setForm(current => ({ ...current, website_url: e.target.value }))} placeholder="https://" /></Field>
          <Field label="Instagram"><input type="url" value={form.instagram_url} onChange={e => setForm(current => ({ ...current, instagram_url: e.target.value }))} placeholder="https://" /></Field>
        </div></section>

        <section className="aep-card"><header className="aep-section-title"><span>05</span><div><h3>Estado administrativo</h3><p>Publicação, aprovação, destaque e cancelamento.</p></div></header><div className="aep-toggle-grid">{[
          ['is_approved', 'Aprovado', 'Liberado administrativamente'], ['is_published', 'Publicado', 'Visível nas experiências públicas'],
          ['is_featured', 'Destaque', 'Prioridade nas superfícies compatíveis'], ['is_cancelled', 'Cancelado', 'Bloqueia operação normal'],
        ].map(([key, label, detail]) => <label key={key} className={form[key] ? 'selected' : ''}><input type="checkbox" checked={Boolean(form[key])} onChange={e => setForm(current => ({ ...current, [key]: e.target.checked }))} /><span><b>{label}</b><small>{detail}</small></span></label>)}</div></section>

        <footer className="aep-editor-actions"><button type="button" className="aep-secondary" onClick={backToList}>Cancelar</button><button className="aep-primary" disabled={saving}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar establishment'}</button></footer>
      </form>
    </div>
  }

  return <div className="acu-root acu-root--simple">
    {error && <div className="acu-notice acu-notice--danger" role="alert">{error}</div>}
    {notice && <div className="aep-feedback success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

    <section className="acu-card acu-users-simple">
      <header className="acu-users-simple__head">
        <div>
          <span>ESTABELECIMENTOS</span>
          <h3>Lista de estabelecimentos</h3>
          <p>{rows.length} cadastrado(s) no ecossistema</p>
        </div>
        <button className="acu-invite-button" type="button" onClick={startCreate}>+ Novo estabelecimento</button>
      </header>

      <div className="aep-objective-search" role="search">
        <label>
          <span>Buscar estabelecimento</span>
          <input
            type="search"
            value={filters.search}
            onChange={event => setFilters({ search: event.target.value })}
            placeholder="Nome, CNPJ, e-mail, telefone ou ID"
            autoComplete="off"
          />
        </label>
        {filters.search && <button type="button" className="acu-secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar</button>}
      </div>

      {loading ? (
        <AdminProcessingIndicator
          title={loadedOnceRef.current ? 'Atualizando estabelecimentos' : 'Carregando estabelecimentos'}
          messages="Consultando os estabelecimentos do ecossistema…|Sincronizando vínculos, responsáveis e aplicações…|Organizando a visão administrativa…"
          detail={filters.search ? `Buscando por “${filters.search}”.` : 'Aguarde enquanto os dados são carregados.'}
        />
      ) : rows.length === 0 ? (
        <div className="acu-empty">
          <strong>Nenhum estabelecimento encontrado.</strong>
          <span>{filters.search ? 'Tente outro nome, documento ou contato.' : 'Cadastre o primeiro estabelecimento para começar.'}</span>
        </div>
      ) : (
        <div className="acu-simple-list">
          {rows.map(row => {
            const owner = row.user || row.owner || { id: row.user_id }
            return <div className="acu-simple-user" key={row.id}>
              <button type="button" className="acu-simple-user__details" onClick={() => startEdit(row)}>
                <span className="acu-simple-user__avatar">{establishmentName(row).slice(0, 2).toUpperCase()}</span>
                <span className="acu-simple-user__identity">
                  <strong>{establishmentName(row)}</strong>
                  <small>{row.email || row.slug || `#${row.id}`}</small>
                </span>
                <span className="acu-simple-user__meta">
                  <small>Proprietário</small>
                  <strong>{userName(owner)}</strong>
                </span>
                <span className="acu-simple-user__meta">
                  <small>Plataformas</small>
                  <strong>{establishmentApplications(row)}</strong>
                </span>
                <span className="acu-simple-user__meta acu-simple-user__activity">
                  <small>Status · Localização</small>
                  <strong>{establishmentStatus(row)} · {establishmentLocation(row)}</strong>
                </span>
                <span className="acu-simple-user__open" aria-hidden="true">›</span>
              </button>
              <button type="button" className="acu-simple-user__impersonate" onClick={() => startEdit(row)}>Abrir</button>
            </div>
          })}
        </div>
      )}
    </section>
  </div>
}
