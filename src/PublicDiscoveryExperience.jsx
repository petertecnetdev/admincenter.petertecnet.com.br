import { useEffect, useMemo, useState } from 'react'
import MarketingExperience from './MarketingExperience.jsx'
import './MarketingExperience.css'
import './PublicDiscoveryExperience.css'
import { blogArticles, findBlogArticle, formatArticleDate, applicationSeo } from './marketingContent.js'
import { formatCurrency, getItemImage, resolveAssetUrl } from './landingApi.js'
import { updatePageSeo } from './seo.js'
import {
  fetchContentEntries,
  fetchContentEntry,
  fetchDiscoveryCategory,
  fetchDiscoveryEstablishment,
  fetchDiscoveryItem,
  trackDiscoveryEvent,
} from './discoveryApi.js'

const ORIGIN = 'https://petertecnet.com.br'
const API = 'https://api.petertecnet.com.br'
const DEFAULT_CONTACT = 'contato@petertecnet.com.br'

const headingId = value => String(value || '')
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')

const publicImage = value => {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  return `${API}/${String(value).replace(/^\/+/, '')}`
}

function Shell({ children }) {
  return <div className="mkt-shell discovery-shell">
    <header className="mkt-header">
      <a className="mkt-brand" href="/" aria-label="Peter Tecnet — início">
        <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
        <span><strong>Peter Tecnet</strong><small>Technology ecosystem</small></span>
      </a>
      <nav className="mkt-nav discovery-nav" aria-label="Navegação principal">
        <a href="/#plataformas">Plataformas</a><a href="/#catalogo">Catálogo</a><a href="/blog">Conteúdo</a><a href="/#contato">Contato</a>
      </nav>
    </header>
    {children}
    <footer className="mkt-footer"><div className="mkt-container discovery-footer"><strong>Peter Tecnet</strong><span>Tecnologia para vender, organizar, integrar e crescer.</span><a href="/">Voltar ao início ↗</a></div></footer>
  </div>
}

function State({ children }) {
  return <Shell><main className="mkt-page-state discovery-state">{children}</main></Shell>
}

function Breadcrumb({ items }) {
  return <div className="mkt-breadcrumb">{items.map((item, index) => <span className="discovery-crumb" key={`${item.label}-${index}`}>{index > 0 && <i>/</i>}{item.href ? <a href={item.href}>{item.label}</a> : <strong>{item.label}</strong>}</span>)}</div>
}

function TrackLink({ href, children, event = 'cta_click', entityType, entityId, className, target }) {
  return <a href={href} className={className} target={target} rel={target === '_blank' ? 'noreferrer' : undefined} onClick={() => trackDiscoveryEvent(event, { entityType, entityId, metadata: { destination: href } })}>{children}</a>
}

