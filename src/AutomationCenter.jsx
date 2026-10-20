import { useCallback, useEffect, useRef, useState } from 'react'
import './AutomationCenter.css'

const names = {
  discovery_quality: 'Qualidade dos candidatos',
  discovery_health: 'Saúde das fontes',
  catalog_quality: 'Qualidade do catálogo',
  candidate_freshness: 'Atualização de candidatos',
}
const statusNames = { queued: 'Na fila', running: 'Executando', succeeded: 'Concluído', failed: 'Falhou', skipped: 'Ignorado' }
function formattedDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AutomationCenter({ applications = [], request }) {
  const apps = applications.filter(app => app.slug || app.app_slug)
  const [chosenSlug, setChosenSlug] = useState('')
  const selectedApp = apps.find(app => (app.slug || app.app_slug) === chosenSlug)
    || apps.find(app => (app.slug || app.app_slug) === 'cutinapp') || apps[0]
  const slug = String(selectedApp?.slug || selectedApp?.app_slug || '')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)

  const reload = useCallback(async () => {
    if (!slug) { setData(null); return }
    const id = ++generation.current
    setLoading(true)
    setError('')
    try {
      const answer = await request('/v1/apps/' + encodeURIComponent(slug) + '/admin/automations', { force: true })
      if (generation.current === id) setData(answer?.data || null)
    } catch (e) {
      if (generation.current === id) {
        setData(null)
        setError(e?.message || 'Não foi possível consultar os workers.')
      }
    } finally {
      if (generation.current === id) setLoading(false)
    }
  }, [request, slug])

  useEffect(() => {
    setData(null)
    setNotice('')
    reload()
    return () => { generation.current += 1 }
  }, [reload])

  async function update(worker, change, interval = worker.interval_minutes) {
    if (!slug || busy) return
    setBusy(worker.key)
    setError('')
    setNotice('')
    const url = '/v1/apps/' + encodeURIComponent(slug) + '/admin/automations/workers/' + encodeURIComponent(worker.key)
    try {
      if (change === 'run') {
        await request(url + '/dispatch', { method: 'POST', body: '{}' })
        setNotice('Execução encaminhada para a fila.')
      } else {
        await request(url, {
          method: 'PUT',
          body: JSON.stringify({ enabled: change === 'interval' ? worker.enabled : change === 'enable', interval_minutes: Number(interval) }),
        })
        setNotice('Configuração salva.')
      }
      await reload()
    } catch (e) {
      setError(e?.message || 'Falha ao atualizar o worker.')
    } finally {
      setBusy('')
    }
  }

  const workers = data?.workers || []
  const runs = data?.recent_runs || []

  return <div className="automation-center">
    <div className="automation-toolbar">
      <label htmlFor="automation-app">Aplicação
        <select id="automation-app" value={slug} disabled={Boolean(busy)} onChange={e => setChosenSlug(e.target.value)}>
          {apps.map(app => <option value={app.slug || app.app_slug} key={app.id || app.slug || app.app_slug}>{app.name || app.slug || app.app_slug}</option>)}
        </select>
      </label>
      <button type="button" disabled={!slug || loading || Boolean(busy)} onClick={reload}>Atualizar</button>
    </div>
    {!slug && <p>Nenhuma aplicação disponível.</p>}
    {data && <p className="automation-summary" role="status">
      <strong>{data.global_enabled ? 'Infraestrutura habilitada' : 'Infraestrutura global desativada'}</strong>
      <span>{workers.filter(w => w.enabled).length} de {workers.length} workers habilitados nesta aplicação.</span>
    </p>}
    {loading && <p role="status">Consultando workers…</p>}
    {error && <p role="alert" className="automation-error">{error}</p>}
    {notice && <p role="status" className="automation-notice">{notice}</p>}
    {data && <div className="automation-scroll"><table className="automation-table">
      <thead><tr><th>Worker</th><th>Intervalo</th><th>Último despacho</th><th>Estado</th><th>Ações</th></tr></thead>
      <tbody>{workers.map(worker => {
        const pending = runs.some(run => run.worker_key === worker.key && ['queued', 'running'].includes(run.status))
        return <tr key={worker.key}>
          <td><strong>{names[worker.key] || worker.key}</strong><small>{worker.key}</small></td>
          <td><label className="automation-interval">Minutos
            <select aria-label={'Intervalo de ' + (names[worker.key] || worker.key)}
              value={worker.interval_minutes} disabled={Boolean(busy)}
              onChange={e => update(worker, 'interval', e.target.value)}>
              {[5, 15, 30, 60, 120, 240, 720, 1440, worker.interval_minutes].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map(min => <option key={min} value={min}>{min}</option>)}
            </select>
          </label></td>
          <td>{formattedDate(worker.last_dispatched_at)}</td>
          <td>{worker.enabled ? 'Habilitado' : 'Pausado'}</td>
          <td className="automation-buttons">
            <button type="button" disabled={Boolean(busy)} onClick={() => update(worker, worker.enabled ? 'disable' : 'enable')}>{worker.enabled ? 'Pausar' : 'Ativar'}</button>
            <button type="button" disabled={Boolean(busy) || !data.global_enabled || !worker.enabled || pending}
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
          <td>{names[run.worker_key] || run.worker_key}<small>#{run.id}</small></td>
          <td>{statusNames[run.status] || run.status}</td>
          <td>{formattedDate(run.started_at || run.created_at)}</td>
          <td>{formattedDate(run.finished_at)}</td>
          <td>{run.error_type || (run.result ? Object.entries(run.result).map(([key, value]) => key + ': ' + value).join(' · ') : '—')}</td>
        </tr>) : <tr><td colSpan="5">Nenhuma execução registrada.</td></tr>}</tbody>
      </table></div>
    </section>}
  </div>
}
