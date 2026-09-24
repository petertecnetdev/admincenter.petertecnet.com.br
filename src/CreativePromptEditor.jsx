import { useCallback, useEffect, useRef, useState } from 'react'
import { confirmAction } from './utils/uiDialog.js'
import './CreativePromptEditor.css'

const PROMPT_KEY = 'event_flyer_background'
const MAX_LENGTH = 1600

export default function CreativePromptEditor({ request }) {
  const textareaRef = useRef(null)
  const [prompt, setPrompt] = useState(null)
  const [template, setTemplate] = useState('')
  const [baseline, setBaseline] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await request(`/admin/ecosystem/creative/prompts/${PROMPT_KEY}`)
      const current = payload?.prompt
      if (!current?.template) throw new Error('O prompt da IA não pôde ser carregado.')
      setPrompt(current)
      setTemplate(current.template)
      setBaseline(current.template)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    load()
  }, [load])

  const changed = template !== baseline

  function insertVariable(token) {
    const textarea = textareaRef.current
    if (!textarea) {
      setTemplate(current => `${current}${current ? ' ' : ''}${token}`)
      return
    }

    const start = textarea.selectionStart ?? template.length
    const end = textarea.selectionEnd ?? start
    const next = `${template.slice(0, start)}${token}${template.slice(end)}`
    setTemplate(next.slice(0, MAX_LENGTH))
    requestAnimationFrame(() => {
      const cursor = Math.min(start + token.length, MAX_LENGTH)
      textarea.focus()
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  async function save() {
    if (!changed || saving) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = await request(`/admin/ecosystem/creative/prompts/${PROMPT_KEY}`, {
        method: 'PUT',
        body: JSON.stringify({ template }),
      })
      const current = payload?.prompt
      if (!current?.template) throw new Error('A API não retornou a versão salva do prompt.')
      setPrompt(current)
      setTemplate(current.template)
      setBaseline(current.template)
      setSuccess(payload?.message || 'Prompt atualizado com sucesso.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (resetting) return
    const confirmed = await confirmAction({
      tone: 'danger',
      eyebrow: 'PROMPT DA IA',
      title: 'Restaurar prompt padrão?',
      message: 'O prompt personalizado atual deixará de ser usado nas próximas imagens e o padrão da Peter Tecnet voltará a valer.',
      confirmLabel: 'Restaurar padrão',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return

    setResetting(true)
    setError('')
    setSuccess('')
    try {
      const payload = await request(`/admin/ecosystem/creative/prompts/${PROMPT_KEY}`, { method: 'DELETE' })
      const current = payload?.prompt
      if (!current?.template) throw new Error('A API não retornou o prompt padrão.')
      setPrompt(current)
      setTemplate(current.template)
      setBaseline(current.template)
      setSuccess(payload?.message || 'Prompt padrão restaurado.')
    } catch (err) {
      setError(err.message)
    } finally {
      setResetting(false)
    }
  }

  const status = prompt?.is_custom ? `Personalizado · v${prompt.version}` : 'Padrão do sistema'

  return <section className="cpe-shell" aria-labelledby="cpe-title">
    <div className="cpe-head">
      <div>
        <span className="cpe-kicker">PROMPT GLOBAL DA IA</span>
        <h4 id="cpe-title">Direção visual das capas de evento</h4>
        <p>Controle a instrução enviada ao gerador. Depois de salvar, as próximas capas de evento passam a usar esta versão.</p>
      </div>
      <div className="cpe-head-actions">
        <span className={`cpe-status ${prompt?.is_custom ? 'custom' : ''}`}>{loading ? 'Carregando…' : status}</span>
        <button type="button" className="cpe-toggle" disabled={loading} onClick={() => setOpen(value => !value)}>{open ? 'Fechar editor' : 'Editar prompt'}</button>
      </div>
    </div>

    {error && <div className="cpe-message error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    {success && <div className="cpe-message success" role="status">{success}<button type="button" onClick={() => setSuccess('')}>×</button></div>}

    {open && !loading && <div className="cpe-body">
      <div className="cpe-note">
        <b>Variáveis dinâmicas</b>
        <span>Use os tokens abaixo para inserir dados reais do evento. <code>{'{{subject}}'}</code> é obrigatório e impede que o gerador perca o contexto do evento.</span>
      </div>

      <label className="cpe-editor-label">
        <span>Prompt enviado para a IA</span>
        <textarea
          ref={textareaRef}
          rows="13"
          maxLength={MAX_LENGTH}
          value={template}
          onChange={event => { setTemplate(event.target.value); setSuccess('') }}
          spellCheck="false"
        />
      </label>

      <div className="cpe-meta">
        <span>{template.length}/{MAX_LENGTH} caracteres</span>
        {changed ? <b>Alterações ainda não salvas</b> : <span>Versão sincronizada</span>}
      </div>

      <div className="cpe-vars" aria-label="Variáveis disponíveis">
        {(prompt?.variables || []).map(variable => <button
          key={variable.key}
          type="button"
          className="cpe-variable"
          title={variable.description}
          onClick={() => insertVariable(variable.token)}
        >
          <code>{variable.token}</code>
          <span>{variable.description}</span>
        </button>)}
      </div>

      <div className="cpe-actions">
        <button type="button" className="cpe-secondary" disabled={resetting || saving} onClick={reset}>{resetting ? 'Restaurando…' : 'Restaurar padrão'}</button>
        <button type="button" className="cpe-primary" disabled={!changed || saving || resetting} onClick={save}>{saving ? 'Salvando prompt…' : 'Salvar prompt da IA'}</button>
      </div>
    </div>}
  </section>
}
