import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.cwd())
const assets = join(root, 'dist', 'assets')
const output = join(root, 'artifacts', 'admin-navigation')
if (!existsSync(assets)) throw new Error('dist/assets não encontrado. Execute npm run build antes do teste.')

const cssFiles = readdirSync(assets).filter(file => file.endsWith('.css')).map(file => join(assets, file))
const cssLinks = cssFiles.map(file => `<link rel="stylesheet" href="${pathToFileURL(file).href}">`).join('\n')
const chromeCandidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
const chrome = chromeCandidates.find(existsSync)
if (!chrome) throw new Error('Chrome/Chromium não encontrado.')

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

const routes = [
  { key: 'users', label: 'Usuários', kind: 'legacy' },
  { key: 'content', label: 'Conteúdo e SEO', kind: 'module' },
  { key: 'visibility', label: 'Visibilidade e publicação', kind: 'module' },
  { key: 'laora', label: 'Laora Safety Center', kind: 'laora' },
]
const viewports = [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
]
const nav = [
  ['command','Mission Control'],['dashboard','Visão geral'],['activity','Atividade'],['financial','Financeiro'],['establishments','Estabelecimentos'],['items','Itens'],['visibility','Visibilidade e publicação'],['marketing','Landing e marketing'],['content','Conteúdo e SEO'],['discovery','Discovery Intelligence'],['applications','Aplicações'],['branding','Branding e logos'],['ecosystem-launcher','Navegação do ecossistema'],['users','Usuários'],['profiles','Perfis e permissões'],['audit','Auditoria'],['site','Site institucional'],['laora','Laora Safety Center'],
]

function moduleContent(route) {
  if (route.kind === 'legacy') return `<main class="ecosystem-shell legacy-probe"><aside class="ecosystem-sidebar"><nav><button>Mission Control</button><button>Usuários</button></nav></aside><section class="ecosystem-main"><header class="ecosystem-top"><h1>${route.label}</h1></header><div class="admin-panel"><p>Workspace legado embutido.</p></div></section></main>`
  if (route.kind === 'laora') return `<main class="la-admin"><aside><a class="la-admin-brand">Laora</a><nav><button class="active">Denúncias</button><button>Fotos</button><button>Indicadores</button></nav><a>Voltar</a></aside><section class="la-admin-main"><header><div><h1>Laora Safety Center</h1></div></header><div class="la-panel">Módulo Laora integrado.</div></section></main>`
  return `<section class="visibility-admin-shell"><header class="ecosystem-top"><h1>${route.label}</h1></header><div class="admin-panel">Módulo administrativo integrado.</div></section>`
}

