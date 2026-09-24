import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './MarketingExperience.css'
import './MarketingHub.css'
import PeterAccountGateway from './components/PeterAccountGateway.jsx'
import {
  fetchApplications,
  fetchPeterCatalog,
  fetchSite,
  formatCurrency,
  getItemImage,
  resolveAssetUrl,
} from './landingApi.js'
import {
  fetchContentEntries,
  fetchDiscoverySearch,
  installWebVitals,
  trackDiscoveryEvent,
} from './discoveryApi.js'
import { applicationSeo, blogArticles, formatArticleDate } from './marketingContent.js'
import {
  aboutFacts,
  caseBlueprints,
  catalogGroups,
  groupCatalogItem,
  marketingServices,
  serviceBySlug,
  trustPoints,
} from './marketingHubContent.js'
import useLandingMotion from './useLandingMotion.js'
import { updatePageSeo } from './seo.js'
import { installGlobalImageFallbacks } from './utils/imageFallback.js'
import { installPasswordVisibilityToggles } from './utils/passwordVisibility.js'

const ORIGIN = 'https://petertecnet.com.br'
const API_BASE_URL = 'https://api.petertecnet.com.br/api'
const APP_SLUG = 'peter-tecnet'
const CRM_APP_SLUG = 'payflow'
const CNPJ = '42.595.409/0001-48'

const defaultContact = {
  email: 'contato@petertecnet.com.br',
  instagram: 'https://www.instagram.com/petertecnet/',
  whatsapp: '',
  phone: '',
}

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const safeText = value => String(value || '').trim()
const normalize = value => safeText(value).toLocaleLowerCase('pt-BR')
const platformSlug = application => normalize(application?.slug).replace(/[^a-z0-9-]+/g, '-')
const applicationHref = application => `/plataformas/${encodeURIComponent(platformSlug(application))}`
const itemHref = item => `/solucoes/${encodeURIComponent(item?.slug || item?.id)}`
const extractCollection = payload => Array.isArray(payload?.data?.data) ? payload.data.data : Array.isArray(payload?.data) ? payload.data : []

function normalizeArticle(article) {
  return {
    ...article,
    title: article?.title || 'Conteúdo Peter Tecnet',
    category: article?.category || 'Tecnologia',
    description: article?.excerpt || article?.description || 'Conteúdo produzido pela Peter Tecnet.',
    date: article?.published_at || article?.date || article?.created_at,
    readTime: article?.read_time || article?.readTime || null,
  }
}

function serviceForText(value = '') {
  const text = normalize(value)
  if (!text) return null
  return marketingServices
    .map(service => ({
      service,
      score: [service.title, service.short, service.description, ...service.intents]
        .reduce((total, candidate) => total + normalize(candidate).split(/\s+/).filter(token => token.length > 3 && text.includes(token)).length, 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.service || null
}

function dynamicService(staticService, entries) {
  const entry = entries.find(candidate => candidate.slug === staticService.slug || candidate.metadata?.service_slug === staticService.slug)
  if (!entry) return staticService
  return {
    ...staticService,
    title: entry.title || staticService.title,
    short: entry.excerpt || staticService.short,
    description: entry.content || entry.excerpt || staticService.description,
    cover_image: entry.cover_image || entry.og_image || staticService.cover_image,
    seo_title: entry.seo_title || entry.seo?.title,
    seo_description: entry.seo_description || entry.seo?.description,
    deliverables: Array.isArray(entry.metadata?.deliverables) ? entry.metadata.deliverables : staticService.deliverables,
    intents: Array.isArray(entry.tags) && entry.tags.length ? entry.tags : staticService.intents,
    entry,
  }
}

function useHubData() {
  const [applications, setApplications] = useState([])
  const [catalog, setCatalog] = useState([])
  const [contact, setContact] = useState(defaultContact)
  const [articles, setArticles] = useState(() => blogArticles.slice(0, 6).map(normalizeArticle))
  const [caseStudies, setCaseStudies] = useState([])
  const [pageEntries, setPageEntries] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const [appsPayload, sitePayload] = await Promise.all([
          fetchApplications(controller.signal),
          fetchSite(controller.signal).catch(() => null),
        ])
        const apps = Array.isArray(appsPayload?.applications) ? appsPayload.applications : []
        setApplications(apps)
        if (sitePayload?.site?.contact) setContact(current => ({ ...current, ...sitePayload.site.contact }))

        const [catalogPayload, articlePayload, casesPayload, pagesPayload] = await Promise.all([
          fetchPeterCatalog(apps, controller.signal).catch(() => ({ items: [] })),
          fetchContentEntries({ type: 'article', per_page: 12 }, controller.signal).catch(() => null),
          fetchContentEntries({ type: 'case-study', per_page: 20 }, controller.signal).catch(() => null),
          fetchContentEntries({ type: 'page', per_page: 50 }, controller.signal).catch(() => null),
        ])

        setCatalog(Array.isArray(catalogPayload?.items) ? catalogPayload.items : [])
        const dynamicArticles = extractCollection(articlePayload)
        if (dynamicArticles.length) setArticles(dynamicArticles.map(normalizeArticle))
        setCaseStudies(extractCollection(casesPayload))
        setPageEntries(extractCollection(pagesPayload))
        setStatus('success')
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus('error')
      }
    }
    load()
    return () => controller.abort()
  }, [])

  const services = useMemo(() => marketingServices.map(service => dynamicService(service, pageEntries.filter(entry => normalize(entry.category) === 'service'))), [pageEntries])
  const landingEntries = useMemo(() => pageEntries.filter(entry => normalize(entry.category) === 'landing'), [pageEntries])

  return { applications, catalog, contact, articles, caseStudies, pageEntries, landingEntries, services, status }
}

