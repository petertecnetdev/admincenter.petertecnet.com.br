import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.cwd())
const dist = join(root, 'dist')
const assets = join(dist, 'assets')
const output = join(root, 'artifacts', 'admin-ui')

if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html não encontrado. Execute npm run build antes do teste visual.')
if (!existsSync(assets)) throw new Error('dist/assets não encontrado.')

const cssFiles = readdirSync(assets).filter(file => file.endsWith('.css')).map(file => join(assets, file))
if (!cssFiles.length) throw new Error('Nenhum CSS de produção foi encontrado em dist/assets.')

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)
const chrome = chromeCandidates.find(existsSync)
if (!chrome) throw new Error('Chrome/Chromium não encontrado para validação responsiva real.')

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

const viewports = [
  { name: 'mobile-360', width: 360, height: 800, mobile: true, expectedMetrics: 1 },
  { name: 'mobile-390', width: 390, height: 844, mobile: true, expectedMetrics: 1 },
  { name: 'tablet-768', width: 768, height: 1024, mobile: false, expectedMetrics: 2 },
  { name: 'notebook-1024', width: 1024, height: 768, mobile: false, expectedMetrics: 2 },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false, expectedMetrics: 4 },
  { name: 'wide-1920', width: 1920, height: 1080, mobile: false, expectedMetrics: 4 },
]

const navItems = ['Mission Control', 'Visão geral', 'Atividade', 'Financeiro', 'Aplicações', 'Usuários', 'Perfis e permissões', 'Estabelecimentos', 'Itens', 'Site institucional', 'Auditoria']
const icons = ['⌘', '▦', '⌁', '¤', '◇', '◉', '⌗', '⌂', '▣', '✦', '◎']
const cssLinks = cssFiles.map(file => `<link rel="stylesheet" href="${pathToFileURL(file).href}">`).join('\n')

function adminMarkup() {
  const nav = navItems.map((label, index) => `<button ${index === 0 ? 'class="active"' : ''} data-admin-tab="${['command','dashboard','activity','financial','applications','users','profiles','establishments','items','site','audit'][index]}" data-icon="${icons[index]}">${label}</button>`).join('')
  const metrics = Array.from({ length: 8 }, (_, index) => `<article class="metric-card"><span>Indicador ${index + 1}</span><strong>${(index + 1) * 17}</strong><small>amostra responsiva</small></article>`).join('')
  const rows = Array.from({ length: 5 }, (_, index) => `<tr><td>#${index + 1}</td><td>Registro operacional ${index + 1} com conteúdo suficiente</td><td>Ativo</td><td>03/09/2026</td></tr>`).join('')

  return `<header class="admin-mobile-topbar"><button class="admin-mobile-menu-button" aria-expanded="false"><span></span><span></span><span></span></button><a class="admin-mobile-identity"><img src=""><span><small>Admin Center</small><strong>Mission Control</strong></span></a><span class="admin-mobile-topbar-spacer"></span></header>
  <main class="ecosystem-shell"><aside class="ecosystem-sidebar" id="admin-mobile-drawer"><a class="admin-brand ecosystem-brand"><img src=""><span><b>Peter Tecnet</b><small>Mission Control</small></span></a><nav>${nav}</nav><div class="sidebar-foot"><a>Site Peter Tecnet</a><button>Sair</button></div></aside><section class="ecosystem-main"><header class="ecosystem-top"><div><p class="admin-kicker">Peter Tecnet Command Center</p><h1>Mission Control</h1></div><div class="top-actions"><button>Atualizar</button></div></header><div class="admin-stack"><div class="metric-grid">${metrics}</div><div class="admin-grid"><section class="admin-panel"><div class="panel-title"><h2>Operação</h2></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Descrição</th><th>Status</th><th>Data</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="admin-panel"><div class="panel-title"><h2>Resumo</h2></div><p>Conteúdo para validar largura, quebra e densidade visual.</p></section></div></div></section></main><button class="admin-mobile-backdrop"></button>`
}

