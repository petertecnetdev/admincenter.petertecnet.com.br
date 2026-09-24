import { useEffect, useMemo, useState } from 'react'
import './MarketingExperience.css'
import {
  fetchApplications,
  fetchPeterCatalog,
  fetchPeterItem,
  fetchSite,
  formatCurrency,
  getItemImage,
  resolveAssetUrl,
} from './landingApi'
import useLandingMotion from './useLandingMotion'
import { updatePageSeo } from './seo'
import {
  applicationSeo,
  blogArticles,
  findBlogArticle,
  formatArticleDate,
  marketingPillars,
} from './marketingContent'

const ORIGIN = 'https://petertecnet.com.br'
const defaultContact = {
  email: 'contato@petertecnet.com.br',
  instagram: 'https://www.instagram.com/petertecnet/',
}

const heroSignals = [
  'desenvolvimento de software',
  'criação de sites e landing pages',
  'aplicativos sob medida',
  'IA e automação',
  'APIs, integrações e banco de dados',
  'serviços digitais e documentos',
]

const goalPaths = [
  { label: 'Criar software, site ou aplicativo', detail: 'Desenvolvimento sob medida, landing pages, e-commerce, sistemas, APIs, integrações e IA.', href: '#catalogo' },
  { label: 'Vender e divulgar produtos', detail: 'Catálogo digital, páginas de itens, QR Codes e presença online.', slug: 'nexus' },
  { label: 'Organizar agenda e serviços', detail: 'Serviços, profissionais, recursos, disponibilidade e reservas.', slug: 'rasoio' },
  { label: 'Criar e operar eventos', detail: 'Eventos, ingressos, participantes, promoters e check-in.', slug: 'cutinapp' },
  { label: 'Acompanhar oportunidades', detail: 'Clientes, propostas, cobranças e follow-up comercial.', slug: 'payflow' },
]

const catalogHighlights = [
  'Desenvolvimento de software',
  'Sites e landing pages',
  'Aplicativos',
  'E-commerce',
  'IA e automação',
  'APIs e integrações',
  'Banco de dados',
  'Documentos e serviços digitais',
]

const safeText = value => String(value || '').trim()
const normalize = value => safeText(value).toLocaleLowerCase('pt-BR')
const platformSlug = application => normalize(application?.slug).replace(/[^a-z0-9-]+/g, '-')
const applicationHref = application => `/plataformas/${encodeURIComponent(platformSlug(application))}`
const itemHref = item => `/solucoes/${encodeURIComponent(item?.slug || item?.id)}`

function useMarketingData({ withCatalog = false } = {}) {
  const [applications, setApplications] = useState([])
  const [catalog, setCatalog] = useState([])
  const [establishment, setEstablishment] = useState(null)
  const [contact, setContact] = useState(defaultContact)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const watchdog = window.setTimeout(() => {
      if (!active) return
      controller.abort()
      setStatus('error')
    }, 9000)

    const load = async () => {
      try {
        const [appsPayload, sitePayload] = await Promise.all([
          fetchApplications(controller.signal),
          fetchSite(controller.signal).catch(() => null),
        ])
        const apps = Array.isArray(appsPayload?.applications) ? appsPayload.applications : []
        window.__PETERTECNET_APPLICATIONS__ = apps
        window.dispatchEvent(new CustomEvent('petertecnet:applications', { detail: { applications: apps } }))
        setApplications(apps)
        if (sitePayload?.site?.contact) setContact(current => ({ ...current, ...sitePayload.site.contact }))

        if (withCatalog) {
          const catalogPayload = await fetchPeterCatalog(apps, controller.signal)
          setCatalog(Array.isArray(catalogPayload?.items) ? catalogPayload.items : [])
          setEstablishment(catalogPayload?.establishment || null)
        }
        if (active) setStatus('success')
      } catch {
        if (active) setStatus('error')
      } finally {
        window.clearTimeout(watchdog)
      }
    }
    load()
    return () => {
      active = false
      window.clearTimeout(watchdog)
      controller.abort()
    }
  }, [withCatalog])

  return { applications, catalog, establishment, contact, status }
}

function MarketingHeader() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return <header className="mkt-header">
    <a className="mkt-brand" href="/" onClick={close} aria-label="Peter Tecnet — início">
      <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
      <span><strong>Peter Tecnet</strong><small>Technology ecosystem</small></span>
    </a>
    <button className="mkt-menu" type="button" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><i /><i /></button>
    <nav className={open ? 'mkt-nav is-open' : 'mkt-nav'} aria-label="Navegação principal">
      <a href="/#plataformas" onClick={close}>Plataformas</a>
      <a href="/#catalogo" onClick={close}>Catálogo</a>
      <a href="/blog" onClick={close}>Conteúdo</a>
      <a href="/#empresa" onClick={close}>Para empresas</a>
      <a className="mkt-nav-cta" href="/#contato" onClick={close}>Encontrar uma solução <span>↗</span></a>
    </nav>
  </header>
}

