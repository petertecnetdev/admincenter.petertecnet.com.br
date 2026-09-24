import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './AgentChatPanel.css'

const STATUS_LABELS = {
  NEW: 'Nova',
  ASSIGNED: 'Atribuída',
  RUNNING: 'Executando',
  WAITING: 'Aguardando',
  REVIEW: 'Revisão',
  DONE: 'Concluída',
  BLOCKED: 'Bloqueada',
  NEEDS_OWNER_DECISION: 'Decisão necessária',
  CANCELLED: 'Cancelada',
}

const EMPTY_LIST = Object.freeze([])

const PRIORITY_LABELS = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  NORMAL: 'Normal',
  LOW: 'Baixa',
}

function statusTone(status) {
  const value = String(status || '').toUpperCase()
  if (['DONE', 'ACTIVE'].includes(value)) return 'done'
  if (['BLOCKED', 'NEEDS_OWNER_DECISION'].includes(value)) return 'blocked'
  if (value === 'REVIEW') return 'review'
  if (['RUNNING', 'START', 'READING'].includes(value)) return 'start'
  if (['QUESTION', 'WAITING', 'ASSIGNED'].includes(value)) return 'question'
  return 'info'
}

function adminMessage(message) {
  const author = String(message?.author || '').toLowerCase()
  return author.includes('pedro') || author.includes('peter tecnet admin') || author === 'owner'
}

