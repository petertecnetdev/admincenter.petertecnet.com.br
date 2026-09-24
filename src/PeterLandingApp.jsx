import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './MarketingExperience.css'
import PeterAccountGateway from './components/PeterAccountGateway.jsx'
import {
  fetchApplications,
  fetchPeterCatalog,
  fetchSite,
  formatCurrency,
  getItemImage,
  resolveAssetUrl,
} from './landingApi.js'
import { fetchContentEntries, installWebVitals } from './discoveryApi.js'
import { applicationSeo, blogArticles, formatArticleDate } from './marketingContent.js'
import useLandingMotion from './useLandingMotion.js'
import { updatePageSeo } from './seo.js'
import { installGlobalImageFallbacks } from './utils/imageFallback.js'
import { installPasswordVisibilityToggles } from './utils/passwordVisibility.js'

const ORIGIN = 'https://petertecnet.com.br'
const API_BASE_URL = 'https://api.petertecnet.com.br/api'
const APP_SLUG = 'peter-tecnet'

const defaultContact = {
  email: 'contato@petertecnet.com.br',
  instagram: 'https://www.instagram.com/petertecnet/',
}

const serviceAreas = [
  {
    eyebrow: 'Software e sistemas',
    title: 'Desenvolvimento de software sob medida',
    description: 'Criamos sistemas, painéis administrativos, plataformas web e soluções internas de acordo com a rotina, o problema e os objetivos de cada projeto.',
    tags: ['sistemas web', 'painéis', 'software sob medida'],
  },
  {
    eyebrow: 'Sites e vendas online',
    title: 'Sites, landing pages e e-commerce',
    description: 'Desenvolvemos presença digital para apresentar empresas, divulgar serviços, vender produtos e transformar ideias em experiências acessíveis pelo celular e computador.',
    tags: ['website', 'landing page', 'e-commerce'],
  },
  {
    eyebrow: 'Aplicativos e plataformas',
    title: 'Aplicativos e produtos digitais',
    description: 'Criamos aplicativos, portais e plataformas para atendimento, agendamento, vendas, eventos, gestão e diferentes necessidades de pessoas e empresas.',
    tags: ['aplicativos', 'plataformas', 'produtos digitais'],
  },
  {
    eyebrow: 'IA e automação',
    title: 'Integrações, automações e inteligência artificial',
    description: 'Conectamos ferramentas, automatizamos tarefas repetitivas e aplicamos inteligência artificial quando ela realmente ajuda a reduzir trabalho e melhorar a operação.',
    tags: ['inteligência artificial', 'automação', 'integrações'],
  },
  {
    eyebrow: 'Dados e infraestrutura',
    title: 'APIs, bancos de dados e integrações',
    description: 'Estruturamos dados, integrações entre sistemas e serviços de backend para projetos que precisam de segurança, organização, desempenho e capacidade de evolução.',
    tags: ['API', 'banco de dados', 'backend'],
  },
  {
    eyebrow: 'Serviços digitais',
    title: 'Documentos, contratos e demandas do dia a dia',
    description: 'Também atendemos necessidades mais simples, como formatação de textos, elaboração e organização de documentos e contratos, apoio em serviços online e emissão de guias ou boletos, inclusive IPVA, conforme o serviço solicitado.',
    tags: ['documentos', 'contratos', 'serviços online'],
  },
]

const needs = [
  {
    label: 'Quero criar algo novo',
    title: 'Transformamos uma ideia em uma solução utilizável.',
    description: 'Podemos partir de uma necessidade, organizar o escopo e desenvolver site, aplicativo, sistema, automação ou outro produto digital.',
    href: '#contato',
    cta: 'Conversar sobre o projeto',
  },
  {
    label: 'Preciso melhorar uma operação',
    title: 'Analisamos o processo e desenvolvemos o que precisa melhorar.',
    description: 'Podemos integrar sistemas, automatizar tarefas, organizar dados, criar painéis ou evoluir uma ferramenta que já existe.',
    href: '#servicos',
    cta: 'Ver serviços',
  },
  {
    label: 'Quero usar uma plataforma pronta',
    title: 'A Peter Tecnet também possui plataformas próprias.',
    description: 'Nossas ferramentas atendem necessidades como catálogo e vendas, agendamentos, eventos, atendimento comercial e outras operações digitais.',
    href: '#plataformas',
    cta: 'Conhecer plataformas',
  },
  {
    label: 'Tenho uma demanda simples',
    title: 'Nem todo problema precisa virar um grande projeto.',
    description: 'Também realizamos serviços digitais do dia a dia, documentos, contratos, formatações, serviços online e outras demandas que podem ser resolvidas de forma prática.',
    href: '#catalogo',
    cta: 'Ver produtos e serviços',
  },
]