function MarketingFooter({ contact = defaultContact }) {
  return <footer className="mkt-footer">
    <div className="mkt-container mkt-footer-grid">
      <div className="mkt-footer-brand">
        <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
        <div><strong>Peter Tecnet</strong><p>Tecnologia para vender, organizar, integrar e crescer.</p></div>
      </div>
      <div className="mkt-footer-links">
        <a href="/blog">Blog</a>
        <a href="/#catalogo">Catálogo</a>
        <a href={contact.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>
        <a href="/login">Administrar</a>
      </div>
      <p className="mkt-footer-legal">© {new Date().getFullYear()} Peter Tecnet · CNPJ 42.595.409/0001-48</p>
    </div>
  </footer>
}

function PageChrome({ children, contact }) {
  useLandingMotion(true)
  return <div className="mkt-shell">
    <div className="mkt-scroll-progress" aria-hidden="true" />
    <div className="mkt-pointer" aria-hidden="true" />
    <MarketingHeader />
    {children}
    <MarketingFooter contact={contact} />
  </div>
}

function PlatformCard({ application, index }) {
  const slug = platformSlug(application)
  const seo = applicationSeo[slug]
  return <article className="mkt-platform-card" data-reveal data-tilt>
    <div className="mkt-card-index"><span>{String(index + 1).padStart(2, '0')}</span><small>{application?.version ? `v${application.version}` : 'PETER TECNET'}</small></div>
    <a className="mkt-platform-logo" href={applicationHref(application)} aria-label={`Conhecer ${application.name}`}>
      <img src={resolveAssetUrl(application.logo) || '/petertecnet-brand.svg'} alt={`Logo ${application.name}`} loading="lazy" />
    </a>
    <p className="mkt-card-eyebrow">{seo?.eyebrow || 'Produto digital'}</p>
    <h3><a href={applicationHref(application)}>{application.name}</a></h3>
    <p>{seo?.description || application.description || 'Plataforma desenvolvida dentro do ecossistema Peter Tecnet.'}</p>
    <div className="mkt-chip-row">{(seo?.intents || []).slice(0, 2).map(intent => <span key={intent}>{intent}</span>)}</div>
    <a className="mkt-text-link" href={applicationHref(application)}>Conhecer a plataforma <span>↗</span></a>
  </article>
}

function CatalogCard({ item }) {
  const image = getItemImage(item)
  return <article className="mkt-catalog-card" data-reveal data-tilt>
    <a className="mkt-catalog-media" href={itemHref(item)}>
      <img src={image} alt={item.name} loading="lazy" />
      <span className="mkt-media-label">{item.category || item.type || 'Solução'}</span>
    </a>
    <div className="mkt-catalog-body">
      <div className="mkt-catalog-meta"><span>{item.brand || item.subcategory || 'Peter Tecnet'}</span><strong>{formatCurrency(item.price)}</strong></div>
      <h3><a href={itemHref(item)}>{item.name}</a></h3>
      <p>{item.description || 'Produto ou serviço disponível no catálogo da Peter Tecnet.'}</p>
      <a className="mkt-text-link" href={itemHref(item)}>Ver detalhes <span>↗</span></a>
    </div>
  </article>
}

function BlogCard({ article, compact = false }) {
  return <article className={compact ? 'mkt-blog-card is-compact' : 'mkt-blog-card'} data-reveal>
    <a className="mkt-blog-visual" href={`/blog/${article.slug}`} aria-label={article.title}>
      <span className="mkt-blog-orbit" aria-hidden="true" />
      <small>{article.category}</small>
      <strong>{article.title.split(':')[0]}</strong>
      <i>↗</i>
    </a>
    <div className="mkt-blog-body">
      <div className="mkt-blog-meta"><span>{formatArticleDate(article.date)}</span><span>{article.readTime}</span></div>
      <h3><a href={`/blog/${article.slug}`}>{article.title}</a></h3>
      <p>{article.description}</p>
      <a className="mkt-text-link" href={`/blog/${article.slug}`}>Ler artigo <span>↗</span></a>
    </div>
  </article>
}

function LandingPage() {
  const { applications, catalog, contact, status } = useMarketingData({ withCatalog: true })
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('todos')
  const [goal, setGoal] = useState(0)
  const [signal, setSignal] = useState(0)

  useEffect(() => {
    updatePageSeo({
      title: 'Peter Tecnet | Desenvolvimento de software, sites, apps, IA e serviços de tecnologia',
      description: 'Aplicativos e plataformas próprias, desenvolvimento de software, sites, landing pages, e-commerce, APIs, banco de dados, integrações, IA, automações e serviços digitais da Peter Tecnet.',
      path: '/',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Peter Tecnet — software, aplicativos, sites, IA e serviços de tecnologia',
        url: `${ORIGIN}/`,
        description: 'Produtos, plataformas e serviços de tecnologia do básico ao avançado: software, aplicativos, sites, e-commerce, APIs, banco de dados, IA, automação e serviços digitais.',
        isPartOf: { '@id': `${ORIGIN}/#website` },
      },
    })
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const timer = window.setInterval(() => setSignal(value => (value + 1) % heroSignals.length), 2600)
    return () => window.clearInterval(timer)
  }, [])

  const categories = useMemo(() => [...new Set(catalog.map(item => item.category || item.type).filter(Boolean))].slice(0, 12), [catalog])
  const filtered = useMemo(() => {
    const term = normalize(query)
    return catalog.filter(item => {
      const itemCategory = item.category || item.type || ''
      const categoryMatch = category === 'todos' || itemCategory === category
      const text = normalize(`${item.name} ${item.description} ${item.category} ${item.subcategory} ${item.brand}`)
      return categoryMatch && (!term || text.includes(term))
    })
  }, [catalog, category, query])

  const selectedGoal = goalPaths[goal]
  const goalApp = selectedGoal.slug ? applications.find(application => platformSlug(application) === selectedGoal.slug) : null

  return <PageChrome contact={contact}>
    <main>
      <section className="mkt-hero" id="inicio">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-aurora mkt-aurora-a" aria-hidden="true" /><div className="mkt-aurora mkt-aurora-b" aria-hidden="true" />
        <div className="mkt-container mkt-hero-layout">
          <div className="mkt-hero-copy" data-reveal>
            <p className="mkt-kicker"><span /> TECNOLOGIA PARA PROBLEMAS REAIS</p>
            <h1>Tecnologia do básico ao avançado para <em>resolver o que você precisa.</em></h1>
            <p className="mkt-hero-lead">Criamos software, aplicativos, sites, landing pages, e-commerce, APIs, bancos de dados, integrações, automações e soluções com IA. Também atendemos serviços digitais mais simples, documentos e demandas operacionais que podem ser resolvidas com tecnologia.</p>
            <div className="mkt-hero-actions"><a className="mkt-btn is-primary" href="#comece">Encontrar minha solução <span>↘</span></a><a className="mkt-btn is-ghost" href="#catalogo">Explorar produtos e serviços <span>↗</span></a></div>
            <div className="mkt-live-query"><small>PESSOAS PROCURAM POR</small><strong key={heroSignals[signal]}>{heroSignals[signal]}</strong><span>_</span></div>
          </div>

          <aside className="mkt-command" data-reveal data-tilt aria-label="Visão do ecossistema Peter Tecnet">
            <div className="mkt-command-head"><span><i /> ECOSYSTEM / ONLINE</span><small>API CONNECTED</small></div>
            <div className="mkt-command-core"><div className="mkt-core-rings"><span /><span /><span /></div><img src="/petertecnet-brand.svg" alt="Peter Tecnet" /></div>
            <div className="mkt-command-stats"><div><strong>{status === 'success' ? applications.length : '—'}</strong><span>plataformas</span></div><div><strong>{status === 'success' ? catalog.length : '—'}</strong><span>produtos e serviços</span></div><div><strong>1</strong><span>ecossistema</span></div></div>
            <div className="mkt-command-stream"><span>DISCOVER</span><b>→</b><span>CONNECT</span><b>→</b><span>OPERATE</span></div>
          </aside>
        </div>
        <div className="mkt-marquee" aria-hidden="true"><div>SOFTWARE • APLICATIVOS • SITES • LANDING PAGES • E-COMMERCE • IA • AUTOMAÇÃO • API • BANCO DE DADOS • INTEGRAÇÕES • SERVIÇOS DIGITAIS • </div><div>SOFTWARE • APLICATIVOS • SITES • LANDING PAGES • E-COMMERCE • IA • AUTOMAÇÃO • API • BANCO DE DADOS • INTEGRAÇÕES • SERVIÇOS DIGITAIS • </div></div>
      </section>

      <section className="mkt-goals" id="comece">
        <div className="mkt-container">
          <div className="mkt-section-heading" data-reveal><p className="mkt-kicker">COMECE PELO QUE VOCÊ PRECISA</p><h2>Você pode precisar de uma plataforma pronta ou <span>de um serviço sob medida.</span></h2><p>Escolha o objetivo mais próximo da sua necessidade. A Peter Tecnet pode entregar uma ferramenta do ecossistema ou desenvolver e executar a solução necessária.</p></div>
          <div className="mkt-goal-layout" data-reveal>
            <div className="mkt-goal-list">{goalPaths.map((item, index) => <button type="button" key={item.slug || item.label} className={goal === index ? 'is-active' : ''} onClick={() => setGoal(index)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div><b>↗</b></button>)}</div>
            <div className="mkt-goal-result">
              <p className="mkt-card-eyebrow">Caminho recomendado</p>
              <h3>{goalApp?.name || applicationSeo[selectedGoal.slug]?.eyebrow || selectedGoal.label}</h3>
              <p>{applicationSeo[selectedGoal.slug]?.headline || selectedGoal.detail}</p>
              <div className="mkt-chip-row">{(applicationSeo[selectedGoal.slug]?.intents || catalogHighlights.slice(0, 4)).map(intent => <span key={intent}>{intent}</span>)}</div>
              <a className="mkt-btn is-primary" href={goalApp ? applicationHref(goalApp) : selectedGoal.href || '/#catalogo'}>{goalApp ? 'Ver solução' : 'Explorar serviços'} <span>↗</span></a>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-platforms" id="plataformas">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">ECOSSISTEMA PETER TECNET</p><h2>Cada plataforma resolve uma parte. <span>A arquitetura conecta o todo.</span></h2></div><p>Aplicativos e plataformas próprias são uma parte do que entregamos. Eles resolvem operações específicas e compartilham uma base tecnológica pensada para integração, evolução e reaproveitamento.</p></div>
          {status === 'loading' && <div className="mkt-state">Carregando plataformas conectadas à API…</div>}
          {applications.length > 0 && <div className="mkt-platform-grid">{applications.map((application, index) => <PlatformCard application={application} index={index} key={application.id || application.slug} />)}</div>}
          {status === 'error' && <div className="mkt-state">As plataformas não puderam ser carregadas agora. O conteúdo institucional continua disponível.</div>}
        </div>
      </section>

      <section className="mkt-discovery" id="empresa">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">DO BÁSICO AO AVANÇADO</p><h2>Uma empresa de tecnologia para <span>muito mais que software pronto.</span></h2></div><p>Atendemos desde tarefas digitais simples até projetos completos: formatação e criação de documentos, contratos e serviços online; sites, landing pages e e-commerce; sistemas, aplicativos, banco de dados, APIs, integrações, automações e inteligência artificial.</p></div>
          <div className="mkt-pillar-grid">{marketingPillars.map((pillar, index) => <article key={pillar.eyebrow} data-reveal><span>0{index + 1}</span><p className="mkt-card-eyebrow">{pillar.eyebrow}</p><h3>{pillar.title}</h3><p>{pillar.description}</p><div className="mkt-chip-row">{pillar.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div></article>)}</div>
        </div>
      </section>

      <section className="mkt-catalog" id="catalogo">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">CATÁLOGO PETER TECNET</p><h2>Conheça o que a Peter Tecnet <span>oferece de verdade.</span></h2></div><p>Esta é a nossa vitrine de produtos e serviços. Aqui entram desenvolvimento de software, sites, aplicativos, e-commerce, integrações, IA, banco de dados e também serviços digitais mais simples, como documentos e outras demandas tecnológicas. Os dados vêm da API central da Peter Tecnet; a Nexus é apenas uma das plataformas que também utiliza essa mesma base.</p></div>
          <div className="mkt-chip-row is-large" data-reveal>{catalogHighlights.map(highlight => <span key={highlight}>{highlight}</span>)}</div>
          <div className="mkt-catalog-tools" data-reveal><label><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar software, site, aplicativo, serviço, documento…" aria-label="Buscar produtos e serviços da Peter Tecnet" /></label><div><button type="button" className={category === 'todos' ? 'is-active' : ''} onClick={() => setCategory('todos')}>Todos</button>{categories.map(itemCategory => <button type="button" className={category === itemCategory ? 'is-active' : ''} onClick={() => setCategory(itemCategory)} key={itemCategory}>{itemCategory}</button>)}</div></div>
          {status === 'loading' && <div className="mkt-state">Carregando produtos e serviços da Peter Tecnet…</div>}
          {status === 'success' && filtered.length > 0 && <div className="mkt-catalog-grid">{filtered.slice(0, 12).map(item => <CatalogCard item={item} key={item.id || item.slug} />)}</div>}
          {status === 'success' && filtered.length === 0 && <div className="mkt-state">Nenhum produto ou serviço corresponde a essa busca.</div>}
        </div>
      </section>

      <section className="mkt-blog-preview" id="conteudo">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal><div><p className="mkt-kicker">PETER TECNET / CONTEÚDO</p><h2>Um blog para responder dúvidas <span>antes da conversa comercial.</span></h2></div><p>Artigos ajudam quem está pesquisando um problema a conhecer a Peter Tecnet antes mesmo de saber qual plataforma ou serviço procurar.</p></div>
          <div className="mkt-blog-grid">{blogArticles.slice(0, 3).map(article => <BlogCard article={article} key={article.slug} compact />)}</div>
          <div className="mkt-section-action"><a className="mkt-btn is-ghost" href="/blog">Ver todos os artigos <span>↗</span></a></div>
        </div>
      </section>

      <section className="mkt-conversion" id="contato">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-container mkt-conversion-inner" data-reveal>
          <div className="mkt-conversion-mark"><img src="/petertecnet-brand.svg" alt="" /><span /><span /></div>
          <p className="mkt-kicker">PRÓXIMO PASSO</p>
          <h2>Do serviço digital simples ao sistema completo. <span>Se envolve tecnologia, buscamos um caminho.</span></h2>
          <p>Use uma plataforma do ecossistema, contrate um item do catálogo ou fale com a Peter Tecnet sobre desenvolvimento sob medida, sites, aplicativos, documentos, integrações, automação, IA e evolução de uma operação digital existente.</p>
          <div className="mkt-hero-actions"><a className="mkt-btn is-primary" href={`mailto:${contact.email}?subject=${encodeURIComponent('Quero conversar sobre um produto ou serviço da Peter Tecnet')}`}>Falar com a Peter Tecnet <span>↗</span></a><a className="mkt-btn is-ghost" href="#catalogo">Ver produtos e serviços <span>↗</span></a></div>
        </div>
      </section>
    </main>
  </PageChrome>
}

function PlatformPage({ slug }) {
  const { applications, contact, status } = useMarketingData()
  const application = applications.find(candidate => platformSlug(candidate) === slug)
  const seo = applicationSeo[slug]

  useEffect(() => {
    if (status === 'loading') return
    if (!application) {
      updatePageSeo({ title: 'Plataforma não encontrada | Peter Tecnet', description: 'A plataforma solicitada não está disponível.', path: `/plataformas/${slug}`, robots: 'noindex, nofollow' })
      return
    }
    const description = seo?.description || application.description || `Conheça ${application.name}, uma plataforma do ecossistema Peter Tecnet.`
    updatePageSeo({
      title: seo?.title || `${application.name} | Plataforma Peter Tecnet`,
      description,
      path: `/plataformas/${slug}`,
      image: resolveAssetUrl(application.logo),
      type: 'website',
      schema: [
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: application.name,
          description,
          applicationCategory: 'BusinessApplication',
          url: `${ORIGIN}/plataformas/${slug}`,
          image: resolveAssetUrl(application.logo) || `${ORIGIN}/petertecnet-brand.svg`,
          creator: { '@id': `${ORIGIN}/#organization` },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Peter Tecnet', item: `${ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Plataformas', item: `${ORIGIN}/#plataformas` },
            { '@type': 'ListItem', position: 3, name: application.name, item: `${ORIGIN}/plataformas/${slug}` },
          ],
        },
      ],
    })
  }, [application, seo, slug, status])

  if (status === 'loading') return <PageChrome><main className="mkt-page-state"><img src="/petertecnet-brand.svg" alt="" /><p>Carregando plataforma…</p></main></PageChrome>
  if (!application) return <PageChrome><main className="mkt-page-state"><h1>Plataforma não encontrada.</h1><a className="mkt-btn is-primary" href="/#plataformas">Ver plataformas</a></main></PageChrome>

  const benefits = seo?.benefits || [
    application.description || 'Produto desenvolvido no ecossistema Peter Tecnet.',
    'Integração com a infraestrutura e serviços compartilhados do ecossistema.',
    'Experiência preparada para evoluir de acordo com a operação.',
  ]

  return <PageChrome contact={contact}>
    <main>
      <section className="mkt-detail-hero">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-container mkt-detail-layout">
          <div data-reveal>
            <div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><a href="/#plataformas">Plataformas</a><span>/</span><strong>{application.name}</strong></div>
            <p className="mkt-kicker">{seo?.eyebrow || 'PLATAFORMA PETER TECNET'}</p>
            <h1>{seo?.headline || application.description || `${application.name}: tecnologia criada para entrar em operação.`}</h1>
            <p className="mkt-detail-lead">{seo?.description || application.description}</p>
            <div className="mkt-chip-row is-large">{(seo?.intents || []).map(intent => <span key={intent}>{intent}</span>)}</div>
            <div className="mkt-hero-actions">{application.url && <a className="mkt-btn is-primary" href={application.url} target="_blank" rel="noreferrer">Abrir {application.name} <span>↗</span></a>}<a className="mkt-btn is-ghost" href={`mailto:${contact.email}?subject=${encodeURIComponent(`Quero saber mais sobre ${application.name}`)}`}>Falar sobre essa solução <span>↗</span></a></div>
          </div>
          <div className="mkt-product-orbit" data-reveal data-tilt><div className="mkt-orbit-lines"><span /><span /><span /></div><img src={resolveAssetUrl(application.logo) || '/petertecnet-brand.svg'} alt={`Logo ${application.name}`} /><small>PLATFORM / {slug.toUpperCase()}</small></div>
        </div>
      </section>

      <section className="mkt-benefits"><div className="mkt-container"><div className="mkt-section-heading" data-reveal><p className="mkt-kicker">O QUE ESSA PLATAFORMA ORGANIZA</p><h2>Uma proposta clara para <span>um problema específico.</span></h2></div><div className="mkt-benefit-grid">{benefits.map((benefit, index) => <article key={benefit} data-reveal><span>0{index + 1}</span><p>{benefit}</p></article>)}</div></div></section>

      <section className="mkt-related-content"><div className="mkt-container"><div className="mkt-section-heading" data-reveal><p className="mkt-kicker">APRENDA ANTES DE DECIDIR</p><h2>Conteúdo relacionado a <span>{application.name}.</span></h2></div><div className="mkt-blog-grid">{blogArticles.filter(article => article.relatedPlatform === slug).slice(0, 3).map(article => <BlogCard article={article} key={article.slug} compact />)}</div></div></section>
    </main>
  </PageChrome>
}

