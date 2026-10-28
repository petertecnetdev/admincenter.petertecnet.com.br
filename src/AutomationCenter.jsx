import { useCallback, useEffect, useRef, useState } from 'react'
import { getAdminApiSessionSnapshot } from './adminApi.js'
import './AutomationCenter.css'

const names = {
  discovery_quality: 'Qualidade dos candidatos',
  discovery_health: 'Saúde das fontes',
  catalog_quality: 'Qualidade do catálogo',
  candidate_freshness: 'Atualização de candidatos',
}
const statusNames = { queued: 'Na fila', running: 'Executando', succeeded: 'Concluído', failed: 'Falhou', skipped: 'Ignorado' }
const resultFields = {
  processed: 'Processados', created: 'Criados', updated: 'Atualizados',
  skipped: 'Ignorados', failed: 'Falhas', duration_ms: 'Duração (ms)',
}

function formattedDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function hasCapability(app, permission) {
  const capabilities = app?.capabilities
  if (Array.isArray(capabilities)) return capabilities.includes(permission)
  return Boolean(capabilities && typeof capabilities === 'object' && capabilities[permission] === true)
}

function safeResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return '—'
  const fields = Object.entries(resultFields)
    .filter(([key]) => typeof result[key] === 'number' && Number.isFinite(result[key]) && result[key] >= 0)
    .map(([key, label]) => label + ': ' + result[key])
  return fields.join(' · ') || '—'
}

function safeError(error, fallback) {
  if (error?.status === 401) return 'Sessão expirada. Entre novamente.'
  if (error?.status === 403) return 'Sem permissão para esta operação.'
  if (error?.code === 'ADMIN_SESSION_CHANGED') return 'A sessão foi alterada. Atualize a consulta.'
  return fallback
}

