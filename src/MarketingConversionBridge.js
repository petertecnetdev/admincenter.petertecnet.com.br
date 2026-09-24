import { fetchContentEntry, trackDiscoveryEvent } from './discoveryApi.js'
import { marketingServices } from './marketingHubContent.js'

const APP_SLUG = 'peter-tecnet'
const flag = '__peterMarketingConversionBridgeInstalled'

function normalize(value) {
  return String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function inferService(article) {
  const explicit = article?.metadata?.related_service || article?.metadata?.service_slug
  if (explicit) return marketingServices.find(service => service.slug === explicit) || null

  const haystack = normalize([
    article?.title,
    article?.excerpt,
    article?.category,
    article?.cluster,
    article?.search_intent,
    ...(Array.isArray(article?.tags) ? article.tags : []),
  ].filter(Boolean).join(' '))

  const ranked = marketingServices.map(service => {
    const terms = [service.title, service.eyebrow, ...service.intents]
      .flatMap(value => normalize(value).split(/[^a-z0-9]+/))
      .filter(term => term.length >= 4)
    const score = [...new Set(terms)].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
    return { service, score }
  }).sort((a, b) => b.score - a.score)

  return ranked[0]?.score > 0 ? ranked[0].service : null
}

function positionFor(element) {
  if (element.closest('header')) return 'header'
  if (element.closest('footer')) return 'footer'
  if (element.closest('.hub-hero,.mkt-hero')) return 'hero'
  if (element.closest('.hub-catalog,.mkt-catalog')) return 'catalog'
  if (element.closest('.hub-blog,.mkt-blog-preview,.article-enhanced')) return 'content'
  if (element.closest('.hub-inline-quote,.hub-conversion,.mkt-conversion')) return 'conversion'
  return 'body'
}

function classify(anchor) {
  const href = anchor.getAttribute('href') || ''
  if (!href || href === '#') return null
  if (href.startsWith('mailto:')) return { type: 'contact', id: 'email' }
  if (href.includes('wa.me') || normalize(anchor.textContent).includes('whatsapp')) return { type: 'contact', id: 'whatsapp' }
  if (href.startsWith('/orcamento')) return { type: 'conversion', id: 'quote' }
  if (href.startsWith('/servicos/')) return { type: 'service', id: decodeURIComponent(href.split('/')[2]?.split('?')[0] || '') }
  if (href.startsWith('/plataformas/')) return { type: 'application', id: decodeURIComponent(href.split('/')[2]?.split('?')[0] || '') }
  if (href.startsWith('/solucoes/')) return { type: 'item', id: decodeURIComponent(href.split('/')[2]?.split('?')[0] || '') }
  if (href.startsWith('/blog/')) return { type: 'content', id: decodeURIComponent(href.split('/')[2]?.split('?')[0] || '') }
  return null
}

function installTracking() {
  trackDiscoveryEvent('page_view', {
    entityType: 'marketing_page',
    entityId: window.location.pathname,
    application: APP_SLUG,
    metadata: { title: document.title },
  })

  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]')
    if (!anchor) return
    const classification = classify(anchor)
    if (!classification) return
    trackDiscoveryEvent('cta_click', {
      entityType: classification.type,
      entityId: classification.id,
      application: APP_SLUG,
      metadata: {
        destination: anchor.getAttribute('href'),
        label: String(anchor.textContent || '').trim().slice(0, 160),
        position: positionFor(anchor),
        source_path: window.location.pathname,
      },
    })
  }, { passive: true })
}

function installStyle() {
  if (document.getElementById('marketing-conversion-bridge-style')) return
  const style = document.createElement('style')
  style.id = 'marketing-conversion-bridge-style'
  style.textContent = `
    .article-service-cta{margin:3rem auto;max-width:850px;border:1px solid rgba(105,226,255,.2);border-radius:24px;padding:1.5rem;background:linear-gradient(145deg,rgba(7,31,40,.92),rgba(2,12,17,.96));box-shadow:0 22px 60px rgba(0,0,0,.2)}
    .article-service-cta small{display:block;color:#71dff8;letter-spacing:.12em;text-transform:uppercase;font-size:.68rem;margin-bottom:.55rem}.article-service-cta h2{margin:.2rem 0 .65rem;font-size:clamp(1.35rem,3vw,2rem)}.article-service-cta p{color:#9bb4bc;line-height:1.65;margin:0 0 1rem}.article-service-cta div{display:flex;flex-wrap:wrap;gap:.65rem}.article-service-cta a{display:inline-flex;align-items:center;gap:.45rem;border:1px solid rgba(105,226,255,.24);border-radius:999px;padding:.72rem 1rem;color:#dffbff;text-decoration:none}.article-service-cta a:first-child{background:#70e4ff;color:#061015;border-color:#70e4ff;font-weight:800}
    .hub-admin-banner{position:relative;z-index:18;display:block;text-align:center;padding:.65rem 1rem;background:linear-gradient(90deg,#6de1fb,#a0f1ff);color:#041014;text-decoration:none;font-weight:800;font-size:.82rem;letter-spacing:.02em}
    .hub-whatsapp-float{position:fixed;right:18px;bottom:18px;z-index:60;display:inline-flex;align-items:center;justify-content:center;padding:.8rem 1rem;border-radius:999px;background:#e8fdff;color:#041014;text-decoration:none;font-weight:850;box-shadow:0 14px 42px rgba(0,0,0,.34);border:1px solid rgba(105,226,255,.4)}
    @media(max-width:720px){.article-service-cta{margin:2rem 1rem}.hub-whatsapp-float{right:12px;bottom:12px;padding:.7rem .85rem;font-size:.82rem}}
  `
  document.head.appendChild(style)
}

async function connectArticle() {
  const match = window.location.pathname.match(/^\/blog\/([^/]+)\/?$/)
  if (!match) return

  try {
    const payload = await fetchContentEntry(decodeURIComponent(match[1]))
    const article = payload?.data
    const service = inferService(article)
    if (!service) return

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const body = document.querySelector('.article-enhanced-body,.mkt-article-body,article')
      if (!body && attempts < 50) return
      window.clearInterval(timer)
      if (!body || document.querySelector('.article-service-cta')) return

      const aside = document.createElement('aside')
      aside.className = 'article-service-cta'
      aside.innerHTML = `<small>Peter Tecnet pode ajudar</small><h2>${service.title}</h2><p>${service.short}</p><div><a href="/orcamento?servico=${encodeURIComponent(service.slug)}">Pedir orçamento <span>↗</span></a><a href="/servicos/${encodeURIComponent(service.slug)}">Conhecer o serviço</a></div>`
      body.insertAdjacentElement('afterend', aside)
    }, 100)
  } catch { /* article remains fully usable without commercial recommendation */ }
}

if (!window[flag]) {
  window[flag] = true
  installStyle()
  installTracking()
  connectArticle()
}
