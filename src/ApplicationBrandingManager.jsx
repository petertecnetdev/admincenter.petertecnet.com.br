import { useEffect, useMemo, useState } from 'react'
import { confirmAction } from './utils/uiDialog.js'
import './ApplicationBrandingManager.css'

const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const TOKEN_KEY = 'token'

const ASSETS = [
  ['logo', 'Logo principal'],
  ['logo_light', 'Logo em fundo claro'],
  ['logo_dark', 'Logo em fundo escuro'],
  ['icon', 'Ícone / símbolo'],
  ['favicon', 'Favicon'],
  ['social_image', 'Imagem social / SEO'],
]

const COLORS = [
  ['primary_color', 'Cor principal'],
  ['secondary_color', 'Cor secundária'],
  ['accent_color', 'Cor de destaque'],
]

const EMPTY = {
  display_name: '', short_name: '', seo_description: '', logo: '', logo_light: '', logo_dark: '', icon: '', favicon: '', social_image: '', primary_color: '', secondary_color: '', accent_color: '',
}

function editableBranding(value = {}) {
  return Object.fromEntries(Object.keys(EMPTY).map(key => [key, value?.[key] || '']))
}

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }
  const response = await fetch(`${API}${path}`, { ...options, headers })
  const data = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    window.location.href = '/login'
    throw new Error('Sessão expirada.')
  }
  if (!response.ok) throw new Error(data?.message || data?.error || Object.values(data?.errors || {}).flat()?.[0] || 'Não foi possível concluir a operação.')
  return data
}

function ImagePreview({ src, label, tone = 'light', fallback }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const effective = !failed && src ? src : fallback
  return <div className={`branding-preview branding-preview--${tone}`}>
    {effective ? <img src={effective} alt={label} onError={() => setFailed(true)} /> : <span>{label?.slice(0, 2)?.toUpperCase() || 'APP'}</span>}
  </div>
}