function ProductPage({ identifier }) {
  const [status, setStatus] = useState('loading')
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const appsPayload = await fetchApplications(controller.signal)
        const apps = Array.isArray(appsPayload?.applications) ? appsPayload.applications : []
        const itemPayload = await fetchPeterItem(identifier, apps, controller.signal)
        setPayload(itemPayload)
        setStatus('success')
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus(error?.status === 404 ? 'not-found' : 'error')
      }
    }
    load()
    return () => controller.abort()
  }, [identifier])

  useEffect(() => {
    if (status === 'loading') return
    if (!payload?.item) {
      updatePageSeo({ title: 'Produto não encontrado | Peter Tecnet', description: 'O produto ou serviço solicitado não está disponível no catálogo público.', path: `/solucoes/${encodeURIComponent(identifier)}`, robots: 'noindex, nofollow' })
      return
    }
    const { item, establishment } = payload
    const image = getItemImage(item)
    const price = Number(item.price)
    const productSchema = {
      '@context': 'https://schema.org',
      '@type': item.type === 'service' ? 'Service' : 'Product',
      name: item.name,
      description: item.description || `Conheça ${item.name} no catálogo Peter Tecnet.`,
      image: image && !image.startsWith('data:') ? [image] : undefined,
      category: item.category || item.type || undefined,
      brand: item.brand ? { '@type': 'Brand', name: item.brand } : undefined,
      url: `${ORIGIN}/solucoes/${encodeURIComponent(identifier)}`,
      offers: Number.isFinite(price) && price > 0 ? {
        '@type': 'Offer',
        priceCurrency: 'BRL',
        price: price.toFixed(2),
        availability: 'https://schema.org/InStock',
        url: `${ORIGIN}/solucoes/${encodeURIComponent(identifier)}`,
        seller: { '@type': 'Organization', name: establishment?.fantasy || establishment?.name || 'Peter Tecnet' },
      } : undefined,
    }
    updatePageSeo({
      title: `${item.name} | ${item.category || item.type || 'Produto'} | Peter Tecnet`,
      description: item.description || `${item.name}: conheça detalhes, categoria e disponibilidade no catálogo da Peter Tecnet.`,
      path: `/solucoes/${encodeURIComponent(identifier)}`,
      image,
      type: 'product',
      schema: [
        productSchema,
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Peter Tecnet', item: `${ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Catálogo', item: `${ORIGIN}/#catalogo` },
            { '@type': 'ListItem', position: 3, name: item.name, item: `${ORIGIN}/solucoes/${encodeURIComponent(identifier)}` },
          ],
        },
      ],
    })
  }, [identifier, payload, status])

  if (status === 'loading') return <PageChrome><main className="mkt-page-state"><img src="/petertecnet-brand.svg" alt="" /><p>Consultando o catálogo…</p></main></PageChrome>
  if (!payload?.item) return <PageChrome><main className="mkt-page-state"><h1>{status === 'not-found' ? 'Produto não encontrado.' : 'Não foi possível carregar este item.'}</h1><a className="mkt-btn is-primary" href="/#catalogo">Voltar ao catálogo</a></main></PageChrome>

  const { item, establishment, otherItems = [] } = payload
  const image = getItemImage(item)
  const contactEmail = establishment?.email || defaultContact.email

  return <PageChrome contact={{ ...defaultContact, email: contactEmail }}>
    <main>
      <section className="mkt-detail-hero mkt-product-detail">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-container mkt-detail-layout">
          <div data-reveal>
            <div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><a href="/#catalogo">Catálogo</a><span>/</span><strong>{item.name}</strong></div>
            <p className="mkt-kicker">{item.category || item.type || 'PRODUTO OU SERVIÇO'}</p>
            <h1>{item.name}</h1>
            <p className="mkt-detail-lead">{item.description || 'Produto ou serviço disponível no catálogo da Peter Tecnet.'}</p>
            <div className="mkt-product-price"><small>Valor</small><strong>{formatCurrency(item.price)}</strong></div>
            <div className="mkt-chip-row is-large">{[item.brand, item.category, item.subcategory].filter(Boolean).map(value => <span key={value}>{value}</span>)}</div>
            <div className="mkt-hero-actions"><a className="mkt-btn is-primary" href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Interesse em ${item.name}`)}&body=${encodeURIComponent(`Olá, encontrei ${item.name} no catálogo da Peter Tecnet e quero saber mais.`)}`}>Tenho interesse <span>↗</span></a><a className="mkt-btn is-ghost" href="/#catalogo">Continuar no catálogo <span>↘</span></a></div>
          </div>
          <div className="mkt-product-photo" data-reveal data-tilt><img src={image} alt={item.name} /><div><small>PETER TECNET / CATALOG</small><strong>{item.slug || `ITEM-${item.id}`}</strong></div></div>
        </div>
      </section>

      <section className="mkt-product-info"><div className="mkt-container mkt-product-info-grid"><div className="mkt-section-heading" data-reveal><p className="mkt-kicker">DETALHES DA SOLUÇÃO</p><h2>Entenda o que está incluído <span>neste produto ou serviço.</span></h2><p>Aqui reunimos descrição, categoria, valor e informações úteis para você avaliar a solução e falar com a Peter Tecnet sabendo exatamente o que procura.</p></div><dl data-reveal>{item.type && <><dt>Tipo</dt><dd>{item.type}</dd></>}{item.category && <><dt>Categoria</dt><dd>{item.category}</dd></>}{item.subcategory && <><dt>Subcategoria</dt><dd>{item.subcategory}</dd></>}{item.brand && <><dt>Marca</dt><dd>{item.brand}</dd></>}{establishment?.name && <><dt>Responsável</dt><dd>{establishment.fantasy || establishment.name}</dd></>}</dl></div></section>

      {otherItems.length > 0 && <section className="mkt-related-products"><div className="mkt-container"><div className="mkt-section-heading" data-reveal><p className="mkt-kicker">CONTINUE EXPLORANDO</p><h2>Outros produtos e serviços <span>da Peter Tecnet.</span></h2></div><div className="mkt-catalog-grid">{otherItems.slice(0, 4).map(candidate => <CatalogCard item={candidate} key={candidate.id || candidate.slug} />)}</div></div></section>}
    </main>
  </PageChrome>
}

