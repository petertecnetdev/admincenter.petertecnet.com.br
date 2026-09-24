import { useCallback, useEffect, useState } from 'react'
import './AdminPayoutCenter.css'

const money = value => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
}).format(Number(value) || 0)

const when = value => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const statusLabel = status => ({
  pending: 'Pendente',
  requested: 'Solicitado',
  processing: 'Processando',
  provider_unknown: 'Aguardando conciliação',
  paid: 'Pago',
  completed: 'Concluído',
  failed: 'Falhou',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
}[String(status || '').toLowerCase()] || status || '—')

const statusTone = status => {
  const value = String(status || '').toLowerCase()
  if (['failed', 'rejected', 'cancelled'].includes(value)) return 'danger'
  if (['pending', 'requested', 'processing', 'provider_unknown'].includes(value)) return 'warning'
  return 'success'
}

export default function AdminPayoutCenter({ request }) {
  const [payload, setPayload] = useState({ data: [], summary: {} })
  const [reconciliations, setReconciliations] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : ''
      const [payoutResponse, reconciliationResponse] = await Promise.all([
        request(`/admin/ecosystem/financial/payouts${query}`),
        request('/admin/ecosystem/financial/reconciliations?mismatches_only=1&per_page=20'),
      ])
      setPayload(payoutResponse || { data: [], summary: {} })
      setReconciliations(reconciliationResponse?.data || [])
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar os repasses.')
    } finally {
      setLoading(false)
    }
  }, [request, status])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  async function reconcileNow() {
    if (reconciling) return
    setReconciling(true)
    setError('')
    setNotice('')
    try {
      const result = await request('/admin/ecosystem/financial/reconcile', { method: 'POST' })
      const stats = result?.stats || {}
      const checked = Number(stats.checked || 0)
      const reconciled = Number(stats.reconciled || 0)
      const replayed = Number(stats.webhooks_replayed || 0)
      const errors = Number(stats.errors || 0)
      setNotice(`${result?.message || 'Conciliação concluída.'} ${checked} repasse(s) verificado(s), ${reconciled} atualizado(s), ${replayed} webhook(s) reprocessado(s)${errors ? `, ${errors} ocorrência(s) para revisão` : ''}.`)
      await load()
    } catch (err) {
      setError(err?.message || 'Não foi possível executar a conciliação.')
    } finally {
      setReconciling(false)
    }
  }

  const rows = payload?.data || []
  const summary = payload?.summary || {}

  return <div className="admin-payout-center">
    <div className="admin-payout-head">
      <div>
        <p className="eyebrow">REPASSES / PIX</p>
        <h3>Repasses aos produtores</h3>
        <p>Acompanhe o ciclo de saída pelo Asaas, falhas, comprovantes e divergências de conciliação.</p>
      </div>
      <div className="admin-payout-actions">
        <select aria-label="Filtrar repasses por status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">Todos os status</option>
          <option value="processing">Processando</option>
          <option value="provider_unknown">Aguardando conciliação</option>
          <option value="paid">Pagos</option>
          <option value="failed">Falhos</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <button className="primary-button" type="button" onClick={reconcileNow} disabled={reconciling}>
          {reconciling ? 'Conciliando…' : 'Conciliar agora'} <span>↻</span>
        </button>
      </div>
    </div>

    {error && <div className="notice payout-notice danger" role="alert">{error}<button type="button" onClick={load}>Tentar novamente</button></div>}
    {notice && <div className="notice payout-notice success" role="status">{notice}</div>}

    <div className="admin-payout-kpis">
      <div><span>Total</span><b>{Number(summary.total || 0).toLocaleString('pt-BR')}</b></div>
      <div><span>Em processamento</span><b>{Number(summary.pending || 0).toLocaleString('pt-BR')}</b><small>{money(summary.amount_pending)}</small></div>
      <div><span>Pagos</span><b>{Number(summary.paid || 0).toLocaleString('pt-BR')}</b><small>{money(summary.amount_paid)}</small></div>
      <div className={Number(summary.failed || 0) ? 'attention' : ''}><span>Falhas</span><b>{Number(summary.failed || 0).toLocaleString('pt-BR')}</b></div>
      <div className={reconciliations.length ? 'attention' : ''}><span>Divergências</span><b>{reconciliations.length.toLocaleString('pt-BR')}</b></div>
    </div>

    <div className="admin-payout-grid">
      <article className="panel">
        <header><div><h3>Últimos repasses</h3><p>Status retornado pelo provedor e trilha de pagamento.</p></div></header>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Referência</th><th>Valor</th><th>Status</th><th>Provedor</th><th>Comprovante</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="6">Carregando repasses…</td></tr> : rows.length ? rows.slice(0, 30).map(row => <tr key={row.id}>
                <td>{when(row.created_at || row.requested_at)}</td>
                <td><b>#{row.id}</b><small className="payout-ref">{row.external_reference || row.provider_transfer_id || row.app_slug || '—'}</small></td>
                <td>{money(row.amount ?? row.net_amount)}</td>
                <td><span className={`payout-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span>{row.failure_reason && <small className="payout-failure">{row.failure_reason}</small>}</td>
                <td>{row.provider || 'asaas'}</td>
                <td>{row.receipt_url ? <a href={row.receipt_url} target="_blank" rel="noreferrer">Abrir ↗</a> : '—'}</td>
              </tr>) : <tr><td colSpan="6">Nenhum repasse encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <header><div><h3>Divergências de conciliação</h3><p>Somente registros que não bateram com o provedor.</p></div></header>
        <div className="admin-reconciliation-list">
          {loading ? <p>Carregando conciliações…</p> : reconciliations.length ? reconciliations.slice(0, 12).map(row => <div key={row.id} className="admin-reconciliation-row">
            <span className="severity danger"/>
            <div><b>{row.provider || 'Provedor'} · #{row.payment_id || row.payout_id || row.id}</b><small>{row.reason || row.status || row.notes || 'Divergência financeira pendente de revisão.'}</small></div>
            <time>{when(row.checked_at || row.created_at)}</time>
          </div>) : <div className="empty-state">Nenhuma divergência aberta.</div>}
        </div>
      </article>
    </div>
  </div>
}
