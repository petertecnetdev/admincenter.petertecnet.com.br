import { useEffect, useMemo, useState } from 'react'
import './MarketingExperience.css'
import './PublicDiscoveryExperience.css'
import { applicationSeo, findBlogArticle } from './marketingContent.js'
import { fetchContentEntry, trackDiscoveryEvent } from './discoveryApi.js'
import { updatePageSeo } from './seo.js'

const ORIGIN = 'https://petertecnet.com.br'
const API_ORIGIN = 'https://api.petertecnet.com.br'

const safeText = value => String(value ?? '').trim()
const safeArray = value => Array.isArray(value) ? value : []
const safeObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function safeDate(value) {
  if (!value) return 'Peter Tecnet'
  const raw = safeText(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw)

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

function publicImage(value) {
  const image = safeText(value)
  if (!image) return undefined
  if (/^https?:\/\//i.test(image)) return image
  return `${API_ORIGIN}/${image.replace(/^\/+/, '')}`
}

function headingId(value) {
  return safeText(value)
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeStatic(article) {
  if (!article) return null
  return {
    ...article,
    slug: safeText(article.slug),
    title: safeText(article.title),
    excerpt: safeText(article.description),
    published_at: article.date || null,
    tags: safeArray(article.tags),
    related_content: [],
    application: article.relatedPlatform ? { slug: article.relatedPlatform } : null,
    seo: {
      title: safeText(article.seoTitle),
      description: safeText(article.description),
      canonical_path: `/blog/${safeText(article.slug)}`,
    },
    staticArticle: article,
  }
}

function normalizeRemote(payload, fallback) {
  const source = payload?.data
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallback

  const slug = safeText(source.slug) || fallback?.slug
  const title = safeText(source.title) || fallback?.title
  if (!slug || !title) return fallback

  return {
    ...(fallback || {}),
    ...source,
    slug,
    title,
    excerpt: safeText(source.excerpt || source.description) || fallback?.excerpt || '',
    category: safeText(source.category) || fallback?.category || 'Tecnologia',
    content: typeof source.content === 'string' ? source.content : '',
    published_at: source.published_at || source.date || source.created_at || fallback?.published_at || null,
    updated_at: source.updated_at || null,
    tags: safeArray(source.tags).map(safeText).filter(Boolean),
    related_content: safeArray(source.related_content).filter(item => item && typeof item === 'object'),
    application: source.application && typeof source.application === 'object'
      ? source.application
      : fallback?.application || null,
    metadata: safeObject(source.metadata),
    seo: safeObject(source.seo),
    staticArticle: fallback?.staticArticle || null,
  }
}

function Shell({ children }) {
  return <div className="mkt-shell discovery-shell">
    <header className="mkt-header">
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
    {children}
    <footer className="mkt-footer">
      <div className="mkt-container discovery-footer">
        <strong>Peter Tecnet</strong>
        <span>Tecnologia para criar, integrar, organizar e crescer.</span>
        <a href="/blog">Mais conteúdos ↗</a>
      </div>
    </footer>
  </div>
}

function State({ children }) {
  return <Shell><main className="mkt-page-state discovery-state">{children}</main></Shell>
}

function StaticBody({ article }) {
  const sections = safeArray(article?.sections)
  return <>
    {safeText(article?.intro) && <p className="mkt-article-intro">{article.intro}</p>}
    {sections.map((section, index) => {
      const heading = safeText(section?.heading)
      if (!heading) return null
      return <section id={headingId(heading)} key={`${heading}-${index}`}>
        <h2>{heading}</h2>
        {safeArray(section?.paragraphs).map((paragraph, paragraphIndex) => {
          const text = safeText(paragraph)
          return text ? <p key={`${heading}-${paragraphIndex}`}>{text}</p> : null
        })}
      </section>
    })}
  </>
}

function ApiBody({ content, fallbackArticle }) {
  const blocks = useMemo(() => {
    const lines = safeText(content).split(/\r?\n/)
    const output = []
    let paragraph = []
    let bullets = []

    const flushParagraph = () => {
      if (!paragraph.length) return
      output.push({ type: 'p', text: paragraph.join(' ') })
      paragraph = []
    }
    const flushBullets = () => {
      if (!bullets.length) return
      output.push({ type: 'ul', items: [...bullets] })
      bullets = []
    }

    lines.forEach(line => {
      const value = line.trim()
      if (!value) {
        flushParagraph()
        flushBullets()
        return
      }
      if (/^#{2,3}\s+/.test(value)) {
        flushParagraph()
        flushBullets()
        output.push({ type: 'h2', text: value.replace(/^#{2,3}\s+/, '') })
        return
      }
      if (/^[-*]\s+/.test(value)) {
        flushParagraph()
        bullets.push(value.replace(/^[-*]\s+/, ''))
        return
      }
      flushBullets()
      paragraph.push(value.replace(/^#\s+/, ''))
    })

    flushParagraph()
    flushBullets()
    return output
  }, [content])

  if (!blocks.length && fallbackArticle) return <StaticBody article={fallbackArticle} />
  if (!blocks.length) return <p>Este conteúdo está publicado, mas ainda não possui corpo editorial disponível.</p>

  return <>{blocks.map((block, index) => {
    if (block.type === 'h2') return <h2 id={headingId(block.text)} key={`heading-${index}`}>{block.text}</h2>
    if (block.type === 'ul') return <ul key={`list-${index}`}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
    return <p key={`paragraph-${index}`}>{block.text}</p>
  })}</>
}

export default function PublicBlogArticle({ slug }) {
  const staticArticle = findBlogArticle(slug)
  const fallback = normalizeStatic(staticArticle)
  const [article, setArticle] = useState(fallback)
  const [loading, setLoading] = useState(!fallback)

  useEffect(() => {
    const controller = new AbortController()

    fetchContentEntry(slug, { application: 'peter-tecnet' }, controller.signal)
      .then(payload => setArticle(normalizeRemote(payload, fallback)))
      .catch(() => setArticle(fallback))
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [slug])

  useEffect(() => {
    if (!article) return

    const seo = safeObject(article.seo)
    const image = publicImage(seo.og_image || article.og_image || article.cover_image)

    try {
      updatePageSeo({
        title: safeText(seo.title || article.seoTitle) || `${article.title} | Peter Tecnet`,
        description: safeText(seo.description || article.excerpt || article.description),
        path: `/blog/${article.slug}`,
        image,
        type: 'article',
        schema: [{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description: safeText(seo.description || article.excerpt || article.description),
          datePublished: article.published_at || article.date || undefined,
          dateModified: article.updated_at || article.published_at || article.date || undefined,
          mainEntityOfPage: `${ORIGIN}/blog/${article.slug}`,
          author: { '@type': 'Organization', name: 'Peter Tecnet' },
          publisher: { '@type': 'Organization', name: 'Peter Tecnet', url: ORIGIN },
          image: image || `${ORIGIN}/thumbnail.jpg`,
        }],
      })
    } catch {
      // SEO nunca deve impedir a renderização do artigo.
    }

    try {
      trackDiscoveryEvent('content_view', {
        entityType: 'content',
        entityId: article.slug,
        application: article.application?.slug,
      })
    } catch {
      // Telemetria nunca deve impedir a leitura do artigo.
    }
  }, [article])

  if (loading) return <State><p>Carregando conteúdo…</p></State>
  if (!article) return <State><h1>Artigo não encontrado.</h1><p>O conteúdo solicitado não está disponível.</p><a href="/blog">Voltar para Conteúdos</a></State>

  const tags = safeArray(article.tags).map(safeText).filter(Boolean).slice(0, 6)
  const sections = safeArray(article.staticArticle?.sections)
  const related = safeArray(article.related_content).filter(item => safeText(item?.slug) && safeText(item?.title))
  const platform = safeText(article.application?.slug || article.staticArticle?.relatedPlatform || article.metadata?.related_platform)
  const platformKey = platform === 'peter-payflow' ? 'payflow' : platform
  const platformCopy = applicationSeo[platformKey]

  return <Shell><main data-page-ready="blog-article">
    <article className="mkt-article discovery-article">
      <header className="mkt-article-header">
        <div className="mkt-grid" aria-hidden="true" />
        <div className="mkt-container">
          <div className="mkt-breadcrumb"><a href="/">Peter Tecnet</a><span>/</span><a href="/blog">Conteúdos</a><span>/</span><strong>{article.category || 'Artigo'}</strong></div>
          <p className="mkt-kicker">{safeText(article.category || 'Tecnologia').toUpperCase()}</p>
          <h1>{article.title}</h1>
          {safeText(article.excerpt || article.description) && <p className="mkt-article-deck">{article.excerpt || article.description}</p>}
          <div className="mkt-article-byline"><span>Peter Tecnet</span><i /><time>{safeDate(article.published_at || article.date)}</time></div>
        </div>
      </header>

      <div className="mkt-container mkt-article-layout">
        <aside className="mkt-article-aside">
          <strong>Neste conteúdo</strong>
          {tags.map(tag => <span key={tag}>{tag}</span>)}
          {sections.map((section, index) => {
            const heading = safeText(section?.heading)
            return heading ? <a href={`#${headingId(heading)}`} key={`${heading}-${index}`}>{heading}</a> : null
          })}
        </aside>

        <div className="mkt-article-content">
          {article.staticArticle && !safeText(article.content)
            ? <StaticBody article={article.staticArticle} />
            : <ApiBody content={article.content} fallbackArticle={article.staticArticle} />}

          {platformKey && <aside className="discovery-context-cta">
            <small>SOLUÇÃO RELACIONADA</small>
            <h3>{platformCopy?.headline || platformKey}</h3>
            <p>{platformCopy?.description || 'Conheça a plataforma relacionada a este conteúdo.'}</p>
            <a className="mkt-btn is-primary" href={`/plataformas/${encodeURIComponent(platformKey)}`}>Conhecer solução <span>↗</span></a>
          </aside>}
        </div>
      </div>
    </article>

    {related.length > 0 && <section className="mkt-related-content">
      <div className="mkt-container">
        <div className="mkt-section-heading"><p className="mkt-kicker">CONTEÚDOS RELACIONADOS</p><h2>Continue a <span>jornada de descoberta.</span></h2></div>
        <div className="discovery-card-grid">
          {related.map((item, index) => <article className="discovery-card" key={`${item.slug}-${index}`}>
            <p className="mkt-card-eyebrow">{safeText(item.category) || 'Tecnologia'}</p>
            <h3><a href={`/blog/${encodeURIComponent(safeText(item.slug))}`}>{safeText(item.title)}</a></h3>
            {safeText(item.excerpt) && <p>{safeText(item.excerpt)}</p>}
          </article>)}
        </div>
      </div>
    </section>}
  </main></Shell>
}
