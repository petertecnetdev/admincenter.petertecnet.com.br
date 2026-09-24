import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { adminRequest as apiRequest } from './adminApi.js'

const labels = { item: 'Item', product: 'Produto', service: 'Serviço', ticket: 'Ingresso legado' }
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function AdminEstablishmentCatalog({ establishment, app, onCreate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const deferredSearch = useDeferredValue(search)

  const load = useCallback(async () => {
    if (!establishment?.id || !app?.id) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ app_id: String(app.id), establishment_id: String(establishment.id) })
      const payload = await apiRequest(`/admin/ecosystem/items?${params.toString()}`)
      setItems(payload?.items || payload?.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [app?.id, establishment?.id])

  useEffect(() => { void load() }, [load])

  const indexedItems = useMemo(() => items.map(item => ({
    item,
    searchText: normalize([item.name, item.category, item.sku, item.brand, item.id].filter(Boolean).join(' ')),
  })), [items])

  const visible = useMemo(() => {
    const term = normalize(deferredSearch.trim())
    return indexedItems.filter(({ item, searchText }) => {
      if (type !== 'all' && item.type !== type) return false
      return !term || searchText.includes(term)
    }).map(({ item }) => item)
  }, [indexedItems, deferredSearch, type])

  const metrics = useMemo(() => ({
    total: items.length,
    products: items.filter(item => item.type === 'product').length,
    active: items.filter(item => item.status !== false).length,
    legacyTickets: items.filter(item => item.type === 'ticket').length,
  }), [items])

  return <section className="aec-panel">
    <header className="aec-head">
      <div><span>CATÁLOGO DO ESTABELECIMENTO</span><h4>Produtos e itens do estabelecimento</h4><p>Listagem separada dos ingressos de evento. Ingressos reais são gerenciados dentro de cada evento.</p></div>
      <div className="aec-actions"><button type="button" onClick={() => void load()} disabled={loading}>↻ Atualizar</button>{onCreate && <button className="primary" type="button" onClick={onCreate}>＋ Novo item</button>}</div>
    </header>

    {!loading && <div className="aec-metrics"><div><b>{metrics.total}</b><span>Total</span></div><div><b>{metrics.products}</b><span>Produtos</span></div><div><b>{metrics.active}</b><span>Ativos</span></div><div className={metrics.legacyTickets ? 'warning' : ''}><b>{metrics.legacyTickets}</b><span>Ingressos legados</span></div></div>}

    {metrics.legacyTickets > 0 && <div className="aec-warning"><b>Atenção:</b> existem registros antigos do tipo ticket no catálogo genérico. Novos ingressos devem ser criados dentro do evento para participar corretamente de estoque, vendas, QR e check-in.</div>}

    {!loading && items.length > 0 && <div className="aec-toolbar"><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar produto, categoria, SKU ou ID…" /><select value={type} onChange={event => setType(event.target.value)}><option value="all">Todos os tipos</option><option value="product">Produtos</option><option value="item">Itens</option><option value="service">Serviços</option><option value="ticket">Ingressos legados</option></select></div>}

    {error && <div className="aec-feedback error">{error}</div>}
    {loading && <div className="aec-empty">Carregando catálogo…</div>}
    {!loading && !items.length && <div className="aec-empty"><b>Nenhum produto ou item cadastrado.</b><span>Use o formulário abaixo para criar o primeiro recurso comercial.</span></div>}
    {!loading && items.length > 0 && !visible.length && <div className="aec-empty">Nenhum item corresponde aos filtros.</div>}

    {!loading && visible.length > 0 && <div className="aec-list">{visible.map(item => <article key={item.id} className="aec-item"><div className="aec-identity"><span>{item.image || item.image_url ? <img src={item.image || item.image_url} alt="" loading="lazy" decoding="async" /> : String(item.name || 'I')[0]}</span><div><b>{item.name}</b><small>#{item.id} · {labels[item.type] || item.type || 'Item'}{item.category ? ` · ${item.category}` : ''}</small></div></div><div><span>Preço</span><b>{money(item.price)}</b></div><div><span>Estoque</span><b>{item.stock ?? '—'}</b></div><div><span>Estado</span><b className={item.status === false ? 'inactive' : 'active'}>{item.status === false ? 'Arquivado' : 'Ativo'}</b></div></article>)}</div>}
  </section>
}