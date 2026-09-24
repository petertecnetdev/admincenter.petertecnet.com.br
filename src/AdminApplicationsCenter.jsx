import { useEffect, useMemo, useRef, useState } from 'react'
import { readAdminSessionState, writeAdminSessionState } from './adminPersistence.js'
import './AdminApplicationsCenter.css'
import './AdminApplicationManager.css'

const EMPTY_FORM = {
  name: '', slug: '', description: '', url: '', logo: '', category: '',
  is_active: true, self_service_access: true, is_visible: true, is_default: false,
  launcher_order: 0, operational_status: 'operational', maintenance_message: '',
  ecosystem_sdk_version: '', version: '', author: '', release_date: '',
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function compact(value) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value))
}

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(number(value))
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR')
}

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10)
}

function appKey(row) {
  return String(row?.id || row?.application_id || row?.app_id || normalize(row?.slug || row?.app_slug || row?.name || row?.application_name))
}

function sameApp(row, application) {
  if (!row || !application) return false
  const ids = [row.id, row.application_id, row.app_id].filter(value => value !== null && value !== undefined).map(String)
  if (application.id !== null && application.id !== undefined && ids.includes(String(application.id))) return true
  const appSlug = normalize(application.slug || application.app_slug)
  const rowSlug = normalize(row.slug || row.application_slug || row.app_slug)
  if (appSlug && rowSlug && appSlug === rowSlug) return true
  return normalize(application.name) && normalize(application.name) === normalize(row.application_name || row.app_name || row.name)
}

function formFrom(application) {
  return {
    ...EMPTY_FORM,
    ...application,
    name: application?.name || '',
    slug: application?.slug || '',
    description: application?.description || '',
    url: application?.url || '',
    logo: application?.logo || '',
    category: application?.category || '',
    launcher_order: Number(application?.launcher_order || 0),
    operational_status: application?.operational_status || 'operational',
    maintenance_message: application?.maintenance_message || '',
    ecosystem_sdk_version: application?.ecosystem_sdk_version || '',
    version: application?.version || '',
    author: application?.author || '',
    release_date: toDateInput(application?.release_date),
    is_active: application?.is_active !== false,
    self_service_access: application?.self_service_access !== false,
    is_visible: application?.is_visible !== false,
    is_default: Boolean(application?.is_default),
  }
}

function tone(application) {
  if (application?.is_active === false) return 'danger'
  const status = String(application?.operational_status || 'operational').toLowerCase()
  if (status === 'down') return 'danger'
  if (status === 'maintenance' || status === 'degraded') return 'warning'
  return 'success'
}

function statusLabel(application) {
  if (application?.is_active === false) return 'Inativa'
  const status = String(application?.operational_status || 'operational').toLowerCase()
  if (status === 'down') return 'Indisponível'
  if (status === 'maintenance') return 'Manutenção'
  if (status === 'degraded') return 'Degradada'
  return 'Operacional'
}

function Toggle({ label, detail, checked, onChange, disabled }) {
  return <label className="app-manager-toggle">
    <span><b>{label}</b><small>{detail}</small></span>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled}/>
    <i aria-hidden="true"/>
  </label>
}

function Field({ label, children, wide = false, hint }) {
  return <label className={`app-manager-field ${wide ? 'wide' : ''}`}>
    <span>{label}</span>{children}{hint && <small>{hint}</small>}
  </label>
}

