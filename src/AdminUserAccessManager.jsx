import { useEffect, useMemo, useState } from 'react'
import AdminProcessingIndicator from './AdminProcessingIndicator.jsx'
import { confirmAction } from './utils/uiDialog.js'
import './AdminUserAccessManager.css'

function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name || user?.email || 'Usuário'
}

function statusLabel(status) {
  const labels = {
    active: 'Ativo',
    blocked: 'Bloqueado',
    suspended: 'Suspenso',
  }
  return labels[String(status || '').toLowerCase()] || 'Sem vínculo'
}

function metadataValue(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function mergeApplications(applications, platforms) {
  const map = new Map()
  ;(applications || []).forEach(application => {
    if (application?.id) map.set(Number(application.id), application)
  })
  ;(platforms || []).forEach(platform => {
    const application = platform?.application
    if (application?.id) map.set(Number(application.id), application)
  })
  return [...map.values()].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR'))
}

export default function AdminUserAccessManager({
  open,
  user,
  applications = [],
  apiRequest,
  onClose,
  onChanged,
  onDeleted,
}) {
  const [detail, setDetail] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const busy = Boolean(busyAction)
  const platforms = detail?.platforms || []
  const applicationOptions = useMemo(() => mergeApplications(applications, platforms), [applications, platforms])
  const accessByApp = useMemo(() => {
    const map = new Map()
    platforms.forEach(platform => {
      const id = Number(platform?.application?.id)
      if (id) map.set(id, platform?.access || null)
    })
    return map
  }, [platforms])

  const linkedAccesses = useMemo(
    () => [...accessByApp.values()].filter(Boolean),
    [accessByApp],
  )
  const activeCount = linkedAccesses.filter(access => access?.status === 'active').length
  const restrictedCount = linkedAccesses.filter(access => ['blocked', 'suspended'].includes(access?.status)).length
  const allBlocked = linkedAccesses.length > 0 && linkedAccesses.every(access => access?.status === 'blocked')

  async function load() {
    if (!user?.id) return
    setLoading(true)
    setError('')
    try {
      const payload = await apiRequest('/admin/ecosystem/users/' + user.id)
      setDetail(payload)
      const nextDrafts = {}
      ;(payload?.platforms || []).forEach(platform => {
        const appId = Number(platform?.application?.id)
        if (!appId) return
        nextDrafts[appId] = {
          status: platform?.access?.status || 'active',
          role: platform?.access?.role || 'member',
        }
      })
      setDrafts(nextDrafts)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as permissões deste usuário.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return undefined
    void load()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = event => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, user?.id])

  function updateDraft(appId, field, value) {
    setDrafts(current => ({
      ...current,
      [appId]: {
        status: current[appId]?.status || 'active',
        role: current[appId]?.role || 'member',
        [field]: value,
      },
    }))
    setError('')
    setNotice('')
  }

  async function refreshAfterChange(message) {
    await load()
    setNotice(message || 'Acesso atualizado.')
    onChanged?.()
  }

  async function changeGlobalAccess() {
    const nextStatus = allBlocked ? 'active' : 'blocked'
    const confirmed = await confirmAction({
      tone: nextStatus === 'blocked' ? 'danger' : 'warning',
      eyebrow: 'ACESSO GLOBAL',
      title: nextStatus === 'blocked' ? 'Bloquear este usuário em todo o ecossistema?' : 'Reativar os acessos bloqueados?',
      message: nextStatus === 'blocked'
        ? 'O usuário perderá acesso às aplicações atualmente liberadas e as sessões anteriores serão invalidadas.'
        : 'Os vínculos bloqueados voltarão a ficar ativos. Vínculos suspensos continuarão suspensos.',
      confirmLabel: nextStatus === 'blocked' ? 'Bloquear usuário' : 'Reativar acessos',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setBusyAction('global')
    setError('')
    setNotice('')
    try {
      const payload = await apiRequest('/admin/ecosystem/users/' + user.id + '/account-access', {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      await refreshAfterChange(payload?.message)
    } catch (err) {
      setError(err.message || 'Não foi possível alterar o acesso global.')
    } finally {
      setBusyAction('')
    }
  }

  async function revokeSessions() {
    const confirmed = await confirmAction({
      tone: 'warning',
      eyebrow: 'SESSÕES ATIVAS',
      title: 'Encerrar todas as sessões deste usuário?',
      message: 'Tokens e sessões já emitidos serão invalidados. O usuário precisará entrar novamente.',
      confirmLabel: 'Encerrar sessões',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setBusyAction('sessions')
    setError('')
    setNotice('')
    try {
      const payload = await apiRequest('/admin/ecosystem/users/' + user.id + '/security/revoke-sessions', {
        method: 'POST',
      })
      setNotice(payload?.message || 'Sessões encerradas com sucesso.')
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Não foi possível encerrar as sessões.')
    } finally {
      setBusyAction('')
    }
  }

  async function saveApplicationAccess(application) {
    const appId = Number(application.id)
    const existing = accessByApp.get(appId)
    const draft = drafts[appId] || {
      status: existing?.status || 'active',
      role: existing?.role || 'member',
    }

    setBusyAction('app-' + appId)
    setError('')
    setNotice('')
    try {
      await apiRequest('/admin/ecosystem/users/' + user.id + '/applications/' + appId, {
        method: 'PUT',
        body: JSON.stringify({
          status: draft.status || 'active',
          role: String(draft.role || '').trim() || null,
          metadata: metadataValue(existing?.metadata),
        }),
      })
      await refreshAfterChange('Acesso em ' + (application.name || 'aplicação') + ' atualizado.')
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar esta aplicação.')
    } finally {
      setBusyAction('')
    }
  }

  async function removeApplicationAccess(application) {
    const appId = Number(application.id)
    const confirmed = await confirmAction({
      tone: 'danger',
      eyebrow: 'REMOVER VÍNCULO',
      title: 'Remover o acesso a ' + (application.name || 'esta aplicação') + '?',
      message: 'O vínculo do usuário com a aplicação será removido. Isso não apaga os dados de negócio relacionados ao usuário.',
      confirmLabel: 'Remover vínculo',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setBusyAction('remove-' + appId)
    setError('')
    setNotice('')
    try {
      await apiRequest('/admin/ecosystem/users/' + user.id + '/applications/' + appId, {
        method: 'DELETE',
      })
      await refreshAfterChange('Vínculo com ' + (application.name || 'aplicação') + ' removido.')
    } catch (err) {
      setError(err.message || 'Não foi possível remover este vínculo.')
    } finally {
      setBusyAction('')
    }
  }

  async function deleteUser() {
    const confirmed = await confirmAction({
      tone: 'danger',
      eyebrow: 'ZONA CRÍTICA',
      title: 'Excluir definitivamente ' + fullName(user) + '?',
      message: 'A conta será excluída do cadastro central e os vínculos diretos com aplicações serão removidos. Esta ação deve ser usada somente quando a exclusão for realmente necessária.',
      confirmLabel: 'Excluir usuário',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setBusyAction('delete')
    setError('')
    setNotice('')
    try {
      await apiRequest('/admin/ecosystem/users/' + user.id, { method: 'DELETE' })
      onDeleted?.()
    } catch (err) {
      setError(err.message || 'Não foi possível excluir este usuário.')
      setBusyAction('')
    }
  }

  if (!open || !user) return null

  return <div
    className="aua-backdrop"
    role="presentation"
    onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}
  >
    <section className="aua-modal" role="dialog" aria-modal="true" aria-labelledby="aua-title">
      <header className="aua-head">
        <div>
          <span>ADMINISTRAÇÃO DE ACESSO</span>
          <h2 id="aua-title">{fullName(user)}</h2>
          <p>{user.email || 'sem e-mail'} · usuário #{user.id}</p>
        </div>
        <button type="button" className="aua-close" onClick={onClose} disabled={busy} aria-label="Fechar">×</button>
      </header>

      {loading ? <div className="aua-loading">
        <AdminProcessingIndicator
          title="Carregando controles de acesso"
          messages="Consultando vínculos do usuário…|Verificando aplicações liberadas…|Preparando os controles administrativos…"
          detail="Os dados são lidos diretamente da API central."
        />
      </div> : <>
        {busy && <div className="aua-processing">
          <AdminProcessingIndicator
            title="Aplicando alteração"
            messages="Validando a operação…|Atualizando permissões na API central…|Sincronizando a ficha do usuário…"
            detail="Aguarde a confirmação antes de executar outra ação."
          />
        </div>}

        <div className="aua-summary">
          <article><span>Acessos ativos</span><strong>{activeCount}</strong><small>aplicações liberadas</small></article>
          <article><span>Restrições</span><strong>{restrictedCount}</strong><small>bloqueadas ou suspensas</small></article>
          <article><span>Vínculos</span><strong>{linkedAccesses.length}</strong><small>no ecossistema</small></article>
        </div>

        {error && <div className="aua-feedback aua-feedback--error">{error}</div>}
        {notice && <div className="aua-feedback aua-feedback--success">{notice}</div>}

        <section className="aua-section">
          <div className="aua-section-head">
            <div>
              <span>CONTA</span>
              <h3>Controle global</h3>
              <p>Bloqueie a conta em todas as aplicações ou invalide sessões sem alterar os dados do usuário.</p>
            </div>
            <span className={'aua-state ' + (allBlocked ? 'danger' : 'success')}>
              {allBlocked ? 'Bloqueado globalmente' : 'Conta operacional'}
            </span>
          </div>
          <div className="aua-global-actions">
            <button type="button" className={allBlocked ? 'aua-primary' : 'aua-danger'} onClick={changeGlobalAccess} disabled={busy || !linkedAccesses.length}>
              {busyAction === 'global' ? 'Salvando…' : allBlocked ? 'Reativar acessos' : 'Bloquear usuário'}
            </button>
            <button type="button" className="aua-secondary" onClick={revokeSessions} disabled={busy}>
              {busyAction === 'sessions' ? 'Encerrando…' : 'Encerrar todas as sessões'}
            </button>
          </div>
        </section>

        <section className="aua-section">
          <div className="aua-section-head">
            <div>
              <span>APLICAÇÕES</span>
              <h3>Permissões por aplicação</h3>
              <p>Libere, suspenda, bloqueie ou remova o vínculo individualmente.</p>
            </div>
          </div>

          <div className="aua-app-list">
            {applicationOptions.length ? applicationOptions.map(application => {
              const appId = Number(application.id)
              const access = accessByApp.get(appId)
              const draft = drafts[appId] || {
                status: access?.status || 'active',
                role: access?.role || 'member',
              }
              const appBusy = busyAction === 'app-' + appId || busyAction === 'remove-' + appId

              return <article key={appId} className="aua-app-row">
                <div className="aua-app-identity">
                  <span className="aua-app-logo">
                    {application.logo
                      ? <img src={application.logo} alt="" onError={event => { event.currentTarget.style.display = 'none' }}/>
                      : <b>{String(application.name || 'P').slice(0, 1)}</b>}
                  </span>
                  <span>
                    <b>{application.name || 'Aplicação #' + appId}</b>
                    <small className={'aua-inline-status ' + (access?.status || 'none')}>
                      {statusLabel(access?.status)}
                    </small>
                  </span>
                </div>

                <label>
                  Status
                  <select
                    value={draft.status}
                    onChange={event => updateDraft(appId, 'status', event.target.value)}
                    disabled={busy}
                  >
                    <option value="active">Ativo</option>
                    <option value="suspended">Suspenso</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </label>

                <label>
                  Função
                  <input
                    value={draft.role}
                    onChange={event => updateDraft(appId, 'role', event.target.value)}
                    maxLength={100}
                    placeholder="member"
                    disabled={busy}
                  />
                </label>

                <div className="aua-app-actions">
                  <button type="button" className="aua-primary" onClick={() => saveApplicationAccess(application)} disabled={busy}>
                    {appBusy && busyAction === 'app-' + appId ? 'Salvando…' : access ? 'Salvar' : 'Conceder acesso'}
                  </button>
                  {access && <button type="button" className="aua-link-danger" onClick={() => removeApplicationAccess(application)} disabled={busy}>
                    {appBusy && busyAction === 'remove-' + appId ? 'Removendo…' : 'Remover'}
                  </button>}
                </div>
              </article>
            }) : <div className="aua-empty">Nenhuma aplicação cadastrada para administrar.</div>}
          </div>
        </section>

        <section className="aua-section aua-danger-zone">
          <div className="aua-section-head">
            <div>
              <span>ZONA CRÍTICA</span>
              <h3>Excluir usuário</h3>
              <p>Remove o cadastro central do usuário. Prefira bloquear quando a intenção for apenas impedir novos acessos.</p>
            </div>
          </div>
          <button type="button" className="aua-danger" onClick={deleteUser} disabled={busy}>
            {busyAction === 'delete' ? 'Excluindo…' : 'Excluir usuário definitivamente'}
          </button>
        </section>
      </>}
    </section>
  </div>
}