function BlogIndexPage() {
  useEffect(() => {
    updatePageSeo({
      title: 'Blog Peter Tecnet | Software, automação, APIs, SEO e produtos digitais',
      description: 'Conteúdo prático sobre software para empresas, automação, APIs, integração de sistemas, catálogos digitais, SEO, agendamento e eventos.',
      path: '/blog',
      type: 'website',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'Blog Peter Tecnet',
        url: `${ORIGIN}/blog`,
        description: 'Conteúdo sobre tecnologia aplicada a operações, produtos digitais e empresas.',
        publisher: { '@id': `${ORIGIN}/#organization` },
      },
    })
  }, [])

  return <PageChrome>
    <main>
      <section className="mkt-blog-hero"><div className="mkt-grid" aria-hidden="true" /><div className="mkt-container" data-reveal><div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><strong>Blog</strong></div><p className="mkt-kicker">PETER TECNET / CONTEÚDO</p><h1>Tecnologia explicada a partir de <span>problemas que empresas realmente enfrentam.</span></h1><p>Conteúdo sobre software, automação, APIs, integração de sistemas, catálogo digital, SEO, agenda e eventos — conectado às soluções que construímos e operamos.</p></div></section>
      <section className="mkt-blog-list"><div className="mkt-container"><div className="mkt-blog-grid is-wide">{blogArticles.map(article => <BlogCard article={article} key={article.slug} />)}</div></div></section>
    </main>
  </PageChrome>
}

