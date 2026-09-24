import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import PublicDiscoveryExperience from './PublicDiscoveryExperience.jsx'
import SmartImage from './components/SmartImage.jsx'
import { formatCurrency, getItemImage } from './landingApi.js'
import { updatePageSeo } from './seo.js'
import {
  fetchContentEntry,
  fetchDiscoveryLanding,
  fetchDiscoverySearch,
  trackDiscoveryEvent,
} from './discoveryApi.js'
import './PublicExperienceRouter.css'
import './NavDiscoverySearch.css'

const ORIGIN = 'https://petertecnet.com.br'

function SearchInput({ initial = '', city = '', compact = false }) {
  const [query, setQuery] = useState(initial)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => setQuery(initial), [initial])
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null)
      return undefined
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      fetchDiscoverySearch({ q: query.trim(), city: city || undefined, limit: compact ? 4 : 8 }, controller.signal)
        .then(payload => setResults(payload?.data || null))
        .catch(() => setResults(null))
        .finally(() => setLoading(false))
    }, 260)
    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [query, city, compact])

  const submit = event => {
    event.preventDefault()
    const value = query.trim()
    if (!value) return
    trackDiscoveryEvent('search', { entityType: 'search', entityId: value, metadata: { term: value } })
    const params = new URLSearchParams({ q: value })
    if (city) params.set('city', city)
    window.location.assign(`/buscar?${params}`)
  }

  const top = results ? [
    ...(results.results?.applications || []),
    ...(results.results?.items || []),
    ...(results.results?.establishments || []),
    ...(results.results?.content || []),
  ].slice(0, compact ? 4 : 8) : []

  return <div className={`global-discovery ${compact ? 'is-compact' : ''}`}>
    <form onSubmit={submit} className="global-discovery-form">
      <span aria-hidden="true">⌕</span>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="O que você procura? Produto, serviço, empresa ou solução…" aria-label="Busca global Peter Tecnet" />
      <button type="submit">Buscar</button>
    </form>
    {(loading || top.length > 0) && <div className="global-discovery-suggestions">
      {loading && <p>Procurando em todo o ecossistema…</p>}
      {!loading && top.map(result => <a href={result.url} key={`${result.type}-${result.id}`} onClick={() => trackDiscoveryEvent('cta_click', { entityType: result.type, entityId: result.id, metadata: { destination: result.url, position: 'global-search' } })}>
        <small>{result.type === 'item' ? 'Produto/serviço' : result.type === 'establishment' ? 'Empresa' : result.type === 'application' ? 'Plataforma' : 'Conteúdo'}</small>
        <strong>{result.title}</strong>
        {(result.location || result.category) && <span>{result.location || result.category}</span>}
      </a>)}
      {!loading && query.trim().length >= 2 && <a className="is-all" href={`/buscar?q=${encodeURIComponent(query.trim())}`}>Ver todos os resultados →</a>}
    </div>}
  </div>
}

function NavSearchPortal({ initial = '' }) {
  const [target, setTarget] = useState(null)

  useEffect(() => {
    setTarget(document.querySelector('.mkt-header .mkt-nav'))
  }, [])

  if (!target) return null

  return createPortal(
    <div className="mkt-discovery-search" role="search" aria-label="Busca global na navegação">
      <SearchInput initial={initial} compact />
    </div>,
    target,
  )
}

function ResultGroup({ title, rows = [] }) {
  if (!rows.length) return null
  return <section className="search-result-group">
    <div className="search-result-heading"><h2>{title}</h2><span>{rows.length}</span></div>
    <div className="search-result-grid">{rows.map(row => <a className="search-result-card" href={row.url} key={`${row.type}-${row.id}`} onClick={() => trackDiscoveryEvent('cta_click', { entityType: row.type, entityId: row.id, metadata: { destination: row.url, position: 'search-results' } })}>
      <small>{row.category || row.type}</small>
      <strong>{row.title}</strong>
      <p>{row.description || row.location || 'Abrir resultado no ecossistema Peter Tecnet.'}</p>
      {(row.location || row.price) && <div>{row.location && <span>{row.location}</span>}{row.price && <b>{formatCurrency(row.price)}</b>}</div>}
    </a>)}</div>
  </section>
}

function SearchPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const query = params.get('q') || ''
  const city = params.get('city') || ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(query))

  useEffect(() => {
    updatePageSeo({ title: query ? `${query} | Busca Peter Tecnet` : 'Busca global | Peter Tecnet', description: 'Pesquise simultaneamente produtos, serviços, empresas, plataformas e conteúdos no ecossistema Peter Tecnet.', path: '/buscar', robots: 'noindex, follow' })
    if (!query) return undefined
    const controller = new AbortController()
    fetchDiscoverySearch({ q: query, city: city || undefined, limit: 20 }, controller.signal)
      .then(payload => setData(payload?.data || null))
      .finally(() => setLoading(false))
    trackDiscoveryEvent('search', { entityType: 'search', entityId: query, metadata: { term: query } })
    return () => controller.abort()
  }, [query, city])

  const r = data?.results || {}
  const total = data?.totals ? Object.values(data.totals).reduce((sum, value) => sum + Number(value || 0), 0) : 0
  const discoverUrl = query ? `/descobrir/${encodeURIComponent(query.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))}${city ? `/${encodeURIComponent(city.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))}` : ''}` : null

  return <main className="search-page">
    <header className="search-page-hero"><a className="search-back" href="/">← Peter Tecnet</a><p>GLOBAL DISCOVERY</p><h1>Encontre qualquer coisa no <span>ecossistema.</span></h1><SearchInput initial={query} city={city} /></header>
    <div className="search-page-body">
      {loading && <div className="search-empty">Pesquisando aplicações, conteúdos, empresas e catálogo…</div>}
      {!loading && query && <div className="search-summary"><strong>{total}</strong><span>resultados para “{query}”{city ? ` em ${city}` : ''}</span>{discoverUrl && total >= 4 && <a href={discoverUrl}>Abrir página de descoberta →</a>}</div>}
      {!loading && query && total === 0 && <div className="search-empty"><h2>Nada encontrado ainda.</h2><p>Tente um termo mais amplo ou remova a cidade.</p></div>}
      <ResultGroup title="Plataformas" rows={r.applications} />
      <ResultGroup title="Produtos e serviços" rows={r.items} />
      <ResultGroup title="Empresas" rows={r.establishments} />
      <ResultGroup title="Conteúdo" rows={r.content} />
    </div>
  </main>
}

function DiscoveryLandingPage({ term, city }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetchDiscoveryLanding({ q: term.replaceAll('-', ' '), city: city ? city.replaceAll('-', ' ') : undefined }, controller.signal)
      .then(payload => setData(payload?.data || null))
      .catch(() => setError(true))
    return () => controller.abort()
  }, [term, city])
  useEffect(() => {
    if (!data) return
    updatePageSeo({ title: data.seo?.title, description: data.seo?.description, path: data.seo?.canonical_path || window.location.pathname, robots: data.seo?.robots || (data.indexable ? 'index, follow' : 'noindex, follow'), schema: { '@context': 'https://schema.org', '@type': 'SearchResultsPage', name: data.seo?.title, description: data.seo?.description, url: `${ORIGIN}${data.seo?.canonical_path || window.location.pathname}` } })
    trackDiscoveryEvent('page_view', { entityType: 'discovery_landing', entityId: data.seo?.canonical_path, metadata: { term: data.query } })
  }, [data])
  if (error) return <PublicDiscoveryExperience />
  if (!data) return <main className="search-page"><div className="search-empty">Montando página de descoberta…</div></main>
  const r = data.results || {}
  return <main className="search-page discovery-landing-page">
    <header className="search-page-hero"><a className="search-back" href="/">← Peter Tecnet</a><p>{data.indexable ? 'INDEXABLE DISCOVERY' : 'DISCOVERY'}</p><h1>{data.query}{data.city ? ` em ${data.city}` : ''}: <span>encontre o melhor caminho.</span></h1><p>{data.seo?.description}</p><SearchInput initial={data.query} city={data.city || ''} /></header>
    <div className="search-page-body">
      {!data.indexable && <div className="search-index-note">Esta página ainda não tem massa suficiente para indexação; ela continua útil para navegação e ganhará indexação automaticamente quando houver dados suficientes.</div>}
      <ResultGroup title="Produtos e serviços" rows={r.items} />
      <ResultGroup title="Empresas" rows={r.establishments} />
      <ResultGroup title="Conteúdos que explicam" rows={r.content} />
      <ResultGroup title="Plataformas relacionadas" rows={r.applications} />
    </div>
  </main>
}

