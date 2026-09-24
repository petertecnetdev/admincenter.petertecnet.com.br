import { useEffect, useMemo, useState } from 'react'
import { adminRequest as apiRequest } from './adminApi.js'
import AdminEstablishmentCatalog from './AdminEstablishmentCatalog.jsx'
import AdminEstablishmentEvents from './AdminEstablishmentEvents.jsx'
import AdminEventEditor from './AdminEventEditor.jsx'
import './AdminEstablishmentResourceEditor.css'

const appKey = app => `${app?.slug || ''} ${app?.name || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '')
const establishmentName = row => row?.fantasy || row?.name || `Establishment #${row?.id || '—'}`
const userName = user => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || `Usuário #${user?.id || '—'}`

function Field({ label, children, wide = false }) {
  return <label className={`aer-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}

function Section({ number, title, description, children }) {
  return <section className="aer-card"><header><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></header>{children}</section>
}

function resourceKind(action) {
  if (action?.key === 'ticket') return 'ticket-manager'
  return action?.resourceKind || action?.key || 'item'
}

function initialForm(action, app, establishment) {
  const kind = resourceKind(action)
  if (kind === 'event') return {
    title: '', description: '', category: '', event_format: 'in_person', start_date: '', end_date: '',
    venue: establishmentName(establishment), address: establishment?.address || '', city: establishment?.city || '', uf: establishment?.uf || '',
    online_platform: '', online_url: '', max_attendees: '', contact_email: establishment?.email || '', contact_phone: establishment?.phone || '',
    is_published: false, is_approved: true, is_private: false, requires_approval: false, approval_message: '',
  }
  if (kind === 'employer') return { user_id: '', role: '', permissions: '' }
  if (kind === 'appointment') return { client_id: '', attendant_id: '', item_id: '', order_datetime: '', payment_method: 'pix', notes: '' }
  return {
    name: '', type: action?.defaultType || (appKey(app).includes('rasoio') ? 'service' : 'item'), price: '', category: '', stock: '', duration: '', description: '',
  }
}

export default function AdminEstablishmentResourceEditor({ action, app, establishment, users = [], onBack, onCreated }) {
  const [form, setForm] = useState(() => initialForm(action, app, establishment))
  const [context, setContext] = useState({ employers: [], items: [] })
  const [loadingContext, setLoadingContext] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [eventRevision, setEventRevision] = useState(0)

  const kind = resourceKind(action)
  const title = action.label || 'Criar recurso'
  const isCutinapp = appKey(app).includes('cutinapp')
  const activeItems = useMemo(() => {
    const services = context.items.filter(item => item.type === 'service')
    return services.length ? services : context.items
  }, [context.items])

  useEffect(() => {
    setForm(initialForm(action, app, establishment))
    setError('')
    setEventRevision(0)
  }, [action, app, establishment])

  useEffect(() => {
    if (!['appointment', 'employer'].includes(kind)) return undefined
    let cancelled = false
    setLoadingContext(true)
    apiRequest(`/admin/ecosystem/establishments/${establishment.id}/resources/context?app_id=${encodeURIComponent(app.id)}`)
      .then(payload => {
        if (!cancelled) setContext({ employers: payload?.employers || [], items: payload?.items || [] })
      })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoadingContext(false) })
    return () => { cancelled = true }
  }, [kind, app.id, establishment.id])

  const patch = values => setForm(current => ({ ...current, ...values }))

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      let result
      if (kind === 'event') {
        if (!establishment.user_id) throw new Error('Este establishment precisa ter um proprietário antes de receber um evento.')
        result = await apiRequest('/admin/ecosystem/event-management/events', {
          method: 'POST',
          body: JSON.stringify({
            user_id: Number(establishment.user_id), production_id: Number(establishment.id), title: form.title.trim(), description: form.description.trim(),
            category: form.category.trim() || null, event_format: form.event_format, start_date: form.start_date, end_date: form.end_date,
            venue: form.venue.trim() || null, address: form.address.trim() || null, city: form.city.trim() || null, uf: form.uf.trim().toUpperCase() || null,
            online_platform: form.online_platform.trim() || null, online_url: form.online_url.trim() || null,
            max_attendees: form.max_attendees === '' ? null : Number(form.max_attendees), contact_email: form.contact_email.trim() || null,
            contact_phone: form.contact_phone.trim() || null, is_published: Boolean(form.is_published), is_approved: Boolean(form.is_approved),
            is_private: Boolean(form.is_private), requires_approval: Boolean(form.requires_approval), approval_message: form.approval_message.trim() || null,
          }),
        })
      } else if (kind === 'employer') {
        result = await apiRequest(`/admin/ecosystem/establishments/${establishment.id}/resources/employers`, {
          method: 'POST',
          body: JSON.stringify({
            app_id: Number(app.id), user_id: Number(form.user_id), role: form.role.trim(),
            permissions: form.permissions.split(',').map(value => value.trim()).filter(Boolean),
          }),
        })
      } else if (kind === 'appointment') {
        result = await apiRequest(`/admin/ecosystem/establishments/${establishment.id}/resources/appointments`, {
          method: 'POST',
          body: JSON.stringify({
            app_id: Number(app.id), client_id: Number(form.client_id), attendant_id: Number(form.attendant_id),
            items: [{ item_id: Number(form.item_id), quantity: 1 }], order_datetime: form.order_datetime,
            payment_method: form.payment_method, notes: form.notes.trim() || null,
          }),
        })
      } else {
        result = await apiRequest('/admin/ecosystem/items', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(), app_id: Number(app.id), entity_id: Number(establishment.id), type: form.type,
            price: Number(form.price), discount: null, sku: null, category: form.category.trim() || null, subcategory: null, brand: null,
            duration: form.duration === '' ? null : Number(form.duration), stock: form.stock === '' ? null : Number(form.stock),
            image: null, description: form.description.trim() || null, status: true, is_featured: false,
          }),
        })
      }
      onCreated(result?.message || `${title} concluído com sucesso.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const headerDescription = kind === 'event'
    ? 'Liste e gerencie os eventos deste establishment, edite dados e imagens, acompanhe ingressos/vendas, duplique programações ou cadastre um novo evento.'
    : kind === 'ticket-manager'
      ? 'Gerencie os ingressos reais por evento, com lotes, capacidade, vendas, receita, reservas, cortesias e check-ins.'
      : 'Criação administrativa dentro do ecossistema, sem sair para a página do aplicativo.'

  if (kind === 'ticket-manager') {
    return <div className="aer-page">
      <header className="aer-page-header">
        <button type="button" className="aer-back" onClick={onBack}>← Voltar ao establishment</button>
        <div><p className="eyebrow">ADMIN CENTER / {app.name || app.slug}</p><h2>Ingressos e vendas</h2><p>{headerDescription}</p></div>
        <div className="aer-context"><small>Establishment</small><b>{establishmentName(establishment)}</b><span>#{establishment.id} · {app.name || app.slug}</span></div>
      </header>
      <AdminEstablishmentEvents establishment={establishment} app={app} ticketsOnly />
      <footer className="aer-actions"><button type="button" className="aer-secondary" onClick={onBack}>Voltar</button></footer>
    </div>
  }

  return <div className="aer-page">
    <header className="aer-page-header">
      <button type="button" className="aer-back" onClick={onBack}>← Voltar ao establishment</button>
      <div><p className="eyebrow">ADMIN CENTER / {app.name || app.slug}</p><h2>{title}</h2><p>{headerDescription}</p></div>
      <div className="aer-context"><small>Establishment</small><b>{establishmentName(establishment)}</b><span>#{establishment.id} · {app.name || app.slug}</span></div>
    </header>

    {error && <div className="aer-feedback error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    {loadingContext && <div className="aer-feedback">Carregando contexto operacional…</div>}
    {kind === 'event' && <>
      <AdminEventEditor establishment={establishment} app={app} onMutated={() => setEventRevision(current => current + 1)} />
      <AdminEstablishmentEvents key={`events-${eventRevision}`} establishment={establishment} app={app} />
    </>}
    {kind === 'item' && isCutinapp && <AdminEstablishmentCatalog establishment={establishment} app={app} onCreate={() => document.getElementById('admin-item-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />}

    <form id={kind === 'event' ? 'admin-event-create-form' : kind === 'item' ? 'admin-item-create-form' : undefined} className="aer-form" onSubmit={submit}>
      {kind === 'event' && <>
        <Section number="01" title="Novo evento" description="Preencha as informações centrais que aparecerão na Cutinapp."><div className="aer-grid">
          <Field label="Nome do evento *"><input value={form.title} onChange={e => patch({ title: e.target.value })} required /></Field>
          <Field label="Categoria"><input value={form.category} onChange={e => patch({ category: e.target.value })} /></Field>
          <Field label="Formato *"><select value={form.event_format} onChange={e => patch({ event_format: e.target.value })}><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></select></Field>
          <Field label="Capacidade"><input type="number" min="0" value={form.max_attendees} onChange={e => patch({ max_attendees: e.target.value })} /></Field>
          <Field label="Início *"><input type="datetime-local" value={form.start_date} onChange={e => patch({ start_date: e.target.value })} required /></Field>
          <Field label="Fim *"><input type="datetime-local" value={form.end_date} onChange={e => patch({ end_date: e.target.value })} required /></Field>
          <Field label="Descrição *" wide><textarea rows="7" value={form.description} onChange={e => patch({ description: e.target.value })} required /></Field>
        </div></Section>
        <Section number="02" title="Local e acesso" description="Dados presenciais ou online do evento."><div className="aer-grid">
          <Field label="Local"><input value={form.venue} onChange={e => patch({ venue: e.target.value })} /></Field>
          <Field label="Endereço"><input value={form.address} onChange={e => patch({ address: e.target.value })} /></Field>
          <Field label="Cidade"><input value={form.city} onChange={e => patch({ city: e.target.value })} /></Field>
          <Field label="UF"><input maxLength="2" value={form.uf} onChange={e => patch({ uf: e.target.value.toUpperCase() })} /></Field>
          <Field label="Plataforma online"><input value={form.online_platform} onChange={e => patch({ online_platform: e.target.value })} /></Field>
          <Field label="URL online"><input type="url" value={form.online_url} onChange={e => patch({ online_url: e.target.value })} placeholder="https://" /></Field>
          <Field label="E-mail de contato"><input type="email" value={form.contact_email} onChange={e => patch({ contact_email: e.target.value })} /></Field>
          <Field label="Telefone"><input value={form.contact_phone} onChange={e => patch({ contact_phone: e.target.value })} /></Field>
        </div></Section>
        <Section number="03" title="Publicação" description="Estado inicial do evento."><div className="aer-toggles">
          {[['is_approved','Aprovado'],['is_published','Publicado'],['is_private','Privado'],['requires_approval','Exigir aprovação de participantes']].map(([key,label]) => <label key={key} className={form[key] ? 'selected' : ''}><input type="checkbox" checked={Boolean(form[key])} onChange={e => patch({ [key]: e.target.checked })} /><span><b>{label}</b><small>{form[key] ? 'Ativo' : 'Inativo'}</small></span></label>)}
        </div>{form.requires_approval && <div className="aer-grid"><Field label="Mensagem de aprovação" wide><textarea rows="4" value={form.approval_message} onChange={e => patch({ approval_message: e.target.value })} /></Field></div>}</Section>
      </>}

      {kind === 'employer' && <Section number="01" title="Novo employer" description="Vincule um usuário existente à equipe deste establishment."><div className="aer-grid">
        <Field label="Usuário *" wide><select value={form.user_id} onChange={e => patch({ user_id: e.target.value })} required><option value="">Selecione</option>{users.filter(user => Number(user.id) !== Number(establishment.user_id)).map(user => <option key={user.id} value={user.id}>{userName(user)} · {user.email}</option>)}</select></Field>
        <Field label="Função *"><input value={form.role} onChange={e => patch({ role: e.target.value })} placeholder="Barbeiro, gerente, atendente..." required /></Field>
        <Field label="Permissões"><input value={form.permissions} onChange={e => patch({ permissions: e.target.value })} placeholder="agenda, itens, pedidos — separadas por vírgula" /></Field>
      </div></Section>}

      {kind === 'appointment' && <>
        <Section number="01" title="Agendamento" description="Cliente, profissional, serviço e horário do atendimento."><div className="aer-grid">
          <Field label="Cliente *"><select value={form.client_id} onChange={e => patch({ client_id: e.target.value })} required><option value="">Selecione</option>{users.map(user => <option key={user.id} value={user.id}>{userName(user)} · {user.email}</option>)}</select></Field>
          <Field label="Employer *"><select value={form.attendant_id} onChange={e => patch({ attendant_id: e.target.value })} required><option value="">Selecione</option>{context.employers.map(employer => <option key={employer.id} value={employer.id}>{userName(employer.user)} · {employer.role}</option>)}</select></Field>
          <Field label="Serviço / item *"><select value={form.item_id} onChange={e => patch({ item_id: e.target.value })} required><option value="">Selecione</option>{activeItems.map(item => <option key={item.id} value={item.id}>{item.name} · {Number(item.price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</option>)}</select></Field>
          <Field label="Data e hora *"><input type="datetime-local" value={form.order_datetime} onChange={e => patch({ order_datetime: e.target.value })} required /></Field>
          <Field label="Pagamento"><select value={form.payment_method} onChange={e => patch({ payment_method: e.target.value })}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="other">Outro</option></select></Field>
          <Field label="Observações" wide><textarea rows="5" value={form.notes} onChange={e => patch({ notes: e.target.value })} /></Field>
        </div></Section>
        {!loadingContext && !context.employers.length && <div className="aer-feedback warning">Este establishment ainda não possui employer. Crie um employer antes do agendamento.</div>}
        {!loadingContext && !activeItems.length && <div className="aer-feedback warning">Este establishment ainda não possui serviço/item ativo nesta aplicação.</div>}
      </>}

      {kind === 'item' && <Section number="01" title={action?.entityLabel ? `Novo ${action.entityLabel}` : 'Novo item'} description={action?.description || 'Item genérico vinculado diretamente ao establishment e à aplicação.'}><div className="aer-grid">
        <Field label="Nome *"><input value={form.name} onChange={e => patch({ name: e.target.value })} required /></Field>
        <Field label="Tipo *"><select value={form.type} onChange={e => patch({ type: e.target.value })}><option value="item">Item</option><option value="product">Produto</option><option value="service">Serviço</option>{!isCutinapp && <option value="ticket">Ingresso</option>}</select></Field>
        <Field label="Preço (R$) *"><input type="number" min="0" step="0.01" value={form.price} onChange={e => patch({ price: e.target.value })} required /></Field>
        <Field label="Categoria"><input value={form.category} onChange={e => patch({ category: e.target.value })} /></Field>
        <Field label="Estoque"><input type="number" min="0" value={form.stock} onChange={e => patch({ stock: e.target.value })} /></Field>
        <Field label="Duração (min)"><input type="number" min="0" max="1440" value={form.duration} onChange={e => patch({ duration: e.target.value })} /></Field>
        <Field label="Descrição" wide><textarea rows="6" value={form.description} onChange={e => patch({ description: e.target.value })} /></Field>
      </div></Section>}

      <footer className="aer-actions"><button type="button" className="aer-secondary" onClick={onBack}>Cancelar</button><button className="aer-primary" disabled={saving || loadingContext}>{saving ? 'Salvando…' : title}</button></footer>
    </form>
  </div>
}
