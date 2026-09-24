import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const origin = 'https://petertecnet.com.br'
const api = 'https://api.petertecnet.com.br/api'
const defaultImage = `${origin}/thumbnail.jpg`

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

async function fetchJson(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(`${api}${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function replaceMeta(html, selector, value) {
  if (!value) return html
  const escaped = escapeHtml(value)
  const patterns = {
    description: /<meta\s+name=["']description["'][^>]*>/i,
    robots: /<meta\s+name=["']robots["'][^>]*>/i,
    ogTitle: /<meta\s+property=["']og:title["'][^>]*>/i,
    ogDescription: /<meta\s+property=["']og:description["'][^>]*>/i,
    ogUrl: /<meta\s+property=["']og:url["'][^>]*>/i,
    ogImage: /<meta\s+property=["']og:image["'][^>]*>/i,
    twitterTitle: /<meta\s+name=["']twitter:title["'][^>]*>/i,
    twitterDescription: /<meta\s+name=["']twitter:description["'][^>]*>/i,
    twitterImage: /<meta\s+name=["']twitter:image["'][^>]*>/i,
  }
  const tags = {
    description: `<meta name="description" content="${escaped}">`,
    robots: `<meta name="robots" content="${escaped}">`,
    ogTitle: `<meta property="og:title" content="${escaped}">`,
    ogDescription: `<meta property="og:description" content="${escaped}">`,
    ogUrl: `<meta property="og:url" content="${escaped}">`,
    ogImage: `<meta property="og:image" content="${escaped}">`,
    twitterTitle: `<meta name="twitter:title" content="${escaped}">`,
    twitterDescription: `<meta name="twitter:description" content="${escaped}">`,
    twitterImage: `<meta name="twitter:image" content="${escaped}">`,
  }
  return patterns[selector]?.test(html)
    ? html.replace(patterns[selector], tags[selector])
    : html.replace('</head>', `  ${tags[selector]}\n</head>`)
}

function pageHtml(base, { title, description, path, image = defaultImage, schema, body }) {
  const canonical = `${origin}${path}`
  let html = base
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}">`)
  html = replaceMeta(html, 'description', description)
  html = replaceMeta(html, 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
  html = replaceMeta(html, 'ogTitle', title)
  html = replaceMeta(html, 'ogDescription', description)
  html = replaceMeta(html, 'ogUrl', canonical)
  html = replaceMeta(html, 'ogImage', image)
  html = replaceMeta(html, 'twitterTitle', title)
  html = replaceMeta(html, 'twitterDescription', description)
  html = replaceMeta(html, 'twitterImage', image)
  html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(schema || {})}</script>\n</head>`)
  html = html.replace(/<div id=["']root["']>\s*<\/div>/i, `<div id="root"><main data-prerender="discovery">${body}</main></div>`)
  return html
}

async function writeRoute(base, route, meta) {
  const target = join(dist, route.replace(/^\//, ''), 'index.html')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, pageHtml(base, meta), 'utf8')
}

function unwrapCollection(payload) {
  const value = payload?.data
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.establishments)) return value.establishments
  if (Array.isArray(payload?.establishments)) return payload.establishments
  return []
}

function articleBody(entry) {
  const paragraphs = String(entry.content || '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .slice(0, 14)
    .map(block => /^##\s+/.test(block)
      ? `<h2>${escapeHtml(block.replace(/^##\s+/, ''))}</h2>`
      : `<p>${escapeHtml(block.replace(/^[-*]\s+/gm, ''))}</p>`)
    .join('')
  return `<article><p>${escapeHtml(entry.category || 'Tecnologia')}</p><h1>${escapeHtml(entry.title)}</h1><p>${escapeHtml(entry.excerpt || '')}</p>${paragraphs}<p><a href="/blog">Mais conteúdos Peter Tecnet</a></p></article>`
}

function productList(items = []) {
  return items.slice(0, 80).map(item => `<li><a href="/solucoes/${encodeURIComponent(item.slug || item.id)}">${escapeHtml(item.name)}</a>${item.description ? ` — ${escapeHtml(item.description)}` : ''}</li>`).join('')
}

const base = await readFile(join(dist, 'index.html'), 'utf8')
const generatedUrls = new Set()

try {
  const payload = await fetchJson('/v1/content?type=article&per_page=50')
  for (const entry of unwrapCollection(payload)) {
    if (!entry?.slug || !entry?.title) continue
    const seo = entry.seo || {}
    const route = `/blog/${entry.slug}`
    await writeRoute(base, route, {
      title: seo.title || entry.seo_title || `${entry.title} | Peter Tecnet`,
      description: seo.description || entry.seo_description || entry.excerpt || 'Conteúdo Peter Tecnet.',
      path: route,
      image: seo.og_image || entry.og_image || defaultImage,
      schema: { '@context': 'https://schema.org', '@type': 'Article', headline: entry.title, description: entry.excerpt, datePublished: entry.published_at, dateModified: entry.updated_at || entry.published_at, mainEntityOfPage: `${origin}${route}`, publisher: { '@type': 'Organization', name: 'Peter Tecnet' } },
      body: articleBody(entry),
    })
    generatedUrls.add(route)
  }
} catch (error) {
  console.warn(`[discovery-prerender] conteúdo dinâmico indisponível: ${error.message}`)
}

try {
  const applications = await fetchJson('/applications')
  const apps = applications?.applications || applications?.data || []
  const nexus = apps.find(app => String(app?.slug || '').toLowerCase() === 'nexus')
  const appQuery = nexus?.id ? `?application=${encodeURIComponent(nexus.slug || nexus.id)}` : ''

  const categoryPayload = await fetchJson(`/v1/discovery/categories${appQuery}`)
  for (const category of unwrapCollection(categoryPayload)) {
    if (!category?.slug) continue
    try {
      const detail = (await fetchJson(`/v1/discovery/categories/${encodeURIComponent(category.slug)}${appQuery}`))?.data
      if (!detail) continue
      const route = `/catalogo/${detail.category?.slug || category.slug}`
      await writeRoute(base, route, {
        title: detail.seo?.title || `${detail.category?.name || category.name} | Catálogo Peter Tecnet`,
        description: detail.seo?.description || `Encontre ${detail.category?.name || category.name} no catálogo digital Peter Tecnet.`,
        path: route,
        image: detail.seo?.og_image || defaultImage,
        schema: { '@context': 'https://schema.org', '@type': 'ItemList', name: detail.category?.name || category.name, itemListElement: (detail.items || []).map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, url: `${origin}/solucoes/${item.slug || item.id}` })) },
        body: `<section><h1>${escapeHtml(detail.category?.name || category.name)}</h1><p>${escapeHtml(detail.seo?.description || '')}</p><ul>${productList(detail.items)}</ul></section>`,
      })
      generatedUrls.add(route)
    } catch (error) {
      console.warn(`[discovery-prerender] categoria ${category.slug}: ${error.message}`)
    }
  }

  if (nexus?.slug) {
    const establishmentsPayload = await fetchJson(`/v1/apps/${encodeURIComponent(nexus.slug)}/establishments?per_page=100`)
    const establishments = unwrapCollection(establishmentsPayload)
    for (const candidate of establishments) {
      const identifier = candidate?.slug || candidate?.id
      if (!identifier) continue
      try {
        const detail = (await fetchJson(`/v1/discovery/establishments/${encodeURIComponent(identifier)}${appQuery}`))?.data
        if (!detail?.slug) continue
        const name = detail.fantasy || detail.name
        const route = `/empresas/${detail.slug}`
        await writeRoute(base, route, {
          title: detail.seo?.title || `${name} | Peter Tecnet`,
          description: detail.seo?.description || detail.description || `Conheça ${name}.`,
          path: route,
          image: detail.seo?.og_image || defaultImage,
          schema: { '@context': 'https://schema.org', '@type': 'LocalBusiness', name, description: detail.description, url: `${origin}${route}`, address: { '@type': 'PostalAddress', streetAddress: detail.address, addressLocality: detail.city, addressRegion: detail.uf, postalCode: detail.cep, addressCountry: 'BR' } },
          body: `<section><h1>${escapeHtml(name)}</h1><p>${escapeHtml(detail.description || '')}</p><p>${escapeHtml([detail.address, detail.city, detail.uf].filter(Boolean).join(' · '))}</p><h2>Produtos e serviços</h2><ul>${productList(detail.items)}</ul></section>`,
        })
        generatedUrls.add(route)
      } catch (error) {
        console.warn(`[discovery-prerender] estabelecimento ${identifier}: ${error.message}`)
      }
    }
  }
} catch (error) {
  console.warn(`[discovery-prerender] descoberta local indisponível: ${error.message}`)
}

try {
  const sitemapPath = join(dist, 'sitemap.xml')
  let sitemap = await readFile(sitemapPath, 'utf8')
  const additions = [...generatedUrls]
    .filter(route => !sitemap.includes(`<loc>${origin}${route}</loc>`))
    .map(route => `  <url><loc>${origin}${route}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`)
    .join('\n')
  if (additions) {
    sitemap = sitemap.replace('</urlset>', `${additions}\n</urlset>`)
    await writeFile(sitemapPath, sitemap, 'utf8')
  }
} catch (error) {
  console.warn(`[discovery-prerender] sitemap não atualizado: ${error.message}`)
}

console.log(`[discovery-prerender] ${generatedUrls.size} rotas dinâmicas adicionais geradas.`)
