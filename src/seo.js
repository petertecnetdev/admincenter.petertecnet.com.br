const PUBLIC_ORIGIN = 'https://petertecnet.com.br'
const DEFAULT_IMAGE = `${PUBLIC_ORIGIN}/thumbnail.jpg`
const SEO_SCHEMA_ID = 'peter-page-structured-data'

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') element.setAttribute(key, String(value))
  })
}

function upsertCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }
  element.href = href
}

function upsertStructuredData(schema) {
  let element = document.getElementById(SEO_SCHEMA_ID)
  if (!schema) {
    element?.remove()
    return
  }

  if (!element) {
    element = document.createElement('script')
    element.id = SEO_SCHEMA_ID
    element.type = 'application/ld+json'
    document.head.appendChild(element)
  }

  const graph = Array.isArray(schema) ? schema : [schema]
  element.textContent = JSON.stringify(graph.length === 1 ? graph[0] : {
    '@context': 'https://schema.org',
    '@graph': graph.map(entry => {
      if (!entry || typeof entry !== 'object') return entry
      const { '@context': _context, ...rest } = entry
      return rest
    }),
  })
}

function normalizePath(path) {
  const normalized = String(path || '/').split('?')[0].replace(/\/+$/, '')
  return normalized || '/'
}

export function updatePageSeo({ title, description, path = '/', image, type = 'website', robots, schema, keywords } = {}) {
  const normalizedPath = normalizePath(path)
  const canonical = `${PUBLIC_ORIGIN}${normalizedPath === '/' ? '/' : normalizedPath}`
  const pageTitle = title || 'Peter Tecnet | Software, automação, APIs e produtos digitais'
  const pageDescription = description || 'Tecnologia para transformar necessidades reais em produtos, plataformas, aplicativos, automações, APIs e soluções digitais.'
  const pageImage = image && !/^data:/i.test(image) ? image : DEFAULT_IMAGE

  document.title = pageTitle
  upsertCanonical(canonical)
  upsertMeta('meta[name="description"]', { name: 'description', content: pageDescription })
  if (Array.isArray(keywords) && keywords.length) upsertMeta('meta[name="keywords"]', { name: 'keywords', content: keywords.join(', ') })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' })
  upsertMeta('meta[name="author"]', { name: 'author', content: 'Peter Tecnet' })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type })
  upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'pt_BR' })
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Peter Tecnet' })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: pageTitle })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: pageDescription })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: pageImage })
  upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: pageTitle })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: pageTitle })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: pageDescription })
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: pageImage })
  upsertStructuredData(schema)
}

export function applySeoPolicy() {
  const path = normalizePath(window.location.pathname)
  const isLanding = path === '/'
  const isSolution = /^\/solucoes\/[^/]+$/.test(path)
  const isPlatform = /^\/plataformas\/[^/]+$/.test(path)
  const isBlog = path === '/blog' || /^\/blog\/[^/]+$/.test(path)
  const isBusiness = /^\/empresas\/[^/]+$/.test(path)
  const isCategory = /^\/catalogo\/[^/]+$/.test(path)
  const isPublic = isLanding || isSolution || isPlatform || isBlog || isBusiness || isCategory

  upsertMeta('meta[name="robots"]', {
    name: 'robots',
    content: isPublic
      ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      : 'noindex, nofollow',
  })
  upsertCanonical(`${PUBLIC_ORIGIN}${path === '/' ? '/' : path}`)
}

applySeoPolicy()