export default function ApplicationBrandingManager({ applications = [] }) {
  const [applicationId, setApplicationId] = useState('')
  const [payload, setPayload] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selected = useMemo(() => applications.find(app => String(app.id) === String(applicationId)), [applications, applicationId])

  useEffect(() => {
    if (!applicationId && applications.length) setApplicationId(String(applications[0].id))
  }, [applications, applicationId])

  useEffect(() => {
    if (!applicationId) return
    let active = true
    setBusy(true)
    setError('')
    api(`/admin/applications/${applicationId}/branding`)
      .then(data => {
        if (!active) return
        setPayload(data)
        setForm(editableBranding(data?.draft || data?.published))
      })
      .catch(err => active && setError(err.message))
      .finally(() => active && setBusy(false))
    return () => { active = false }
  }, [applicationId])

  function consume(data) {
    setPayload(data)
    setForm(editableBranding(data?.draft || data?.published))
    return data
  }

  async function saveDraft({ quiet = false } = {}) {
    if (!applicationId) return null
    setBusy(true)
    setError('')
    if (!quiet) setMessage('')
    try {
      const data = await api(`/admin/applications/${applicationId}/branding/draft`, {
        method: 'PUT',
        body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]))),
      })
      consume(data)
      if (!quiet) setMessage('Rascunho salvo. A identidade pública ainda não foi alterada.')
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setMessage('')
    const saved = await saveDraft({ quiet: true })
    if (!saved) return
    setBusy(true)
    try {
      const data = await api(`/admin/applications/${applicationId}/branding/publish`, { method: 'POST' })
      consume(data)
      setMessage(`Identidade publicada. Versão ${data?.published?.version ?? 'nova'} disponível para os aplicativos.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function uploadAsset(asset, file) {
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const body = new FormData()
      body.append('asset', asset)
      body.append('file', file)
      const data = await api(`/admin/applications/${applicationId}/branding/assets`, { method: 'POST', body })
      consume(data)
      setMessage('Imagem adicionada ao rascunho. Publique quando terminar a revisão.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function discardDraft() {
    if (!payload?.draft) return
    const confirmed = await confirmAction({
      tone: 'danger',
      title: 'Descartar alterações de branding?',
      message: 'Todas as alterações ainda não publicadas serão removidas. A identidade publicada continuará ativa.',
      confirmLabel: 'Descartar rascunho',
      cancelLabel: 'Continuar editando',
    })
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      const data = await api(`/admin/applications/${applicationId}/branding/draft`, { method: 'DELETE' })
      consume(data)
      setMessage('Rascunho descartado.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function restore(revision) {
    const confirmed = await confirmAction({
      tone: 'warning',
      title: `Restaurar a versão ${revision.version}?`,
      message: 'A versão escolhida será carregada como um novo rascunho. Nada será publicado até você revisar e confirmar a publicação.',
      confirmLabel: `Restaurar v${revision.version}`,
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      const data = await api(`/admin/applications/${applicationId}/branding/history/${revision.id}/restore`, { method: 'POST' })
      consume(data)
      setMessage(`Versão ${revision.version} carregada como rascunho. Confira o preview e publique para aplicar.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const published = payload?.published || {}
  const preview = { ...published, ...form }
  const fallback = selected?.logo || '/petertecnet-brand.svg'

  return <section className="branding-manager" aria-busy={busy}>
    <header className="branding-manager__head">
      <div><p className="admin-kicker">Branding Manager</p><h2>Identidade visual dos aplicativos</h2><p>Troque logos, ícones, cores e metadados sem editar o código nem fazer deploy do frontend.</p></div>
      <label className="branding-app-picker">Aplicativo<select value={applicationId} onChange={event => { setApplicationId(event.target.value); setMessage(''); setError('') }}>{applications.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
    </header>

    {error && <div className="branding-notice branding-notice--error" role="alert">{error}</div>}
    {message && <div className="branding-notice branding-notice--success">{message}</div>}

    {!selected ? <p className="branding-empty">Cadastre uma aplicação para administrar sua identidade.</p> : <>
      <div className="branding-statusbar"><span><b>{selected.name}</b> · {selected.slug}</span><span>Publicada: <b>v{published.version ?? 0}</b>{payload?.draft ? ' · rascunho pendente' : ''}</span></div>
      <div className="branding-layout">
        <div className="branding-editor">
          <div className="branding-card"><h3>Marca e SEO</h3><div className="branding-fields">
            <label>Nome público<input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></label>
            <label>Nome curto<input value={form.short_name} maxLength="80" onChange={e => setForm({ ...form, short_name: e.target.value })} /></label>
            <label className="wide">Descrição SEO<textarea rows="3" maxLength="320" value={form.seo_description} onChange={e => setForm({ ...form, seo_description: e.target.value })} /></label>
          </div></div>
          <div className="branding-card"><h3>Logos e imagens</h3><div className="branding-assets">{ASSETS.map(([key, label]) => <div className="branding-asset" key={key}>
            <div><b>{label}</b><small>PNG, JPG ou WebP · até 5 MB</small></div>
            <input aria-label={`${label} por URL`} placeholder="https://..." value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
            <label className="branding-upload">Enviar arquivo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { uploadAsset(key, e.target.files?.[0]); e.target.value = '' }} /></label>
          </div>)}</div></div>
          <div className="branding-card"><h3>Cores</h3><div className="branding-colors">{COLORS.map(([key, label]) => <label key={key}>{label}<span>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(form[key]) ? form[key] : '#000000'} onChange={e => setForm({ ...form, [key]: e.target.value })} />
            <input placeholder="#000000" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
          </span></label>)}</div></div>
        </div>
        <aside className="branding-side">
          <div className="branding-card branding-card--sticky"><h3>Pré-visualização</h3><div className="branding-preview-grid">
            <div><small>Fundo claro</small><ImagePreview src={preview.logo_light || preview.logo} fallback={fallback} label={preview.display_name || selected.name} /></div>
            <div><small>Fundo escuro</small><ImagePreview src={preview.logo_dark || preview.logo} fallback={fallback} label={preview.display_name || selected.name} tone="dark" /></div>
            <div><small>Ícone</small><ImagePreview src={preview.icon || preview.logo} fallback={fallback} label={preview.short_name || selected.name} tone="icon" /></div>
          </div><div className="branding-swatch-row">{COLORS.map(([key, label]) => <span key={key} title={label} style={{ background: preview[key] || 'transparent' }} />)}</div>
          <div className="branding-actions"><button disabled={busy} onClick={() => saveDraft()}>{busy ? 'Salvando…' : 'Salvar rascunho'}</button><button className="primary" disabled={busy} onClick={publish}>Publicar</button>{payload?.draft && <button className="danger" disabled={busy} onClick={discardDraft}>Descartar</button>}</div></div>
          <div className="branding-card"><h3>Histórico</h3><div className="branding-history">{payload?.history?.length ? payload.history.map(revision => <div key={revision.id}><span><b>v{revision.version}</b><small>{revision.created_at ? new Date(revision.created_at).toLocaleString('pt-BR') : '—'}{revision.created_by?.name ? ` · ${revision.created_by.name}` : ''}</small></span><button disabled={busy} onClick={() => restore(revision)}>Restaurar</button></div>) : <p>Nenhuma publicação anterior.</p>}</div></div>
        </aside>
      </div>
    </>}
  </section>
}
