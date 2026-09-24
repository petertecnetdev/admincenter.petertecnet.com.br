import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { marketingServices } from '../src/marketingHubContent.js'

const root = process.cwd()
const dist = join(root, 'dist')
const origin = 'https://petertecnet.com.br'
const api = 'https://api.petertecnet.com.br/api'
const defaultImage = `${origin}/thumbnail.jpg`
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

async function fetchJson(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(`${api}${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.json()
  } finally { clearTimeout(timeout) }
}

function meta(html, name, value, property = false) {
  if (!value) return html
  const attribute = property ? 'property' : 'name'
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${escapedName}["'][^>]*>`, 'i')
  const tag = `<meta ${attribute}="${name}" content="${escapeHtml(value)}">`
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n</head>`)
}

function render(base, page) {
  const canonical = `${origin}${page.path}`
  let html = base
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}">`)
  html = meta(html, 'description', page.description)
  html = meta(html, 'og:title', page.title, true)
  html = meta(html, 'og:description', page.description, true)
  html = meta(html, 'og:url', canonical, true)
  html = meta(html, 'og:image', page.image || defaultImage, true)
  html = meta(html, 'twitter:title', page.title)
  html = meta(html, 'twitter:description', page.description)
  html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(page.schema || {})}</script>\n</head>`)
  html = html.replace(/<div id=["']root["']>\s*<\/div>/i, `<div id="root"><main data-prerender="marketing">${page.body}</main></div>`)
  return html
}

async function writeRoute(base, route, page) {
  const target = join(dist, route.replace(/^\//, ''), 'index.html')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, render(base, { ...page, path: route }), 'utf8')
}

function unwrap(payload) {
  return Array.isArray(payload?.data?.data) ? payload.data.data : Array.isArray(payload?.data) ? payload.data : []
}

const base = await readFile(join(dist, 'index.html'), 'utf8')
const generated = new Set()
let dynamicServices = []

try {
  const payload = await fetchJson('/v1/content?type=page&category=service&per_page=50')
  dynamicServices = unwrap(payload)
} catch (error) {
  console.warn(`[marketing-prerender] serviços administráveis indisponíveis: ${error.message}`)
}

for (const fallback of marketingServices) {
  const entry = dynamicServices.find(candidate => candidate.slug === fallback.slug || candidate.metadata?.service_slug === fallback.slug)
  const title = entry?.seo_title || entry?.seo?.title || `${entry?.title || fallback.title} | Peter Tecnet`
  const description = entry?.seo_description || entry?.seo?.description || entry?.excerpt || fallback.short
  const serviceTitle = entry?.title || fallback.title
  const serviceDescription = entry?.content || entry?.excerpt || fallback.description
  const image = entry?.cover_image || entry?.og_image || defaultImage
  const route = `/servicos/${fallback.slug}`
  await writeRoute(base, route, {
    title,
    description,
    image,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: serviceTitle,
      description,
      url: `${origin}${route}`,
      provider: { '@type': 'Organization', name: 'Peter Tecnet', url: origin, taxID: '42.595.409/0001-48' },
    },
    body: `<article><p>${escapeHtml(fallback.eyebrow)}</p><h1>${escapeHtml(serviceTitle)}</h1><p>${escapeHtml(serviceDescription)}</p><h2>O que pode fazer parte da entrega</h2><ul>${fallback.deliverables.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><p><a href="/orcamento?servico=${encodeURIComponent(fallback.slug)}">Pedir orçamento</a></p></article>`,
  })
  generated.add(route)
}

const institutional = [
  { route: '/sobre', title: 'Sobre a Peter Tecnet | Tecnologia do básico ao avançado', description: 'Conheça a Peter Tecnet, empresa de tecnologia que desenvolve software, plataformas, sites, automações, integrações e serviços digitais.', heading: 'Tecnologia para resolver problemas reais.' },
  { route: '/portfolio', title: 'Projetos e cases | Peter Tecnet', description: 'Conheça plataformas, produtos e projetos desenvolvidos pela Peter Tecnet.', heading: 'Projetos que mostram como a Peter Tecnet trabalha.' },
  { route: '/orcamento', title: 'Pedir orçamento | Peter Tecnet', description: 'Conte sua necessidade e solicite uma proposta de software, site, aplicativo, automação ou serviço digital.', heading: 'Conte o que você precisa.' },
]

for (const page of institutional) {
  await writeRoute(base, page.route, {
    title: page.title,
    description: page.description,
    schema: { '@context': 'https://schema.org', '@type': 'WebPage', name: page.heading, url: `${origin}${page.route}`, isPartOf: { '@id': `${origin}/#website` } },
    body: `<section><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p><p><a href="/">Peter Tecnet</a></p></section>`,
  })
  generated.add(page.route)
}

try {
  const sitemapPath = join(dist, 'sitemap.xml')
  let sitemap = await readFile(sitemapPath, 'utf8')
  const today = new Date().toISOString().slice(0, 10)
  const additions = [...generated]
    .filter(route => !sitemap.includes(`<loc>${origin}${route}</loc>`))
    .map(route => `  <url><loc>${origin}${route}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${route.startsWith('/servicos/') ? '0.85' : '0.75'}</priority></url>`)
    .join('\n')
  if (additions) {
    sitemap = sitemap.replace('</urlset>', `${additions}\n</urlset>`)
    await writeFile(sitemapPath, sitemap, 'utf8')
  }
} catch (error) {
  console.warn(`[marketing-prerender] sitemap não atualizado: ${error.message}`)
}

console.log(`[marketing-prerender] ${generated.size} páginas comerciais geradas.`)