function Header() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return <header className="mkt-header hub-header">
    <a className="mkt-brand" href="/" onClick={close} aria-label="Peter Tecnet — início">
      <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
      <span><strong>Peter Tecnet</strong><small>Soluções em tecnologia</small></span>
    </a>
    <button className="mkt-menu" type="button" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><i /><i /></button>
    <nav className={open ? 'mkt-nav is-open' : 'mkt-nav'} aria-label="Navegação principal">
      <a href="/#servicos" onClick={close}>Serviços</a>
      <a href="/portfolio" onClick={close}>Projetos</a>
      <a href="/#plataformas" onClick={close}>Plataformas</a>
      <a href="/blog" onClick={close}>Blog</a>
      <a href="/sobre" onClick={close}>Sobre</a>
      <a className="mkt-nav-cta" href="/orcamento" onClick={close}>Pedir orçamento <span>↗</span></a>
    </nav>
  </header>
}

function Footer({ contact = defaultContact }) {
  return <footer className="mkt-footer">
    <div className="mkt-container mkt-footer-grid">
      <div className="mkt-footer-brand">
        <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
        <div><strong>Peter Tecnet</strong><p>Produtos, serviços e soluções em tecnologia do básico ao avançado.</p></div>
      </div>
      <div className="mkt-footer-links">
        <a href="/#servicos">Serviços</a><a href="/portfolio">Projetos</a><a href="/blog">Blog</a><a href="/sobre">Sobre</a>
        <a href={contact.instagram || defaultContact.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>
        <a href="/login">Área administrativa</a>
      </div>
      <p className="mkt-footer-legal">© {new Date().getFullYear()} Peter Tecnet · CNPJ {CNPJ}</p>
    </div>
  </footer>
}

function Chrome({ children, contact }) {
  useLandingMotion(true)
  return <div className="mkt-shell hub-shell"><div className="mkt-scroll-progress" aria-hidden="true" /><div className="mkt-pointer" aria-hidden="true" /><Header />{children}<Footer contact={contact} /></div>
}

function ServiceVisual({ service, image }) {
  return <div className={image ? 'hub-service-visual has-image' : 'hub-service-visual'} aria-hidden="true">
    {image ? <img src={resolveAssetUrl(image) || image} alt="" loading="lazy" /> : <><span>{service.icon}</span><i /><i /><b>{service.eyebrow}</b></>}
  </div>
}

function ServiceCard({ service }) {
  return <article className="hub-service-card" data-reveal>
    <ServiceVisual service={service} image={service.cover_image} />
    <div><p className="mkt-card-eyebrow">{service.eyebrow}</p><h3>{service.title}</h3><p>{service.short}</p><div className="mkt-chip-row">{service.intents.slice(0, 3).map(intent => <span key={intent}>{intent}</span>)}</div><a className="mkt-text-link" href={`/servicos/${service.slug}`}>Conhecer o serviço <span>↗</span></a></div>
  </article>
}

function PlatformCard({ application, index }) {
  const slug = platformSlug(application)
  const copy = applicationSeo[slug]
  return <article className="mkt-platform-card" data-reveal data-tilt>
    <div className="mkt-card-index"><span>{String(index + 1).padStart(2, '0')}</span><small>PRODUTO PETER TECNET</small></div>
    <a className="mkt-platform-logo" href={applicationHref(application)}><img src={resolveAssetUrl(application.logo) || '/petertecnet-brand.svg'} alt={`Logo ${application.name}`} loading="lazy" /></a>
    <p className="mkt-card-eyebrow">{copy?.eyebrow || 'Plataforma'}</p><h3><a href={applicationHref(application)}>{application.name}</a></h3><p>{copy?.description || application.description || 'Plataforma desenvolvida pela Peter Tecnet.'}</p><a className="mkt-text-link" href={applicationHref(application)}>Conhecer a plataforma <span>↗</span></a>
  </article>
}

function CatalogCard({ item }) {
  return <article className="mkt-catalog-card hub-catalog-card" data-reveal>
    <a className="mkt-catalog-media" href={itemHref(item)}><img src={getItemImage(item)} alt={item.name} loading="lazy" /><span className="mkt-media-label">{item.category || item.type || 'Serviço'}</span></a>
    <div className="mkt-catalog-body"><div className="mkt-catalog-meta"><span>{item.subcategory || item.brand || 'Peter Tecnet'}</span><strong>{formatCurrency(item.price)}</strong></div><h3><a href={itemHref(item)}>{item.name}</a></h3><p>{item.description || 'Produto ou serviço oferecido pela Peter Tecnet.'}</p><a className="mkt-text-link" href={itemHref(item)}>Ver detalhes <span>↗</span></a></div>
  </article>
}

function BlogCard({ article }) {
  const related = serviceForText(`${article.title} ${article.description} ${(article.tags || []).join(' ')}`)
  return <article className="mkt-blog-card is-compact" data-reveal>
    <a className="mkt-blog-visual" href={`/blog/${article.slug}`} aria-label={article.title}><span className="mkt-blog-orbit" aria-hidden="true" /><small>{article.category}</small><strong>{article.title.split(':')[0]}</strong><i>↗</i></a>
    <div className="mkt-blog-body"><div className="mkt-blog-meta"><span>{article.date ? formatArticleDate(article.date) : 'Peter Tecnet'}</span>{article.readTime && <span>{article.readTime}</span>}</div><h3><a href={`/blog/${article.slug}`}>{article.title}</a></h3><p>{article.description}</p>{related && <a className="hub-related-service" href={`/servicos/${related.slug}`}>Relacionado: {related.eyebrow}</a>}<a className="mkt-text-link" href={`/blog/${article.slug}`}>Ler conteúdo <span>↗</span></a></div>
  </article>
}

function PortfolioCard({ application, entry, index }) {
  const slug = entry?.metadata?.related_platform || entry?.cluster || platformSlug(application)
  const blueprint = caseBlueprints[slug] || {}
  const name = entry?.title || application?.name || `Projeto ${index + 1}`
  return <article className="hub-case-card" data-reveal>
    <div className="hub-case-head"><span>{String(index + 1).padStart(2, '0')}</span>{application?.logo && <img src={resolveAssetUrl(application.logo)} alt="" loading="lazy" />}</div>
    <p className="mkt-card-eyebrow">PROJETO PETER TECNET</p><h3>{name}</h3>
    <dl><div><dt>Problema</dt><dd>{entry?.metadata?.problem || blueprint.problem || entry?.excerpt || 'Uma necessidade real que precisava ser organizada em uma experiência digital.'}</dd></div><div><dt>Solução</dt><dd>{entry?.metadata?.solution || blueprint.solution || application?.description || 'Produto digital desenvolvido pela Peter Tecnet.'}</dd></div><div><dt>Resultado</dt><dd>{entry?.metadata?.result || blueprint.result || 'Uma solução pronta para operar, medir e evoluir.'}</dd></div></dl>
    {application && <a className="mkt-text-link" href={applicationHref(application)}>Conhecer produto <span>↗</span></a>}
  </article>
}

function TrustSection({ contact }) {
  return <section className="hub-trust"><div className="mkt-container"><div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">CONFIANÇA</p><h2>Você sabe com quem está <span>falando e contratando.</span></h2></div><p>A Peter Tecnet apresenta seus produtos, canais e identificação de forma clara para quem chega pelo Google, redes sociais ou indicação.</p></div><div className="hub-trust-grid">{trustPoints.map(point => <article key={point.title} data-reveal><strong>✓</strong><h3>{point.title}</h3><p>{point.text}</p></article>)}</div><div className="hub-company-strip" data-reveal><span>CNPJ {CNPJ}</span><a href={`mailto:${contact.email}`}>{contact.email}</a>{contact.instagram && <a href={contact.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>}{(contact.whatsapp || contact.phone) && <a href={whatsappHref(contact)} target="_blank" rel="noreferrer">WhatsApp ↗</a>}</div></div></section>
}

function whatsappHref(contact) {
  const raw = contact.whatsapp || contact.phone || ''
  if (/^https?:/i.test(raw)) return raw
  const digits = String(raw).replace(/\D/g, '')
  return digits ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}` : '#'
}

function useSemanticSearch(query) {
  const [remote, setRemote] = useState([])
  useEffect(() => {
    const term = query.trim()
    if (term.length < 3) { setRemote([]); return undefined }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const payload = await fetchDiscoverySearch({ q: term, limit: 12 }, controller.signal)
        const candidates = payload?.data?.results || payload?.data || []
        setRemote(Array.isArray(candidates) ? candidates : [])
      } catch { setRemote([]) }
    }, 320)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])
  return remote
}

function CatalogSection({ catalog, services, status }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('todos')
  const remote = useSemanticSearch(query)
  const recommendedService = useMemo(() => serviceForText(query), [query])
  const grouped = useMemo(() => catalog.map(item => ({ item, group: groupCatalogItem(item) })), [catalog])
  const filtered = useMemo(() => {
    const term = normalize(query)
    return grouped.filter(row => (group === 'todos' || row.group === group) && (!term || normalize(`${row.item.name} ${row.item.description} ${row.item.category} ${row.item.subcategory}`).includes(term))).map(row => row.item)
  }, [grouped, group, query])

  return <section className="mkt-catalog hub-catalog" id="catalogo"><div className="mkt-container">
    <div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">PRODUTOS E SERVIÇOS</p><h2>Encontre algo pronto ou <span>conte o que precisa.</span></h2></div><p>O catálogo reúne serviços disponíveis e soluções que podem ser contratadas diretamente. Para projetos maiores, você também pode pedir um orçamento.</p></div>
    <div className="hub-search-box" data-reveal><label><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: quero criar um site, preciso de um contrato, quero automatizar atendimento…" /></label>{recommendedService && query.trim().length >= 3 && <a href={`/servicos/${recommendedService.slug}`}><small>Talvez você precise de</small><strong>{recommendedService.title}</strong><span>↗</span></a>}</div>
    <div className="hub-group-tabs" data-reveal><button className={group === 'todos' ? 'is-active' : ''} onClick={() => setGroup('todos')} type="button">Todos</button>{catalogGroups.map(item => <button className={group === item.id ? 'is-active' : ''} onClick={() => setGroup(item.id)} type="button" key={item.id}>{item.label}</button>)}</div>
    {status === 'loading' && <div className="mkt-state">Carregando produtos e serviços…</div>}
    {filtered.length > 0 && <div className="mkt-catalog-grid">{filtered.slice(0, 12).map(item => <CatalogCard item={item} key={item.id || item.slug} />)}</div>}
    {query && remote.length > 0 && <div className="hub-remote-results"><p className="mkt-card-eyebrow">OUTROS RESULTADOS RELACIONADOS</p><div>{remote.slice(0, 6).map((result, index) => <a href={result.url || result.path || '#catalogo'} key={result.id || result.slug || index}><strong>{result.title || result.name || 'Resultado relacionado'}</strong><span>{result.description || result.excerpt || result.type}</span></a>)}</div></div>}
    <div className="mkt-section-action"><a className="mkt-btn is-primary" href="/orcamento">Não encontrou? Conte sua necessidade <span>↗</span></a></div>
  </div></section>
}

function QuoteForm({ services, contact, initialService = '' }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', need: initialService, service_slug: initialService, budget: '', urgency: '', message: '' })
  const [files, setFiles] = useState([])
  const [state, setState] = useState('idle')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (initialService) setForm(current => ({ ...current, need: serviceBySlug(initialService)?.title || current.need, service_slug: initialService }))
  }, [initialService])

  const submit = async event => {
    event.preventDefault()
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim()) || !form.need.trim()) return
    setState('sending'); setFeedback('')
    const body = new FormData()
    Object.entries({ ...form, source: 'petertecnet-website', source_url: window.location.href, source_path: window.location.pathname }).forEach(([key, value]) => { if (value) body.append(key, value) })
    files.forEach(file => body.append('attachments[]', file))
    try {
      const response = await fetch(`${API_BASE_URL}/v1/apps/${CRM_APP_SLUG}/crm/inquiries`, { method: 'POST', headers: { Accept: 'application/json' }, body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || Object.values(payload?.errors || {}).flat().join(' ') || 'Não foi possível enviar a solicitação.')
      setState('success')
      setFeedback(`Solicitação recebida${payload?.data?.reference ? ` · ${payload.data.reference}` : ''}.`)
      trackDiscoveryEvent('conversion', { entityType: 'inquiry', entityId: payload?.data?.opportunity_id, application: APP_SLUG, metadata: { service_slug: form.service_slug, need: form.need } })
      setForm({ name: '', email: '', phone: '', company: '', need: '', service_slug: '', budget: '', urgency: '', message: '' }); setFiles([])
    } catch (error) { setState('error'); setFeedback(error.message) }
  }

  return <form className="hub-quote-form" onSubmit={submit}>
    <div className="hub-form-grid"><label><span>Nome *</span><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required /></label><label><span>Empresa</span><input value={form.company} onChange={event => setForm(current => ({ ...current, company: event.target.value }))} /></label><label><span>E-mail</span><input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label><label><span>WhatsApp / telefone</span><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></label><label className="is-wide"><span>O que você precisa? *</span><select value={form.service_slug} onChange={event => { const service = services.find(item => item.slug === event.target.value); setForm(current => ({ ...current, service_slug: event.target.value, need: service?.title || current.need })) }}><option value="">Outra necessidade</option>{services.map(service => <option value={service.slug} key={service.slug}>{service.title}</option>)}</select><input className="hub-need-free" value={form.need} onChange={event => setForm(current => ({ ...current, need: event.target.value }))} placeholder="Descreva em poucas palavras" required /></label><label><span>Faixa de investimento</span><select value={form.budget} onChange={event => setForm(current => ({ ...current, budget: event.target.value }))}><option value="">Ainda não sei</option><option>Até R$ 500</option><option>R$ 500 a R$ 2.000</option><option>R$ 2.000 a R$ 10.000</option><option>Acima de R$ 10.000</option></select></label><label><span>Urgência</span><select value={form.urgency} onChange={event => setForm(current => ({ ...current, urgency: event.target.value }))}><option value="">Sem prazo definido</option><option>Preciso o quanto antes</option><option>Até 7 dias</option><option>Até 30 dias</option><option>Posso planejar</option></select></label><label className="is-wide"><span>Detalhes</span><textarea rows="6" value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} placeholder="Explique o problema, o que já existe e o resultado que você espera." /></label><label className="is-wide hub-file"><span>Anexos</span><input type="file" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={event => setFiles([...event.target.files].slice(0, 4))} /><small>Até 4 arquivos. PDF, documentos ou imagens.</small></label></div>
    {feedback && <div className={`hub-form-feedback is-${state}`}>{feedback}{state === 'error' && contact.email && <> <a href={`mailto:${contact.email}`}>Enviar por e-mail</a></>}</div>}
    <button className="mkt-btn is-primary" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : 'Enviar solicitação'} <span>↗</span></button>
  </form>
}

function HomePage({ data }) {
  const hero = data.landingEntries.find(entry => entry.cluster === 'home-hero')
  const about = data.landingEntries.find(entry => entry.cluster === 'home-about')
  const cases = data.caseStudies.length ? data.caseStudies.slice(0, 5).map((entry, index) => ({ entry, application: data.applications.find(app => platformSlug(app) === (entry.metadata?.related_platform || entry.cluster)) || data.applications[index] })) : data.applications.slice(0, 5).map(application => ({ application, entry: null }))

  useEffect(() => { updatePageSeo({ title: 'Peter Tecnet | Software, sites, aplicativos, IA e serviços digitais', description: 'Desenvolvimento de software, sites, landing pages, aplicativos, e-commerce, automação, IA, integrações, banco de dados e serviços digitais.', path: '/', schema: { '@context': 'https://schema.org', '@type': 'Organization', name: 'Peter Tecnet', url: ORIGIN, taxID: CNPJ, logo: `${ORIGIN}/petertecnet-brand.svg` } }) }, [])

  return <Chrome contact={data.contact}><main>
    <section className="mkt-hero hub-hero"><div className="mkt-grid" aria-hidden="true" /><div className="mkt-aurora mkt-aurora-a" aria-hidden="true" /><div className="mkt-container hub-hero-layout"><div className="mkt-hero-copy" data-reveal><p className="mkt-kicker"><span /> PETER TECNET</p><h1>{hero?.title || <>Tecnologia para transformar uma necessidade em <em>algo que funciona.</em></>}</h1><p className="mkt-hero-lead">{hero?.excerpt || 'Criamos software, sites, aplicativos, automações, integrações e produtos digitais. Também resolvemos demandas menores quando você só precisa que uma tarefa digital seja feita de forma prática.'}</p><div className="mkt-hero-actions"><a className="mkt-btn is-primary" href="/orcamento">Conte o que você precisa <span>↗</span></a><a className="mkt-btn is-ghost" href="#servicos">Conhecer serviços <span>↘</span></a></div><div className="hub-hero-proof"><span><strong>{data.applications.length || '—'}</strong> plataformas próprias</span><span><strong>{data.catalog.length || '—'}</strong> produtos e serviços</span><span><strong>1</strong> parceiro de tecnologia</span></div></div><aside className="hub-hero-panel" data-reveal><div className="hub-hero-mark"><img src="/petertecnet-brand.svg" alt="Peter Tecnet" /><span /><span /></div><p>Do primeiro contato à entrega</p><div><span>IDEIA</span><b>→</b><span>PROJETO</span><b>→</b><span>ENTREGA</span></div><small>Software · Sites · Apps · IA · Serviços digitais</small></aside></div></section>

    <section className="hub-services" id="servicos"><div className="mkt-container"><div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">O QUE FAZEMOS</p><h2>Serviços para quem precisa <span>criar, melhorar ou resolver.</span></h2></div><p>Você pode chegar com uma ideia completa ou apenas explicar o problema. Organizamos o caminho e mostramos qual tipo de solução faz sentido.</p></div><div className="hub-service-grid">{data.services.map(service => <ServiceCard service={service} key={service.slug} />)}</div></div></section>

    <section className="mkt-platforms hub-platforms" id="plataformas"><div className="mkt-container"><div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">PRODUTOS PETER TECNET</p><h2>Também criamos e operamos <span>nossas próprias plataformas.</span></h2></div><p>Esses produtos mostram na prática áreas em que trabalhamos: comércio, agendamento, eventos, relacionamento, vendas e gestão.</p></div>{data.applications.length > 0 && <div className="mkt-platform-grid">{data.applications.map((application, index) => <PlatformCard application={application} index={index} key={application.id || application.slug} />)}</div>}</div></section>

    <section className="hub-about" id="empresa"><div className="mkt-container hub-about-grid"><div data-reveal><p className="mkt-kicker">SOBRE A PETER TECNET</p><h2>{about?.title || <>Tecnologia não precisa ser complicada para <span>ser útil.</span></>}</h2><p>{about?.excerpt || 'A Peter Tecnet desenvolve soluções digitais para empresas e pessoas. Trabalhamos desde tarefas simples até sistemas completos, sempre procurando a solução proporcional ao problema.'}</p><a className="mkt-text-link" href="/sobre">Conheça a Peter Tecnet <span>↗</span></a></div><div className="hub-about-list">{aboutFacts.map((fact, index) => <article key={fact} data-reveal><span>{String(index + 1).padStart(2, '0')}</span><strong>{fact}</strong></article>)}</div></div></section>

    <section className="hub-cases"><div className="mkt-container"><div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">PROJETOS E CASES</p><h2>Não mostramos apenas serviços. <span>Mostramos o que construímos.</span></h2></div><p>Conheça problemas que deram origem a produtos do ecossistema e como eles foram transformados em soluções digitais.</p></div><div className="hub-case-grid">{cases.slice(0, 3).map((candidate, index) => <PortfolioCard {...candidate} index={index} key={candidate.entry?.id || candidate.application?.id || index} />)}</div><div className="mkt-section-action"><a className="mkt-btn is-ghost" href="/portfolio">Ver projetos Peter Tecnet <span>↗</span></a></div></div></section>

    <CatalogSection catalog={data.catalog} services={data.services} status={data.status} />

    <section className="mkt-blog-preview hub-blog"><div className="mkt-container"><div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">CONTEÚDOS PETER TECNET</p><h2>Guias e explicações para <span>quem está buscando uma solução.</span></h2></div><p>Publicamos conteúdos sobre problemas, ferramentas e decisões comuns em tecnologia. Novos artigos publicados no Admin Center entram aqui automaticamente.</p></div><div className="mkt-blog-grid">{data.articles.slice(0, 3).map(article => <BlogCard article={article} key={article.slug} />)}</div><div className="mkt-section-action"><a className="mkt-btn is-ghost" href="/blog">Ver todos os conteúdos <span>↗</span></a></div></div></section>

    <TrustSection contact={data.contact} />

    <section className="mkt-conversion hub-conversion" id="contato"><div className="mkt-grid" aria-hidden="true" /><div className="mkt-container mkt-conversion-inner" data-reveal><p className="mkt-kicker">PRÓXIMO PASSO</p><h2>Você não precisa saber o nome técnico da solução. <span>Conte o problema.</span></h2><p>Explique o que precisa fazer, melhorar ou criar. A Peter Tecnet avalia o caminho e transforma a necessidade em uma proposta de solução.</p><div className="mkt-hero-actions"><a className="mkt-btn is-primary" href="/orcamento">Pedir orçamento <span>↗</span></a>{data.contact.email && <a className="mkt-btn is-ghost" href={`mailto:${data.contact.email}`}>Enviar e-mail <span>↗</span></a>}{(data.contact.whatsapp || data.contact.phone) && <a className="mkt-btn is-ghost" href={whatsappHref(data.contact)} target="_blank" rel="noreferrer">WhatsApp <span>↗</span></a>}</div></div></section>
  </main></Chrome>
}

function ServicePage({ service, data }) {
  useEffect(() => {
    if (!service) return
    updatePageSeo({ title: service.seo_title || `${service.title} | Peter Tecnet`, description: service.seo_description || service.short, path: `/servicos/${service.slug}`, image: service.cover_image, schema: [{ '@context': 'https://schema.org', '@type': 'Service', name: service.title, description: service.short, provider: { '@type': 'Organization', name: 'Peter Tecnet', url: ORIGIN }, url: `${ORIGIN}/servicos/${service.slug}` }, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Peter Tecnet', item: ORIGIN }, { '@type': 'ListItem', position: 2, name: 'Serviços', item: `${ORIGIN}/#servicos` }, { '@type': 'ListItem', position: 3, name: service.title, item: `${ORIGIN}/servicos/${service.slug}` }] }] })
  }, [service])
  if (!service) return <NotFound contact={data.contact} />
  const relatedArticles = data.articles.filter(article => serviceForText(`${article.title} ${article.description}`)?.slug === service.slug).slice(0, 3)
  const relatedServices = service.related.map(slug => data.services.find(candidate => candidate.slug === slug)).filter(Boolean)
  return <Chrome contact={data.contact}><main><section className="hub-detail-hero"><div className="mkt-grid" aria-hidden="true" /><div className="mkt-container hub-detail-grid"><div data-reveal><div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><a href="/#servicos">Serviços</a><span>/</span><strong>{service.eyebrow}</strong></div><p className="mkt-kicker">{service.eyebrow}</p><h1>{service.title}</h1><p className="mkt-detail-lead">{service.short}</p><div className="mkt-hero-actions"><a className="mkt-btn is-primary" href={`/orcamento?servico=${encodeURIComponent(service.slug)}`}>Pedir orçamento <span>↗</span></a><a className="mkt-btn is-ghost" href="/#servicos">Outros serviços</a></div></div><ServiceVisual service={service} image={service.cover_image} /></div></section><section className="hub-service-copy"><div className="mkt-container hub-copy-grid"><div data-reveal><p className="mkt-kicker">COMO PODEMOS AJUDAR</p><h2>Uma solução construída a partir <span>da sua necessidade.</span></h2><p>{service.description}</p></div><div className="hub-deliverables" data-reveal>{service.deliverables.map((deliverable, index) => <article key={deliverable}><span>{String(index + 1).padStart(2, '0')}</span><strong>{deliverable}</strong></article>)}</div></div></section><section className="hub-related"><div className="mkt-container"><div className="mkt-section-heading"><p className="mkt-kicker">SERVIÇOS RELACIONADOS</p><h2>Talvez seu projeto também <span>precise disso.</span></h2></div><div className="hub-service-grid is-related">{relatedServices.map(candidate => <ServiceCard service={candidate} key={candidate.slug} />)}</div></div></section>{relatedArticles.length > 0 && <section className="mkt-blog-preview"><div className="mkt-container"><div className="mkt-section-heading"><p className="mkt-kicker">CONTEÚDO RELACIONADO</p><h2>Leia antes de <span>decidir.</span></h2></div><div className="mkt-blog-grid">{relatedArticles.map(article => <BlogCard article={article} key={article.slug} />)}</div></div></section>}<section className="hub-inline-quote"><div className="mkt-container"><div className="mkt-section-heading is-split"><div><p className="mkt-kicker">SOLICITAR PROPOSTA</p><h2>Fale sobre o seu <span>projeto.</span></h2></div><p>A solicitação entra diretamente no nosso fluxo comercial para acompanhamento.</p></div><QuoteForm services={data.services} contact={data.contact} initialService={service.slug} /></div></section></main></Chrome>
}

