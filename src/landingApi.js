const API_ORIGIN = 'https://api.petertecnet.com.br'
export const PETER_TECNET_CNPJ = '42595409000148'

const normalizeDocument = value => String(value || '').replace(/\D/g, '')
const INITIALS_STOP_WORDS = new Set(['a', 'as', 'o', 'os', 'de', 'da', 'das', 'do', 'dos', 'e', 'em', 'para', 'por', 'com'])

export const resolveAssetUrl = path => {
  if (!path) return null
  if (/^data:/i.test(path)) return path
  if (/^https?:\/\//i.test(path)) return path
  return `${API_ORIGIN}/${String(path).replace(/^\/+/, '')}`
}

export const getItemInitials = item => {
  const name = typeof item === 'string' ? item : item?.name
  const words = String(name || 'Item')
    .trim()
    .split(/\s+/)
    .map(word => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)

  const meaningful = words.filter(word => !INITIALS_STOP_WORDS.has(word.toLocaleLowerCase('pt-BR')))
  const source = meaningful.length ? meaningful : words

  if (!source.length) return 'I'
  if (source.length === 1) return source[0][0].toLocaleUpperCase('pt-BR')

  return `${source[0][0]}${source[1][0]}`.toLocaleUpperCase('pt-BR')
}

const createItemInitialsImage = item => {
  const initials = getItemInitials(item)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760" role="img" aria-label="${initials}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#071a23"/>
        <stop offset="0.55" stop-color="#041219"/>
        <stop offset="1" stop-color="#01070b"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="45%" r="62%">
        <stop offset="0" stop-color="#19d8f2" stop-opacity="0.22"/>
        <stop offset="0.55" stop-color="#0089b4" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#01070b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="760" rx="48" fill="url(#bg)"/>
    <rect width="1200" height="760" rx="48" fill="url(#glow)"/>
    <circle cx="600" cy="348" r="188" fill="#19d8f2" fill-opacity="0.035" stroke="#6ef0ff" stroke-opacity="0.16" stroke-width="2"/>
    <circle cx="600" cy="348" r="145" fill="#19d8f2" fill-opacity="0.045" stroke="#6ef0ff" stroke-opacity="0.08" stroke-width="2"/>
    <text x="600" y="395" text-anchor="middle" fill="#eefcff" font-family="Arial, Helvetica, sans-serif" font-size="176" font-weight="700" letter-spacing="-8">${initials}</text>
    <text x="600" y="620" text-anchor="middle" fill="#6f8c95" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="7">PETER TECNET · CATALOG</text>
  </svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const getItemImage = item => {
  if (item?.image_url) return resolveAssetUrl(item.image_url)
  if (item?.image) return resolveAssetUrl(item.image)

  const files = Array.isArray(item?.files) ? item.files : []
  const preferred = files.find(file => file?.is_primary) || files.find(file => file?.type === 'image') || files[0]
  const fileImage = resolveAssetUrl(preferred?.public_url || preferred?.url || preferred?.path)

  return fileImage || createItemInitialsImage(item)
}

const API_TIMEOUT_MS = 6000

const apiGet = async (path, signal) => {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })

  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, API_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      const error = new Error(`API request failed: ${response.status}`)
      error.status = response.status
      throw error
    }

    return await response.json()
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`API request timeout after ${API_TIMEOUT_MS}ms`)
      timeoutError.name = 'TimeoutError'
      throw timeoutError
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

export const fetchApplications = signal => apiGet('/api/applications', signal)
export const fetchSite = signal => apiGet('/api/ecosystem/site', signal)

const resolveNexusApplication = applications =>
  applications.find(application => String(application?.slug || '').toLowerCase() === 'nexus')

const isPeterTecnetCompany = company => {
  if (!company) return false
  if (normalizeDocument(company.cnpj) === PETER_TECNET_CNPJ) return true
  const name = `${company.name || ''} ${company.fantasy || ''}`.toLowerCase()
  return name.includes('peter tecnet')
}

const loadLegacyCatalog = async signal => {
  const payload = await apiGet(`/api/nexus/public/catalog-by-cnpj/${PETER_TECNET_CNPJ}`, signal)
  if (!payload?.success) throw new Error('Legacy catalog unavailable')
  return {
    establishment: payload.establishment || null,
    items: Array.isArray(payload.items) ? payload.items : [],
    source: 'legacy',
  }
}

const discoverPeterTecnetCompany = async (nexusAppId, signal) => {
  const queries = [
    `/api/nexus/discovery?app_id=${encodeURIComponent(nexusAppId)}&q=${encodeURIComponent('Peter Tecnet')}&limit=20`,
    `/api/nexus/discovery?app_id=${encodeURIComponent(nexusAppId)}&limit=100`,
  ]

  for (const path of queries) {
    try {
      const discovery = await apiGet(path, signal)
      const companies = Array.isArray(discovery?.establishments) ? discovery.establishments : []
      const company = companies.find(isPeterTecnetCompany)
      if (company) return company
    } catch (error) {
      if (error?.name === 'AbortError') throw error
    }
  }

  return null
}

export async function fetchPeterCatalog(applications, signal) {
  const nexus = resolveNexusApplication(applications)

  if (nexus?.id) {
    try {
      const company = await discoverPeterTecnetCompany(nexus.id, signal)
      if (company?.slug || company?.id) {
        const identifier = company.slug || company.id
        const catalog = await apiGet(`/api/nexus/catalog/${encodeURIComponent(identifier)}?app_id=${encodeURIComponent(nexus.id)}`, signal)
        if (catalog?.success) {
          return {
            establishment: catalog.establishment || company,
            items: Array.isArray(catalog.items) ? catalog.items : [],
            nexusAppId: nexus.id,
            source: 'nexus-v2',
          }
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error
    }
  }

  return loadLegacyCatalog(signal)
}

export async function fetchPeterItem(identifier, applications, signal) {
  const nexus = resolveNexusApplication(applications)

  if (nexus?.id) {
    try {
      const payload = await apiGet(`/api/nexus/item/${encodeURIComponent(identifier)}?app_id=${encodeURIComponent(nexus.id)}`, signal)
      if (payload?.success && isPeterTecnetCompany(payload.establishment)) {
        return {
          item: payload.item,
          establishment: payload.establishment,
          otherItems: Array.isArray(payload.other_items) ? payload.other_items : [],
          source: 'nexus-v2',
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error
    }
  }

  const catalog = await loadLegacyCatalog(signal)
  const item = catalog.items.find(candidate => String(candidate?.slug || candidate?.id) === String(identifier))
  if (!item) {
    const error = new Error('Item not found')
    error.status = 404
    throw error
  }

  return {
    item,
    establishment: catalog.establishment,
    otherItems: catalog.items.filter(candidate => candidate?.id !== item?.id).slice(0, 8),
    source: 'legacy',
  }
}

export const formatCurrency = value => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 'Sob consulta'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number)
}
