const path = window.location.pathname.replace(/\/+$/, '') || '/'

import('./MarketingConversionBridge.js')

const isMarketingHub = path === '/'
  || path === '/sobre'
  || path === '/portfolio'
  || path === '/orcamento'
  || path.startsWith('/servicos/')

if (isMarketingHub) {
  Promise.all([
    import('./MarketingHubApp.jsx'),
    import('./MarketingRuntimeConfig.js'),
  ])
} else {
  import('./main.jsx')
}
