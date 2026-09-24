import { useEffect, useMemo, useState } from 'react'
import './MarketingExperience.css'
import './PublicDiscoveryExperience.css'
import { blogArticles } from './marketingContent.js'
import { fetchContentEntries, trackDiscoveryEvent } from './discoveryApi.js'
import { updatePageSeo } from './seo.js'

const safeText = value => String(value ?? '').trim()

const petriniaCutinappArticle = {
  slug: 'petrinia-cutinapp-persistencia-tecnologia',
  title: 'Petrínia e a Cutinapp: quando persistência transforma uma ideia em tecnologia',
  description: 'Conheça Petrínia, uma garota determinada que enfrentou erros, dúvidas e um grande desafio técnico até transformar uma ideia na Cutinapp.',
  category: 'Histórias de tecnologia',
  date: '2026-09-04',
  readTime: '6 min',
  relatedPlatform: 'cutinapp',
  cluster: 'Cutinapp',
}

function safeDate(value) {
  if (!value) return 'Peter Tecnet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Peter Tecnet'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return 'Peter Tecnet'
  }
}

function normalizeStatic(article) {
  return {
    ...article,
    excerpt: article.description,
    published_at: article.date,
    source: 'static',
  }
}

function normalizeRemote(payload) {
  const candidates = Array.isArray(payload?.data?.data)
    ? payload.data.data
    : Array.isArray(payload?.data)
      ? payload.data
      : []

  return candidates
    .filter(entry => entry && typeof entry === 'object' && safeText(entry.slug) && safeText(entry.title))
    .map(entry => ({
      ...entry,
      slug: safeText(entry.slug),
      title: safeText(entry.title),
      excerpt: safeText(entry.excerpt || entry.description),
      category: safeText(entry.category) || 'Tecnologia',
      published_at: entry.published_at || entry.date || entry.created_at || null,
      source: 'api',
    }))
}

function Header() {
  return <header className="mkt-header">
    <a className="mkt-brand" href="/" aria-label="Peter Tecnet — início">
      <span className="mkt-brand-mark"><img src="/petertecnet-brand.svg" alt="" /></span>
      <span><strong>Peter Tecnet</strong><small>Soluções em tecnologia</small></span>
    </a>
    <nav className="mkt-nav discovery-nav" aria-label="Navegação principal">
      <a href="/">Início</a>
      <a href="/#plataformas">Plataformas</a>
      <a href="/#catalogo">Catálogo</a>
      <a href="/blog" aria-current="page">Conteúdos</a>
      <a href="/#contato">Contato</a>
    </nav>
  </header>
}

function Footer() {
  return <footer className="mkt-footer">
    <div className="mkt-container discovery-footer">
      <strong>Peter Tecnet</strong>
      <span>Tecnologia para criar, integrar, organizar e crescer.</span>
      <a href="/">Voltar ao início ↗</a>
    </div>
  </footer>
}

export default function PublicBlogIndex() {
  const [remoteEntries, setRemoteEntries] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    fetchContentEntries({ type: 'article', per_page: 50 }, controller.signal)
      .then(payload => setRemoteEntries(normalizeRemote(payload)))
      .catch(() => setRemoteEntries([]))

    updatePageSeo({
      title: 'Conteúdos Peter Tecnet | Software, automação, APIs, SEO e produtos digitais',
      description: 'Conteúdos sobre software, automação, APIs, integrações, catálogos digitais, SEO, produtos digitais e tecnologia aplicada a empresas.',
      path: '/blog',
      type: 'website',
    })

    try {
      trackDiscoveryEvent('page_view', { entityType: 'blog', entityId: 'index' })
    } catch {
      // Telemetria nunca deve bloquear a experiência pública.
    }

    return () => controller.abort()
  }, [])

  const entries = useMemo(() => {
    const merged = new Map()

    ;[petriniaCutinappArticle, ...blogArticles]
      .filter(article => article && safeText(article.slug) && safeText(article.title))
      .forEach(article => merged.set(safeText(article.slug), normalizeStatic(article)))

    remoteEntries.forEach(entry => merged.set(entry.slug, {
      ...(merged.get(entry.slug) || {}),
      ...entry,
    }))

    return [...merged.values()].sort((a, b) => {
      const right = new Date(b.published_at || b.date || 0).getTime()
      const left = new Date(a.published_at || a.date || 0).getTime()
      return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0)
    })
  }, [remoteEntries])

  return <div className="mkt-shell discovery-shell" data-page-ready="blog">
    <Header />
    <main>
      <section className="mkt-blog-hero discovery-hero">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-container">
          <div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><strong>Conteúdos</strong></div>
          <p className="mkt-kicker">CONTEÚDO & DISCOVERY</p>
          <h1>Conhecimento para transformar <span>problemas em soluções digitais.</span></h1>
          <p>Guias, análises e explicações sobre software, automação, integrações, presença digital e os produtos do ecossistema Peter Tecnet.</p>
        </div>
      </section>

      <section className="mkt-blog-list">
        <div className="mkt-container">
          <div className="mkt-section-heading is-split">
            <div><p className="mkt-kicker">PUBLICAÇÕES</p><h2>Conteúdos para <span>entender antes de decidir.</span></h2></div>
            <p>A página funciona com conteúdo local como base e recebe automaticamente novos artigos publicados pela API quando disponíveis.</p>
          </div>

          {entries.length > 0 ? (
            <div className="discovery-card-grid">
              {entries.map(entry => <article className="discovery-card" key={entry.slug}>
                <p className="mkt-card-eyebrow">{entry.category || 'Tecnologia'}</p>
                <h2><a href={`/blog/${encodeURIComponent(entry.slug)}`}>{entry.title || 'Conteúdo Peter Tecnet'}</a></h2>
                <p>{entry.excerpt || entry.description || 'Conteúdo produzido pela Peter Tecnet.'}</p>
                <div className="discovery-card-meta">
                  <span>{safeDate(entry.published_at || entry.date)}</span>
                  {entry.cluster && <span>Cluster: {safeText(entry.cluster)}</span>}
                </div>
                <a className="mkt-text-link" href={`/blog/${encodeURIComponent(entry.slug)}`}>Ler conteúdo <span>↗</span></a>
              </article>)}
            </div>
          ) : (
            <div className="mkt-page-state discovery-state">
              <h2>Os conteúdos estão sendo organizados.</h2>
              <p>Enquanto isso, você pode conhecer as plataformas e soluções da Peter Tecnet.</p>
              <a className="mkt-btn is-primary" href="/">Voltar ao início</a>
            </div>
          )}
        </div>
      </section>
    </main>
    <Footer />
  </div>
}