const safeText = value => String(value || '').trim()
const normalize = value => safeText(value).toLocaleLowerCase('pt-BR')
const platformSlug = application => normalize(application?.slug).replace(/[^a-z0-9-]+/g, '-')
const applicationHref = application => `/plataformas/${encodeURIComponent(platformSlug(application))}`
const itemHref = item => `/solucoes/${encodeURIComponent(item?.slug || item?.id)}`

function normalizeArticle(article) {
  return {
    ...article,
    slug: article?.slug,
    title: article?.title || 'Conteúdo Peter Tecnet',
    category: article?.category || 'Conteúdo',
    description: article?.excerpt || article?.description || 'Conteúdo produzido pela Peter Tecnet.',
    date: article?.published_at || article?.date || article?.created_at,
    readTime: article?.read_time || article?.readTime || null,
  }
}

function useLandingData() {
  const [applications, setApplications] = useState([])
  const [catalog, setCatalog] = useState([])
  const [contact, setContact] = useState(defaultContact)
  const [articles, setArticles] = useState(() => blogArticles.slice(0, 3).map(normalizeArticle))
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

        if (sitePayload?.site?.contact) {
          setContact(current => ({ ...current, ...sitePayload.site.contact }))
        }

        const [catalogPayload, contentPayload] = await Promise.all([
          fetchPeterCatalog(apps, controller.signal).catch(() => ({ items: [] })),
          fetchContentEntries({ type: 'article', per_page: 6 }, controller.signal).catch(() => null),
        ])

        setCatalog(Array.isArray(catalogPayload?.items) ? catalogPayload.items : [])

        const dynamicArticles = contentPayload?.data?.data
        if (Array.isArray(dynamicArticles) && dynamicArticles.length > 0) {
          setArticles(dynamicArticles.slice(0, 3).map(normalizeArticle))
        }

        setStatus('success')
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus('error')
      }
    }

    load()
    return () => controller.abort()
  }, [])

  return { applications, catalog, contact, articles, status }
}

function Header() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return <header className="mkt-header">
    <a className="mkt-brand" href="/" onClick={close} aria-label="Peter Tecnet — início">
      <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
      <span><strong>Peter Tecnet</strong><small>Soluções em tecnologia</small></span>
    </a>
    <button className="mkt-menu" type="button" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><i /><i /></button>
    <nav className={open ? 'mkt-nav is-open' : 'mkt-nav'} aria-label="Navegação principal">
      <a href="#servicos" onClick={close}>Serviços</a>
      <a href="#plataformas" onClick={close}>Plataformas</a>
      <a href="#catalogo" onClick={close}>Produtos</a>
      <a href="/blog" onClick={close}>Blog</a>
      <a className="mkt-nav-cta" href="#contato" onClick={close}>Falar com a Peter Tecnet <span>↗</span></a>
    </nav>
  </header>
}