export default function AutomationCenter({ applications = [], request }) {
  const apps = applications.filter(app => app.slug || app.app_slug)
  const [chosenSlug, setChosenSlug] = useState('')
  const [sessionTick, setSessionTick] = useState(0)
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const generation = useRef(0)

  useEffect(() => {
    if (!chosenSlug && apps.length) setChosenSlug(String(apps[0].slug || apps[0].app_slug))
  }, [chosenSlug, apps])

  useEffect(() => {
    const changed = () => setSessionTick(value => value + 1)
    window.addEventListener('storage', changed)
    window.addEventListener('admin-session-expired', changed)
    window.addEventListener('admin-api-session-changed', changed)
    return () => {
      window.removeEventListener('storage', changed)
      window.removeEventListener('admin-session-expired', changed)
      window.removeEventListener('admin-api-session-changed', changed)
    }
  }, [])

  // sessionTick força nova leitura após storage/revogação, sem armazenar token no React.
  void sessionTick
  const session = getAdminApiSessionSnapshot()
  const selectedApp = apps.find(app => String(app.slug || app.app_slug) === chosenSlug)
  const slug = selectedApp ? chosenSlug : ''
  const appId = String(selectedApp?.application_id ?? selectedApp?.id ?? '')
  const validAppId = /^[a-zA-Z0-9-]{1,64}$/.test(appId)
  const canView = validAppId && hasCapability(selectedApp, 'operations.view')
  const canManage = canView && hasCapability(selectedApp, 'admin.access.manage')
  const contextKey = session.generation + ':' + appId + ':' + slug
  const activeContext = useRef(contextKey)
  if (activeContext.current !== contextKey) {
    activeContext.current = contextKey
    generation.current += 1
  }
  const isCurrent = () => activeContext.current === contextKey && getAdminApiSessionSnapshot().generation === session.generation
  const data = snapshot?.key === contextKey && canView ? snapshot.value : null
  const currentBusy = busy?.key === contextKey ? busy.worker : ''
  const currentError = error?.key === contextKey ? error.message : ''
  const currentNotice = notice?.key === contextKey ? notice.message : ''

  const reload = useCallback(async () => {
    if (!slug || !canView) return
    const id = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const answer = await request('/v1/apps/' + encodeURIComponent(slug) + '/admin/automations', { force: true })
      const payload = answer?.data
      if (!payload || String(payload.application_id ?? '') !== appId || !Array.isArray(payload.workers) || !Array.isArray(payload.recent_runs)) {
        throw new Error('DTO_APPLICATION_MISMATCH')
      }
      if (isCurrent() && generation.current === id) setSnapshot({ key: contextKey, value: payload })
    } catch (cause) {
      if (isCurrent() && generation.current === id) {
        setSnapshot(null)
        setError({ key: contextKey, message: safeError(cause, 'Não foi possível consultar os workers desta aplicação.') })
      }
    } finally {
      if (isCurrent() && generation.current === id) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, slug, appId, canView, contextKey, session.generation])

  useEffect(() => {
    setSnapshot(null)
    setNotice(null)
    setError(null)
    setLoading(false)
    reload()
    return () => { generation.current += 1 }
  }, [reload])

  async function update(worker, change, interval = worker.interval_minutes) {
    if (!slug || !canManage || currentBusy || !Object.hasOwn(names, worker.key)) return
    const id = ++generation.current
    setBusy({ key: contextKey, worker: worker.key })
    setError(null)
    setNotice(null)
    const url = '/v1/apps/' + encodeURIComponent(slug) + '/admin/automations/workers/' + encodeURIComponent(worker.key)
    try {
      if (change === 'run') {
        await request(url + '/dispatch', { method: 'POST', body: '{}' })
      } else {
        await request(url, {
          method: 'PUT',
          body: JSON.stringify({ enabled: change === 'interval' ? worker.enabled : change === 'enable', interval_minutes: Number(interval) }),
        })
      }
      if (!isCurrent() || generation.current !== id) return
      setNotice({ key: contextKey, message: change === 'run' ? 'Execução encaminhada para a fila.' : 'Configuração salva.' })
      await reload()
    } catch (cause) {
      if (isCurrent() && generation.current === id) setError({ key: contextKey, message: safeError(cause, 'Falha ao atualizar o worker.') })
    } finally {
      if (isCurrent()) setBusy(current => current?.key === contextKey && current?.worker === worker.key ? null : current)
    }
  }

  const workers = Array.isArray(data?.workers) ? data.workers.filter(worker => Object.hasOwn(names, worker.key)) : []
  const runs = Array.isArray(data?.recent_runs) ? data.recent_runs.filter(run => Object.hasOwn(names, run.worker_key)) : []

  return <div className="automation-center">
    <div className="automation-toolbar">
      <label htmlFor="automation-app">Aplicação
        <select id="automation-app" value={chosenSlug} onChange={e => setChosenSlug(e.target.value)}>
          {!selectedApp && <option value={chosenSlug}>{chosenSlug || 'Selecione uma aplicação'}</option>}
          {apps.map(app => <option value={app.slug || app.app_slug} key={app.id || app.slug || app.app_slug}>{app.name || app.slug || app.app_slug}</option>)}
        </select>
      </label>
      <button type="button" disabled={!canView || loading || Boolean(currentBusy)} onClick={reload}>Atualizar</button>
    </div>
    {!slug && <p>Aplicação não selecionada ou indisponível.</p>}
    {slug && !canView && <p role="alert">Permissão operations.view ou identidade da aplicação indisponível.</p>}
    {data && <p className="automation-summary" role="status">
      <strong>{data.global_enabled ? 'Infraestrutura habilitada' : 'Infraestrutura global desativada'}</strong>
      <span>{workers.filter(w => w.enabled).length} de {workers.length} workers habilitados nesta aplicação.</span>
    </p>}
    {loading && canView && <p role="status">Consultando workers…</p>}
    {currentError && <p role="alert" className="automation-error">{currentError}</p>}
    {currentNotice && <p role="status" className="automation-notice">{currentNotice}</p>}
    {data && <div className="automation-scroll"><table className="automation-table">
      <thead><tr><th>Worker</th><th>Intervalo</th><th>Último despacho</th><th>Estado</th><th>Ações</th></tr></thead>
      <tbody>{workers.map(worker => {
        const pending = runs.some(run => run.worker_key === worker.key && ['queued', 'running'].includes(run.status))
        return <tr key={worker.key}>
          <td><strong>{names[worker.key]}</strong><small>{worker.key}</small></td>
          <td><label className="automation-interval">Minutos
            <select aria-label={'Intervalo de ' + names[worker.key]}
              value={worker.interval_minutes} disabled={!canManage || Boolean(currentBusy)}
              onChange={e => update(worker, 'interval', e.target.value)}>
              {[5, 15, 30, 60, 120, 240, 720, 1440, worker.interval_minutes].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map(min => <option key={min} value={min}>{min}</option>)}
            </select>
          </label></td>
          <td>{formattedDate(worker.last_dispatched_at)}</td>
          <td>{worker.enabled ? 'Habilitado' : 'Pausado'}</td>
          <td className="automation-buttons">
            <button type="button" disabled={!canManage || Boolean(currentBusy)} onClick={() => update(worker, worker.enabled ? 'disable' : 'enable')}>{worker.enabled ? 'Pausar' : 'Ativar'}</button>
            <button type="button" disabled={!canManage || Boolean(currentBusy) || !data.global_enabled || !worker.enabled || pending}
              onClick={() => update(worker, 'run')}>{pending ? 'Na fila' : 'Executar'}</button>
          </td>
        </tr>
      })}</tbody>
    </table></div>}

    {data && <section className="automation-history" aria-label="Últimas execuções">
      <h3>Últimas execuções</h3>
      <div className="automation-scroll"><table className="automation-table">
        <thead><tr><th>Worker</th><th>Status</th><th>Início</th><th>Fim</th><th>Resultado</th></tr></thead>
        <tbody>{runs.length ? runs.map(run => <tr key={run.id}>
          <td>{names[run.worker_key]}<small>{Number.isSafeInteger(run.id) ? '#' + run.id : ''}</small></td>
          <td>{statusNames[run.status] || 'Desconhecido'}</td>
          <td>{formattedDate(run.started_at || run.created_at)}</td>
          <td>{formattedDate(run.finished_at)}</td>
          <td>{safeResult(run.result)}</td>
        </tr>) : <tr><td colSpan="5">Nenhuma execução registrada.</td></tr>}</tbody>
      </table></div>
    </section>}
  </div>
}
