import { useEffect, useMemo, useState } from 'react'
import './AdminProspectInvitation.css'

const CUTINAPP_PERSONAS = [
  { value: 'participant', label: 'Participante', hint: 'Descobrir eventos, comprar ingressos e itens, interagir e acompanhar movimentações.' },
  { value: 'producer', label: 'Produtor', hint: 'Divulgar eventos, vender ingressos e itens e se relacionar com participantes.' },
  { value: 'artist', label: 'Artista', hint: 'Ganhar destaque, presença nos eventos e conexão com produtores e público.' },
  { value: 'promoter', label: 'Promoter', hint: 'Divulgar eventos, conectar público e reduzir o caminho até a compra.' },
]

const GENERIC_PERSONAS = [
  { value: 'client', label: 'Cliente', hint: 'Apresentação dos benefícios da plataforma para uso direto.' },
  { value: 'professional', label: 'Profissional', hint: 'Foco em operação, produtividade, automação e integração.' },
  { value: 'partner', label: 'Parceiro', hint: 'Foco em parceria comercial e integração com o ecossistema.' },
]

const STATUS_LABELS = {
  pending: 'Pendente',
  accepted: 'Aceito',
  expired: 'Expirado',
  revoked: 'Revogado',
}

const CUTINAPP_SLUGS = new Set(['cutinapp', 'cutin-app', 'catchnap', 'catinapp'])

