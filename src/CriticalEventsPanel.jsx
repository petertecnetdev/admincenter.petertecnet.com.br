import { useMemo, useState } from 'react'
import { showTextDialog } from './utils/uiDialog.js'
import './CriticalEventsPanel.css'

const fmt = value => value ? new Date(value).toLocaleString('pt-BR') : '—'
const text = value => value == null || value === '' ? '—' : String(value)

function parseContent(content) {
  if (!content) return {}
  if (typeof content === 'object') return content
  try { return JSON.parse(content) || {} } catch { return {} }
}

function fallbackFingerprint(event) {
  const source = [event.http_status, event.method, event.route_name || event.route, event.error_code, event.message]
    .map(value => String(value || '').toLowerCase().replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '{uuid}').replace(/\b\d+\b/g, '{n}'))
    .join('|')
  let hash = 2166136261
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
  return `EVT-${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
}

function normalizeEvent(raw) {
  if (raw?.fingerprint && raw?.occurred_at) return raw
  const content = parseContent(raw?.content)
  const userSnapshot = content.user_snapshot || {}
  const entitySnapshot = content.entity_snapshot || {}
  const status = Number(content.status || 0) || null
  const event = {
    id: raw?.id,
    occurred_at: raw?.created_at,
    interaction_type: raw?.interaction_type,
    outcome: raw?.outcome,
    severity: raw?.severity || 'normal',
    environment: raw?.environment,
    application: {
      id: raw?.app_id || null,
      name: content.app_name || null,
      slug: content.app_slug || null,
      version: content.app_version || null,
    },
    method: raw?.method,
    route: raw?.route || content.path,
    route_name: content.route_name,
    path: content.path,
    frontend_page: content.frontend_page,
    http_status: status,
    error_code: content.error_code || (status ? `HTTP_${status}` : null),
    message: content.error || content.response_message || raw?.name || 'Evento operacional sem mensagem detalhada',
    request_id: raw?.request_id,
    correlation_id: raw?.correlation_id,
    parent_interaction_id: raw?.parent_interaction_id,
    duration_ms: raw?.duration_ms ?? content.duration_ms,
    user: Object.keys(userSnapshot).length ? userSnapshot : (raw?.user_id ? { id: raw.user_id } : null),
    entity: Object.keys(entitySnapshot).length ? entitySnapshot : { type: raw?.entity_type, id: raw?.entity_id, name: raw?.name },
    client: { device: content.device, browser: content.browser, operating_system: content.operating_system },
    network: { ip: content.ip, origin: content.origin, referer: content.referer },
    request_context: { parameters: content.parameters, query: content.query, location: content.location, application_context: content.application_context },
    category: raw?.category || 'operational',
    domain: raw?.domain || 'platform',
    impact_score: raw?.impact_score || 0,
    priority: raw?.priority || 'P3',
  }
  event.fingerprint = fallbackFingerprint(event)
  return event
}

function groupEvents(events) {
  const groups = new Map()
  events.forEach(event => {
    const current = groups.get(event.fingerprint) || {
      fingerprint: event.fingerprint,
      occurrences: 0,
      first_seen_at: event.occurred_at,
      last_seen_at: event.occurred_at,
      severity: event.severity,
      category: event.category,
      domain: event.domain,
      impact_score: event.impact_score,
      priority: event.priority,
      http_status: event.http_status,
      error_code: event.error_code,
      message: event.message,
      application: event.application,
      method: event.method,
      route: event.route,
      sample_request_id: event.request_id,
    }
    current.occurrences += 1
    current.first_seen_at = event.occurred_at
    current.impact_score = Math.max(current.impact_score || 0, event.impact_score || 0)
    if (event.severity === 'critical') current.severity = 'critical'
    groups.set(event.fingerprint, current)
  })
  return [...groups.values()].sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0) || b.occurrences - a.occurrences)
}

function appLabel(application) {
  return application?.name || application?.slug || (application?.id ? `App #${application.id}` : 'Aplicação não identificada')
}

function userLabel(user) {
  return user?.name || user?.email || (user?.id ? `Usuário #${user.id}` : 'Visitante / não identificado')
}

function entityLabel(entity) {
  if (!entity || (!entity.type && !entity.id && !entity.name)) return '—'
  return [entity.type, entity.name, entity.id ? `#${entity.id}` : null].filter(Boolean).join(' · ')
}

function diagnosticText(event) {
  return [
    `Fingerprint: ${event.fingerprint}`,
    `Prioridade: ${text(event.priority)} · impacto ${text(event.impact_score)}/100`,
    `Categoria: ${text(event.category)}`,
    `Domínio: ${text(event.domain)}`,
    `Data: ${fmt(event.occurred_at)}`,
    `Severidade: ${text(event.severity)}`,
    `Resultado: ${text(event.outcome)}`,
    `HTTP: ${text(event.http_status)}`,
    `Código: ${text(event.error_code)}`,
    `Aplicação: ${appLabel(event.application)}`,
    `Rota: ${[event.method, event.route].filter(Boolean).join(' ') || '—'}`,
    `Route name: ${text(event.route_name)}`,
    `Mensagem: ${text(event.message)}`,
    `Request ID: ${text(event.request_id)}`,
    `Correlation ID: ${text(event.correlation_id)}`,
    `Usuário: ${userLabel(event.user)}`,
    `Entidade: ${entityLabel(event.entity)}`,
    `Duração: ${event.duration_ms != null ? `${event.duration_ms} ms` : '—'}`,
    `Ambiente: ${text(event.environment)}`,
    `Página frontend: ${text(event.frontend_page)}`,
  ].join('\n')
}

