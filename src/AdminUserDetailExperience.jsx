import { useEffect, useMemo, useState } from 'react'
import AdminUserDetailPage from './AdminUserDetailPage.jsx'
import { AdminImpersonationDialog, canImpersonate } from './AdminImpersonation.jsx'
import AdminUserAccessManager from './AdminUserAccessManager.jsx'
import './AdminUserCommunication.css'
import './AdminUserCommunicationShell.css'

const EMPTY_FORM = {
  channel: 'both',
  type: 'info',
  subject: '',
  message: '',
  action_url: '',
}

const CHANNEL_LABELS = {
  email: 'E-mail',
  notification: 'Notificação',
  both: 'E-mail + notificação',
}

const TEMPLATES = [
  { key: 'information', label: 'Informação', subject: 'Informação da Peter Tecnet', type: 'info' },
  { key: 'support', label: 'Suporte', subject: 'Atualização do seu atendimento', type: 'general' },
  { key: 'account', label: 'Conta', subject: 'Informação sobre sua conta Peter Tecnet', type: 'info' },
  { key: 'important', label: 'Aviso', subject: 'Aviso importante da Peter Tecnet', type: 'warning' },
]

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

  function openComposer(channel) {
    setForm(current => ({ ...EMPTY_FORM, channel, type: current.type || 'info' }))
    setError('')
    setSuccess('')
    setOpen(true)
  }

  function change(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
    setSuccess('')
  }

  function applyTemplate(template) {
    setForm(current => ({ ...current, subject: template.subject, type: template.type }))
    setError('')
    setSuccess('')
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
        action_url: form.action_url.trim() || null,
      }),
    })
  }

  async function sendNotification() {
    return apiRequest('/admin/ecosystem/notifications', {
      method: 'POST',
      body: JSON.stringify({
        audience_type: 'users',
        user_ids: [Number(userId)],
        app_id: null,
        type: form.type,
        title: form.subject.trim(),
        message: form.message.trim(),
        reference_url: form.action_url.trim() || null,
        data: { source: 'admin_user_detail', user_id: Number(userId) },
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
    if (!validateHttpsUrl(form.action_url)) {
      setError('O link opcional deve usar HTTPS.')
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
      setForm(current => ({ ...EMPTY_FORM, channel: current.channel }))
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
        <span>Atalhos</span>
        <div>{TEMPLATES.map(template => <button key={template.key} type="button" onClick={() => applyTemplate(template)} disabled={sending}>{template.label}</button>)}</div>
      </div>

      <form className="auc-form" onSubmit={submit}>
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
        <label className={(form.channel === 'email' ? 'auc-wide' : '')}>Link HTTPS opcional
          <input type="url" value={form.action_url} onChange={event => change('action_url', event.target.value)} maxLength={500} placeholder="https://..."/>
        </label>
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