function PortfolioPage({ data }) {
  useEffect(() => { updatePageSeo({ title: 'Projetos e cases | Peter Tecnet', description: 'Conheça plataformas, produtos e projetos desenvolvidos pela Peter Tecnet.', path: '/portfolio' }) }, [])
  const cases = data.caseStudies.length ? data.caseStudies.map((entry, index) => ({ entry, application: data.applications.find(app => platformSlug(app) === (entry.metadata?.related_platform || entry.cluster)) || data.applications[index] })) : data.applications.map(application => ({ application, entry: null }))
  return <Chrome contact={data.contact}><main><section className="hub-page-hero"><div className="mkt-container"><p className="mkt-kicker">PORTFÓLIO</p><h1>Projetos que mostram <span>como trabalhamos.</span></h1><p>Produtos próprios e estudos de caso publicados pelo Admin Center aparecem aqui automaticamente.</p></div></section><section className="hub-cases"><div className="mkt-container"><div className="hub-case-grid">{cases.map((candidate, index) => <PortfolioCard {...candidate} index={index} key={candidate.entry?.id || candidate.application?.id || index} />)}</div></div></section></main></Chrome>
}

function AboutPage({ data }) {
  useEffect(() => { updatePageSeo({ title: 'Sobre a Peter Tecnet | Tecnologia do básico ao avançado', description: 'Conheça a Peter Tecnet, empresa de tecnologia que desenvolve software, plataformas, sites, automações e serviços digitais.', path: '/sobre' }) }, [])
  return <Chrome contact={data.contact}><main><section className="hub-page-hero"><div className="mkt-container"><p className="mkt-kicker">SOBRE A PETER TECNET</p><h1>Tecnologia para resolver <span>problemas reais.</span></h1><p>A Peter Tecnet cria produtos próprios e desenvolve soluções para empresas e pessoas. O trabalho pode começar em uma pequena demanda digital e chegar a um sistema completo.</p></div></section><section className="hub-about"><div className="mkt-container hub-about-grid"><div><h2>O que buscamos em cada projeto.</h2><p>Entender o problema antes de escolher a tecnologia, entregar algo utilizável e manter espaço para evolução sem transformar uma necessidade simples em complexidade desnecessária.</p></div><div className="hub-about-list">{aboutFacts.map((fact, index) => <article key={fact}><span>{String(index + 1).padStart(2, '0')}</span><strong>{fact}</strong></article>)}</div></div></section><TrustSection contact={data.contact} /><section className="hub-inline-quote"><div className="mkt-container"><div className="mkt-section-heading"><p className="mkt-kicker">TRABALHE CONOSCO</p><h2>Tem uma ideia ou <span>um problema?</span></h2></div><a className="mkt-btn is-primary" href="/orcamento">Conte para a Peter Tecnet <span>↗</span></a></div></section></main></Chrome>
}

