import { useEffect, useMemo, useState } from 'react'
import AdminUserDetailPage from './AdminUserDetailPage.jsx'
import { AdminImpersonationDialog, canImpersonate } from './AdminImpersonation.jsx'
import AdminUserAccessManager from './AdminUserAccessManager.jsx'
import { applyCommunicationTemplate, templatesForApplication } from './adminUserCommunicationTemplates.js'
import './AdminUserCommunication.css'
import './AdminUserCommunicationShell.css'

const EMPTY_FORM = {
  channel: 'both',
  type: 'info',
  app_slug: '',
  template_key: 'custom',
  subject: '',
  message: '',
  production_id: '',
  include_events: false,
  actions: [],
}

const CHANNEL_LABELS = {
  email: 'E-mail',
  notification: 'Notificação',
  both: 'E-mail + notificação',
}

function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || 'Usuário'
}

function validateHttpsUrl(value) {
  if (!value.trim()) return true
  try {
    return new URL(value.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

export default function AdminUserDetailExperience(props) {
  const { userId, apiRequest, applications = [] } = props
  const [user, setUser] = useState(null)
  const [userDetail, setUserDetail] = useState(null)
  const [open, setOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingProductionId, setOnboardingProductionId] = useState('')
  const [onboardingBusy, setOnboardingBusy] = useState(false)
  const [onboardingNotice, setOnboardingNotice] = useState('')
  const [impersonationOpen, setImpersonationOpen] = useState(false)
  const [accessManagerOpen, setAccessManagerOpen] = useState(false)
  const [detailRevision, setDetailRevision] = useState(0)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [sending, setSending] = useState(false)
  const [loadingUser, setLoadingUser] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    setLoadingUser(true)
    apiRequest(`/admin/ecosystem/users/${userId}`)
      .then(payload => {
        if (active) {
          setUser(payload?.user || null)
          setUserDetail(payload || null)
        }
      })
      .catch(() => {
        if (active) {
          setUser(null)
          setUserDetail(null)
        }
      })
      .finally(() => {
        if (active) setLoadingUser(false)
      })
    return () => { active = false }
  }, [apiRequest, userId])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = event => {
      if (event.key === 'Escape' && !sending) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, sending])

  const recipientLabel = useMemo(() => user ? `${fullName(user)} · ${user.email || 'sem e-mail'}` : `Usuário #${userId}`, [user, userId])
  const producerOrganizations = useMemo(
    () => (userDetail?.resources?.productions?.data || []).filter(row => row?.id && row?.application?.slug),
    [userDetail],
  )
  const communicationApplications = useMemo(() => {
    const globalBySlug = new Map(applications.filter(app => app?.slug).map(app => [app.slug, app]))
    const linked = new Map()
    ;(userDetail?.platforms || []).forEach(row => {
      const app = row?.application
      if (app?.slug) linked.set(app.slug, { ...app, ...(globalBySlug.get(app.slug) || {}) })
    })
    producerOrganizations.forEach(row => {
      const app = row?.application
      if (app?.slug) linked.set(app.slug, { ...app, ...(globalBySlug.get(app.slug) || {}) })
    })
    if (!linked.size) applications.filter(app => app?.slug).forEach(app => linked.set(app.slug, app))
    return [...linked.values()]
  }, [applications, producerOrganizations, userDetail])
  const selectedApplication = useMemo(
    () => communicationApplications.find(app => app.slug === form.app_slug) || null,
    [communicationApplications, form.app_slug],
  )
  const availableTemplates = useMemo(() => templatesForApplication(form.app_slug), [form.app_slug])
  const selectedProduction = useMemo(
    () => producerOrganizations.find(row => String(row.id) === String(form.production_id)) || null,
    [form.production_id, producerOrganizations],
  )
  const previewEvents = useMemo(
    () => (userDetail?.resources?.events?.data || [])
      .filter(row => String(row?.production?.id || '') === String(form.production_id || ''))
      .slice(0, 6),
    [form.production_id, userDetail],
  )

  function openComposer(channel) {
    const defaultApp = communicationApplications.find(app => app.slug === 'cutinapp') || communicationApplications[0]
    setForm({ ...EMPTY_FORM, channel, app_slug: defaultApp?.slug || '' })
    setError('')
    setSuccess('')
    setOpen(true)
  }

  function change(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
    setSuccess('')
  }

  function changeApplication(appSlug) {
    setForm(current => ({
      ...current,
      app_slug: appSlug,
      template_key: 'custom',
      production_id: '',
      include_events: false,
      actions: [],
    }))
    setError('')
    setSuccess('')
  }

  function applyTemplate(template) {
    const application = communicationApplications.find(app => app.slug === form.app_slug) || null
    const production = template.requiresProduction
      ? producerOrganizations.find(row => row.application?.slug === form.app_slug) || producerOrganizations[0] || null
      : null
    const patch = applyCommunicationTemplate(template, application, production)
    setForm(current => ({
      ...current,
      ...patch,
      production_id: production?.id ? String(production.id) : '',
    }))
    setError('')
    setSuccess('')
  }

  function changeProduction(productionId) {
    const production = producerOrganizations.find(row => String(row.id) === String(productionId)) || null
    const template = availableTemplates.find(row => row.key === form.template_key)
    const actions = template?.key === 'production_completed'
      ? applyCommunicationTemplate(template, selectedApplication, production).actions
      : form.actions
    setForm(current => ({ ...current, production_id: productionId, actions }))
    setError('')
    setSuccess('')
  }

  function updateAction(index, field, value) {
    setForm(current => ({
      ...current,
      actions: current.actions.map((action, actionIndex) => actionIndex === index ? { ...action, [field]: value } : action),
    }))
    setError('')
    setSuccess('')
  }

  function addAction() {
    setForm(current => current.actions.length >= 3 ? current : ({
      ...current,
      actions: [...current.actions, { label: '', url: '' }],
    }))
  }

  function removeAction(index) {
    setForm(current => ({ ...current, actions: current.actions.filter((_, actionIndex) => actionIndex !== index) }))
  }

  async function ensureNotificationReach() {
    const payload = await apiRequest('/admin/ecosystem/notifications/preview', {
      method: 'POST',
      body: JSON.stringify({ audience_type: 'users', user_ids: [Number(userId)], app_id: null }),
    })
    if (!Number(payload?.deliveries_count || 0)) {
      throw new Error('Este usuário não possui uma aplicação ativa apta a receber notificações no momento.')
    }
    return payload
  }

  async function sendEmail() {
    if (!user?.email) throw new Error('Este usuário não possui e-mail cadastrado.')
    return apiRequest(`/admin/ecosystem/users/${userId}/communications/email`, {
      method: 'POST',
      body: JSON.stringify({
        subject: form.subject.trim(),
        message: form.message.trim(),
        app_slug: form.app_slug || null,
        template_key: form.template_key || 'custom',
        production_id: form.production_id ? Number(form.production_id) : null,
        include_events: Boolean(form.include_events),
        actions: form.actions
          .map(action => ({ label: action.label.trim(), url: action.url.trim() }))
          .filter(action => action.label && action.url),
      }),
    })
  }

  async function sendNotification() {
    const primaryAction = form.actions.find(action => action.url?.trim())
    return apiRequest('/admin/ecosystem/notifications', {
      method: 'POST',
      body: JSON.stringify({
        audience_type: 'users',
        user_ids: [Number(userId)],
        app_id: selectedApplication?.id || null,
        type: form.type,
        title: form.subject.trim(),
        message: form.message.trim(),
        reference_url: primaryAction?.url?.trim() || null,
        data: { source: 'admin_user_detail', user_id: Number(userId), template_key: form.template_key },
      }),
    })
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.subject.trim() || !form.message.trim()) {
      setError('Informe o assunto/título e a mensagem antes de enviar.')
      return
    }
    if (form.template_key === 'production_completed' && !form.production_id) {
      setError('Selecione a produção concluída antes de enviar.')
      return
    }
    const invalidAction = form.actions.find(action => action.url?.trim() && !validateHttpsUrl(action.url))
    if (invalidAction) {
      setError('Todos os links dos botões precisam usar HTTPS.')
      return
    }
    const incompleteAction = form.actions.find(action => Boolean(action.label?.trim()) !== Boolean(action.url?.trim()))
    if (incompleteAction) {
      setError('Cada botão precisa ter um texto e um link.')
      return
    }

    setSending(true)
    const delivered = []
    try {
      if (form.channel === 'notification' || form.channel === 'both') await ensureNotificationReach()
      if (form.channel === 'email' || form.channel === 'both') {
        await sendEmail()
        delivered.push('e-mail')
      }
      if (form.channel === 'notification' || form.channel === 'both') {
        await sendNotification()
        delivered.push('notificação')
      }
      setSuccess(`Enviado com sucesso por ${delivered.join(' e ')} para ${fullName(user)}.`)
      setForm(current => ({ ...EMPTY_FORM, channel: current.channel, app_slug: current.app_slug }))
    } catch (err) {
      const partial = delivered.length ? ` ${delivered.join(' e ')} já foi enviado;` : ''
      setError(`${partial} ${err.message || 'Não foi possível concluir o envio.'}`.trim())
    } finally {
      setSending(false)
    }
  }

  async function resendAccess() {
    setSending(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiRequest('/admin/ecosystem/users/resend-email', {
        method: 'POST',
        body: JSON.stringify({ user_id: Number(userId) }),
      })
      setSuccess(payload?.message || 'Orientações de acesso reenviadas.')
    } catch (err) {
      setError(err.message || 'Não foi possível reenviar as orientações de acesso.')
    } finally {
      setSending(false)
    }
  }

  function openProducerOnboarding() {
    if (!producerOrganizations.length) return
    setOnboardingProductionId(String(producerOrganizations[0].id))
    setOnboardingNotice('')
    setError('')
    setOnboardingOpen(true)
  }

  async function sendProducerOnboarding() {
    const production = producerOrganizations.find(row => String(row.id) === String(onboardingProductionId))
    if (!production?.application?.slug) {
      setOnboardingNotice('Selecione uma produção válida.')
      return
    }

    setOnboardingBusy(true)
    setOnboardingNotice('')
    setError('')
    try {
      const payload = await apiRequest(
        `/v1/apps/${encodeURIComponent(production.application.slug)}/organizations/${production.id}/onboarding/resend-handoff`,
        { method: 'POST' },
      )
      setOnboardingNotice(payload?.message || `Onboarding enviado para ${user?.email || 'o produtor'}.`)
    } catch (err) {
      setOnboardingNotice(err.message || 'Não foi possível enviar o onboarding do produtor.')
    } finally {
      setOnboardingBusy(false)
    }
  }

  const quickActions = <div className="auc-quick-actions" aria-label="Ações rápidas do usuário">
    <button type="button" className="auc-action auc-action--both" onClick={() => openComposer('both')} disabled={loadingUser || !user?.email}>Comunicar</button>
    {producerOrganizations.length > 0 && <button type="button" className="auc-action auc-action--onboarding" onClick={openProducerOnboarding} disabled={loadingUser || !user?.email}>Enviar onboarding</button>}
    <button type="button" className="auc-action auc-action--access" onClick={() => setAccessManagerOpen(true)} disabled={loadingUser || !user}>Administrar acesso</button>
    <button type="button" className="auc-action auc-action--impersonate" onClick={() => setImpersonationOpen(true)} disabled={loadingUser || !canImpersonate(user)}>Entrar como usuário</button>
  </div>

  const modal = open ? <div className="auc-modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !sending) setOpen(false)
  }}>
    <section className="auc-modal" role="dialog" aria-modal="true" aria-labelledby="auc-title">
      <header className="auc-modal-head">
        <div>
          <span>COMUNICAÇÃO INDIVIDUAL</span>
          <h2 id="auc-title">Enviar para {fullName(user)}</h2>
          <p>{recipientLabel}</p>
        </div>
        <button type="button" className="auc-close" onClick={() => setOpen(false)} disabled={sending} aria-label="Fechar">×</button>
      </header>

      <div className="auc-channel-grid" aria-label="Canal de envio">
        {Object.entries(CHANNEL_LABELS).map(([key, label]) => <button
          key={key}
          type="button"
          className={form.channel === key ? 'active' : ''}
          onClick={() => change('channel', key)}
          disabled={sending || ((key === 'email' || key === 'both') && !user?.email)}
        >
          <b>{label}</b>
          <small>{key === 'email' ? 'Caixa de entrada' : key === 'notification' ? 'Dentro das aplicações' : 'Dois canais no mesmo envio'}</small>
        </button>)}
      </div>

      <div className="auc-template-row">
        <span>Mensagens padrão</span>
        <div>{availableTemplates.map(template => <button key={template.key} className={form.template_key === template.key ? 'active' : ''} type="button" onClick={() => applyTemplate(template)} disabled={sending}>{template.label}</button>)}</div>
      </div>

      <form className="auc-form" onSubmit={submit}>
        <label className="auc-wide">Identidade do e-mail
          <select value={form.app_slug} onChange={event => changeApplication(event.target.value)} disabled={sending}>
            <option value="">Peter Tecnet (padrão)</option>
            {communicationApplications.map(app => <option key={app.id || app.slug} value={app.slug}>{app.name || app.slug}</option>)}
          </select>
          <small>{selectedApplication?.slug === 'cutinapp' ? 'Usará a logo e o padrão visual atual da Cutinapp.' : 'O e-mail usa o branding configurado para a aplicação.'}</small>
        </label>

        <label className="auc-wide">Assunto / título
          <input value={form.subject} onChange={event => change('subject', event.target.value)} maxLength={180} placeholder="Ex.: Informação importante sobre sua conta" autoFocus required/>
        </label>
        {(form.channel === 'notification' || form.channel === 'both') && <label>Tipo da notificação
          <select value={form.type} onChange={event => change('type', event.target.value)}>
            <option value="info">Informação</option>
            <option value="general">Geral</option>
            <option value="success">Sucesso</option>
            <option value="warning">Aviso</option>
            <option value="critical">Crítica</option>
            <option value="maintenance">Manutenção</option>
            <option value="marketing">Marketing</option>
          </select>
        </label>}

        {form.template_key === 'production_completed' && <label className="auc-wide">Produção concluída
          <select value={form.production_id} onChange={event => changeProduction(event.target.value)} disabled={sending} required>
            <option value="">Selecione a produção</option>
            {producerOrganizations.filter(row => !form.app_slug || row.application?.slug === form.app_slug).map(row => <option key={row.id} value={row.id}>{row.name} · {row.application?.name || row.application?.slug}</option>)}
          </select>
          <small>O servidor confirma a titularidade antes de incluir produção e eventos no e-mail.</small>
        </label>}

        {(form.channel === 'email' || form.channel === 'both') && <div className="auc-wide auc-actions-editor">
          <div className="auc-actions-editor__head">
            <div><strong>Botões do e-mail</strong><small>Até 3 ações HTTPS. O primeiro botão recebe maior destaque.</small></div>
            <button type="button" className="auc-secondary" onClick={addAction} disabled={sending || form.actions.length >= 3}>Adicionar botão</button>
          </div>
          {form.actions.length === 0 && <p className="auc-actions-empty">Nenhum botão configurado. Você pode enviar apenas a mensagem ou adicionar ações.</p>}
          {form.actions.map((action, index) => <div className="auc-action-row" key={`action-${index}`}>
            <input value={action.label} onChange={event => updateAction(index, 'label', event.target.value)} maxLength={60} placeholder="Texto do botão" aria-label={`Texto do botão ${index + 1}`}/>
            <input type="url" value={action.url} onChange={event => updateAction(index, 'url', event.target.value)} maxLength={500} placeholder="https://..." aria-label={`Link do botão ${index + 1}`}/>
            <button type="button" className="auc-action-remove" onClick={() => removeAction(index)} disabled={sending} aria-label={`Remover botão ${index + 1}`}>Remover</button>
          </div>)}
        </div>}

        {form.include_events && form.production_id && <div className="auc-wide auc-event-preview">
          <div className="auc-event-preview__head"><strong>Prévia que irá no e-mail</strong><span>{selectedProduction?.name || 'Produção'} · até 6 eventos</span></div>
          {previewEvents.length === 0 ? <p>Nenhum evento vinculado a esta produção foi encontrado.</p> : previewEvents.map(event => <div className="auc-event-preview__item" key={event.id}><strong>{event.title || event.name}</strong><span>{event.start_date ? new Date(event.start_date).toLocaleString('pt-BR') : 'Data a confirmar'}{event.city ? ` · ${event.city}${event.uf ? `/${event.uf}` : ''}` : ''}</span></div>)}
        </div>}

        <label className="auc-wide">Mensagem
          <textarea value={form.message} onChange={event => change('message', event.target.value)} maxLength={5000} rows={8} placeholder="Escreva a informação que este usuário deve receber..." required/>
          <small>{form.message.length}/5000 caracteres</small>
        </label>

        {error && <div className="auc-feedback auc-feedback--error">{error}</div>}
        {success && <div className="auc-feedback auc-feedback--success">{success}</div>}

        <div className="auc-modal-actions auc-wide">
          <button type="button" className="auc-secondary" onClick={resendAccess} disabled={sending || !user?.email}>Reenviar acesso</button>
          <div>
            <button type="button" className="auc-secondary" onClick={() => setOpen(false)} disabled={sending}>Cancelar</button>
            <button type="submit" className="auc-primary" disabled={sending || loadingUser}>{sending ? 'Enviando…' : `Enviar ${CHANNEL_LABELS[form.channel]}`}</button>
          </div>
        </div>
      </form>
    </section>
  </div> : null

  const onboardingModal = onboardingOpen ? <div className="auc-modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !onboardingBusy) setOnboardingOpen(false)
  }}>
    <section className="auc-modal" role="dialog" aria-modal="true" aria-labelledby="auc-onboarding-title">
      <header className="auc-modal-head">
        <div>
          <span>ENTREGA AO PRODUTOR</span>
          <h2 id="auc-onboarding-title">Enviar onboarding para {fullName(user)}</h2>
          <p>O e-mail leva o produtor aos termos, identidade, documentos, prova de vida e chave Pix.</p>
        </div>
        <button type="button" className="auc-close" onClick={() => setOnboardingOpen(false)} disabled={onboardingBusy} aria-label="Fechar">×</button>
      </header>
      <div className="auc-form">
        <label className="auc-wide">Produção
          <select value={onboardingProductionId} onChange={event => { setOnboardingProductionId(event.target.value); setOnboardingNotice('') }} disabled={onboardingBusy}>
            {producerOrganizations.map(row => <option key={row.id} value={row.id}>{row.name} · {row.application?.name || row.application?.slug}</option>)}
          </select>
        </label>
        <div className="auc-feedback auc-wide">
          O envio usa o fluxo oficial da produção e registra a data de entrega no onboarding. Nenhuma etapa de identidade ou aceite é concluída pelo administrador.
        </div>
        {onboardingNotice && <div className="auc-feedback auc-feedback--success">{onboardingNotice}</div>}
        <div className="auc-modal-actions auc-wide">
          <button type="button" className="auc-secondary" onClick={() => setOnboardingOpen(false)} disabled={onboardingBusy}>Fechar</button>
          <div><button type="button" className="auc-primary" onClick={sendProducerOnboarding} disabled={onboardingBusy || !onboardingProductionId}>{onboardingBusy ? 'Enviando…' : 'Enviar e-mail de onboarding'}</button></div>
        </div>
      </div>
    </section>
  </div> : null

  return <div className="auc-user-detail-shell" data-user-detail-experience="true">
    <AdminUserDetailPage key={String(userId) + ':' + String(detailRevision)} {...props} detailActions={quickActions}/>
    {modal}
    {onboardingModal}
    {accessManagerOpen && user && <AdminUserAccessManager
      open={accessManagerOpen}
      user={user}
      applications={applications}
      apiRequest={apiRequest}
      onClose={() => setAccessManagerOpen(false)}
      onChanged={() => setDetailRevision(current => current + 1)}
      onDeleted={() => {
        setAccessManagerOpen(false)
        props.onBack?.()
      }}
    />}
    {impersonationOpen && user && <AdminImpersonationDialog user={user} applications={applications} apiRequest={apiRequest} onClose={() => setImpersonationOpen(false)}/>} 
  </div>
}