function BlogArticlePage({ slug }) {
  const article = findBlogArticle(slug)

  useEffect(() => {
    if (!article) {
      updatePageSeo({ title: 'Artigo não encontrado | Peter Tecnet', description: 'O artigo solicitado não está disponível.', path: `/blog/${slug}`, robots: 'noindex, nofollow' })
      return
    }
    updatePageSeo({
      title: article.seoTitle,
      description: article.description,
      path: `/blog/${article.slug}`,
      type: 'article',
      schema: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description: article.description,
          datePublished: article.date,
          dateModified: article.date,
          inLanguage: 'pt-BR',
          mainEntityOfPage: `${ORIGIN}/blog/${article.slug}`,
          author: { '@type': 'Organization', name: 'Peter Tecnet', url: `${ORIGIN}/` },
          publisher: { '@id': `${ORIGIN}/#organization` },
          image: `${ORIGIN}/thumbnail.jpg`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Peter Tecnet', item: `${ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: `${ORIGIN}/blog` },
            { '@type': 'ListItem', position: 3, name: article.title, item: `${ORIGIN}/blog/${article.slug}` },
          ],
        },
      ],
    })
  }, [article, slug])

  if (!article) return <PageChrome><main className="mkt-page-state"><h1>Artigo não encontrado.</h1><a className="mkt-btn is-primary" href="/blog">Voltar ao blog</a></main></PageChrome>
  const relatedSeo = article.relatedPlatform ? applicationSeo[article.relatedPlatform] : null

  return <PageChrome>
    <main>
      <article className="mkt-article">
        <header className="mkt-article-header"><div className="mkt-grid" aria-hidden="true" /><div className="mkt-container"><div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><a href="/blog">Blog</a><span>/</span><strong>{article.category}</strong></div><p className="mkt-kicker">{article.category.toUpperCase()} · {article.readTime}</p><h1>{article.title}</h1><p className="mkt-article-deck">{article.description}</p><div className="mkt-article-byline"><span>Peter Tecnet</span><i /> <time dateTime={article.date}>{formatArticleDate(article.date)}</time></div></div></header>
        <div className="mkt-container mkt-article-layout">
          <aside className="mkt-article-aside" data-reveal><strong>Neste artigo</strong>{article.sections.map(section => <a href={`#${section.heading.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`} key={section.heading}>{section.heading}</a>)}</aside>
          <div className="mkt-article-content">
            <p className="mkt-article-intro">{article.intro}</p>
            {article.sections.map(section => {
              const id = section.heading.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
              return <section id={id} key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>
            })}
            {article.relatedPlatform && <div className="mkt-article-cta"><p className="mkt-card-eyebrow">Solução relacionada</p><h2>{relatedSeo?.eyebrow || article.relatedPlatform}</h2><p>{relatedSeo?.description}</p><a className="mkt-btn is-primary" href={`/plataformas/${article.relatedPlatform}`}>Conhecer a plataforma <span>↗</span></a></div>}
          </div>
        </div>
      </article>
      <section className="mkt-related-content"><div className="mkt-container"><div className="mkt-section-heading" data-reveal><p className="mkt-kicker">CONTINUE LENDO</p><h2>Mais conteúdo sobre <span>tecnologia aplicada.</span></h2></div><div className="mkt-blog-grid">{blogArticles.filter(candidate => candidate.slug !== article.slug).slice(0, 3).map(candidate => <BlogCard article={candidate} key={candidate.slug} compact />)}</div></div></section>
    </main>
  </PageChrome>
}

export default function MarketingExperience() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const platformMatch = path.match(/^\/plataformas\/([^/]+)$/)
  const productMatch = path.match(/^\/solucoes\/([^/]+)$/)
  const articleMatch = path.match(/^\/blog\/([^/]+)$/)

  if (platformMatch) return <PlatformPage slug={decodeURIComponent(platformMatch[1])} />
  if (productMatch) return <ProductPage identifier={decodeURIComponent(productMatch[1])} />
  if (path === '/blog') return <BlogIndexPage />
  if (articleMatch) return <BlogArticlePage slug={decodeURIComponent(articleMatch[1])} />
  return <LandingPage />
}