function RelatedProduct({ item }) {
  const establishment = item.establishment
  return <article className="article-related-product">
    <a href={`/solucoes/${item.slug || item.id}`} className="article-related-image"><SmartImage files={item.files} src={getItemImage(item)} alt={item.name} /></a>
    <div><small>{item.category || item.type || 'Catálogo'}</small><h3><a href={`/solucoes/${item.slug || item.id}`}>{item.name}</a></h3><p>{item.description || `Disponível em ${establishment?.fantasy || establishment?.name || 'um estabelecimento do ecossistema'}.`}</p><strong>{formatCurrency(item.price)}</strong>{establishment?.slug && <a className="article-company-link" href={`/empresas/${establishment.slug}`}>{establishment.fantasy || establishment.name} →</a>}</div>
  </article>
}

function EnhancedArticlePage({ slug }) {
  const [article, setArticle] = useState(null)
  const [fallback, setFallback] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetchContentEntry(slug, {}, controller.signal)
      .then(payload => setArticle(payload?.data || null))
      .catch(() => setFallback(true))
    return () => controller.abort()
  }, [slug])
  useEffect(() => {
    if (!article) return
    const seo = article.seo || {}
    updatePageSeo({ title: seo.title || `${article.title} | Peter Tecnet`, description: seo.description || article.excerpt, path: `/blog/${article.slug}`, image: seo.og_image, type: 'article', schema: { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: seo.description || article.excerpt, datePublished: article.published_at, dateModified: article.updated_at || article.published_at, mainEntityOfPage: `${ORIGIN}/blog/${article.slug}`, author: { '@type': 'Organization', name: 'Peter Tecnet' }, publisher: { '@type': 'Organization', name: 'Peter Tecnet' } } })
    trackDiscoveryEvent('content_view', { entityType: 'content', entityId: article.slug, application: article.application?.slug })
  }, [article])
  if (fallback) return <PublicDiscoveryExperience />
  if (!article) return <main className="article-enhanced"><div className="search-empty">Carregando conteúdo pela API…</div></main>
  const paragraphs = String(article.content || '').split(/\n\s*\n/).filter(Boolean)
  return <main className="article-enhanced">
    <header className="article-enhanced-hero"><a href="/blog">← Conteúdo</a><p>{article.category || 'PETER TECNET DISCOVERY'}</p><h1>{article.title}</h1><div>{article.excerpt}</div><small>{article.cluster ? `Cluster: ${article.cluster}` : 'Peter Tecnet'}</small></header>
    <article className="article-enhanced-body">{paragraphs.map((block, index) => {
      if (/^#{2,3}\s/.test(block)) return <h2 id={`sec-${index}`} key={index}>{block.replace(/^#{2,3}\s+/, '')}</h2>
      if (/^[-*]\s/m.test(block)) return <ul key={index}>{block.split('\n').map(line => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean).map(line => <li key={line}>{line}</li>)}</ul>
      return <p key={index}>{block.replace(/^#\s+/, '')}</p>
    })}</article>
    {(article.related_items || []).length > 0 && <section className="article-related-section"><div className="article-section-heading"><p>DO CONTEÚDO PARA A AÇÃO</p><h2>Produtos e serviços relacionados</h2><span>As recomendações vêm do mesmo contexto semântico do artigo.</span></div><div className="article-related-grid">{article.related_items.map(item => <RelatedProduct item={item} key={item.id} />)}</div></section>}
    {(article.related_content || []).length > 0 && <section className="article-related-section"><div className="article-section-heading"><p>CLUSTER EDITORIAL</p><h2>Continue aprofundando o tema</h2></div><div className="article-content-links">{article.related_content.map(row => <a href={`/blog/${row.slug}`} key={row.id}><small>{row.category}</small><strong>{row.title}</strong><span>{row.excerpt}</span></a>)}</div></section>}
  </main>
}

function AdaptiveHome() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const intentTerm = params.get('utm_term') || params.get('intent') || params.get('q') || ''

  return <>
    <PublicDiscoveryExperience />
    <NavSearchPortal initial={intentTerm} />
  </>
}

export default function PublicExperienceRouter() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const discover = path.match(/^\/descobrir\/([^/]+)(?:\/([^/]+))?$/)
  const article = path.match(/^\/blog\/([^/]+)$/)
  if (path === '/buscar') return <SearchPage />
  if (discover) return <DiscoveryLandingPage term={decodeURIComponent(discover[1])} city={discover[2] ? decodeURIComponent(discover[2]) : null} />
  if (article) return <EnhancedArticlePage slug={decodeURIComponent(article[1])} />
  if (path === '/') return <AdaptiveHome />
  return <PublicDiscoveryExperience />
}