function ApplicationEditor({ application, request, onClose, onSaved }) {
  const [form, setForm] = useState(() => formFrom(application))
  const [tab, setTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const closeRef = useRef(null)

  useEffect(() => {
    setForm(formFrom(application))
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [application])

  useEffect(() => {
    function keydown(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [onClose, saving])

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function submit(event) {
    event.preventDefault()
    if (!application?.id || saving) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || null,
        description: form.description.trim() || null,
        url: form.url.trim(),
        logo: form.logo.trim() || null,
        category: form.category.trim() || null,
        is_active: Boolean(form.is_active),
        self_service_access: Boolean(form.self_service_access),
        is_visible: Boolean(form.is_visible),
        is_default: Boolean(form.is_default),
        launcher_order: Number(form.launcher_order || 0),
        operational_status: form.operational_status,
        maintenance_message: form.maintenance_message.trim() || null,
        ecosystem_sdk_version: form.ecosystem_sdk_version.trim() || null,
        version: form.version.trim() || null,
        author: form.author.trim() || null,
        release_date: form.release_date || null,
      }
      const response = await request(`/admin/applications/${application.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      onSaved(response?.application || response?.data || { ...application, ...payload })
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="app-manager-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !saving && onClose()}>
    <form className="app-manager-drawer" role="dialog" aria-modal="true" aria-labelledby="application-editor-title" onSubmit={submit}>
      <header className="app-manager-header">
        <div><p>ADMIN CENTER / APLICAÇÕES</p><h2 id="application-editor-title">Editar {application?.name}</h2><span>Cadastro, exposição, acesso e estado operacional em uma única área.</span></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar">×</button>
      </header>
      <nav className="app-manager-tabs" aria-label="Seções da edição">
        <button type="button" className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Informações</button>
        <button type="button" className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>Acesso e visibilidade</button>
        <button type="button" className={tab === 'operations' ? 'active' : ''} onClick={() => setTab('operations')}>Operação e versão</button>
      </nav>
      <div className="app-manager-body">
        {tab === 'general' && <div className="app-manager-grid">
          <Field label="Nome"><input value={form.name} onChange={event => set('name', event.target.value)} required/></Field>
          <Field label="Slug"><input value={form.slug} onChange={event => set('slug', event.target.value)} placeholder="nome-da-aplicacao"/></Field>
          <Field label="Descrição" wide><textarea rows="5" value={form.description} onChange={event => set('description', event.target.value)}/></Field>
          <Field label="URL da aplicação" wide><input type="url" value={form.url} onChange={event => set('url', event.target.value)} required/></Field>
          <Field label="URL da logo" wide hint="Se ficar vazio, a API pode usar a identidade padrão da aplicação."><input type="url" value={form.logo} onChange={event => set('logo', event.target.value)}/></Field>
          <Field label="Categoria"><input value={form.category} onChange={event => set('category', event.target.value)}/></Field>
          <Field label="Ordem no launcher"><input type="number" min="0" max="100000" value={form.launcher_order} onChange={event => set('launcher_order', event.target.value)}/></Field>
        </div>}
        {tab === 'access' && <div className="app-manager-toggle-list">
          <Toggle label="Aplicação ativa" detail="Mantém a aplicação operacional no ecossistema." checked={form.is_active} onChange={value => set('is_active', value)} disabled={form.is_default}/>
          <Toggle label="Visível" detail="Controla a exposição da aplicação nas superfícies compatíveis." checked={form.is_visible} onChange={value => set('is_visible', value)} disabled={form.is_default}/>
          <Toggle label="Acesso self-service" detail="Permite acesso sem liberação manual individual." checked={form.self_service_access} onChange={value => set('self_service_access', value)}/>
          <Toggle label="Aplicação padrão" detail="Define a aplicação principal do ecossistema." checked={form.is_default} onChange={value => set('is_default', value)}/>
          <div className="app-manager-explain"><b>Regra de segurança</b><p>A API mantém apenas uma aplicação padrão e força essa aplicação como ativa e visível.</p></div>
        </div>}
        {tab === 'operations' && <div className="app-manager-grid">
          <Field label="Estado operacional"><select value={form.operational_status} onChange={event => set('operational_status', event.target.value)}><option value="operational">Operacional</option><option value="degraded">Degradada</option><option value="maintenance">Manutenção</option><option value="down">Indisponível</option></select></Field>
          <Field label="Versão"><input value={form.version} onChange={event => set('version', event.target.value)}/></Field>
          <Field label="Versão do SDK"><input value={form.ecosystem_sdk_version} onChange={event => set('ecosystem_sdk_version', event.target.value)}/></Field>
          <Field label="Autor"><input value={form.author} onChange={event => set('author', event.target.value)}/></Field>
          <Field label="Data da versão"><input type="date" value={form.release_date} onChange={event => set('release_date', event.target.value)}/></Field>
          <Field label="Mensagem de manutenção" wide><textarea rows="4" value={form.maintenance_message} onChange={event => set('maintenance_message', event.target.value)}/></Field>
          <div className={`app-manager-health wide status-${form.operational_status}`}><span/><div><b>{statusLabel(form)}</b><small>Estado central usado pelas experiências administrativas.</small></div></div>
        </div>}
      </div>
      {error && <div className="app-manager-error" role="alert">{error}</div>}
      <footer className="app-manager-footer"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button></footer>
    </form>
  </div>
}

export default function AdminApplicationsCenter({ applications = [], dashboard, financial, activity, command, request, onReload }) {
  const saved = useMemo(() => readAdminSessionState('applications-view', { search: '', status: 'all', sort: 'activity' }), [])
  const [search, setSearch] = useState(saved.search || '')
  const [status, setStatus] = useState(saved.status || 'all')
  const [sort, setSort] = useState(saved.sort || 'activity')
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [localUpdates, setLocalUpdates] = useState({})
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    writeAdminSessionState('applications-view', { search, status, sort })
  }, [search, status, sort])

  const rows = useMemo(() => {
    const base = new Map()
    ;[...(applications || []), ...(dashboard?.applications || [])].forEach(row => {
      if (!row) return
      const key = appKey(row)
      base.set(key, { ...(base.get(key) || {}), ...row })
    })
    return [...base.values()].map(row => {
      const financialRow = (financial?.applications || []).find(candidate => sameApp(candidate, row)) || {}
      const update = localUpdates[String(row.id)] || {}
      return { ...row, ...update, _financial: financialRow }
    })
  }, [applications, dashboard, financial, localUpdates])

  const visible = useMemo(() => {
    const needle = normalize(search)
    const filtered = rows.filter(row => {
      if (status === 'active' && row.is_active === false) return false
      if (status === 'inactive' && row.is_active !== false) return false
      if (needle && ![row.name, row.slug, row.description, row.category].some(value => normalize(value).includes(needle))) return false
      return true
    })
    return filtered.sort((a, b) => {
      if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
      if (sort === 'users') return number(b.users_count) - number(a.users_count)
      if (sort === 'gross') return number(b._financial?.gross) - number(a._financial?.gross)
      return number(b.activity_count_30d) - number(a.activity_count_30d)
    })
  }, [rows, search, status, sort])

  const selected = rows.find(row => String(row.id) === String(selectedId)) || null
  const activityRows = activity?.activity || dashboard?.recent_activity || []
  const issues = command?.issues?.data || command?.issues || []
  const selectedActivity = selected ? activityRows.filter(row => sameApp(row, selected)).slice(0, 12) : []
  const selectedIssues = selected ? issues.filter(row => sameApp(row, selected)).slice(0, 8) : []

  const totals = useMemo(() => ({
    total: rows.length,
    active: rows.filter(row => row.is_active !== false).length,
    users: rows.reduce((sum, row) => sum + number(row.users_count), 0),
    interactions: rows.reduce((sum, row) => sum + number(row.activity_count_30d), 0),
    gross: rows.reduce((sum, row) => sum + number(row._financial?.gross), 0),
  }), [rows])

  async function savedApplication(updated) {
    setLocalUpdates(current => ({ ...current, [String(updated.id)]: updated }))
    setEditing(null)
    setNotice('Aplicação atualizada com sucesso.')
    setError('')
    try {
      await onReload?.()
    } catch (reloadError) {
      setError(`A alteração foi salva, mas a atualização da lista falhou: ${reloadError.message}`)
    }
  }

  if (selected) {
    return <div className="aac-detail">
      <header className="aac-detail-head">
        <button type="button" className="aac-back" onClick={() => setSelectedId(null)}>← Aplicações</button>
        <div className="aac-detail-actions"><span className={`aac-status ${tone(selected)}`}><i/>{statusLabel(selected)}</span><button type="button" className="aac-primary" onClick={() => setEditing(selected)}>Editar aplicação</button>{selected.url && <a href={selected.url} target="_blank" rel="noreferrer">Abrir ↗</a>}</div>
      </header>
      <section className="aac-hero">
        <div className="aac-logo">{selected.logo ? <img src={selected.logo} alt="" /> : String(selected.name || 'P')[0]}</div>
        <div><p className="eyebrow">APLICAÇÃO / {selected.slug || `#${selected.id}`}</p><h2>{selected.name}</h2><p>{selected.description || 'Produto conectado ao ecossistema Peter Tecnet.'}</p></div>
      </section>
      <div className="aac-metrics">
        <article><span>Usuários</span><b>{compact(selected.users_count)}</b><small>cadastros vinculados</small></article>
        <article><span>Ativos · 30d</span><b>{compact(selected.active_users_30d)}</b><small>uso recente</small></article>
        <article><span>Interações · 30d</span><b>{compact(selected.activity_count_30d)}</b><small>telemetria</small></article>
        <article><span>Volume bruto</span><b>{currency(selected._financial?.gross)}</b><small>{compact(selected._financial?.transactions)} transações</small></article>
      </div>
      <div className="aac-detail-grid">
        <article className="aac-panel"><header><h3>Atividade recente</h3><span>{selectedActivity.length}</span></header><div className="aac-feed">{selectedActivity.length ? selectedActivity.map((row, index) => <div key={row.id || index}><i/><span><b>{row.name || row.interaction_type || row.type || 'Interação'}</b><small>{row.user_email || row.email || 'Ecossistema'}</small></span><time>{dateTime(row.created_at || row.occurred_at)}</time></div>) : <p className="aac-empty">Nenhuma atividade específica retornada.</p>}</div></article>
        <article className="aac-panel"><header><h3>Sinais operacionais</h3><span>{selectedIssues.length}</span></header><div className="aac-feed">{selectedIssues.length ? selectedIssues.map((row, index) => <div key={row.id || index}><i/><span><b>{row.title || row.name || 'Sinal operacional'}</b><small>{row.message || row.description || row.status}</small></span></div>) : <p className="aac-empty">Nenhum alerta específico identificado.</p>}</div></article>
      </div>
      <article className="aac-panel aac-metadata"><header><h3>Cadastro técnico</h3></header><div><span>ID <b>{selected.id}</b></span><span>Slug <b>{selected.slug || '—'}</b></span><span>Categoria <b>{selected.category || '—'}</b></span><span>Versão <b>{selected.version || '—'}</b></span><span>Atualizado <b>{dateTime(selected.updated_at)}</b></span></div></article>
      {editing && <ApplicationEditor application={editing} request={request} onClose={() => setEditing(null)} onSaved={savedApplication}/>}
    </div>
  }

  return <div className="aac-root">
    {notice && <div className="aac-notice success" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
    {error && <div className="aac-notice error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    <div className="aac-metrics">
      <article><span>Aplicações</span><b>{totals.total}</b><small>{totals.active} ativas</small></article>
      <article><span>Usuários vinculados</span><b>{compact(totals.users)}</b><small>somatório cadastral</small></article>
      <article><span>Interações · 30d</span><b>{compact(totals.interactions)}</b><small>atividade recente</small></article>
      <article><span>Volume bruto</span><b>{currency(totals.gross)}</b><small>consolidado disponível</small></article>
    </div>
    <section className="aac-toolbar" aria-label="Filtros das aplicações">
      <label><span>Pesquisar</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, slug, categoria…"/></label>
      <label><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select></label>
      <label><span>Ordenar</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="activity">Mais atividade</option><option value="users">Mais usuários</option><option value="gross">Maior volume</option><option value="name">Nome</option></select></label>
      <button type="button" onClick={() => onReload?.()}>Atualizar ↻</button>
    </section>
    <div className="aac-grid">
      {visible.length ? visible.map(row => <article className="aac-card" key={row.id || row.slug}>
        <header><div className="aac-logo">{row.logo ? <img src={row.logo} alt="" onError={event => { event.currentTarget.style.display = 'none' }}/> : String(row.name || 'P')[0]}</div><span className={`aac-status ${tone(row)}`}><i/>{statusLabel(row)}</span></header>
        <h3>{row.name}</h3><p>{row.description || row.slug || 'Aplicação Peter Tecnet'}</p>
        <div className="aac-card-stats"><span><small>Usuários</small><b>{compact(row.users_count)}</b></span><span><small>Ativos 30d</small><b>{compact(row.active_users_30d)}</b></span><span><small>Interações</small><b>{compact(row.activity_count_30d)}</b></span><span><small>Volume</small><b>{currency(row._financial?.gross)}</b></span></div>
        <footer><button type="button" onClick={() => setSelectedId(row.id)}>Detalhes</button><button type="button" className="primary" onClick={() => setEditing(row)}>Editar</button>{row.url && <a href={row.url} target="_blank" rel="noreferrer">Abrir ↗</a>}</footer>
      </article>) : <div className="aac-empty-card">Nenhuma aplicação corresponde aos filtros atuais.</div>}
    </div>
    {editing && <ApplicationEditor application={editing} request={request} onClose={() => setEditing(null)} onSaved={savedApplication}/>}
  </div>
}