function isCutinapp(application) {
  const slug = String(application?.slug || '').trim().toLowerCase()
  const name = String(application?.name || '').trim().toLowerCase()
  return CUTINAPP_SLUGS.has(slug) || name.includes('cutin') || name.includes('catchnap')
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function AdminProspectInvitation({ apiRequest, applications = [], compact = false, onSuccess }) {
  const activeApplications = useMemo(() => applications.filter(app => app?.is_active !== false), [applications])
  const [form, setForm] = useState({ email: '', recipient_name: '', application_id: '', persona: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [invitations, setInvitations] = useState([])
  const [loadingInvitations, setLoadingInvitations] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [actionId, setActionId] = useState(null)

  const selectedApplication = useMemo(
    () => activeApplications.find(app => String(app.id) === String(form.application_id)) || null,
    [activeApplications, form.application_id],
  )

  const personas = useMemo(
    () => selectedApplication && isCutinapp(selectedApplication) ? CUTINAPP_PERSONAS : GENERIC_PERSONAS,
    [selectedApplication],
  )

  const selectedPersona = personas.find(persona => persona.value === form.persona) || null

  async function refreshInvitations({ silent = false } = {}) {
    if (!silent) setLoadingInvitations(true)
    setHistoryError('')

    try {
      const payload = await apiRequest('/admin/ecosystem/invitations?limit=10')
      setInvitations(Array.isArray(payload?.data) ? payload.data : [])
    } catch (err) {
      setHistoryError(err?.message || 'Não foi possível carregar os convites recentes.')
    } finally {
      if (!silent) setLoadingInvitations(false)
    }
  }

  useEffect(() => {
    if (compact) {
      setLoadingInvitations(false)
      return undefined
    }

    let active = true

    async function load() {
      setLoadingInvitations(true)
      try {
        const payload = await apiRequest('/admin/ecosystem/invitations?limit=10')
        if (active) {
          setInvitations(Array.isArray(payload?.data) ? payload.data : [])
          setHistoryError('')
        }
      } catch (err) {
        if (active) setHistoryError(err?.message || 'Não foi possível carregar os convites recentes.')
      } finally {
        if (active) setLoadingInvitations(false)
      }
    }

    void load()
    return () => { active = false }
  }, [apiRequest, compact])

  function change(field, value) {
    setForm(current => {
      if (field === 'application_id') return { ...current, application_id: value, persona: '' }
      return { ...current, [field]: value }
    })
    setError('')
    setSuccess('')
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.application_id || !form.persona) {
      setError('Selecione a plataforma e o perfil do destinatário.')
      return
    }

    setBusy(true)
    try {
      const payload = await apiRequest('/admin/ecosystem/invitations/prospect', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          recipient_name: form.recipient_name.trim() || null,
          application_id: Number(form.application_id),
          persona: form.persona,
        }),
      })
      setSuccess(payload?.message || 'Convite enviado com sucesso.')
      setForm(current => ({ ...current, email: '', recipient_name: '' }))
      if (!compact) await refreshInvitations({ silent: true })
      onSuccess?.(payload)
    } catch (err) {
      setError(err?.message || 'Não foi possível enviar o convite.')
      if (!compact) await refreshInvitations({ silent: true })
    } finally {
      setBusy(false)
    }
  }

  async function resend(invitation) {
    setActionId(invitation.id)
    setHistoryError('')
    setSuccess('')

    try {
      const payload = await apiRequest(`/admin/ecosystem/invitations/${invitation.id}/resend`, {
        method: 'POST',
      })
      setSuccess(payload?.message || 'Convite reenviado com sucesso.')
      await refreshInvitations({ silent: true })
    } catch (err) {
      setHistoryError(err?.message || 'Não foi possível reenviar o convite.')
    } finally {
      setActionId(null)
    }
  }

  async function revoke(invitation) {
    setActionId(invitation.id)
    setHistoryError('')
    setSuccess('')

    try {
      const payload = await apiRequest(`/admin/ecosystem/invitations/${invitation.id}`, {
        method: 'DELETE',
      })
      setSuccess(payload?.message || 'Convite revogado.')
      await refreshInvitations({ silent: true })
    } catch (err) {
      setHistoryError(err?.message || 'Não foi possível revogar o convite.')
    } finally {
      setActionId(null)
    }
  }

  return <section className={`api-card${compact ? ' api-card--compact' : ''}`} id="admin-prospect-invitation">
    <header className="api-head">
      <div>
        <span>{compact ? 'NOVO ACESSO' : 'PROSPECÇÃO E CONVITES'}</span>
        <h3>{compact ? 'Convidar usuário' : 'Convidar para uma plataforma'}</h3>
        <p>{compact ? 'Informe o e-mail e escolha o acesso inicial.' : 'Crie o primeiro acesso, escolha a plataforma e envie um link seguro para o usuário confirmar o e-mail e definir a própria senha.'}</p>
      </div>
      {!compact && <span className="api-badge">Acesso seguro</span>}
    </header>

    <div className={`api-grid${compact ? ' api-grid--compact' : ''}`}>
      <form className="api-form" onSubmit={submit}>
        <label className="api-wide">E-mail do destinatário
          <input type="email" value={form.email} onChange={event => change('email', event.target.value)} placeholder="contato@exemplo.com" required/>
        </label>

        <label>Nome <small>opcional</small>
          <input value={form.recipient_name} onChange={event => change('recipient_name', event.target.value)} maxLength={120} placeholder="Nome da pessoa ou contato"/>
        </label>

        <label>Plataforma
          <select value={form.application_id} onChange={event => change('application_id', event.target.value)} required>
            <option value="">Selecione</option>
            {activeApplications.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
          </select>
        </label>

        <label className="api-wide">Perfil do convite
          <select value={form.persona} onChange={event => change('persona', event.target.value)} disabled={!selectedApplication} required>
            <option value="">{selectedApplication ? 'Selecione o perfil' : 'Escolha primeiro a plataforma'}</option>
            {personas.map(persona => <option key={persona.value} value={persona.value}>{persona.label}</option>)}
          </select>
        </label>

        {error && <div className="api-feedback api-feedback--error api-wide">{error}</div>}
        {success && <div className="api-feedback api-feedback--success api-wide">{success}</div>}

        <button className="api-submit api-wide" disabled={busy || !selectedApplication || !selectedPersona}>
          {busy ? 'Criando e enviando…' : 'Criar acesso e enviar convite'}
        </button>
      </form>

      {!compact && <aside className="api-preview">
        <span>COMO O ACESSO SERÁ CRIADO</span>
        <h4>{selectedApplication?.name || 'Selecione uma plataforma'}</h4>
        <strong>{selectedPersona?.label || 'Perfil ainda não selecionado'}</strong>
        <p>{selectedPersona?.hint || 'O usuário receberá um link temporário e um código de verificação. A senha só será definida pelo próprio destinatário.'}</p>
        {selectedApplication?.url && <a href={selectedApplication.url} target="_blank" rel="noreferrer">Abrir plataforma ↗</a>}
        {selectedApplication && isCutinapp(selectedApplication) && <div className="api-context-note">
          <b>Cutinapp</b>
          <small>O perfil selecionado também fica associado ao vínculo inicial com a plataforma.</small>
        </div>}
      </aside>}
    </div>

    {!compact && <div className="api-history">
      <div className="api-history-head">
        <div>
          <span>HISTÓRICO</span>
          <h4>Convites recentes</h4>
        </div>
        <button type="button" className="api-history-refresh" onClick={() => refreshInvitations()} disabled={loadingInvitations}>
          {loadingInvitations ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {historyError && <div className="api-feedback api-feedback--error">{historyError}</div>}

      {loadingInvitations ? (
        <div className="api-history-empty">Carregando convites…</div>
      ) : invitations.length === 0 ? (
        <div className="api-history-empty">Nenhum convite registrado ainda.</div>
      ) : (
        <div className="api-history-list">
          {invitations.map(invitation => {
            const canManage = invitation.status !== 'accepted'
            const processing = actionId === invitation.id

            return <article className="api-history-row" key={invitation.id}>
              <div className="api-history-main">
                <div className="api-history-email">{invitation.email}</div>
                <div className="api-history-meta">
                  <span>{invitation.application?.name || 'Plataforma removida'}</span>
                  {invitation.persona && <span>{invitation.persona}</span>}
                  <span>Enviado em {formatDate(invitation.created_at)}</span>
                  {invitation.status === 'pending' && <span>Expira em {formatDate(invitation.expires_at)}</span>}
                </div>
              </div>

              <div className="api-history-side">
                <span className={`api-status api-status--${invitation.status}`}>
                  {STATUS_LABELS[invitation.status] || invitation.status}
                </span>
                {canManage && <div className="api-history-actions">
                  <button type="button" onClick={() => resend(invitation)} disabled={processing}>
                    {processing ? 'Processando…' : 'Reenviar'}
                  </button>
                  {invitation.status !== 'revoked' && <button type="button" className="api-history-danger" onClick={() => revoke(invitation)} disabled={processing}>
                    Revogar
                  </button>}
                </div>}
              </div>
            </article>
          })}
        </div>
      )}
    </div>}
  </section>
}