function StaticArticleBody({ article }) {
  return <>
    <p className="mkt-article-intro">{article.intro}</p>
    {article.sections.map(section => <section id={headingId(section.heading)} key={section.heading}>
      <h2>{section.heading}</h2>
      {(section.paragraphs || []).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    </section>)}
  </>
}

function ApiArticleBody({ content }) {
  const blocks = useMemo(() => {
    const lines = String(content || '').split(/\r?\n/)
    const output = []
    let paragraph = []
    let bullets = []
    const flushParagraph = () => { if (paragraph.length) { output.push({ type: 'p', text: paragraph.join(' ') }); paragraph = [] } }
    const flushBullets = () => { if (bullets.length) { output.push({ type: 'ul', items: bullets }); bullets = [] } }
    lines.forEach(line => {
      const value = line.trim()
      if (!value) { flushParagraph(); flushBullets(); return }
      if (/^#{2,3}\s+/.test(value)) { flushParagraph(); flushBullets(); output.push({ type: 'h2', text: value.replace(/^#{2,3}\s+/, '') }); return }
      if (/^[-*]\s+/.test(value)) { flushParagraph(); bullets.push(value.replace(/^[-*]\s+/, '')); return }
      flushBullets(); paragraph.push(value.replace(/^#\s+/, ''))
    })
    flushParagraph(); flushBullets()
    return output
  }, [content])

  return <>{blocks.map((block, index) => block.type === 'h2'
    ? <h2 id={headingId(block.text)} key={`${block.type}-${index}`}>{block.text}</h2>
    : block.type === 'ul'
      ? <ul key={`${block.type}-${index}`}>{block.items.map(item => <li key={item}>{item}</li>)}</ul>
      : <p key={`${block.type}-${index}`}>{block.text}</p>)}</>
}

function normalizeStatic(article) {
  if (!article) return null
  return {
    ...article,
    excerpt: article.description,
    published_at: article.date,
    seo: { title: article.seoTitle, description: article.description, canonical_path: `/blog/${article.slug}` },
    staticArticle: article,
  }
}

function BlogIndexPage() {
  const [apiEntries, setApiEntries] = useState([])
  useEffect(() => {
    const controller = new AbortController()
    fetchContentEntries({ type: 'article', per_page: 50 }, controller.signal)
      .then(payload => setApiEntries(payload?.data?.data || []))
      .catch(() => setApiEntries([]))
    updatePageSeo({ title: 'Blog Peter Tecnet | Software, automação, APIs, SEO e produtos digitais', description: 'Conteúdo sobre software, automação, APIs, integração, catálogos digitais, SEO, agendamento, eventos e tecnologia aplicada a empresas.', path: '/blog', type: 'website' })
    trackDiscoveryEvent('page_view', { entityType: 'blog', entityId: 'index' })
    return () => controller.abort()
  }, [])

  const entries = useMemo(() => {
    const merged = new Map(blogArticles.map(article => [article.slug, normalizeStatic(article)]))
    apiEntries.forEach(entry => merged.set(entry.slug, entry))
    return [...merged.values()].sort((a, b) => String(b.published_at || b.date || '').localeCompare(String(a.published_at || a.date || '')))
  }, [apiEntries])

  return <Shell><main>
    <section className="mkt-blog-hero discovery-hero"><div className="mkt-grid" /><div className="mkt-container"><Breadcrumb items={[{ label: 'Peter Tecnet', href: '/' }, { label: 'Blog' }]} /><p className="mkt-kicker">CONTENT & DISCOVERY</p><h1>Conteúdo conectado a <span>problemas reais, produtos e empresas.</span></h1><p>Os artigos agora fazem parte de uma camada administrável de descoberta, com clusters editoriais, SEO e relações automáticas com o ecossistema.</p></div></section>
    <section className="mkt-blog-list"><div className="mkt-container discovery-card-grid">{entries.map(entry => <article className="discovery-card" key={entry.slug}><p className="mkt-card-eyebrow">{entry.category || 'Tecnologia'}</p><h2><a href={`/blog/${entry.slug}`}>{entry.title}</a></h2><p>{entry.excerpt || entry.description}</p><div className="discovery-card-meta"><span>{formatArticleDate(entry.published_at || entry.date)}</span>{entry.cluster && <span>Cluster: {entry.cluster}</span>}</div><a className="mkt-text-link" href={`/blog/${entry.slug}`}>Ler artigo <span>↗</span></a></article>)}</div></section>
  </main></Shell>
}

function BlogArticlePage({ slug }) {
  const fallback = normalizeStatic(findBlogArticle(slug))
  const [article, setArticle] = useState(fallback)
  const [loading, setLoading] = useState(!fallback)

  useEffect(() => {
    const controller = new AbortController()
    fetchContentEntry(slug, {}, controller.signal).then(payload => setArticle(payload?.data || fallback)).catch(() => setArticle(fallback)).finally(() => setLoading(false))
    return () => controller.abort()
  }, [slug])

  useEffect(() => {
    if (!article) return
    const seo = article.seo || {}
    const image = publicImage(seo.og_image || article.og_image || article.cover_image)
    updatePageSeo({
      title: seo.title || article.seoTitle || `${article.title} | Peter Tecnet`,
      description: seo.description || article.excerpt || article.description,
      path: `/blog/${article.slug}`,
      image,
      type: 'article',
      schema: [{ '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: seo.description || article.excerpt, datePublished: article.published_at || article.date, dateModified: article.updated_at || article.published_at || article.date, mainEntityOfPage: `${ORIGIN}/blog/${article.slug}`, author: { '@type': 'Organization', name: 'Peter Tecnet' }, publisher: { '@type': 'Organization', name: 'Peter Tecnet', url: ORIGIN }, image: image || `${ORIGIN}/thumbnail.jpg` }],
    })
    trackDiscoveryEvent('content_view', { entityType: 'content', entityId: article.slug, application: article.application?.slug })
  }, [article])

  if (loading) return <State><p>Carregando conteúdo…</p></State>
  if (!article) return <State><h1>Artigo não encontrado.</h1><a href="/blog">Voltar ao blog</a></State>
  const related = article.related_content || []
  const platform = article.application?.slug || article.staticArticle?.relatedPlatform || article.metadata?.related_platform
  const platformKey = platform === 'peter-payflow' ? 'payflow' : platform
  const platformCopy = applicationSeo[platformKey]

  return <Shell><main><article className="mkt-article discovery-article">
    <header className="mkt-article-header"><div className="mkt-grid" /><div className="mkt-container"><Breadcrumb items={[{ label: 'Peter Tecnet', href: '/' }, { label: 'Blog', href: '/blog' }, { label: article.category || 'Artigo' }]} /><p className="mkt-kicker">{String(article.category || 'Tecnologia').toUpperCase()}</p><h1>{article.title}</h1><p className="mkt-article-deck">{article.excerpt || article.description}</p><div className="mkt-article-byline"><span>Peter Tecnet</span><i /><time>{formatArticleDate(article.published_at || article.date)}</time></div></div></header>
    <div className="mkt-container mkt-article-layout"><aside className="mkt-article-aside"><strong>Descubra também</strong>{(article.tags || []).slice(0, 6).map(tag => <a href={`/blog?tag=${encodeURIComponent(tag)}`} key={tag}>{tag}</a>)}{article.staticArticle?.sections?.map(section => <a href={`#${headingId(section.heading)}`} key={section.heading}>{section.heading}</a>)}</aside><div className="mkt-article-content">{article.staticArticle ? <StaticArticleBody article={article.staticArticle} /> : <ApiArticleBody content={article.content} />}{platformKey && <aside className="discovery-context-cta"><small>SOLUÇÃO RELACIONADA</small><h3>{platformCopy?.headline || platformKey}</h3><p>{platformCopy?.description || 'Conheça a plataforma relacionada a este conteúdo.'}</p><TrackLink href={`/plataformas/${platformKey}`} entityType="content" entityId={article.slug} className="mkt-btn is-primary">Conhecer solução <span>↗</span></TrackLink></aside>}</div></div>
  </article>{related.length > 0 && <section className="mkt-related-content"><div className="mkt-container"><div className="mkt-section-heading"><p className="mkt-kicker">MESMO CLUSTER</p><h2>Continue a <span>jornada de descoberta.</span></h2></div><div className="discovery-card-grid">{related.map(item => <article className="discovery-card" key={item.slug}><p className="mkt-card-eyebrow">{item.category}</p><h3><a href={`/blog/${item.slug}`}>{item.title}</a></h3><p>{item.excerpt}</p></article>)}</div></div></section>}</main></Shell>
}

function EstablishmentPage({ identifier }) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    fetchDiscoveryEstablishment(identifier, {}, controller.signal).then(payload => { setData(payload?.data); setStatus('success') }).catch(error => setStatus(error?.status === 404 ? 'not-found' : 'error'))
    return () => controller.abort()
  }, [identifier])
  useEffect(() => {
    if (!data) return
    const name = data.fantasy || data.name
    const seo = data.seo || {}
    updatePageSeo({ title: seo.title, description: seo.description, path: `/empresas/${data.slug}`, image: publicImage(seo.og_image), type: 'website', schema: [{ '@context': 'https://schema.org', '@type': 'LocalBusiness', name, description: data.description, url: `${ORIGIN}/empresas/${data.slug}`, email: data.email || undefined, telephone: data.phone || undefined, address: { '@type': 'PostalAddress', streetAddress: data.address || undefined, addressLocality: data.city || undefined, addressRegion: data.uf || undefined, postalCode: data.cep || undefined, addressCountry: 'BR' } }, { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: (data.items || []).slice(0, 30).map((item, index) => ({ '@type': 'ListItem', position: index + 1, url: `${ORIGIN}/solucoes/${item.slug || item.id}`, name: item.name })) }] })
    trackDiscoveryEvent('establishment_view', { entityType: 'establishment', entityId: data.slug })
  }, [data])
  if (status === 'loading') return <State><p>Carregando empresa…</p></State>
  if (!data) return <State><h1>{status === 'not-found' ? 'Empresa não encontrada.' : 'Não foi possível carregar esta empresa.'}</h1></State>
  const name = data.fantasy || data.name
  return <Shell><main><section className="mkt-detail-hero discovery-hero"><div className="mkt-grid" /><div className="mkt-container mkt-detail-layout"><div><Breadcrumb items={[{ label: 'Peter Tecnet', href: '/' }, { label: 'Empresas' }, { label: name }]} /><p className="mkt-kicker">{data.category || data.type || 'EMPRESA'}</p><h1>{name}</h1><p className="mkt-detail-lead">{data.description || `Conheça produtos e serviços de ${name}.`}</p><div className="mkt-chip-row is-large">{[data.city && `${data.city}${data.uf ? ` - ${data.uf}` : ''}`, data.category, data.type].filter(Boolean).map(value => <span key={value}>{value}</span>)}</div><div className="mkt-hero-actions">{data.phone && <TrackLink className="mkt-btn is-primary" href={`tel:${String(data.phone).replace(/\D/g, '')}`} entityType="establishment" entityId={data.slug}>Entrar em contato <span>↗</span></TrackLink>}<a className="mkt-btn is-ghost" href="#itens">Ver catálogo <span>↘</span></a></div></div><aside className="discovery-business-card"><small>LOCAL DISCOVERY</small><strong>{data.seo?.location || 'Brasil'}</strong><p>{data.address || 'Endereço disponível diretamente com o estabelecimento.'}</p>{data.website_url && <TrackLink href={data.website_url} target="_blank" event="outbound_click" entityType="establishment" entityId={data.slug}>Site oficial ↗</TrackLink>}</aside></div></section><section id="itens" className="mkt-related-products"><div className="mkt-container"><div className="mkt-section-heading"><p className="mkt-kicker">CATÁLOGO PÚBLICO</p><h2>Produtos e serviços de <span>{name}.</span></h2></div><div className="discovery-product-grid">{(data.items || []).map(item => <ProductCard item={item} establishment={data} key={item.id || item.slug} />)}</div></div></section></main></Shell>
}

function ProductCard({ item, establishment }) {
  return <article className="discovery-product"><a href={`/solucoes/${item.slug || item.id}`}><img src={getItemImage(item)} alt={item.name} loading="lazy" decoding="async" /></a><div><p className="mkt-card-eyebrow">{item.category || item.type || 'Catálogo'}</p><h3><a href={`/solucoes/${item.slug || item.id}`}>{item.name}</a></h3><p>{item.description || `Disponível em ${establishment?.fantasy || establishment?.name || 'catálogo público'}.`}</p><strong>{formatCurrency(item.price)}</strong></div></article>
}

function CategoryPage({ slug }) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    fetchDiscoveryCategory(slug, {}, controller.signal).then(payload => { setData(payload?.data); setStatus('success') }).catch(error => setStatus(error?.status === 404 ? 'not-found' : 'error'))
    return () => controller.abort()
  }, [slug])
  useEffect(() => {
    if (!data) return
    const seo = data.seo || {}
    updatePageSeo({ title: seo.title, description: seo.description, path: `/catalogo/${data.category.slug}`, image: publicImage(seo.og_image), schema: { '@context': 'https://schema.org', '@type': 'ItemList', name: data.category.name, itemListElement: (data.items || []).map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, url: `${ORIGIN}/solucoes/${item.slug || item.id}` })) } })
    trackDiscoveryEvent('category_view', { entityType: 'category', entityId: data.category.slug, metadata: { category: data.category.name } })
  }, [data])
  if (status === 'loading') return <State><p>Carregando categoria…</p></State>
  if (!data) return <State><h1>{status === 'not-found' ? 'Categoria não encontrada.' : 'Não foi possível carregar a categoria.'}</h1></State>
  return <Shell><main><section className="mkt-blog-hero discovery-hero"><div className="mkt-grid" /><div className="mkt-container"><Breadcrumb items={[{ label: 'Peter Tecnet', href: '/' }, { label: 'Catálogo', href: '/#catalogo' }, { label: data.category.name }]} /><p className="mkt-kicker">CATEGORY / DISCOVERY</p><h1>{data.category.name}: <span>{data.category.total} opções encontradas.</span></h1><p>{data.seo?.description}</p></div></section><section className="mkt-blog-list"><div className="mkt-container discovery-product-grid">{(data.items || []).map(item => <ProductCard item={item} establishment={item.establishment} key={item.id || item.slug} />)}</div></section></main></Shell>
}