function Footer({ contact }) {
  return <footer className="mkt-footer">
    <div className="mkt-container mkt-footer-grid">
      <div className="mkt-footer-brand">
        <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
        <div><strong>Peter Tecnet</strong><p>Produtos, serviços e soluções em tecnologia do básico ao avançado.</p></div>
      </div>
      <div className="mkt-footer-links">
        <a href="#servicos">Serviços</a>
        <a href="#plataformas">Plataformas</a>
        <a href="#catalogo">Produtos</a>
        <a href="/blog">Blog</a>
        <a href={contact.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>
        <a href="/login">Área administrativa</a>
      </div>
      <p className="mkt-footer-legal">© {new Date().getFullYear()} Peter Tecnet · CNPJ 42.595.409/0001-48</p>
    </div>
  </footer>
}

function PlatformCard({ application, index }) {
  const slug = platformSlug(application)
  const copy = applicationSeo[slug]

  return <article className="mkt-platform-card" data-reveal data-tilt>
    <div className="mkt-card-index"><span>{String(index + 1).padStart(2, '0')}</span><small>PLATAFORMA</small></div>
    <a className="mkt-platform-logo" href={applicationHref(application)} aria-label={`Conhecer ${application.name}`}>
      <img src={resolveAssetUrl(application.logo) || '/petertecnet-brand.svg'} alt={`Logo ${application.name}`} loading="lazy" />
    </a>
    <p className="mkt-card-eyebrow">{copy?.eyebrow || 'Solução Peter Tecnet'}</p>
    <h3><a href={applicationHref(application)}>{application.name}</a></h3>
    <p>{copy?.description || application.description || 'Plataforma criada pela Peter Tecnet para resolver necessidades reais de pessoas e empresas.'}</p>
    <a className="mkt-text-link" href={applicationHref(application)}>Conhecer {application.name} <span>↗</span></a>
  </article>
}

function CatalogCard({ item }) {
  return <article className="mkt-catalog-card" data-reveal data-tilt>
    <a className="mkt-catalog-media" href={itemHref(item)}>
      <img src={getItemImage(item)} alt={item.name} loading="lazy" />
      <span className="mkt-media-label">{item.category || item.type || 'Serviço'}</span>
    </a>
    <div className="mkt-catalog-body">
      <div className="mkt-catalog-meta"><span>{item.subcategory || item.brand || 'Peter Tecnet'}</span><strong>{formatCurrency(item.price)}</strong></div>
      <h3><a href={itemHref(item)}>{item.name}</a></h3>
      <p>{item.description || 'Produto ou serviço oferecido pela Peter Tecnet.'}</p>
      <a className="mkt-text-link" href={itemHref(item)}>Ver detalhes <span>↗</span></a>
    </div>
  </article>
}

function BlogCard({ article }) {
  const dateLabel = article.date ? formatArticleDate(article.date) : 'Peter Tecnet'

  return <article className="mkt-blog-card is-compact" data-reveal>
    <a className="mkt-blog-visual" href={`/blog/${article.slug}`} aria-label={article.title}>
      <span className="mkt-blog-orbit" aria-hidden="true" />
      <small>{article.category}</small>
      <strong>{article.title.split(':')[0]}</strong>
      <i>↗</i>
    </a>
    <div className="mkt-blog-body">
      <div className="mkt-blog-meta"><span>{dateLabel}</span>{article.readTime && <span>{article.readTime}</span>}</div>
      <h3><a href={`/blog/${article.slug}`}>{article.title}</a></h3>
      <p>{article.description}</p>
      <a className="mkt-text-link" href={`/blog/${article.slug}`}>Ler conteúdo <span>↗</span></a>
    </div>
  </article>
}

function PeterLandingExperience() {
  useLandingMotion(true)
  const { applications, catalog, contact, articles, status } = useLandingData()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('todos')
  const [need, setNeed] = useState(0)

  useEffect(() => {
    updatePageSeo({
      title: 'Peter Tecnet | Software, sites, aplicativos e serviços de tecnologia',
      description: 'A Peter Tecnet desenvolve software, sites, landing pages, aplicativos, e-commerce, automações, integrações, soluções com IA e também realiza serviços digitais do dia a dia.',
      path: '/',
      schema: [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          '@id': `${ORIGIN}/#organization`,
          name: 'Peter Tecnet',
          url: `${ORIGIN}/`,
          logo: `${ORIGIN}/petertecnet-brand.svg`,
          description: 'Empresa de tecnologia que desenvolve software, aplicativos, sites, plataformas, automações, integrações, soluções com inteligência artificial e serviços digitais.',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Peter Tecnet — produtos e serviços de tecnologia',
          url: `${ORIGIN}/`,
          description: 'Conheça os produtos, plataformas e serviços oferecidos pela Peter Tecnet.',
          isPartOf: { '@id': `${ORIGIN}/#website` },
        },
      ],
    })
  }, [])

  const categories = useMemo(() => [...new Set(catalog.map(item => item.category || item.type).filter(Boolean))].slice(0, 10), [catalog])

  const filteredCatalog = useMemo(() => {
    const term = normalize(query)
    return catalog.filter(item => {
      const itemCategory = item.category || item.type || ''
      const matchesCategory = category === 'todos' || itemCategory === category
      const searchable = normalize(`${item.name} ${item.description} ${item.category} ${item.subcategory} ${item.brand}`)
      return matchesCategory && (!term || searchable.includes(term))
    })
  }, [catalog, category, query])

  const selectedNeed = needs[need]

  return <div className="mkt-shell">
    <div className="mkt-scroll-progress" aria-hidden="true" />
    <div className="mkt-pointer" aria-hidden="true" />
    <Header />

    <main>
      <section className="mkt-hero" id="inicio">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-aurora mkt-aurora-a" aria-hidden="true" />
        <div className="mkt-aurora mkt-aurora-b" aria-hidden="true" />
        <div className="mkt-container mkt-hero-layout">
          <div className="mkt-hero-copy" data-reveal>
            <p className="mkt-kicker"><span /> PETER TECNET</p>
            <h1>Tecnologia para transformar ideias, necessidades e problemas em <em>soluções que funcionam.</em></h1>
            <p className="mkt-hero-lead">Desenvolvemos software, aplicativos, sites, landing pages, lojas virtuais, automações, integrações e soluções com inteligência artificial. Também realizamos serviços digitais mais simples para pessoas e empresas.</p>
            <div className="mkt-hero-actions">
              <a className="mkt-btn is-primary" href="#servicos">Conhecer nossos serviços <span>↘</span></a>
              <a className="mkt-btn is-ghost" href="#contato">Falar sobre uma necessidade <span>↗</span></a>
            </div>
            <div className="mkt-live-query"><small>DO BÁSICO AO AVANÇADO</small><strong>uma empresa, várias formas de ajudar</strong><span>_</span></div>
          </div>

          <aside className="mkt-command" data-reveal data-tilt aria-label="Peter Tecnet">
            <div className="mkt-command-head"><span><i /> PETER TECNET</span><small>SOLUÇÕES EM TECNOLOGIA</small></div>
            <div className="mkt-command-core"><div className="mkt-core-rings"><span /><span /><span /></div><img src="/petertecnet-brand.svg" alt="Peter Tecnet" /></div>
            <div className="mkt-command-stats">
              <div><strong>{status === 'success' ? applications.length : '—'}</strong><span>plataformas próprias</span></div>
              <div><strong>{status === 'success' ? catalog.length : '—'}</strong><span>produtos e serviços</span></div>
              <div><strong>+</strong><span>projetos sob medida</span></div>
            </div>
            <div className="mkt-command-stream"><span>IDEIA</span><b>→</b><span>PROJETO</span><b>→</b><span>ENTREGA</span></div>
          </aside>
        </div>
        <div className="mkt-marquee" aria-hidden="true">
          <div>SOFTWARE • APLICATIVOS • SITES • LANDING PAGES • E-COMMERCE • AUTOMAÇÕES • IA • INTEGRAÇÕES • BANCO DE DADOS • DOCUMENTOS • SERVIÇOS DIGITAIS • </div>
          <div>SOFTWARE • APLICATIVOS • SITES • LANDING PAGES • E-COMMERCE • AUTOMAÇÕES • IA • INTEGRAÇÕES • BANCO DE DADOS • DOCUMENTOS • SERVIÇOS DIGITAIS • </div>
        </div>
      </section>

      <section className="mkt-discovery" id="servicos">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal>
            <div><p className="mkt-kicker">O QUE FAZEMOS</p><h2>Da tarefa simples ao projeto completo. <span>A Peter Tecnet pode ajudar.</span></h2></div>
            <p>Atendemos necessidades de tecnologia em diferentes níveis. Você pode contratar um serviço específico, usar uma de nossas plataformas ou desenvolver uma solução totalmente nova.</p>
          </div>
          <div className="mkt-pillar-grid">
            {serviceAreas.map((service, index) => <article key={service.title} data-reveal>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p className="mkt-card-eyebrow">{service.eyebrow}</p>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <div className="mkt-chip-row">{service.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
            </article>)}
          </div>
        </div>
      </section>

      <section className="mkt-goals" id="como-ajudamos">
        <div className="mkt-container">
          <div className="mkt-section-heading" data-reveal>
            <p className="mkt-kicker">COMO PODEMOS AJUDAR</p>
            <h2>Comece pela sua necessidade. <span>Não precisa saber qual tecnologia usar.</span></h2>
            <p>Escolha a situação que mais se aproxima do que você precisa e veja um caminho possível.</p>
          </div>
          <div className="mkt-goal-layout" data-reveal>
            <div className="mkt-goal-list">
              {needs.map((item, index) => <button type="button" key={item.label} className={need === index ? 'is-active' : ''} onClick={() => setNeed(index)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{item.label}</strong><small>{item.description}</small></div>
                <b>↗</b>
              </button>)}
            </div>
            <div className="mkt-goal-result">
              <p className="mkt-card-eyebrow">Uma forma de começar</p>
              <h3>{selectedNeed.title}</h3>
              <p>{selectedNeed.description}</p>
              <a className="mkt-btn is-primary" href={selectedNeed.href}>{selectedNeed.cta} <span>↗</span></a>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-platforms" id="plataformas">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal>
            <div><p className="mkt-kicker">NOSSAS PLATAFORMAS</p><h2>Produtos próprios criados para <span>resolver necessidades específicas.</span></h2></div>
            <p>Além de desenvolver projetos sob medida, a Peter Tecnet cria e mantém plataformas próprias para diferentes tipos de operação.</p>
          </div>
          {status === 'loading' && <div className="mkt-state">Carregando nossas plataformas…</div>}
          {applications.length > 0 && <div className="mkt-platform-grid">{applications.map((application, index) => <PlatformCard application={application} index={index} key={application.id || application.slug} />)}</div>}
          {status === 'error' && <div className="mkt-state">Não foi possível carregar as plataformas agora.</div>}
        </div>
      </section>

      <section className="mkt-catalog" id="catalogo">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal>
            <div><p className="mkt-kicker">PRODUTOS E SERVIÇOS</p><h2>Veja o que está disponível <span>na Peter Tecnet.</span></h2></div>
            <p>Encontre serviços de desenvolvimento, tecnologia, documentos, soluções digitais e outros itens oferecidos pela Peter Tecnet.</p>
          </div>

          <div className="mkt-catalog-tools" data-reveal>
            <label><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar produto ou serviço…" aria-label="Buscar produtos e serviços" /></label>
            <div>
              <button type="button" className={category === 'todos' ? 'is-active' : ''} onClick={() => setCategory('todos')}>Todos</button>
              {categories.map(itemCategory => <button type="button" className={category === itemCategory ? 'is-active' : ''} onClick={() => setCategory(itemCategory)} key={itemCategory}>{itemCategory}</button>)}
            </div>
          </div>

          {status === 'loading' && <div className="mkt-state">Carregando produtos e serviços…</div>}
          {status === 'success' && filteredCatalog.length > 0 && <div className="mkt-catalog-grid">{filteredCatalog.slice(0, 12).map(item => <CatalogCard item={item} key={item.id || item.slug} />)}</div>}
          {status === 'success' && filteredCatalog.length === 0 && <div className="mkt-state">Nenhum produto ou serviço corresponde a essa busca.</div>}
        </div>
      </section>

      <section className="mkt-blog-preview" id="conteudo">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split" data-reveal>
            <div><p className="mkt-kicker">CONTEÚDOS PETER TECNET</p><h2>Ideias, explicações e guias sobre <span>tecnologia e soluções digitais.</span></h2></div>
            <p>Acompanhe conteúdos produzidos pela Peter Tecnet sobre ferramentas, negócios, desenvolvimento, automação e uso da tecnologia no dia a dia.</p>
          </div>
          <div className="mkt-blog-grid">{articles.map(article => <BlogCard article={article} key={article.slug} />)}</div>
          <div className="mkt-section-action"><a className="mkt-btn is-ghost" href="/blog">Ver todos os conteúdos <span>↗</span></a></div>
        </div>
      </section>

      <section className="mkt-conversion" id="contato">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-container mkt-conversion-inner" data-reveal>
          <div className="mkt-conversion-mark"><img src="/petertecnet-brand.svg" alt="" /><span /><span /></div>
          <p className="mkt-kicker">FALE COM A PETER TECNET</p>
          <h2>Conte o que você precisa. <span>Nós pensamos na melhor forma de resolver.</span></h2>
          <p>Pode ser um site, aplicativo, sistema, automação, integração, documento, serviço online ou uma necessidade que ainda não tem uma solução definida.</p>
          <div className="mkt-hero-actions">
            <a className="mkt-btn is-primary" href={`mailto:${contact.email}?subject=${encodeURIComponent('Quero falar com a Peter Tecnet')}`}>Enviar e-mail <span>↗</span></a>
            <a className="mkt-btn is-ghost" href={contact.instagram} target="_blank" rel="noreferrer">Instagram <span>↗</span></a>
          </div>
        </div>
      </section>
    </main>

    <Footer contact={contact} />
  </div>
}

installGlobalImageFallbacks()
installPasswordVisibilityToggles()
installWebVitals(APP_SLUG)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
      <PeterLandingExperience />
    </PeterAccountGateway>
  </StrictMode>,
)
