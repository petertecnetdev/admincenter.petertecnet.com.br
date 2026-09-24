import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminRequest as apiRequest, ADMIN_API_BASE } from './adminApi.js'
import CreativePromptEditor from './CreativePromptEditor.jsx'
import './AdminEventEditor.css'

const emptyForm = {
  title: '', description: '', category: '', event_format: 'in_person', start_date: '', end_date: '',
  venue: '', address: '', city: '', uf: '', country: 'Brasil', online_platform: '', online_url: '', online_instructions: '',
  max_attendees: '', contact_email: '', contact_phone: '', is_featured: false, is_published: false, is_approved: false,
  is_cancelled: false, is_private: false, requires_approval: false, approval_message: '', image: '',
}

function toLocalDateTime(value) {
  if (!value) return ''
  const text = String(value)
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text.slice(0, 16)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formFromEvent(event) {
  return {
    ...emptyForm,
    title: event?.title || '',
    description: event?.description || '',
    category: event?.category || '',
    event_format: event?.event_format || 'in_person',
    start_date: toLocalDateTime(event?.start_date),
    end_date: toLocalDateTime(event?.end_date),
    venue: event?.venue || '',
    address: event?.address || '',
    city: event?.city || '',
    uf: event?.uf || '',
    country: event?.country || 'Brasil',
    online_platform: event?.online_platform || '',
    online_url: event?.online_url || '',
    online_instructions: event?.online_instructions || '',
    max_attendees: event?.max_attendees ?? '',
    contact_email: event?.contact_email || '',
    contact_phone: event?.contact_phone || '',
    is_featured: Boolean(event?.is_featured),
    is_published: Boolean(event?.is_published),
    is_approved: Boolean(event?.is_approved),
    is_cancelled: Boolean(event?.is_cancelled),
    is_private: Boolean(event?.is_private),
    requires_approval: Boolean(event?.requires_approval),
    approval_message: event?.approval_message || '',
    image: event?.image || '',
  }
}

function imageUrl(value) {
  if (!value) return ''
  if (/^(https?:|data:|blob:)/i.test(value)) return value
  const origin = ADMIN_API_BASE.replace(/\/api\/?$/i, '')
  const path = String(value).replace(/^\/?storage\//i, '').replace(/^\//, '')
  return `${origin}/storage/${path}`
}

function Field({ label, wide = false, children }) {
  return <label className={`aie-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}

export default function AdminEventEditor({ establishment, app, onMutated }) {
  const [events, setEvents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [event, setEvent] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [generatedImage, setGeneratedImage] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingEvent, setLoadingEvent] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const basePath = useMemo(
    () => `/admin/ecosystem/establishments/${establishment.id}/resources/events`,
    [establishment.id],
  )

  const loadEvents = useCallback(async () => {
    setLoadingList(true)
    setError('')
    try {
      const payload = await apiRequest(`${basePath}?app_id=${encodeURIComponent(app.id)}`)
      setEvents(payload?.events || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingList(false)
    }
  }, [app.id, basePath])

  useEffect(() => {
    setSelectedId('')
    setEvent(null)
    setGeneratedImage('')
    setForm(emptyForm)
    loadEvents()
  }, [loadEvents])

  const patch = values => {
    setForm(current => ({ ...current, ...values }))
    setSuccess('')
  }

  async function openEditor(eventId = selectedId) {
    if (!eventId) return
    setLoadingEvent(true)
    setError('')
    setSuccess('')
    setGeneratedImage('')
    try {
      const payload = await apiRequest(`${basePath}/${eventId}?app_id=${encodeURIComponent(app.id)}`)
      const currentEvent = payload?.event
      if (!currentEvent?.id) throw new Error('O evento não pôde ser carregado para edição.')
      setSelectedId(String(currentEvent.id))
      setEvent(currentEvent)
      setForm(formFromEvent(currentEvent))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingEvent(false)
    }
  }

  async function generateImage() {
    if (!event?.id) return
    if (!form.title.trim()) {
      setError('Informe o nome do evento antes de gerar a imagem.')
      return
    }
    setGenerating(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiRequest('/admin/ecosystem/creative/images', {
        method: 'POST',
        body: JSON.stringify({
          app_id: Number(app.id),
          purpose: 'event_flyer_background',
          subject: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category.trim() || null,
          style: 'neon',
          production_name: establishment?.fantasy || establishment?.name || null,
          venue: form.venue.trim() || null,
          city: form.city.trim() || null,
          uf: form.uf.trim().toUpperCase() || null,
          format: 'cover',
        }),
      })
      const dataUri = payload?.image?.data_uri
      if (!dataUri) throw new Error('A IA respondeu sem uma imagem válida. Tente gerar novamente.')
      setGeneratedImage(dataUri)
      setSuccess('Nova imagem criada. Confira a prévia e clique em “Salvar alterações” para aplicá-la ao evento.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function save(eventSubmit) {
    eventSubmit.preventDefault()
    if (!event?.id) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiRequest(`${basePath}/${event.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          app_id: Number(app.id),
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim() || null,
          event_format: form.event_format,
          start_date: form.start_date,
          end_date: form.end_date,
          venue: form.venue.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          uf: form.uf.trim().toUpperCase() || null,
          country: form.country.trim() || null,
          online_platform: form.online_platform.trim() || null,
          online_url: form.online_url.trim() || null,
          online_instructions: form.online_instructions.trim() || null,
          max_attendees: form.max_attendees === '' ? null : Number(form.max_attendees),
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          is_featured: Boolean(form.is_featured),
          is_published: Boolean(form.is_published),
          is_approved: Boolean(form.is_approved),
          is_cancelled: Boolean(form.is_cancelled),
          is_private: Boolean(form.is_private),
          requires_approval: Boolean(form.requires_approval),
          approval_message: form.approval_message.trim() || null,
          ...(generatedImage ? { image_data_uri: generatedImage } : {}),
        }),
      })
      const updated = payload?.event || event
      setEvent(updated)
      setForm(formFromEvent(updated))
      setGeneratedImage('')
      setSuccess(payload?.message || 'Evento atualizado com sucesso.')
      await loadEvents()
      if (onMutated) await onMutated(payload)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const preview = generatedImage || imageUrl(form.image)
  const presencial = ['in_person', 'hybrid'].includes(form.event_format)
  const online = ['online', 'hybrid'].includes(form.event_format)

  return <section className="aie-shell" aria-labelledby="aie-title">
    <header className="aie-header">
      <div>
        <span className="aie-kicker">GERENCIAMENTO DO EVENTO</span>
        <h3 id="aie-title">Editar evento</h3>
        <p>Abra um evento existente para alterar seus dados, publicação e imagem de capa diretamente pelo Admin Center.</p>
      </div>
      <span className="aie-app-badge">{app.name || app.slug}</span>
    </header>

    <div className="aie-picker">
      <label>
        <span>Evento</span>
        <select value={selectedId} disabled={loadingList || loadingEvent} onChange={e => setSelectedId(e.target.value)}>
          <option value="">{loadingList ? 'Carregando eventos…' : 'Selecione um evento para editar'}</option>
          {events.map(item => <option key={item.id} value={item.id}>{item.title} · #{item.id}</option>)}
        </select>
      </label>
      <button type="button" className="aie-primary" disabled={!selectedId || loadingEvent} onClick={() => openEditor()}>
        {loadingEvent ? 'Abrindo…' : 'Editar evento'}
      </button>
    </div>

    {!loadingList && events.length === 0 && <div className="aie-notice">Nenhum evento cadastrado neste establishment.</div>}
    {error && <div className="aie-notice error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    {success && <div className="aie-notice success" role="status">{success}<button type="button" onClick={() => setSuccess('')}>×</button></div>}

    <CreativePromptEditor request={apiRequest} />

    {event && <form className="aie-editor" onSubmit={save}>
      <div className="aie-editor-heading">
        <div><span>Evento #{event.id}</span><h4>{form.title || 'Evento sem nome'}</h4></div>
        <button type="button" className="aie-ghost" onClick={() => { setEvent(null); setGeneratedImage(''); setSuccess(''); setError('') }}>Fechar edição</button>
      </div>

      <div className="aie-section">
        <div className="aie-section-title"><span>01</span><div><h4>Informações principais</h4><p>Dados exibidos ao público e usados também para orientar a IA.</p></div></div>
        <div className="aie-grid">
          <Field label="Nome do evento *"><input value={form.title} onChange={e => patch({ title: e.target.value })} required /></Field>
          <Field label="Categoria"><input value={form.category} onChange={e => patch({ category: e.target.value })} /></Field>
          <Field label="Formato *"><select value={form.event_format} onChange={e => patch({ event_format: e.target.value })}><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></select></Field>
          <Field label="Capacidade"><input type="number" min="0" value={form.max_attendees} onChange={e => patch({ max_attendees: e.target.value })} /></Field>
          <Field label="Início *"><input type="datetime-local" value={form.start_date} onChange={e => patch({ start_date: e.target.value })} required /></Field>
          <Field label="Fim *"><input type="datetime-local" value={form.end_date} onChange={e => patch({ end_date: e.target.value })} required /></Field>
          <Field label="Descrição *" wide><textarea rows="7" value={form.description} onChange={e => patch({ description: e.target.value })} required /></Field>
        </div>
      </div>

      <div className="aie-section aie-ai-section">
        <div className="aie-section-title"><span>02</span><div><h4>Imagem do evento</h4><p>Use a IA com os dados atuais do formulário. A imagem só substitui a capa quando você salvar o evento.</p></div></div>
        <div className="aie-image-layout">
          <div className={`aie-preview ${preview ? 'has-image' : ''}`}>
            {preview ? <img src={preview} alt={`Capa de ${form.title || 'evento'}`} /> : <div><b>Sem imagem de capa</b><span>Gere uma imagem com IA para visualizar aqui.</span></div>}
            {generatedImage && <span className="aie-preview-badge">Prévia gerada por IA</span>}
          </div>
          <div className="aie-ai-actions">
            <span className="aie-ai-label">GERADOR DE IMAGEM</span>
            <h5>Crie a capa sem sair do Admin Center</h5>
            <p>A IA usa nome, categoria, descrição, produção, local e cidade do evento como contexto visual, junto do prompt global configurado acima.</p>
            <button type="button" className="aie-ai-button" disabled={generating || saving} onClick={generateImage}>
              <span aria-hidden="true">✦</span>
              {generating ? 'Criando imagem com IA…' : generatedImage ? 'Gerar outra imagem com IA' : 'Criar imagem do evento com IA'}
            </button>
            {generatedImage && <button type="button" className="aie-ghost" disabled={generating || saving} onClick={() => { setGeneratedImage(''); setSuccess('Prévia descartada. A capa atual do evento será mantida.') }}>Descartar imagem gerada</button>}
          </div>
        </div>
      </div>

      <div className="aie-section">
        <div className="aie-section-title"><span>03</span><div><h4>Local e acesso</h4><p>Edite os dados presenciais, online ou híbridos.</p></div></div>
        <div className="aie-grid">
          {presencial && <>
            <Field label="Local"><input value={form.venue} onChange={e => patch({ venue: e.target.value })} /></Field>
            <Field label="Endereço"><input value={form.address} onChange={e => patch({ address: e.target.value })} /></Field>
            <Field label="Cidade"><input value={form.city} onChange={e => patch({ city: e.target.value })} /></Field>
            <Field label="UF"><input maxLength="2" value={form.uf} onChange={e => patch({ uf: e.target.value.toUpperCase() })} /></Field>
            <Field label="País"><input value={form.country} onChange={e => patch({ country: e.target.value })} /></Field>
          </>}
          {online && <>
            <Field label="Plataforma online"><input value={form.online_platform} onChange={e => patch({ online_platform: e.target.value })} /></Field>
            <Field label="URL online"><input type="url" value={form.online_url} onChange={e => patch({ online_url: e.target.value })} placeholder="https://" /></Field>
            <Field label="Instruções online" wide><textarea rows="4" value={form.online_instructions} onChange={e => patch({ online_instructions: e.target.value })} /></Field>
          </>}
          <Field label="E-mail de contato"><input type="email" value={form.contact_email} onChange={e => patch({ contact_email: e.target.value })} /></Field>
          <Field label="Telefone"><input value={form.contact_phone} onChange={e => patch({ contact_phone: e.target.value })} /></Field>
        </div>
      </div>

      <div className="aie-section">
        <div className="aie-section-title"><span>04</span><div><h4>Publicação e controle</h4><p>Controles administrativos completos do estado do evento.</p></div></div>
        <div className="aie-toggles">
          {[
            ['is_approved', 'Aprovado'], ['is_published', 'Publicado'], ['is_featured', 'Em destaque'],
            ['is_cancelled', 'Cancelado'], ['is_private', 'Privado'], ['requires_approval', 'Exigir aprovação'],
          ].map(([key, label]) => <label key={key} className={form[key] ? 'selected' : ''}>
            <input type="checkbox" checked={Boolean(form[key])} onChange={e => patch({ [key]: e.target.checked })} />
            <span><b>{label}</b><small>{form[key] ? 'Ativo' : 'Inativo'}</small></span>
          </label>)}
        </div>
        {form.requires_approval && <div className="aie-grid aie-approval"><Field label="Mensagem de aprovação" wide><textarea rows="4" value={form.approval_message} onChange={e => patch({ approval_message: e.target.value })} /></Field></div>}
      </div>

      <footer className="aie-footer">
        <div><b>{generatedImage ? 'Nova capa pronta para ser aplicada.' : 'As alterações só entram em vigor após salvar.'}</b><span>{generatedImage ? 'A imagem gerada também será salva como capa oficial.' : 'Você pode editar os dados sem alterar a capa atual.'}</span></div>
        <button type="submit" className="aie-primary" disabled={saving || generating}>{saving ? 'Salvando alterações…' : 'Salvar alterações'}</button>
      </footer>
    </form>}
  </section>
}