function documentFor(route, viewport) {
  const buttons = nav.map(([key, label]) => `<button data-admin-aux-nav="persistent" data-admin-route="${key}" ${key === route.key ? 'class="active" aria-current="page"' : ''}><span class="admin-persistent-nav-icon">•</span><span>${label}</span></button>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cssLinks}<style>*{animation:none!important;transition:none!important}</style></head><body><header class="admin-mobile-topbar"><button class="admin-mobile-menu-button"></button><span>${route.label}</span></header><main class="ecosystem-shell admin-persistent-shell" data-admin-canonical-shell="true"><aside class="ecosystem-sidebar admin-persistent-sidebar"><a class="admin-brand ecosystem-brand">Peter Tecnet</a><nav>${buttons}</nav></aside><section class="ecosystem-main admin-persistent-main" data-admin-persistent-content data-admin-active-route="${route.key}">${moduleContent(route)}</section></main><button class="admin-mobile-backdrop"></button><pre id="result" hidden></pre><script>addEventListener('load',()=>requestAnimationFrame(()=>{const checks=[];const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});const sidebar=document.querySelector('.admin-persistent-sidebar');const active=sidebar.querySelector('[aria-current="page"]');const visibleSidebars=[...document.querySelectorAll('.ecosystem-sidebar')].filter(el=>getComputedStyle(el).display!=='none');add('active-route',active?.dataset.adminRoute==='${route.key}',active?.dataset.adminRoute||'none');add('canonical-shell',Boolean(document.querySelector('[data-admin-canonical-shell="true"]')));add('single-visible-sidebar',visibleSidebars.length===1,String(visibleSidebars.length));add('no-horizontal-overflow',document.documentElement.scrollWidth<=innerWidth+2,document.documentElement.scrollWidth+'/'+innerWidth);${route.kind === 'legacy' ? "add('legacy-sidebar-hidden',getComputedStyle(document.querySelector('.legacy-probe > .ecosystem-sidebar')).display==='none',getComputedStyle(document.querySelector('.legacy-probe > .ecosystem-sidebar')).display);" : ''}${route.kind === 'laora' ? "const laAside=document.querySelector('.la-admin > aside');add('laora-subnav-static',getComputedStyle(laAside).position==='static',getComputedStyle(laAside).position);add('laora-subnav-not-drawer',getComputedStyle(laAside).transform==='none',getComputedStyle(laAside).transform);" : ''}if(${viewport.mobile}){const closed=getComputedStyle(sidebar).transform;add('mobile-drawer-closed',closed!=='none',closed);document.body.classList.add('admin-mobile-menu-open');const opened=getComputedStyle(sidebar).transform;add('mobile-drawer-opens',opened==='none'||opened==='matrix(1, 0, 0, 1, 0, 0)',opened)}else{add('desktop-sidebar-visible',getComputedStyle(sidebar).display!=='none',getComputedStyle(sidebar).display);add('desktop-sidebar-static',getComputedStyle(sidebar).transform==='none',getComputedStyle(sidebar).transform)}document.querySelector('#result').textContent=JSON.stringify({route:'${route.key}',viewport:'${viewport.name}',checks,ok:checks.every(x=>x.pass)});document.body.dataset.complete='true'}));<\/script></body></html>`
}

function parse(html) {
  const match = html.match(/<pre id="result" hidden="">([^<]+)<\/pre>/) || html.match(/<pre id="result" hidden>([^<]+)<\/pre>/)
  if (!match) return null
  return JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#39;', "'"))
}

function runProbe(url, common, attempts = 3) {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const run = spawnSync(chrome, [...common, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    last = run
    if (run.status !== 0) continue
    const result = parse(run.stdout)
    if (result) return { result, attempt, run }
  }
  return { result: null, attempt: attempts, run: last }
}

const failures = []
for (const route of routes) {
  for (const viewport of viewports) {
    const file = join(output, `${route.key}-${viewport.name}.html`)
    writeFileSync(file, documentFor(route, viewport))
    const common = ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--virtual-time-budget=3000',`--window-size=${Math.max(500, viewport.width)},${Math.max(800, viewport.height)}`]
    const probe = runProbe(pathToFileURL(file).href, common)
    const result = probe.result
    if (!result) {
      const detail = probe.run?.stderr?.trim() || probe.run?.stdout?.trim()?.slice(-500) || 'sem saída do Chromium'
      failures.push(`${route.key}/${viewport.name}: Chromium não retornou o probe após ${probe.attempt} tentativas (${detail})`)
      continue
    }
    console.log(`${result.ok ? '✓' : '✗'} ${route.key}/${viewport.name}: ${result.checks.map(check => `${check.name}=${check.pass ? 'ok' : 'FAIL'}`).join(', ')}${probe.attempt > 1 ? ` (tentativa ${probe.attempt})` : ''}`)
    if (!result.ok) failures.push(`${route.key}/${viewport.name}: ${result.checks.filter(check => !check.pass).map(check => `${check.name} (${check.detail})`).join('; ')}`)
  }
}

if (failures.length) {
  console.error('\nFalhas de regressão do shell administrativo:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`\nShell canônico validado em ${routes.length * viewports.length} cenários reais de navegador.`)
