import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const origin = 'https://petertecnet.com.br'
const api = 'https://api.petertecnet.com.br/api'
const today = new Date().toISOString().slice(0, 10)

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

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `  ${replacement}\n</head>`)
}

function itemList(rows = []) {
  return rows.slice(0, 30).map(row => `<li><a href="${escapeHtml(row.url)}">${escapeHtml(row.title)}</a>${row.location ? ` — ${escapeHtml(row.location)}` : ''}</li>`).join('')
}

function render(base, data) {
  const seo = data.seo || {}
  const path = seo.canonical_path
  const canonical = `${origin}${path}`
  const rows = data.results || {}
  const schema = { '@context': 'https://schema.org', '@type': 'SearchResultsPage', name: seo.title, description: seo.description, url: canonical, mainEntity: { '@type': 'ItemList', itemListElement: [...(rows.items || []), ...(rows.establishments || []), ...(rows.content || []), ...(rows.applications || [])].slice(0, 50).map((row, index) => ({ '@type': 'ListItem', position: index + 1, name: row.title, url: `${origin}${row.url}` })) } }
  let html = base.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`)
  html = replaceTag(html, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}">`)
  html = replaceTag(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(seo.description)}">`)
  html = replaceTag(html, /<meta\s+name=["']robots["'][^>]*>/i, '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">')
  html = replaceTag(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${escapeHtml(seo.title)}">`)
  html = replaceTag(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${escapeHtml(seo.description)}">`)
  html = replaceTag(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonical}">`)
  html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(schema)}</script>\n</head>`)
  const body = `<main data-prerender="intent-discovery"><section><p>Peter Tecnet Discovery</p><h1>${escapeHtml(data.query)}${data.city ? ` em ${escapeHtml(data.city)}` : ''}</h1><p>${escapeHtml(seo.description)}</p></section><section><h2>Produtos e serviços</h2><ul>${itemList(rows.items)}</ul></section><section><h2>Empresas</h2><ul>${itemList(rows.establishments)}</ul></section><section><h2>Conteúdos relacionados</h2><ul>${itemList(rows.content)}</ul></section><section><h2>Plataformas</h2><ul>${itemList(rows.applications)}</ul></section></main>`
  return html.replace(/<div id=["']root["']>\s*<\/div>/i, `<div id="root">${body}</div>`)
}

const base = await readFile(join(dist, 'index.html'), 'utf8')
const generated = []
try {
  const candidates = (await fetchJson('/v1/discovery/landing-candidates?limit=160'))?.data || []
  for (const candidate of candidates) {
    if (!candidate?.term) continue
    try {
      const query = new URLSearchParams({ q: candidate.term })
      if (candidate.city) query.set('city', candidate.city)
      const data = (await fetchJson(`/v1/discovery/landing?${query}`))?.data
      if (!data?.indexable || !data?.seo?.canonical_path) continue
      const route = data.seo.canonical_path
      const target = join(dist, route.replace(/^\//, ''), 'index.html')
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, render(base, data), 'utf8')
      generated.push(route)
    } catch (error) {
      console.warn(`[intent-prerender] ${candidate.term}/${candidate.city || 'brasil'}: ${error.message}`)
    }
  }

  if (generated.length) {
    const sitemapPath = join(dist, 'sitemap.xml')
    let sitemap = await readFile(sitemapPath, 'utf8')
    const additions = generated.filter(route => !sitemap.includes(`<loc>${origin}${route}</loc>`)).map(route => `  <url><loc>${origin}${route}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.72</priority></url>`).join('\n')
    if (additions) {
      sitemap = sitemap.replace('</urlset>', `${additions}\n</urlset>`)
      await writeFile(sitemapPath, sitemap, 'utf8')
    }
  }
} catch (error) {
  console.warn(`[intent-prerender] API indisponível: ${error.message}`)
}

console.log(`[intent-prerender] ${generated.length} páginas locais/intenção indexáveis geradas.`)