export default function CriticalEventsPanel({ security, onOpenIssues }) {
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('all')
  const [application, setApplication] = useState('all')
  const [selectedFingerprint, setSelectedFingerprint] = useState('all')
  const [copied, setCopied] = useState('')

  const events = useMemo(() => (security?.events || []).map(normalizeEvent), [security])
  const groups = useMemo(() => security?.groups?.length ? security.groups : groupEvents(events), [security, events])
  const applications = useMemo(() => [...new Set(events.map(event => event.application?.slug || event.application?.name).filter(Boolean))].sort(), [events])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return events.filter(event => {
      const app = event.application?.slug || event.application?.name || ''
      const haystack = [event.fingerprint, event.error_code, event.message, event.route, event.route_name, event.request_id, event.correlation_id, event.category, event.domain, app, event.user?.name, event.user?.email, event.entity?.name]
        .filter(Boolean).join(' ').toLowerCase()
      return (severity === 'all' || event.severity === severity)
        && (application === 'all' || app === application)
        && (selectedFingerprint === 'all' || event.fingerprint === selectedFingerprint)
        && (!needle || haystack.includes(needle))
    })
  }, [events, query, severity, application, selectedFingerprint])

  async function copy(event) {
    const payload = diagnosticText(event)
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(event.fingerprint)
      window.setTimeout(() => setCopied(''), 1800)
    } catch {
      await showTextDialog({
        title: 'Copiar diagnóstico',
        message: 'O navegador não liberou a área de transferência automaticamente. O diagnóstico está selecionável abaixo para cópia manual.',
        textLabel: 'Diagnóstico técnico',
        textValue: payload,
        textRows: 12,
        confirmLabel: 'Fechar',
      })
    }
  }

  return <>
    <div className="cc-security-kpis">
      <Summary title="Críticos" value={security?.critical_events_24h || 0} sub="severidade crítica" danger={security?.critical_events_24h > 0}/>
      <Summary title="Suspeitos" value={security?.suspicious_24h || 0} sub="exigem investigação" danger={security?.suspicious_24h > 0}/>
      <Summary title="Erros" value={security?.errors_24h || 0} sub="resultado classificado como erro" danger={security?.errors_24h > 0}/>
      <Summary title="Atenção" value={security?.attention_24h || 0} sub="alertas não críticos"/>
      <Summary title="Acessos recusados" value={security?.denied_24h || 0} sub="denied ou refused"/>
    </div>

    <div className="cc-diagnostic-metrics">
      <Metric label="Problemas persistentes abertos" value={security?.operational_issues?.open ?? 0}/>
      <Metric label="Problemas distintos na janela" value={security?.unique_issues ?? groups.length}/>
      <Metric label="Repetições detectadas" value={security?.repeated_events ?? Math.max(0, events.length - groups.length)}/>
      <Metric label="Apps impactados" value={security?.impacted_applications?.length ?? applications.length}/>
    </div>

    {security?.truncated && <div className="cc-diag-warning">Há mais eventos no período do que a amostra carregada. Os contadores continuam representando a janela completa.</div>}

    <section className="cc-panel cc-diagnostics-panel">
      <header><div><b>Problemas recorrentes</b><small>Falhas iguais são agrupadas por fingerprint. Categoria, domínio e impacto ajudam a separar ruído de bugs que realmente bloqueiam o ecossistema.</small></div><div className="cc-diag-head-actions"><span className="cc-diag-version">diagnóstico v{security?.diagnostics_version || 1}</span>{onOpenIssues && <button onClick={onOpenIssues}>Gerenciar problemas →</button>}</div></header>
      {groups.length ? <div className="cc-issue-grid">{groups.slice(0, 12).map(group => <button key={group.fingerprint} className={`cc-issue-card ${selectedFingerprint === group.fingerprint ? 'active' : ''}`} onClick={() => setSelectedFingerprint(value => value === group.fingerprint ? 'all' : group.fingerprint)}>
        <div><div className="cc-group-badges"><span className={`cc-priority ${String(group.priority || 'P3').toLowerCase()}`}>{group.priority || 'P3'}</span><Status value={group.severity}/></div><strong>{group.occurrences}×</strong></div>
        <b>{group.message || group.error_code || 'Falha sem mensagem'}</b>
        <small>{group.http_status ? `HTTP ${group.http_status} · ` : ''}{[group.method, group.route].filter(Boolean).join(' ') || 'rota não identificada'}</small>
        <div className="cc-group-meta"><span>{group.category || 'operational'}</span><span>{group.domain || 'platform'}</span><span>impacto {group.impact_score ?? '—'}/100</span></div>
        <footer><code>{group.fingerprint}</code><span>{appLabel(group.application)}</span></footer>
      </button>)}</div> : <p className="cc-empty">Nenhum problema recorrente na janela analisada.</p>}
    </section>

    <section className="cc-panel cc-diagnostics-panel">
      <header><div><b>Eventos críticos detalhados</b><small>Abra uma ocorrência para reproduzir, localizar e corrigir o problema com contexto técnico completo.</small></div><span className="cc-diag-count">{filtered.length} exibido(s)</span></header>

      <div className="cc-diag-filters">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar erro, rota, domínio, request ID, usuário, entidade..." />
        <select value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">Todas severidades</option><option value="critical">Crítico</option><option value="suspicious">Suspeito</option><option value="attention">Atenção</option></select>
        <select value={application} onChange={event => setApplication(event.target.value)}><option value="all">Todas aplicações</option>{applications.map(app => <option key={app} value={app}>{app}</option>)}</select>
        {(selectedFingerprint !== 'all' || query || severity !== 'all' || application !== 'all') && <button onClick={() => { setQuery(''); setSeverity('all'); setApplication('all'); setSelectedFingerprint('all') }}>Limpar filtros</button>}
      </div>

      <div className="cc-event-list">
        {filtered.length ? filtered.map(event => <details className={`cc-event ${event.severity}`} key={event.id || `${event.fingerprint}-${event.occurred_at}`}>
          <summary>
            <div className="cc-event-main"><Status value={event.severity}/><span className="cc-http">{event.http_status ? `HTTP ${event.http_status}` : event.outcome || 'evento'}</span><b>{event.message}</b></div>
            <div className="cc-event-route"><code>{[event.method, event.route].filter(Boolean).join(' ') || 'rota não identificada'}</code><span>{appLabel(event.application)}</span></div>
            <div className="cc-event-time"><span>{fmt(event.occurred_at)}</span><code>{event.fingerprint}</code></div>
          </summary>
          <div className="cc-event-body">
            <div className="cc-event-actions"><button onClick={() => copy(event)}>{copied === event.fingerprint ? 'Diagnóstico copiado' : 'Copiar diagnóstico'}</button></div>
            <div className="cc-detail-grid">
              <Detail label="Prioridade / impacto" value={`${event.priority || 'P3'} · ${event.impact_score ?? 0}/100`}/><Detail label="Categoria" value={event.category}/><Detail label="Domínio genérico" value={event.domain}/><Detail label="Severidade" value={event.severity}/>
              <Detail label="Mensagem" value={event.message}/><Detail label="Código do erro" value={event.error_code}/><Detail label="HTTP" value={event.http_status}/><Detail label="Resultado" value={event.outcome}/>
              <Detail label="Aplicação" value={appLabel(event.application)}/><Detail label="Versão" value={event.application?.version}/><Detail label="Método / rota" value={[event.method, event.route].filter(Boolean).join(' ')}/><Detail label="Route name" value={event.route_name}/>
              <Detail label="Request ID" value={event.request_id} mono/><Detail label="Correlation ID" value={event.correlation_id} mono/><Detail label="Duração" value={event.duration_ms != null ? `${event.duration_ms} ms` : null}/><Detail label="Página frontend" value={event.frontend_page}/>
              <Detail label="Usuário" value={userLabel(event.user)}/><Detail label="Perfil" value={event.user?.profile}/><Detail label="Entidade" value={entityLabel(event.entity)}/><Detail label="IP" value={event.network?.ip} mono/>
              <Detail label="Cliente" value={[event.client?.device, event.client?.browser, event.client?.operating_system].filter(Boolean).join(' · ')}/><Detail label="Origem" value={event.network?.origin}/><Detail label="Referer" value={event.network?.referer}/><Detail label="Ocorrências iguais" value={event.occurrence_count || groups.find(group => group.fingerprint === event.fingerprint)?.occurrences || 1}/>
            </div>
            {event.request_context && Object.values(event.request_context).some(Boolean) && <details className="cc-context"><summary>Contexto técnico estruturado</summary><pre>{JSON.stringify(event.request_context, null, 2)}</pre></details>}
          </div>
        </details>) : <p className="cc-empty">Nenhum evento corresponde aos filtros atuais.</p>}
      </div>
    </section>
  </>
}

function Summary({ title, value, sub, danger }) { return <article className={`cc-kpi ${danger ? 'danger' : ''}`}><span>{title}</span><strong>{value ?? '—'}</strong><small>{sub}</small></article> }
function Metric({ label, value }) { return <article><span>{label}</span><strong>{value ?? '—'}</strong></article> }
function Status({ value }) { const normalized = String(value || 'unknown'); return <span className={`cc-status ${normalized}`}>{normalized.replaceAll('_', ' ')}</span> }
function Detail({ label, value, mono = false }) { return <div><span>{label}</span><b className={mono ? 'mono' : ''}>{text(value)}</b></div> }
