(() => {
  'use strict'

  const RUNTIME_VERSION = '1.3.0'
  const DEFAULT_API = 'https://api.petertecnet.com.br/api'
  const CACHE_PREFIX = 'peter.branding.v2:'
  const script = document.currentScript
  let activeContext = null
  let focusListenerInstalled = false

  if (window.PeterTecnetBranding?.version === RUNTIME_VERSION) return

  const normalizeSlug = value => String(value || '').trim().toLowerCase()
  const inferredSlug = () => {
    const host = window.location.hostname.toLowerCase()
    if (host === 'petertecnet.com.br' || host === 'www.petertecnet.com.br') return 'peter-tecnet'
    const label = host.split('.')[0]
    return ({ 'la-ora': 'laora' }[label] || label)
  }

  const readCache = slug => {
    try {
      const value = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${slug}`) || 'null')
      return value?.branding ? value : null
    } catch { return null }
  }

  const writeCache = (slug, branding) => {
    try { localStorage.setItem(`${CACHE_PREFIX}${slug}`, JSON.stringify({ savedAt: Date.now(), branding })) } catch {}
  }

  const assetFor = (branding, role) => ({
    logo: branding.logo,
    'logo-light': branding.logo_light || branding.logo,
    'logo-dark': branding.logo_dark || branding.logo,
    icon: branding.icon || branding.logo,
    favicon: branding.favicon || branding.icon || branding.logo,
    'social-image': branding.social_image || branding.logo,
  }[role] || branding.logo)

  const applyImage = (element, url) => {
    if (!url || !(element instanceof HTMLImageElement)) return
    if (element.dataset.peterBrandingFailed === url) return
    if (!element.dataset.peterBrandingFallback) element.dataset.peterBrandingFallback = element.getAttribute('src') || ''
    if (element.src === url || element.getAttribute('src') === url) return

    if (element.dataset.peterBrandingFailed && element.dataset.peterBrandingFailed !== url) {
      delete element.dataset.peterBrandingFailed
    }

    element.src = url
    element.removeAttribute('srcset')
    element.addEventListener('error', () => {
      element.dataset.peterBrandingFailed = url
      const fallback = element.dataset.peterBrandingFallback
      if (fallback && element.getAttribute('src') !== fallback) element.src = fallback
    }, { once: true })
  }

  const semanticText = element => [
    element.getAttribute?.('id'),
    element.getAttribute?.('class'),
    element.getAttribute?.('alt'),
    element.getAttribute?.('aria-label'),
    element.getAttribute?.('data-testid'),
  ].filter(Boolean).join(' ').toLowerCase()

  const isLocalAppLogoUrl = (src, slug, semantics = '') => {
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false

    try {
      const url = new URL(src, window.location.href)
      if (url.origin !== window.location.origin) return false

      const path = url.pathname.toLowerCase()
      const filename = path.split('/').pop() || ''
      const compactSlug = slug.replace(/[^a-z0-9]/g, '')
      const compactFilename = filename.replace(/[^a-z0-9]/g, '')
      const isGenericLogo = /^(logo|app-logo|brand-logo|logo-app|logo-brand)([._-][a-z0-9-]+)?\.(png|jpe?g|webp|svg)$/.test(filename)
        || /\/static\/media\/logo\.[a-z0-9]+\.(png|jpe?g|webp|svg)$/.test(path)
        || /\/assets\/logo-[a-z0-9]+\.(png|jpe?g|webp|svg)$/.test(path)
      const isSlugLogo = filename.includes('logo') && compactSlug && compactFilename.includes(compactSlug)
      const hasLogoSemantics = /(^|[\s_-])(logo|brand)([\s_-]|$)/.test(semantics)
      const isAppAssetDirectory = /^\/(images?|assets?|static\/media)\//.test(path)
      const isEntityImage = /(establishment|empresa|company|business|produto|product|item|avatar|customer|cliente|employer|profissional)/.test(semantics)

      return isGenericLogo || isSlugLogo || (isAppAssetDirectory && hasLogoSemantics && !isEntityImage)
    } catch { return false }
  }

  const isLocalLegacyLogo = (element, slug) => {
    const semantics = semanticText(element)
    return isLocalAppLogoUrl(element.getAttribute('src'), slug, semantics)
      || isLocalAppLogoUrl(element.dataset.peterBrandingFallback, slug, semantics)
  }

  const applyLegacyLogo = (branding, slug) => {
    if (script?.dataset?.autoLegacyLogo !== 'true' || !branding.logo) return
    document.querySelectorAll('img[src]').forEach(element => {
      if (isLocalLegacyLogo(element, slug)) applyImage(element, branding.logo)
    })
  }

  const applyLogoBackgrounds = (branding, slug) => {
    if (script?.dataset?.autoLegacyLogo !== 'true' || !branding.logo) return

    const candidates = document.querySelectorAll(
      '[data-peter-branding-background], [class*="logo"], [id*="logo"], [class*="brand"], [id*="brand"]'
    )

    candidates.forEach(element => {
      const semantics = semanticText(element)
      const background = element.style.backgroundImage || window.getComputedStyle(element).backgroundImage
      const currentMatch = background && background.match(/url\(["']?([^"')]+)["']?\)/i)
      const fallbackBackground = element.dataset.peterBrandingBackgroundFallback || ''
      const fallbackMatch = fallbackBackground.match(/url\(["']?([^"')]+)["']?\)/i)
      const isManagedBackground = Boolean(
        (currentMatch && isLocalAppLogoUrl(currentMatch[1], slug, semantics))
        || (fallbackMatch && isLocalAppLogoUrl(fallbackMatch[1], slug, semantics))
      )

      if (!isManagedBackground) return
      if (!element.dataset.peterBrandingBackgroundFallback) {
        element.dataset.peterBrandingBackgroundFallback = background
      }
      element.style.backgroundImage = `url("${branding.logo}")`
    })
  }

  const applyConfiguredSelector = branding => {
    const selector = script?.dataset?.logoSelector
    if (!selector || !branding.logo) return
    try { document.querySelectorAll(selector).forEach(element => applyImage(element, branding.logo)) }
    catch (error) { console.warn('[Peter Branding] Seletor de logo inválido.', error) }
  }

  const applyMarkedElements = (branding, slug) => {
    document.querySelectorAll('[data-peter-branding]').forEach(element => {
      const role = element.getAttribute('data-peter-branding') || 'logo'
      if (element instanceof HTMLImageElement) return applyImage(element, assetFor(branding, role))
      if (role === 'display-name' && branding.display_name) element.textContent = branding.display_name
      if (role === 'short-name' && branding.short_name) element.textContent = branding.short_name
    })
    applyConfiguredSelector(branding)
    applyLegacyLogo(branding, slug)
    applyLogoBackgrounds(branding, slug)
  }

  const applyDocumentMetadata = branding => {
    const root = document.documentElement
    if (branding.primary_color) root.style.setProperty('--peter-brand-primary', branding.primary_color)
    if (branding.secondary_color) root.style.setProperty('--peter-brand-secondary', branding.secondary_color)
    if (branding.accent_color) root.style.setProperty('--peter-brand-accent', branding.accent_color)
    if (branding.logo) root.style.setProperty('--peter-brand-logo-url', `url("${branding.logo}")`)

    const favicon = assetFor(branding, 'favicon')
    if (favicon) {
      const icons = [...document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')]
      if (!icons.length) {
        const link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
        icons.push(link)
      }
      icons.forEach(link => { link.href = favicon })
    }

    if (branding.social_image) document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(meta => meta.setAttribute('content', branding.social_image))
    if (branding.seo_description) document.querySelector('meta[name="description"]')?.setAttribute('content', branding.seo_description)
  }

  const apply = (branding, slug = activeContext?.slug || inferredSlug()) => {
    if (!branding) return
    applyDocumentMetadata(branding)
    applyMarkedElements(branding, slug)
    window.dispatchEvent(new CustomEvent('peter:branding-ready', { detail: { branding, slug } }))
  }

  const observe = (branding, slug) => {
    activeContext?.observer?.disconnect()
    const observer = new MutationObserver(() => applyMarkedElements(branding, slug))
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'style', 'class'],
    })
    if (activeContext) activeContext.observer = observer
  }

  const fetchPublishedBranding = async (slug, apiBase) => {
    const endpoint = `${apiBase}/applications/${encodeURIComponent(slug)}/branding?_branding_refresh=${Date.now()}`
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.branding) throw new Error(payload?.message || 'Branding indisponível.')
    return payload.branding
  }

  const refresh = async () => {
    if (!activeContext?.slug || !activeContext?.apiBase) return null

    try {
      const branding = await fetchPublishedBranding(activeContext.slug, activeContext.apiBase)
      activeContext.branding = branding
      writeCache(activeContext.slug, branding)
      apply(branding, activeContext.slug)
      observe(branding, activeContext.slug)
      return branding
    } catch (error) {
      if (!activeContext.branding) console.warn('[Peter Branding] Não foi possível carregar a identidade dinâmica.', error)
      return activeContext.branding || null
    }
  }

  const install = async options => {
    const slug = normalizeSlug(options?.appSlug || script?.dataset?.appSlug || inferredSlug())
    const apiBase = String(options?.apiBase || script?.dataset?.apiBase || DEFAULT_API).replace(/\/+$/, '')
    if (!slug) return null

    const cached = readCache(slug)
    activeContext = {
      slug,
      apiBase,
      branding: cached?.branding || null,
      observer: null,
    }

    if (cached?.branding) {
      apply(cached.branding, slug)
      observe(cached.branding, slug)
    }

    // Always verify the published version. The cache is only an instant/offline fallback;
    // it never blocks a freshly published logo from reaching the application.
    const branding = await refresh()

    if (!focusListenerInstalled) {
      focusListenerInstalled = true
      window.addEventListener('focus', () => { refresh() }, { passive: true })
      window.addEventListener('pageshow', event => { if (event.persisted) refresh() }, { passive: true })
    }

    return branding
  }

  window.PeterTecnetBranding = { version: RUNTIME_VERSION, install, refresh, apply }
  if (script?.dataset?.auto !== 'false') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true })
    else install()
  }
})()