function formatDate(value) {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function messageDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) BRT$/)
  if (!match) return null
  const date = new Date(`${match[1]}T${match[2]}:00-03:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function presenceLabel(agent) {
  if (agent?.presence === 'ACTIVE') return 'Ativo recentemente'
  if (agent?.presence === 'RECENT') return 'Executou recentemente'
  if (agent?.presence === 'STALE') return 'Sem execução recente'
  return 'Aguardando primeira leitura'
}

function taskLabel(task) {
  if (!task) return 'Sem tarefa'
  return `${task.task_id} · ${task.title}`
}

export default function AgentChatPanel({ request }) {
  const [messages, setMessages] = useState([])
  const [control, setControl] = useState({ agents: [], tasks: [], metrics: {}, registry: {} })
  const [target, setTarget] = useState('@todos')
  const [context, setContext] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [taskId, setTaskId] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [error, setError] = useState('')
  const [writeEnabled, setWriteEnabled] = useState(true)
  const [sourceUrl, setSourceUrl] = useState('')
  const [syncedAt, setSyncedAt] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState('OPEN')
  const [newMessages, setNewMessages] = useState(0)
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigned_agent_id: '',
    application_context: '',
    repository: '',
    priority: 'NORMAL',
    review_required: false,
    tags: '',
  })
  const endRef = useRef(null)
  const mountedRef = useRef(true)
  const previousMessageIds = useRef(new Set())

  const agents = control?.agents || EMPTY_LIST
  const tasks = control?.tasks || EMPTY_LIST
  const applications = control?.registry?.applications || EMPTY_LIST
  const metrics = control?.metrics || {}
  const selectedTaskRow = tasks.find(task => task.task_id === selectedTask) || null

  const visibleTasks = useMemo(() => {
    return tasks.filter(task => {
      if (selectedAgent && task.assigned_agent_id !== selectedAgent && task.owner_agent_id !== selectedAgent) return false
      if (context && task.application_context !== context) return false
      if (taskStatusFilter === 'OPEN' && ['DONE', 'CANCELLED'].includes(task.status)) return false
      if (taskStatusFilter !== 'ALL' && taskStatusFilter !== 'OPEN' && task.status !== taskStatusFilter) return false
      return true
    })
  }, [tasks, selectedAgent, context, taskStatusFilter])

  const visibleMessages = useMemo(() => {
    return messages.filter(message => {
      if (selectedAgent) {
        const agentTarget = `@${selectedAgent}`
        const related = message.to === agentTarget || message.author?.startsWith(selectedAgent) || message.to === '@todos'
        if (!related) return false
      }
      if (context && message.application_context && message.application_context !== context) return false
      if (selectedTask && message.task_id && message.task_id !== selectedTask) return false
      return true
    }).slice(-250)
  }, [messages, selectedAgent, context, selectedTask])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)

    try {
      const [chatPayload, controlPayload] = await Promise.all([
        request('/admin/ecosystem/agents/chat', { timeout: 18000 }),
        request('/admin/ecosystem/agents/control', { timeout: 20000 }),
      ])
      if (!mountedRef.current) return

      const nextMessages = Array.isArray(chatPayload?.messages) ? chatPayload.messages : []
      if (previousMessageIds.current.size > 0) {
        const unseen = nextMessages.filter(message => !previousMessageIds.current.has(message.id))
        if (unseen.length) setNewMessages(current => current + unseen.length)
      }
      previousMessageIds.current = new Set(nextMessages.map(message => message.id))

      setMessages(nextMessages)
      setControl(controlPayload || { agents: [], tasks: [], metrics: {}, registry: {} })
      setWriteEnabled(chatPayload?.write_enabled !== false)
      setSourceUrl(chatPayload?.source_url || '')
      setSyncedAt(chatPayload?.synced_at || controlPayload?.synced_at || '')
      setError('')
    } catch (loadError) {
      if (mountedRef.current && !quiet) {
        setError(loadError?.message || 'Não foi possível carregar a Central dos Agentes.')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [request])

  useEffect(() => {
    mountedRef.current = true
    const initialTimer = window.setTimeout(() => { void load() }, 0)

    const timer = window.setInterval(() => {
      const active = document.querySelector('.admin-shell')?.dataset?.adminPage === 'agents'
      if (document.visibilityState === 'visible' && active) void load({ quiet: true })
    }, 60000)

    const onVisibility = () => {
      const active = document.querySelector('.admin-shell')?.dataset?.adminPage === 'agents'
      if (document.visibilityState === 'visible' && active) void load({ quiet: true })
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth', block: 'end' })
  }, [visibleMessages.length, loading])

  async function send() {
    const message = text.trim()
    if (!message || sending || !writeEnabled) return

    setSending(true)
    setError('')

    try {
      const payload = await request('/admin/ecosystem/agents/chat', {
        method: 'POST',
        timeout: 20000,
        body: JSON.stringify({
          message,
          to: target,
          task_id: taskId || null,
          application_context: context || null,
          priority,
          type: 'REQUEST',
          subject: taskId ? `Ordem vinculada a ${taskId}` : 'Mensagem do Admin Center',
        }),
      })

      setText('')
      if (payload?.message) {
        setMessages(current => current.some(item => item.id === payload.message.id) ? current : [...current, payload.message])
      }
      setWriteEnabled(payload?.write_enabled !== false)
    } catch (sendError) {
      if (sendError?.status === 503) setWriteEnabled(false)
      setError(sendError?.message || 'Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  async function createTask(event) {
    event.preventDefault()
    if (!taskForm.title.trim() || creatingTask) return

    setCreatingTask(true)
    setError('')

    try {
      const payload = await request('/admin/ecosystem/agents/tasks', {
        method: 'POST',
        timeout: 20000,
        body: JSON.stringify({
          ...taskForm,
          title: taskForm.title.trim(),
          description: taskForm.description.trim(),
          repository: taskForm.repository.trim() || null,
          assigned_agent_id: taskForm.assigned_agent_id || null,
          application_context: taskForm.application_context || null,
          tags: taskForm.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        }),
      })

      if (payload?.task) {
        setControl(current => ({ ...current, tasks: [payload.task, ...(current.tasks || [])] }))
        setSelectedTask(payload.task.task_id)
        setTaskId(payload.task.task_id)
      }

      setTaskForm({
        title: '',
        description: '',
        assigned_agent_id: '',
        application_context: '',
        repository: '',
        priority: 'NORMAL',
        review_required: false,
        tags: '',
      })
      await load({ quiet: true })
    } catch (taskError) {
      setError(taskError?.message || 'Não foi possível criar a tarefa.')
    } finally {
      setCreatingTask(false)
    }
  }

  async function patchTask(patch) {
    if (!selectedTaskRow || savingTask) return
    setSavingTask(true)
    setError('')

    try {
      await request(`/admin/ecosystem/agents/tasks/${selectedTaskRow.task_id}`, {
        method: 'PATCH',
        timeout: 20000,
        body: JSON.stringify(patch),
      })

      setControl(current => ({
        ...current,
        tasks: (current.tasks || []).map(task => task.task_id === selectedTaskRow.task_id
          ? { ...task, ...patch, sync_status: 'pending' }
          : task),
      }))
      await load({ quiet: true })
    } catch (taskError) {
      setError(taskError?.message || 'Não foi possível atualizar a tarefa.')
    } finally {
      setSavingTask(false)
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  function readState(message) {
    if (!adminMessage(message)) return null
    const sentAt = messageDate(message.timestamp)
    if (!sentAt) return null

    const targetId = String(message.to || '').replace(/^@/, '')
    const recipients = targetId === 'todos'
      ? agents
      : agents.filter(agent => agent.id === targetId)

    if (!recipients.length) return null

    const read = recipients.filter(agent => {
      const exactReceipts = Array.isArray(agent?.state?.read_message_ids) ? agent.state.read_message_ids : []
      if (message.message_id && exactReceipts.includes(message.message_id)) return true
      const readAt = agent.last_read_at ? new Date(agent.last_read_at) : null
      return readAt && !Number.isNaN(readAt.getTime()) && readAt >= sentAt
    })

    return { read: read.length, total: recipients.length }
  }

  if (loading) return <article className="agent-control-shell">
    <div className="agent-control-loading"><span/><span/><span/><p>Carregando identidades, tarefas e conversa compartilhada…</p></div>
  </article>

  return <div className="agent-control">
    <section className="agent-control-top">
      <div>
        <span className="agent-chat-live"><i/>AGENT CONTROL / GITHUB</span>
        <h3>Central dos Agentes</h3>
        <p>Controle as contas externas do ChatGPT sem confundir identidade do agente com a plataforma em que ele está trabalhando.</p>
      </div>
      <div className="agent-chat-actions">
        {newMessages > 0 && <button className="new-message-chip" onClick={() => { setNewMessages(0); endRef.current?.scrollIntoView({ behavior: 'smooth' }) }}>{newMessages} nova(s)</button>}
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Histórico no GitHub ↗</a>}
        <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing}>{refreshing ? 'Atualizando…' : 'Atualizar'}</button>
      </div>
    </section>

    {error && <div className="agent-chat-error" role="alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

    <section className="agent-metrics">
      <div><span>Agentes registrados</span><b>{metrics.agents_total ?? agents.length}</b><small>{metrics.agents_active || 0} ativos recentemente</small></div>
      <div><span>Executando</span><b>{metrics.tasks_running || 0}</b><small>tarefas com lock ativo</small></div>
      <div><span>Revisão</span><b>{metrics.tasks_review || 0}</b><small>aguardando validação</small></div>
      <div><span>Bloqueios</span><b>{metrics.tasks_blocked || 0}</b><small>inclui decisão do proprietário</small></div>
      <div><span>Concluídas</span><b>{metrics.tasks_done || 0}</b><small>com histórico persistente</small></div>
    </section>

    <section className="agent-control-filters">
      <label>Agente
        <select value={selectedAgent} onChange={event => setSelectedAgent(event.target.value)}>
          <option value="">Todos</option>
          {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.display_name}</option>)}
        </select>
      </label>
      <label>Plataforma / contexto
        <select value={context} onChange={event => setContext(event.target.value)}>
          <option value="">Todos os contextos</option>
          {applications.map(app => <option key={app} value={app}>{app}</option>)}
        </select>
      </label>
      <label>Tarefas
        <select value={taskStatusFilter} onChange={event => setTaskStatusFilter(event.target.value)}>
          <option value="OPEN">Abertas</option>
          <option value="RUNNING">Executando</option>
          <option value="REVIEW">Revisão</option>
          <option value="BLOCKED">Bloqueadas</option>
          <option value="NEEDS_OWNER_DECISION">Decisão necessária</option>
          <option value="DONE">Concluídas</option>
          <option value="ALL">Todas</option>
        </select>
      </label>
    </section>

    <section className="agent-control-grid">
      <aside className="agent-roster-panel">
        <div className="panel-heading"><div><small>CONTAS CHATGPT</small><b>Agentes registrados</b></div><span>{agents.length}</span></div>
        <div className="agent-roster-list">
          {agents.map(agent => <button
            type="button"
            key={agent.id}
            className={selectedAgent === agent.id ? 'agent-roster-card selected' : 'agent-roster-card'}
            onClick={() => setSelectedAgent(current => current === agent.id ? '' : agent.id)}
          >
            <span className={`agent-presence ${String(agent.presence || '').toLowerCase()}`}/>
            <div className="agent-roster-copy">
              <b>{agent.id}</b>
              <strong>{agent.display_name?.replace(`${agent.id} · `, '') || agent.role}</strong>
              <small>{presenceLabel(agent)}</small>
              <small>Última leitura: {formatDate(agent.last_read_at)}</small>
              {agent.current_task_id && <em>{agent.current_task_id}</em>}
            </div>
          </button>)}
        </div>
      </aside>

      <main className="agent-conversation-panel">
        <header className="agent-conversation-head">
          <div><small>CONVERSA COMPARTILHADA</small><b>{selectedAgent ? `Mensagens relacionadas a ${selectedAgent}` : 'Todos os agentes'}</b></div>
          <span>{visibleMessages.length} mensagens</span>
        </header>

        <div className="agent-chat-body" aria-live="polite">
          {visibleMessages.length ? visibleMessages.map(message => {
            const mine = adminMessage(message)
            const receipt = readState(message)
            return <div className={`agent-chat-row ${mine ? 'mine' : ''}`} key={message.id}>
              <div className="agent-chat-avatar">{String(message.author || 'A').slice(0, 2).toUpperCase()}</div>
              <div className={`agent-chat-bubble tone-${statusTone(message.status || message.type)}`}>
                <div className="agent-chat-meta">
                  <b>{message.author || 'Agente'}</b>
                  <span>{message.to || '@todos'}</span>
                  <i>{message.sync_status === 'pending' ? 'SINCRONIZANDO' : (message.status || message.type || 'INFO')}</i>
                </div>
                <div className="agent-message-links">
                  {message.priority && <span className={`priority-${String(message.priority).toLowerCase()}`}>{PRIORITY_LABELS[message.priority] || message.priority}</span>}
                  {message.application_context && <span>{message.application_context}</span>}
                  {message.task_id && <button type="button" onClick={() => { setSelectedTask(message.task_id); setTaskId(message.task_id) }}>{message.task_id}</button>}
                </div>
                {message.subject && message.subject !== 'Mensagem do Admin Center' && <strong className="agent-chat-subject">{message.subject}</strong>}
                <p>{message.message}</p>
                <div className="agent-chat-foot">
                  <time>{message.timestamp}</time>
                  {receipt && <span>{receipt.read === receipt.total ? '✓✓' : '✓'} Lido por {receipt.read}/{receipt.total}</span>}
                  {message.sync_status === 'pending'
                    ? <span>Salva na fila · sincronizando</span>
                    : message.commit && message.commit !== 'n/a' && <span>Commit/PR: {message.commit}</span>}
                </div>
              </div>
            </div>
          }) : <div className="agent-chat-empty"><b>Nenhuma mensagem neste filtro.</b><span>Altere os filtros ou envie uma nova ordem.</span></div>}
          <div ref={endRef}/>
        </div>

        <footer className="agent-chat-composer">
          <div className="agent-composer-meta">
            <label>Destinatário
              <select value={target} onChange={event => setTarget(event.target.value)}>
                <option value="@todos">Todos os agentes</option>
                {agents.map(agent => <option key={agent.id} value={`@${agent.id}`}>{agent.display_name}</option>)}
              </select>
            </label>
            <label>Prioridade
              <select value={priority} onChange={event => setPriority(event.target.value)}>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Vincular tarefa
              <select value={taskId} onChange={event => setTaskId(event.target.value)}>
                <option value="">Sem tarefa</option>
                {tasks.filter(task => !['DONE', 'CANCELLED'].includes(task.status)).map(task => <option key={task.task_id} value={task.task_id}>{taskLabel(task)}</option>)}
              </select>
            </label>
          </div>
          <div className="agent-chat-input">
            <textarea
              value={text}
              onChange={event => setText(event.target.value.slice(0, 5000))}
              onKeyDown={onKeyDown}
              placeholder="Digite uma ordem, pergunta ou decisão para os agentes…"
              disabled={!writeEnabled || sending}
              rows="3"
            />
            <div>
              <small>{text.length}/5000 · Enter envia · não envie senhas, tokens ou segredos</small>
              <button type="button" className="agent-chat-send" onClick={() => void send()} disabled={!text.trim() || sending || !writeEnabled}>{sending ? 'Enviando…' : 'Enviar'} <span>↗</span></button>
            </div>
          </div>
        </footer>
      </main>

      <aside className="agent-task-panel">
        <div className="panel-heading"><div><small>WORK QUEUE</small><b>Tarefas</b></div><span>{visibleTasks.length}</span></div>
        <div className="agent-task-list">
          {visibleTasks.length ? visibleTasks.map(task => <button
            type="button"
            key={task.task_id}
            className={selectedTask === task.task_id ? 'agent-task-card selected' : 'agent-task-card'}
            onClick={() => { setSelectedTask(task.task_id); setTaskId(task.task_id) }}
          >
            <div><span className={`task-priority ${String(task.priority || '').toLowerCase()}`}>{PRIORITY_LABELS[task.priority] || task.priority}</span><i className={`task-status ${statusTone(task.status)}`}>{STATUS_LABELS[task.status] || task.status}</i></div>
            <b>{task.title}</b>
            <small>{task.task_id}</small>
            <p>{task.application_context || 'geral'} · {task.assigned_agent_id || 'não atribuída'}</p>
            {task.assigned_agent_id && agents.find(agent => agent.id === task.assigned_agent_id)?.state?.received_task_ids?.includes(task.task_id) && <em>✓ Recebida pelo agente</em>}
            {task.lock?.owner_agent_id && <em>{task.lock_expired ? 'Lock expirado' : `Lock: ${task.lock.owner_agent_id}`}</em>}
            {task.sync_status === 'pending' && <em>Sincronizando…</em>}
          </button>) : <div className="agent-task-empty">Nenhuma tarefa neste filtro.</div>}
        </div>
      </aside>
    </section>

    <section className="agent-control-lower">
      <form className="agent-task-create" onSubmit={createTask}>
        <div className="panel-heading"><div><small>NOVA ORDEM ESTRUTURADA</small><b>Criar tarefa</b></div></div>
        <label>Título<input value={taskForm.title} onChange={event => setTaskForm(current => ({ ...current, title: event.target.value }))} placeholder="Ex.: revisar checkout antes do deploy" required/></label>
        <label>Descrição<textarea value={taskForm.description} onChange={event => setTaskForm(current => ({ ...current, description: event.target.value }))} rows="4" placeholder="Resultado esperado, restrições e critérios de conclusão."/></label>
        <div className="task-form-grid">
          <label>Agente<select value={taskForm.assigned_agent_id} onChange={event => setTaskForm(current => ({ ...current, assigned_agent_id: event.target.value }))}><option value="">Fila geral</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.display_name}</option>)}</select></label>
          <label>Contexto<select value={taskForm.application_context} onChange={event => setTaskForm(current => ({ ...current, application_context: event.target.value }))}><option value="">Geral</option>{applications.map(app => <option key={app} value={app}>{app}</option>)}</select></label>
          <label>Prioridade<select value={taskForm.priority} onChange={event => setTaskForm(current => ({ ...current, priority: event.target.value }))}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label>Repositório<input value={taskForm.repository} onChange={event => setTaskForm(current => ({ ...current, repository: event.target.value }))} placeholder="petertecnetdev/cutinapp.petertecnet.com.br"/></label>
        <label>Tags<input value={taskForm.tags} onChange={event => setTaskForm(current => ({ ...current, tags: event.target.value }))} placeholder="payments, production, security"/></label>
        <label className="agent-checkbox"><input type="checkbox" checked={taskForm.review_required} onChange={event => setTaskForm(current => ({ ...current, review_required: event.target.checked }))}/><span>Exigir revisão de outro agente antes da conclusão</span></label>
        <button className="agent-chat-send" disabled={creatingTask}>{creatingTask ? 'Criando…' : 'Criar tarefa'} <span>＋</span></button>
      </form>

      <article className="agent-task-detail">
        <div className="panel-heading"><div><small>DETALHES</small><b>{selectedTaskRow ? selectedTaskRow.task_id : 'Selecione uma tarefa'}</b></div></div>
        {selectedTaskRow ? <>
          <div className="task-detail-head">
            <div><h4>{selectedTaskRow.title}</h4><p>{selectedTaskRow.description || 'Sem descrição adicional.'}</p></div>
            <span className={`task-priority ${String(selectedTaskRow.priority || '').toLowerCase()}`}>{PRIORITY_LABELS[selectedTaskRow.priority] || selectedTaskRow.priority}</span>
          </div>
          <div className="task-detail-grid">
            <div><small>Status</small><b>{STATUS_LABELS[selectedTaskRow.status] || selectedTaskRow.status}</b></div>
            <div><small>Agente atribuído</small><b>{selectedTaskRow.assigned_agent_id || 'Fila geral'}</b></div>
            <div><small>Contexto</small><b>{selectedTaskRow.application_context || 'geral'}</b></div>
            <div><small>Versão</small><b>{selectedTaskRow.version || 1}</b></div>
          </div>
          <div className="task-checkpoint"><small>Checkpoint</small><p>{selectedTaskRow.checkpoint || 'Nenhum checkpoint registrado ainda.'}</p><small>Próxima ação</small><p>{selectedTaskRow.next_action || 'Não definida.'}</p></div>
          {selectedTaskRow.blocker && <div className="task-blocker"><b>Bloqueio</b><p>{selectedTaskRow.blocker}</p></div>}
          <div className="task-review"><span>Revisão: <b>{selectedTaskRow.review?.status || 'NOT_REQUIRED'}</b></span>{selectedTaskRow.review?.reviewer_agent_id && <span>Revisor: <b>{selectedTaskRow.review.reviewer_agent_id}</b></span>}</div>
          <div className="task-owner-controls">
            <label>Atribuir
              <select value={selectedTaskRow.assigned_agent_id || ''} onChange={event => void patchTask({ assigned_agent_id: event.target.value || null, status: event.target.value ? 'ASSIGNED' : 'NEW' })} disabled={savingTask}>
                <option value="">Fila geral</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.id}</option>)}
              </select>
            </label>
            <label>Prioridade
              <select value={selectedTaskRow.priority || 'NORMAL'} onChange={event => void patchTask({ priority: event.target.value })} disabled={savingTask}>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Status
              <select value={selectedTaskRow.status || 'NEW'} onChange={event => void patchTask({ status: event.target.value })} disabled={savingTask}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" className="danger-task-action" onClick={() => void patchTask({ status: 'CANCELLED', next_action: 'Interrompida pelo OWNER no Admin Center.' })} disabled={savingTask || selectedTaskRow.status === 'CANCELLED'}>Interromper</button>
          </div>
          <div className="task-history">
            <small>Histórico recente</small>
            {(selectedTaskRow.history || []).slice(-6).reverse().map((event, index) => <div key={event.operation_id || index}><b>{event.event || 'UPDATE'}</b><span>{event.actor || 'agente'} · {formatDate(event.at)}</span><p>{event.message || event.summary || ''}</p></div>)}
          </div>
          <div className="task-evidence">
            <small>Evidências</small>
            {selectedTaskRow.evidence?.length ? selectedTaskRow.evidence.map((item, index) => <div key={item.id || index}><b>{item.type || 'evidência'}</b><span>{item.ref || item.url || item.label || JSON.stringify(item)}</span></div>) : <p>Nenhuma evidência registrada.</p>}
          </div>
        </> : <div className="agent-task-empty large">Clique em uma tarefa para ver checkpoint, lock, revisão, bloqueios e evidências.</div>}
      </article>
    </section>

    <footer className="agent-control-foot">
      <span><i/> GitHub é a memória compartilhada · atualizações dos agentes dependem das execuções autorizadas de cada conta</span>
      <small>{syncedAt ? `Sincronizado às ${new Date(syncedAt).toLocaleTimeString('pt-BR')}` : 'Aguardando sincronização'}</small>
    </footer>
  </div>
}
