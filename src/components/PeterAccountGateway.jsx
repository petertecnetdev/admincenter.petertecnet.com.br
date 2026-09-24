/* eslint-disable react/prop-types */
import { useEffect, useRef } from 'react'

const SDK_VERSION = '3.0.0'
const TELEMETRY_VERSION = '3.1.0'
const INSIGHTS_VERSION = '1.0.0'
const SDK_URL = `https://petertecnet.com.br/ecosystem/peter-ecosystem-v3.js?v=${SDK_VERSION}`
const TELEMETRY_URL = `https://petertecnet.com.br/ecosystem/peter-telemetry-v3.js?v=${TELEMETRY_VERSION}`
const INSIGHTS_URL = `https://petertecnet.com.br/ecosystem/peter-insights.js?v=${INSIGHTS_VERSION}`
let sdkPromise
let telemetryPromise
let insightsPromise

function loadScript({ selector, src, datasetKey, datasetValue, isReady, errorMessage, attributes = {} }) {
  if (isReady()) return Promise.resolve()
  const existing = document.querySelector(selector)
  if (existing) {
    return new Promise((resolve, reject) => {
      if (isReady()) return resolve()
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => {
        existing.remove()
        reject(new Error(errorMessage))
      }, { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset[datasetKey] = datasetValue
    Object.entries(attributes).forEach(([key, value]) => { script.dataset[key] = value || '' })
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error(errorMessage))
    }, { once: true })
    document.head.appendChild(script)
  })
}

function loadTelemetry(apiBaseUrl, appSlug) {
  if (window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION) {
    window.PeterTecnetTelemetry.start({ apiBaseUrl, appSlug })
    return Promise.resolve()
  }
  if (!telemetryPromise) telemetryPromise = loadScript({
    selector: 'script[data-peter-telemetry-sdk]', src: TELEMETRY_URL, datasetKey: 'peterTelemetrySdk', datasetValue: TELEMETRY_VERSION,
    attributes: { appSlug, apiBase: apiBaseUrl },
    isReady: () => window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION,
    errorMessage: 'Não foi possível carregar a telemetria Peter Tecnet.',
  }).then(() => window.PeterTecnetTelemetry?.start({ apiBaseUrl, appSlug })).catch(error => {
    telemetryPromise = null
    throw error
  })
  return telemetryPromise
}

function loadSdk() {
  if (window.PeterTecnetEcosystem?.version === SDK_VERSION && customElements.get('peter-ecosystem-launcher')) return Promise.resolve()
  if (!sdkPromise) sdkPromise = loadScript({
    selector: 'script[data-peter-ecosystem-sdk]', src: SDK_URL, datasetKey: 'peterEcosystemSdk', datasetValue: SDK_VERSION,
    isReady: () => Boolean(customElements.get('peter-ecosystem-launcher')),
    errorMessage: 'Não foi possível carregar o Peter Tecnet Ecosystem SDK.',
  }).catch(error => {
    sdkPromise = null
    throw error
  })
  return sdkPromise
}

function loadInsights() {
  if (window.PeterTecnetInsights?.version === INSIGHTS_VERSION && customElements.get('peter-insight-chart')) return Promise.resolve()
  if (!insightsPromise) insightsPromise = loadScript({
    selector: 'script[data-peter-insights-sdk]', src: INSIGHTS_URL, datasetKey: 'peterInsightsSdk', datasetValue: INSIGHTS_VERSION,
    isReady: () => Boolean(customElements.get('peter-insight-chart')),
    errorMessage: 'Não foi possível carregar o Peter Tecnet Insights SDK.',
  }).catch(error => {
    insightsPromise = null
    throw error
  })
  return insightsPromise
}

function keepLauncherHeadless(launcher) {
  if (!launcher) return
  launcher.hidden = true
  launcher.setAttribute('aria-hidden', 'true')
  launcher.setAttribute('data-peter-headless', 'true')
  launcher.style.display = 'none'
}

export default function PeterAccountGateway({ apiBaseUrl, appSlug, children }) {
  const hostRef = useRef(null)

  useEffect(() => {
    let active = true
    let launcher = null
    const host = hostRef.current
    const api = apiBaseUrl || 'https://api.petertecnet.com.br/api'

    loadTelemetry(api, appSlug || '')
      .catch(error => console.error('[Peter Tecnet Telemetry]', error))
      .finally(() => loadSdk().then(() => {
        if (!active || !host) return
        launcher = document.createElement('peter-ecosystem-launcher')
        launcher.setAttribute('api-base', api)
        launcher.setAttribute('app-slug', appSlug || '')
        launcher.setAttribute('sdk-version', SDK_VERSION)
        host.replaceChildren(launcher)
        keepLauncherHeadless(launcher)
      }).catch(error => console.error('[Peter Tecnet Ecosystem]', error)))

    loadInsights().catch(error => console.error('[Peter Tecnet Insights]', error))

    return () => {
      active = false
      launcher?.remove()
      host?.replaceChildren()
    }
  }, [apiBaseUrl, appSlug])

  return <>{children}<span ref={hostRef} style={{ display: 'contents' }} /></>
}
