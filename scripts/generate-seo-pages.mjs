import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationSeo, blogArticles } from '../src/marketingContent.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const origin = 'https://petertecnet.com.br'
const apiOrigin = 'https://api.petertecnet.com.br'
const peterCnpj = '42595409000148'
const fallbackPlatformNames = {
  nexus: 'Nexus',
  rasoio: 'Rasoio',
  cutinapp: 'Cutinapp',
  payflow: 'PayFlow',
  laora: 'Laora',
}

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const normalizeSlug = value => String(value || '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]+/g, '-')
const encodeSegment = value => encodeURIComponent(String(value))

function replaceTitle(html, title) {
  return html.replace(/<title>.*?<\/title>/is, `<title>${escapeHtml(title)}</title>`)
}

function replaceMeta(html, selector, value) {
  const escaped = escapeHtml(value)
  const patterns = selector === 'description'
    ? [/<meta\s+name=["']description["'][^>]*>/i]
    : selector === 'robots'
      ? [/<meta\s+name=["']robots["'][^>]*>/i]
      : [new RegExp(`<meta\\s+property=["']${selector.replace(':', '\\:')}["'][^>]*>`, 'i')]
  const replacement = selector === 'description'
    ? `<meta name="description" content="${escaped}" />`
    : selector === 'robots'
      ? `<meta name="robots" content="${escaped}" />`
      : `<meta property="${selector}" content="${escaped}" />`
  return patterns.reduce((current, pattern) => pattern.test(current) ? current.replace(pattern, replacement) : current.replace('</head>', `    ${replacement}\n  </head>`), html)
}

function replaceTwitterMeta(html, name, value) {
  const pattern = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, 'i')
  const replacement = `<meta name="${name}" content="${escapeHtml(value)}" />`
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `    ${replacement}\n  </head>`)
}

function replaceCanonical(html, url) {
  const pattern = /<link\s+rel=["']canonical["'][^>]*>/i
  const replacement = `<link rel="canonical" href="${escapeHtml(url)}" />`
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `    ${replacement}\n  </head>`)
}

function buildPageHtml(baseHtml, { title, description, route, type = 'website', schema, body }) {
  const url = `${origin}${route === '/' ? '/' : route}`
  let html = baseHtml
  html = replaceTitle(html, title)
  html = replaceMeta(html, 'description', description)
  html = replaceMeta(html, 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
  html = replaceMeta(html, 'og:title', title)
  html = replaceMeta(html, 'og:description', description)
  html = replaceMeta(html, 'og:url', url)
  html = replaceMeta(html, 'og:type', type)
  html = replaceTwitterMeta(html, 'twitter:title', title)
  html = replaceTwitterMeta(html, 'twitter:description', description)
  html = replaceCanonical(html, url)

  if (schema) {
    html = html.replace('</head>', `    <script id="prerender-page-schema" type="application/ld+json">${safeJson(schema)}</script>\n  </head>`)
  }

  if (body) {
    html = html.replace('<div id="root"></div>', `<div id="root"><main data-prerender="true" style="max-width:900px;margin:100px auto;padding:24px;color:#eefcff;font-family:Arial,sans-serif;line-height:1.65">${body}</main></div>`)
  }

  return html
}

async function writeRoute(baseHtml, route, payload) {
  const relative = route === '/' ? '' : route.replace(/^\//, '')
  const targetDir = path.join(distDir, relative)
  await mkdir(targetDir, { recursive: true })
  await writeFile(path.join(targetDir, 'index.html'), buildPageHtml(baseHtml, { ...payload, route }), 'utf8')
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6500)
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPublicMarketingData() {
  let applications = []
  let items = []

  try {
    const appsPayload = await fetchJson(`${apiOrigin}/api/applications`)
    applications = Array.isArray(appsPayload?.applications) ? appsPayload.applications : []
  } catch (error) {
    console.warn(`[seo] Applications unavailable during build: ${error.message}`)
  }

  const nexus = applications.find(application => normalizeSlug(application?.slug) === 'nexus')
  if (nexus?.id) {
    try {
      const discovery = await fetchJson(`${apiOrigin}/api/nexus/discovery?app_id=${encodeURIComponent(nexus.id)}&q=${encodeURIComponent('Peter Tecnet')}&limit=20`)
      const companies = Array.isArray(discovery?.establishments) ? discovery.establishments : []
      const company = companies.find(candidate => {
        const cnpj = String(candidate?.cnpj || '').replace(/\D/g, '')
        const name = `${candidate?.name || ''} ${candidate?.fantasy || ''}`.toLocaleLowerCase('pt-BR')
        return cnpj === peterCnpj || name.includes('peter tecnet')
      })

      if (company?.slug || company?.id) {
        const identifier = company.slug || company.id
        const catalog = await fetchJson(`${apiOrigin}/api/nexus/catalog/${encodeURIComponent(identifier)}?app_id=${encodeURIComponent(nexus.id)}`)
        if (catalog?.success && Array.isArray(catalog.items)) items = catalog.items
      }
    } catch (error) {
      console.warn(`[seo] Generic catalog discovery unavailable during build: ${error.message}`)
    }
  }

  if (!items.length) {
    try {
      const legacy = await fetchJson(`${apiOrigin}/api/nexus/public/catalog-by-cnpj/${peterCnpj}`)
      if (legacy?.success && Array.isArray(legacy.items)) items = legacy.items
    } catch (error) {
      console.warn(`[seo] Catalog fallback unavailable during build: ${error.message}`)
    }
  }

  return { applications, items }
}

function articleBody(article) {
  const sections = article.sections.map(section => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')
  return `<article><nav><a href="/">Peter Tecnet</a> / <a href="/blog">Blog</a></nav><p>${escapeHtml(article.category)} · ${escapeHtml(article.readTime)}</p><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.intro)}</p>${sections}</article>`
}

function platformBody(application, slug) {
  const seo = applicationSeo[slug]
  const name = application?.name || fallbackPlatformNames[slug] || slug
  const description = seo?.description || application?.description || `Conheça ${name}, uma plataforma do ecossistema Peter Tecnet.`
  const benefits = seo?.benefits || []
  return `<article><nav><a href="/">Peter Tecnet</a> / Plataformas</nav><p>${escapeHtml(seo?.eyebrow || 'Plataforma Peter Tecnet')}</p><h1>${escapeHtml(name)}</h1><p>${escapeHtml(seo?.headline || description)}</p><p>${escapeHtml(description)}</p>${benefits.length ? `<ul>${benefits.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}<p><a href="/#plataformas">Ver ecossistema Peter Tecnet</a></p></article>`
}

function productBody(item) {
  const identifier = item.slug || item.id
  return `<article><nav><a href="/">Peter Tecnet</a> / <a href="/#catalogo">Catálogo</a></nav><p>${escapeHtml(item.category || item.type || 'Catálogo digital')}</p><h1>${escapeHtml(item.name)}</h1><p>${escapeHtml(item.description || `Conheça ${item.name} no catálogo digital Peter Tecnet.`)}</p>${item.price ? `<p>Valor: ${escapeHtml(item.price)}</p>` : ''}<p><a href="/solucoes/${encodeSegment(identifier)}">Página do produto</a></p></article>`
}

async function main() {
  const baseHtml = await readFile(path.join(distDir, 'index.html'), 'utf8')
  const { applications, items } = await fetchPublicMarketingData()
  const sitemap = new Map()
  const addSitemap = (route, priority, changefreq = 'weekly') => sitemap.set(route, { route, priority, changefreq })

  addSitemap('/', '1.0', 'weekly')
  addSitemap('/blog', '0.8', 'weekly')

  await writeRoute(baseHtml, '/blog', {
    title: 'Blog Peter Tecnet | Software, automação, APIs, SEO e produtos digitais',
    description: 'Conteúdo prático sobre software para empresas, automação, APIs, integração de sistemas, catálogos digitais, SEO, agendamento e eventos.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Blog Peter Tecnet',
      url: `${origin}/blog`,
      publisher: { '@id': `${origin}/#organization` },
    },
    body: `<h1>Blog Peter Tecnet</h1><p>Conteúdo sobre software, automação, APIs, integração, catálogo digital, SEO, agenda e eventos.</p>${blogArticles.map(article => `<article><h2><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.description)}</p></article>`).join('')}`,
  })

  for (const article of blogArticles) {
    const route = `/blog/${article.slug}`
    addSitemap(route, '0.75', 'monthly')
    await writeRoute(baseHtml, route, {
      title: article.seoTitle,
      description: article.description,
      type: 'article',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.description,
        datePublished: article.date,
        dateModified: article.date,
        inLanguage: 'pt-BR',
        mainEntityOfPage: `${origin}${route}`,
        author: { '@type': 'Organization', name: 'Peter Tecnet', url: `${origin}/` },
        publisher: { '@id': `${origin}/#organization` },
      },
      body: articleBody(article),
    })
  }

  const platforms = new Map()
  Object.keys(applicationSeo).forEach(slug => platforms.set(slug, { slug, name: fallbackPlatformNames[slug] || slug }))
  applications.forEach(application => {
    const slug = normalizeSlug(application?.slug)
    if (slug) platforms.set(slug, { ...application, slug })
  })

  for (const [slug, application] of platforms) {
    const seo = applicationSeo[slug]
    const name = application?.name || fallbackPlatformNames[slug] || slug
    const description = seo?.description || application?.description || `Conheça ${name}, uma plataforma do ecossistema Peter Tecnet.`
    const route = `/plataformas/${encodeSegment(slug)}`
    addSitemap(route, '0.85', 'weekly')
    await writeRoute(baseHtml, route, {
      title: seo?.title || `${name} | Plataforma Peter Tecnet`,
      description,
      schema: {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name,
        description,
        applicationCategory: 'BusinessApplication',
        url: `${origin}${route}`,
        creator: { '@id': `${origin}/#organization` },
      },
      body: platformBody(application, slug),
    })
  }

  for (const item of items) {
    const identifier = item?.slug || item?.id
    if (!identifier || !item?.name) continue
    const route = `/solucoes/${encodeSegment(identifier)}`
    const description = item.description || `${item.name}: conheça detalhes e disponibilidade no catálogo digital Peter Tecnet.`
    addSitemap(route, '0.8', 'weekly')
    await writeRoute(baseHtml, route, {
      title: `${item.name} | ${item.category || item.type || 'Produto'} | Peter Tecnet`,
      description,
      type: 'product',
      schema: {
        '@context': 'https://schema.org',
        '@type': item.type === 'service' ? 'Service' : 'Product',
        name: item.name,
        description,
        category: item.category || item.type || undefined,
        brand: item.brand ? { '@type': 'Brand', name: item.brand } : undefined,
        url: `${origin}${route}`,
        offers: Number(item.price) > 0 ? {
          '@type': 'Offer',
          priceCurrency: 'BRL',
          price: Number(item.price).toFixed(2),
          availability: 'https://schema.org/InStock',
          url: `${origin}${route}`,
        } : undefined,
      },
      body: productBody(item),
    })
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...sitemap.values()].map(entry => `  <url>\n    <loc>${origin}${entry.route === '/' ? '/' : entry.route}</loc>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`
  await writeFile(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8')
  console.log(`[seo] Generated ${sitemap.size} public URLs (${items.length} catalog items, ${platforms.size} platforms, ${blogArticles.length} articles).`)
}

main().catch(error => {
  console.error('[seo] Failed to generate prerendered pages:', error)
  process.exitCode = 1
})
