const API = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api'
const CONFIG_SLUG = 'peter-home-settings'

const text = (selector, value) => {
  if (!value) return
  const element = document.querySelector(selector)
  if (element) element.textContent = value
}

const link = (selector, label, href) => {
  const element = document.querySelector(selector)
  if (!element) return
  if (href) element.setAttribute('href', href)
  if (label) {
    const arrow = element.querySelector('span')?.textContent || ''
    element.textContent = label
    if (arrow) {
      const span = document.createElement('span')
      span.textContent = arrow
      element.append(' ', span)
    }
  }
}

const slugFromHref = href => {
  try {
    const url = new URL(href, window.location.origin)
    return decodeURIComponent(url.pathname.replace(/\/+$/, '').split('/').pop() || '')
  } catch { return '' }
}

function orderCards(containerSelector, cardSelector, linkSelector, slugs = []) {
  if (!Array.isArray(slugs) || !slugs.length) return
  const container = document.querySelector(containerSelector)
  if (!container) return
  const cards = [...container.querySelectorAll(cardSelector)]
  const bySlug = new Map(cards.map(card => {
    const anchor = card.querySelector(linkSelector)
    return [slugFromHref(anchor?.getAttribute('href') || ''), card]
  }))
  const ordered = slugs.map(slug => bySlug.get(slug)).filter(Boolean)
  if (!ordered.length) return

  cards.forEach(card => { card.style.display = 'none' })
  ordered.forEach(card => {
    card.style.display = ''
    container.appendChild(card)
  })
}

function ensureBanner(metadata) {
  document.querySelector('.hub-admin-banner')?.remove()
  if (!metadata.banner_text) return
  const header = document.querySelector('.hub-header')
  if (!header) return
  const banner = document.createElement('a')
  banner.className = 'hub-admin-banner'
  banner.href = metadata.banner_href || '/orcamento'
  banner.textContent = metadata.banner_text
  header.insertAdjacentElement('afterend', banner)
}

function ensureWhatsapp(metadata) {
  document.querySelector('.hub-whatsapp-float')?.remove()
  const raw = String(metadata.contact_whatsapp || '').trim()
  if (!raw) return
  const digits = raw.replace(/\D/g, '')
  if (!/^https?:/i.test(raw) && !digits) return
  const href = /^https?:/i.test(raw) ? raw : `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
  const anchor = document.createElement('a')
  anchor.className = 'hub-whatsapp-float'
  anchor.href = href
  anchor.target = '_blank'
  anchor.rel = 'noreferrer'
  anchor.setAttribute('aria-label', 'Falar com a Peter Tecnet pelo WhatsApp')
  anchor.textContent = 'WhatsApp'
  document.body.appendChild(anchor)
}

function apply(metadata = {}) {
  if (window.location.pathname !== '/') return
  text('.hub-hero .mkt-kicker', metadata.hero_badge)
  text('.hub-hero .mkt-hero-copy h1', metadata.hero_title)
  text('.hub-hero .mkt-hero-lead', metadata.hero_excerpt)
  link('.hub-hero .mkt-hero-actions .mkt-btn.is-primary', metadata.primary_cta_label, metadata.primary_cta_href)
  link('.hub-hero .mkt-hero-actions .mkt-btn.is-ghost', metadata.secondary_cta_label, metadata.secondary_cta_href)
  text('.hub-services .mkt-section-heading h2', metadata.services_title)
  text('.hub-platforms .mkt-section-heading h2', metadata.platforms_title)
  text('.hub-cases .mkt-section-heading h2', metadata.cases_title)
  text('.hub-catalog .mkt-section-heading h2', metadata.catalog_title)
  text('.hub-blog .mkt-section-heading h2', metadata.blog_title)

  orderCards('.hub-services .hub-service-grid', '.hub-service-card', 'a[href^="/servicos/"]', metadata.featured_service_slugs)
  orderCards('.hub-platforms .mkt-platform-grid', '.mkt-platform-card', 'a[href^="/plataformas/"]', metadata.featured_platform_slugs)
  orderCards('.hub-blog .mkt-blog-grid', '.mkt-blog-card', 'a[href^="/blog/"]', metadata.featured_article_slugs)
  orderCards('.hub-cases .hub-case-grid', '.hub-case-card', 'a[href^="/plataformas/"]', metadata.featured_case_slugs)

  if (metadata.contact_email) {
    document.querySelectorAll('a[href^="mailto:"]').forEach(anchor => {
      const previous = anchor.getAttribute('href') || ''
      const subject = previous.includes('?') ? previous.slice(previous.indexOf('?')) : ''
      anchor.setAttribute('href', `mailto:${metadata.contact_email}${subject}`)
    })
    document.querySelectorAll('.hub-company-strip a').forEach(anchor => {
      if ((anchor.getAttribute('href') || '').startsWith('mailto:')) anchor.textContent = metadata.contact_email
    })
  }

  ensureBanner(metadata)
  ensureWhatsapp(metadata)
  document.documentElement.dataset.marketingConfig = 'ready'
}

async function load() {
  try {
    const response = await fetch(`${API}/v1/content/${CONFIG_SLUG}`, { headers: { Accept: 'application/json' } })
    if (!response.ok) return
    const payload = await response.json()
    const metadata = payload?.data?.metadata || {}
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (document.querySelector('.hub-hero') || attempts > 40) {
        window.clearInterval(timer)
        apply(metadata)
      }
    }, 100)
  } catch { /* landing remains usable with code defaults */ }
}

load()