function QuotePage({ data }) {
  const initialService = new URLSearchParams(window.location.search).get('servico') || ''
  useEffect(() => { updatePageSeo({ title: 'Pedir orçamento | Peter Tecnet', description: 'Conte sua necessidade e solicite uma proposta de software, site, aplicativo, automação ou serviço digital.', path: '/orcamento', robots: 'index, follow' }) }, [])
  return <Chrome contact={data.contact}><main><section className="hub-page-hero"><div className="mkt-container"><p className="mkt-kicker">ORÇAMENTO</p><h1>Conte o que você precisa. <span>Nós organizamos o próximo passo.</span></h1><p>Você pode descrever o problema com suas próprias palavras. Não é necessário saber qual tecnologia ou serviço contratar.</p></div></section><section className="hub-inline-quote"><div className="mkt-container hub-quote-layout"><div><QuoteForm services={data.services} contact={data.contact} initialService={initialService} /></div><aside><h2>Depois do envio</h2><ol><li><span>01</span><p>A solicitação entra no fluxo comercial.</p></li><li><span>02</span><p>A necessidade é analisada e organizada.</p></li><li><span>03</span><p>Entramos em contato para alinhar escopo, prazo e proposta.</p></li></ol><p className="hub-privacy-note">Os dados enviados são usados para responder à sua solicitação e acompanhar o atendimento.</p></aside></div></section></main></Chrome>
}

function NotFound({ contact }) {
  return <Chrome contact={contact}><main className="mkt-page-state"><img src="/petertecnet-brand.svg" alt="" /><h1>Página não encontrada.</h1><p>Volte para a Peter Tecnet e encontre produtos, serviços e plataformas.</p><a className="mkt-btn is-primary" href="/">Ir para o início</a></main></Chrome>
}

function MarketingHubRouter() {
  const data = useHubData()
  const serviceMatch = path.match(/^\/servicos\/([^/]+)$/)
  if (serviceMatch) return <ServicePage service={data.services.find(service => service.slug === decodeURIComponent(serviceMatch[1]))} data={data} />
  if (path === '/portfolio') return <PortfolioPage data={data} />
  if (path === '/sobre') return <AboutPage data={data} />
  if (path === '/orcamento') return <QuotePage data={data} />
  if (path === '/') return <HomePage data={data} />
  return <NotFound contact={data.contact} />
}

installGlobalImageFallbacks()
installPasswordVisibilityToggles()
installWebVitals(APP_SLUG)

createRoot(document.getElementById('root')).render(<StrictMode><PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}><MarketingHubRouter /></PeterAccountGateway></StrictMode>)
