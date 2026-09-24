import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import './AdminApplicationManager.css'

const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const TOKEN_KEY = 'petertecnet_admin_token'

const EMPTY_FORM = {
  name: '', slug: '', description: '', url: '', logo: '', category: '',
  is_active: true, self_service_access: true, is_visible: true, is_default: false,
  launcher_order: 0, operational_status: 'operational', maintenance_message: '',
  ecosystem_sdk_version: '', version: '', author: '', release_date: '',
}

function currentSlug() {
  const match = window.location.pathname.match(/^\/applications\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : ''
}

function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function normalizeApplication(application) {
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

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) throw new Error('Sessão administrativa indisponível.')
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || Object.values(payload?.errors || {}).flat()?.[0] || 'Não foi possível salvar a aplicação.')
  }
  return payload
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

function Editor({ application, onClose, onSaved }) {
  const [form, setForm] = useState(() => normalizeApplication(application))
  const [tab, setTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setForm(normalizeApplication(application)), [application])

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
      onSaved(response?.application || { ...application, ...payload })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="app-manager-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="app-manager-drawer" onSubmit={submit}>
      <header className="app-manager-header">
        <div><p>ADMIN CENTER / APLICAÇÕES</p><h2>Editar {application?.name}</h2><span>Gerencie cadastro, exposição, acesso e estado operacional sem sair do Admin Center.</span></div>
        <button type="button" onClick={onClose} aria-label="Fechar">×</button>
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
          <Field label="Descrição" wide><textarea rows="5" value={form.description} onChange={event => set('description', event.target.value)} placeholder="Explique o papel da aplicação no ecossistema."/></Field>
          <Field label="URL da aplicação" wide><input type="url" value={form.url} onChange={event => set('url', event.target.value)} required/></Field>
          <Field label="URL da logo" wide hint="Se ficar vazio, a API usa /logo a partir da URL da aplicação."><input type="url" value={form.logo} onChange={event => set('logo', event.target.value)}/></Field>
          <Field label="Categoria"><input value={form.category} onChange={event => set('category', event.target.value)} placeholder="Eventos, gestão, financeiro…"/></Field>
          <Field label="Ordem no launcher"><input type="number" min="0" max="100000" value={form.launcher_order} onChange={event => set('launcher_order', event.target.value)}/></Field>
        </div>}

        {tab === 'access' && <div className="app-manager-toggle-list">
          <Toggle label="Aplicação ativa" detail="Permite que a aplicação permaneça operacional no ecossistema." checked={form.is_active} onChange={value => set('is_active', value)} disabled={form.is_default}/>
          <Toggle label="Visível" detail="Controla a exposição da aplicação nas experiências que respeitam visibilidade." checked={form.is_visible} onChange={value => set('is_visible', value)} disabled={form.is_default}/>
          <Toggle label="Acesso self-service" detail="Permite que usuários acessem a aplicação sem liberação manual individual." checked={form.self_service_access} onChange={value => set('self_service_access', value)}/>
          <Toggle label="Aplicação padrão" detail="Define a aplicação principal do ecossistema. Ao ativar, ela também ficará ativa e visível." checked={form.is_default} onChange={value => set('is_default', value)}/>
          <div className="app-manager-explain"><b>Regra de segurança</b><p>Apenas uma aplicação pode ser padrão. A API garante essa exclusividade e força a aplicação padrão como ativa e visível.</p></div>
        </div>}

        {tab === 'operations' && <div className="app-manager-grid">
          <Field label="Estado operacional">
            <select value={form.operational_status} onChange={event => set('operational_status', event.target.value)}>
              <option value="operational">Operacional</option>
              <option value="degraded">Degradada</option>
              <option value="maintenance">Manutenção</option>
              <option value="down">Indisponível</option>
            </select>
          </Field>
          <Field label="Versão"><input value={form.version} onChange={event => set('version', event.target.value)} placeholder="1.0.0"/></Field>
          <Field label="Versão do SDK"><input value={form.ecosystem_sdk_version} onChange={event => set('ecosystem_sdk_version', event.target.value)} placeholder="1.0.0"/></Field>
          <Field label="Autor"><input value={form.author} onChange={event => set('author', event.target.value)} placeholder="Peter Tecnet"/></Field>
          <Field label="Data da versão"><input type="date" value={form.release_date} onChange={event => set('release_date', event.target.value)}/></Field>
          <Field label="Mensagem de manutenção" wide><textarea rows="4" value={form.maintenance_message} onChange={event => set('maintenance_message', event.target.value)} placeholder="Mensagem exibida quando houver manutenção ou indisponibilidade."/></Field>
          <div className={`app-manager-health wide status-${form.operational_status}`}><span/><div><b>{form.operational_status === 'operational' ? 'Operacional' : form.operational_status === 'degraded' ? 'Operação degradada' : form.operational_status === 'maintenance' ? 'Em manutenção' : 'Indisponível'}</b><small>Este estado passa a fazer parte do cadastro central da aplicação.</small></div></div>
        </div>}
      </div>

      {error && <div className="app-manager-error" role="alert">{error}</div>}
      <footer className="app-manager-footer">
        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
      </footer>
    </form>
  </div>
}

export default function AdminApplicationManager() {
  const [slug, setSlug] = useState(currentSlug)
  const [application, setApplication] = useState(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [actionHost, setActionHost] = useState(null)

  const syncRoute = useCallback(() => setSlug(currentSlug()), [])

  useEffect(() => {
    window.addEventListener('popstate', syncRoute)
    const observer = new MutationObserver(syncRoute)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { window.removeEventListener('popstate', syncRoute); observer.disconnect() }
  }, [syncRoute])

  useEffect(() => {
    if (!slug || !localStorage.getItem(TOKEN_KEY)) { setApplication(null); return }
    let active = true
    setLoading(true)
    request('/admin/applications')
      .then(payload => {
        if (!active) return
        const rows = payload?.applications || payload?.data || (Array.isArray(payload) ? payload : [])
        setApplication(rows.find(row => String(row.slug || '').toLowerCase() === String(slug).toLowerCase()) || null)
      })
      .catch(() => active && setApplication(null))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [slug])

  useEffect(() => {
    function locate() {
      const host = document.querySelector('.application-detail-actions')
      setActionHost(current => current === host ? current : host)
    }
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [slug])

  const button = useMemo(() => <button className="app-manager-open" type="button" disabled={!application || loading} onClick={() => setEditing(true)}>{loading ? 'Carregando…' : 'Editar aplicação'}</button>, [application, loading])

  function saved(updated) {
    setApplication(updated)
    setEditing(false)
    const heading = document.querySelector('.application-detail-identity h1')
    const description = document.querySelector('.application-detail-identity > div > span')
    if (heading && updated?.name) heading.textContent = updated.name
    if (description) description.textContent = updated?.description || 'Produto conectado ao ecossistema Peter Tecnet.'
    window.dispatchEvent(new CustomEvent('admin-application-updated', { detail: updated }))
  }

  if (!slug) return null
  return <>
    {actionHost && createPortal(button, actionHost)}
    {editing && application && createPortal(<Editor application={application} onClose={() => setEditing(false)} onSaved={saved}/>, document.body)}
  </>
}
