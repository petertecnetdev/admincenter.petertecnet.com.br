import { useMemo, useState } from 'react'
import { confirmAction, confirmTypedAction } from './utils/uiDialog.js'
import './interaction-cleanup.css'

const PURGE_CONFIRMATION = 'LIMPAR TODAS AS INTERAÇÕES'

function interactionId(row) {
  const id = Number(row?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

function interactionTitle(row) {
  return row?.name || row?.interaction_type || row?.type || 'Interação'
}

function interactionContext(row) {
  return row?.user_email || row?.email || row?.application_name || row?.app_name || 'Ecossistema Peter Tecnet'
}

export default function InteractionCleanup({ rows = [], total = 0, request, onChanged, formatDate }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState(null)

  const visibleIds = useMemo(
    () => rows.map(interactionId).filter(Boolean),
    [rows],
  )

  const selectedVisibleIds = useMemo(
    () => selectedIds.filter(id => visibleIds.includes(id)),
    [selectedIds, visibleIds],
  )

  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length

  function toggleInteraction(id) {
    if (!id || busy) return
    setSelectedIds(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id])
  }

  function toggleVisible() {
    if (!visibleIds.length || busy) return
    setSelectedIds(current => {
      if (allVisibleSelected) return current.filter(id => !visibleIds.includes(id))
      return [...new Set([...current, ...visibleIds])]
    })
  }

  async function deleteSelected() {
    if (!selectedVisibleIds.length || busy) return

    const quantity = selectedVisibleIds.length
    const confirmed = await confirmAction({
      tone: 'danger',
      title: `Excluir ${quantity} ${quantity === 1 ? 'interação selecionada' : 'interações selecionadas'}?`,
      message: 'Os registros selecionados serão removidos permanentemente. Essa ação não pode ser desfeita.',
      confirmLabel: quantity === 1 ? 'Excluir interação' : `Excluir ${quantity} interações`,
      cancelLabel: 'Manter registros',
    })
    if (!confirmed) return

    setBusy('selected')
    setFeedback(null)
    try {
      const result = await request('/admin/ecosystem/activity', {
        method: 'DELETE',
        body: JSON.stringify({ ids: selectedVisibleIds }),
      })
      const deleted = Number(result?.deleted || 0)
      setSelectedIds([])
      setFeedback({
        tone: 'success',
        text: `${deleted} ${deleted === 1 ? 'interação foi excluída' : 'interações foram excluídas'} com sucesso.`,
      })
      await onChanged?.()
    } catch (error) {
      setFeedback({ tone: 'danger', text: error.message || 'Não foi possível excluir as interações selecionadas.' })
    } finally {
      setBusy('')
    }
  }

  async function purgeAll() {
    if (busy || !Number(total)) return

    const confirmed = await confirmTypedAction({
      tone: 'danger',
      eyebrow: 'AÇÃO IRREVERSÍVEL',
      title: 'Limpar todo o histórico de interações?',
      message: `Esta ação excluirá todas as ${Number(total).toLocaleString('pt-BR')} interações armazenadas. Para proteger o histórico operacional, confirme digitando exatamente a frase indicada.`,
      requiredText: PURGE_CONFIRMATION,
      requiredTextLabel: 'Confirmação de segurança',
      confirmLabel: 'Limpar todas as interações',
      cancelLabel: 'Cancelar limpeza',
      dismissOnBackdrop: false,
    })
    if (!confirmed) return

    setBusy('all')
    setFeedback(null)
    try {
      const result = await request('/admin/ecosystem/activity/all', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: PURGE_CONFIRMATION }),
      })
      const deleted = Number(result?.deleted || 0)
      setSelectedIds([])
      setFeedback({
        tone: 'success',
        text: `Limpeza concluída: ${deleted} ${deleted === 1 ? 'interação removida' : 'interações removidas'}.`,
      })
      await onChanged?.()
    } catch (error) {
      setFeedback({ tone: 'danger', text: error.message || 'Não foi possível limpar todas as interações.' })
    } finally {
      setBusy('')
    }
  }

  return <div className="interaction-cleanup">
    <div className="interaction-cleanup-toolbar">
      <div className="interaction-cleanup-copy">
        <b>Gerenciar histórico</b>
        <small>Selecione registros específicos ou limpe toda a telemetria armazenada.</small>
      </div>
      <div className="interaction-cleanup-actions">
        <button type="button" className="interaction-action secondary" disabled={!visibleIds.length || Boolean(busy)} onClick={toggleVisible}>
          {allVisibleSelected ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
        </button>
        <button type="button" className="interaction-action danger-soft" disabled={!selectedVisibleIds.length || Boolean(busy)} onClick={deleteSelected}>
          {busy === 'selected' ? 'Excluindo…' : `Excluir selecionadas${selectedVisibleIds.length ? ` (${selectedVisibleIds.length})` : ''}`}
        </button>
        <button type="button" className="interaction-action danger" disabled={!Number(total) || Boolean(busy)} onClick={purgeAll}>
          {busy === 'all' ? 'Limpando…' : 'Limpar todas'}
        </button>
      </div>
    </div>

    {feedback && <div className={`interaction-feedback ${feedback.tone}`} role="status">
      <span>{feedback.tone === 'success' ? '✓' : '!'}</span>
      <p>{feedback.text}</p>
      <button type="button" onClick={() => setFeedback(null)} aria-label="Fechar aviso">×</button>
    </div>}

    <div className="interaction-cleanup-list">
      {rows.length ? rows.map((row, index) => {
        const id = interactionId(row)
        const selected = id ? selectedVisibleIds.includes(id) : false
        return <label className={`interaction-cleanup-row ${selected ? 'selected' : ''}`} key={id || `${row?.created_at}-${index}`}>
          <span className="interaction-check">
            {id ? <input type="checkbox" checked={selected} disabled={Boolean(busy)} onChange={() => toggleInteraction(id)} aria-label={`Selecionar ${interactionTitle(row)}`}/> : <i/>}
          </span>
          <span className="interaction-cleanup-dot"/>
          <span className="interaction-cleanup-content">
            <b>{interactionTitle(row)}</b>
            <small>{interactionContext(row)}</small>
          </span>
          <time>{formatDate?.(row?.created_at || row?.occurred_at) || '—'}</time>
        </label>
      }) : <div className="empty-state">Nenhuma interação recente retornada pela API.</div>}
    </div>
  </div>
}