function ProductPage({ identifier }) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    fetchDiscoveryItem(identifier, {}, controller.signal).then(payload => { setData(payload?.data); setStatus('success') }).catch(error => setStatus(error?.status === 404 ? 'not-found' : 'error'))
    return () => controller.abort()
  }, [identifier])
  useEffect(() => {
    if (!data?.item) return
    const { item, establishment } = data
    const seo = item.seo || {}
    const image = getItemImage(item)
    const price = Number(item.price)
    updatePageSeo({ title: seo.title || `${item.name} | Peter Tecnet`, description: seo.description || item.description, path: `/solucoes/${item.slug || item.id}`, image: publicImage(seo.og_image) || image, type: 'product', schema: { '@context': 'https://schema.org', '@type': item.type === 'service' ? 'Service' : 'Product', name: item.name, description: item.description, image: !image?.startsWith('data:') ? [image] : undefined, category: item.category || item.type, brand: item.brand ? { '@type': 'Brand', name: item.brand } : undefined, offers: Number.isFinite(price) && price > 0 ? { '@type': 'Offer', priceCurrency: 'BRL', price: price.toFixed(2), availability: 'https://schema.org/InStock', seller: { '@type': 'Organization', name: establishment?.fantasy || establishment?.name } } : undefined } })
    trackDiscoveryEvent('product_view', { entityType: 'item', entityId: item.slug || item.id, application: item.app?.slug })
  }, [data])
  if (status === 'loading') return <State><p>Carregando item…</p></State>
  if (status === 'error') return <MarketingExperience />
  if (!data?.item) return <State><h1>Produto não encontrado.</h1><a href="/#catalogo">Voltar ao catálogo</a></State>
  const { item, establishment, related_items: related = [] } = data
  const company = establishment?.fantasy || establishment?.name
  const image = getItemImage(item)
  const email = establishment?.email || DEFAULT_CONTACT
  return <Shell><main><section className="mkt-detail-hero mkt-product-detail discovery-hero"><div className="mkt-grid" /><div className="mkt-container mkt-detail-layout"><div><Breadcrumb items={[{ label: 'Peter Tecnet', href: '/' }, { label: item.category || 'Catálogo', href: item.category ? `/catalogo/${headingId(item.category)}` : '/#catalogo' }, { label: item.name }]} /><p className="mkt-kicker">{item.category || item.type || 'CATÁLOGO DIGITAL'}</p><h1>{item.name}</h1><p className="mkt-detail-lead">{item.description || `Conheça ${item.name} e consulte disponibilidade.`}</p><div className="mkt-product-price"><small>Valor</small><strong>{formatCurrency(item.price)}</strong></div><div className="mkt-chip-row is-large">{[item.brand, item.category, item.subcategory, item.seo?.location].filter(Boolean).map(value => <span key={value}>{value}</span>)}</div><div className="mkt-hero-actions"><TrackLink className="mkt-btn is-primary" href={`mailto:${email}?subject=${encodeURIComponent(`Interesse em ${item.name}`)}`} entityType="item" entityId={item.slug || item.id}>Tenho interesse <span>↗</span></TrackLink>{establishment?.slug && <a className="mkt-btn is-ghost" href={`/empresas/${establishment.slug}`}>Conhecer {company} <span>↗</span></a>}</div></div><div className="mkt-product-photo"><img src={image} alt={item.name} decoding="async" fetchPriority="high" /><div><small>PUBLIC CATALOG</small><strong>{company || 'PETER TECNET'}</strong></div></div></div></section>{related.length > 0 && <section className="mkt-related-products"><div className="mkt-container"><div className="mkt-section-heading"><p className="mkt-kicker">RELACIONADOS</p><h2>Mais opções do <span>mesmo contexto.</span></h2></div><div className="discovery-product-grid">{related.map(candidate => <ProductCard item={candidate} establishment={establishment} key={candidate.id || candidate.slug} />)}</div></div></section>}</main></Shell>
}

function CanonicalRedirect({ to }) {
  useEffect(() => { window.location.replace(to) }, [to])
  return <State><p>Redirecionando…</p></State>
}

export default function PublicDiscoveryExperience() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const blogMatch = path.match(/^\/blog\/([^/]+)$/)
  const establishmentMatch = path.match(/^\/empresas\/([^/]+)$/)
  const categoryMatch = path.match(/^\/catalogo\/([^/]+)$/)
  const productMatch = path.match(/^\/solucoes\/([^/]+)$/)
  if (path === '/plataformas/peter-payflow') return <CanonicalRedirect to="/plataformas/payflow" />
  if (path === '/blog') return <BlogIndexPage />
  if (blogMatch) return <BlogArticlePage slug={decodeURIComponent(blogMatch[1])} />
  if (establishmentMatch) return <EstablishmentPage identifier={decodeURIComponent(establishmentMatch[1])} />
  if (categoryMatch) return <CategoryPage slug={decodeURIComponent(categoryMatch[1])} />
  if (productMatch) return <ProductPage identifier={decodeURIComponent(productMatch[1])} />
  return <MarketingExperience />
}