function probeDocument(viewport) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cssLinks}<style>*{animation:none!important;transition:none!important}</style></head><body>${adminMarkup()}
  <script>
  addEventListener('load', () => requestAnimationFrame(() => {
    const checks = []
    const add = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail })
    const shell = document.querySelector('.ecosystem-shell')
    const sidebar = document.querySelector('.ecosystem-sidebar')
    const main = document.querySelector('.ecosystem-main')
    const topbar = document.querySelector('.admin-mobile-topbar')
    const grid = document.querySelector('.metric-grid')
    const tableWrap = document.querySelector('.table-wrap')
    const firstNav = document.querySelector('.ecosystem-sidebar nav button[data-icon]')
    const width = innerWidth
    const height = innerHeight
    const closedTransform = getComputedStyle(sidebar).transform
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
    const mainRect = main.getBoundingClientRect()
    const iconContent = getComputedStyle(firstNav, '::before').content

    add('requested-viewport-width', Math.abs(width - ${viewport.width}) <= 1, width + ' requested=${viewport.width}')
    add('requested-viewport-height', Math.abs(height - ${viewport.height}) <= 1, height + ' requested=${viewport.height}')
    add('no-page-horizontal-overflow', document.documentElement.scrollWidth <= width + 2, document.documentElement.scrollWidth + '/' + width)
    add('main-contained-in-viewport', mainRect.left >= -2 && mainRect.right <= width + 2, JSON.stringify({ left: mainRect.left, right: mainRect.right, width }))
    add('table-scroll-contained', tableWrap.scrollWidth >= tableWrap.clientWidth && tableWrap.getBoundingClientRect().right <= mainRect.right + 2, tableWrap.scrollWidth + '/' + tableWrap.clientWidth)
    add('metric-columns', columns === ${viewport.expectedMetrics}, String(columns))
    add('data-driven-nav-icon', iconContent && iconContent !== 'none' && iconContent !== 'normal', iconContent)

    if (${viewport.mobile}) {
      add('mobile-shell-block', getComputedStyle(shell).display === 'block', getComputedStyle(shell).display)
      add('mobile-topbar-fixed', getComputedStyle(topbar).position === 'fixed', getComputedStyle(topbar).position)
      add('mobile-drawer-closed-offcanvas', closedTransform !== 'none', closedTransform)
      document.body.classList.add('admin-mobile-menu-open')
      const openTransform = getComputedStyle(sidebar).transform
      add('mobile-drawer-opens', openTransform === 'none' || openTransform === 'matrix(1, 0, 0, 1, 0, 0)', openTransform)
      add('mobile-drawer-width', sidebar.getBoundingClientRect().width <= width * .9, String(sidebar.getBoundingClientRect().width))
    } else {
      add('desktop-shell-grid', getComputedStyle(shell).display === 'grid', getComputedStyle(shell).display)
      const sidebarWidth = sidebar.getBoundingClientRect().width
      add('desktop-sidebar-width', sidebarWidth >= 200 && sidebarWidth <= 300, String(sidebarWidth))
      add('mobile-topbar-hidden', getComputedStyle(topbar).display === 'none', getComputedStyle(topbar).display)
    }

    parent.postMessage({ source: 'admin-ui-probe', result: { viewport: '${viewport.name}', requestedWidth: ${viewport.width}, requestedHeight: ${viewport.height}, width, height, columns, checks, ok: checks.every(check => check.pass) } }, '*')
  }))
  <\/script></body></html>`
}

function wrapperDocument(viewport, probeUrl) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#02080d;overflow:hidden}iframe{display:block;width:${viewport.width}px;height:${viewport.height}px;border:0}</style></head><body><iframe id="probe" src="${probeUrl}" title="Admin Center responsive probe"></iframe><pre id="browser-result" hidden></pre><script>addEventListener('message',event=>{if(event.data?.source!=='admin-ui-probe')return;document.querySelector('#browser-result').textContent=JSON.stringify(event.data.result);document.body.dataset.probeComplete='true'})<\/script></body></html>`
}

function parseResult(html) {
  const match = html.match(/<pre id="browser-result" hidden="">([^<]+)<\/pre>/) || html.match(/<pre id="browser-result" hidden>([^<]+)<\/pre>/)
  if (!match) return null
  return JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#39;', "'"))
}

function runProbe(url, common, attempts = 3) {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const dumped = spawnSync(chrome, [...common, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    last = dumped
    if (dumped.status !== 0) continue
    const result = parseResult(dumped.stdout)
    if (result) return { dumped, result, attempt }
  }
  return { dumped: last, result: null, attempt: attempts }
}

const failures = []
for (const viewport of viewports) {
  const probePath = join(output, `${viewport.name}-probe.html`)
  writeFileSync(probePath, probeDocument(viewport))
  const wrapperPath = join(output, `${viewport.name}.html`)
  writeFileSync(wrapperPath, wrapperDocument(viewport, pathToFileURL(probePath).href))
  const url = pathToFileURL(wrapperPath).href
  const outerWidth = Math.max(500, viewport.width)
  const outerHeight = Math.max(800, viewport.height)
  const common = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--hide-scrollbars', '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=4000', `--window-size=${outerWidth},${outerHeight}`,
  ]

  const probe = runProbe(url, common)
  if (!probe.dumped || probe.dumped.status !== 0) {
    failures.push(`${viewport.name}: Chrome falhou após ${probe.attempt} tentativa(s) (${probe.dumped?.stderr || probe.dumped?.stdout || 'sem saída'})`)
    continue
  }

  const result = probe.result
  if (!result) {
    failures.push(`${viewport.name}: o probe responsivo não concluiu após ${probe.attempt} tentativa(s)`)
    continue
  }

  console.log(`${result.ok ? '✓' : '✗'} ${viewport.name} requested=${result.requestedWidth}x${result.requestedHeight} actual=${result.width}x${result.height}: ${result.checks.map(check => `${check.name}=${check.pass ? 'ok' : 'FAIL'}`).join(', ')}${probe.attempt > 1 ? ` (tentativa ${probe.attempt})` : ''}`)
  if (!result.ok) failures.push(`${viewport.name}: ${result.checks.filter(check => !check.pass).map(check => `${check.name} (${check.detail})`).join('; ')}`)

  const screenshot = join(output, `${viewport.name}.png`)
  spawnSync(chrome, [...common, `--screenshot=${screenshot}`, url], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
}

if (failures.length) {
  console.error('\nFalhas responsivas detectadas:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`\nAdmin Center validado em navegador real em ${viewports.length} viewports CSS exatos. Screenshots: ${output}`)
