import { existsSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.cwd())
const assets = join(root, 'dist', 'assets')
const output = join(root, 'artifacts', 'admin-shell-v2')
if (!existsSync(assets)) throw new Error('dist/assets não encontrado.')

const chrome = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean).find(existsSync)
if (!chrome) throw new Error('Chrome/Chromium não encontrado.')

const css = readdirSync(assets)
  .filter(name => name.endsWith('.css'))
  .map(name => `<link rel="stylesheet" href="${pathToFileURL(join(assets, name)).href}">`)
  .join('\n')

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

const cases = [
  { name: 'wide-1920-open', width: 1920, height: 1080, open: true, mobile: false },
  { name: 'desktop-1440-open', width: 1440, height: 900, open: true, mobile: false },
  { name: 'notebook-1366-open', width: 1366, height: 768, open: true, mobile: false },
  { name: 'desktop-1280-closed', width: 1280, height: 800, open: false, mobile: false },
  { name: 'tablet-1024-closed', width: 1024, height: 900, open: false, mobile: false },
  { name: 'tablet-768-closed', width: 768, height: 1024, open: false, mobile: true },
  { name: 'iphone-430-open', width: 430, height: 932, open: true, mobile: true },
  { name: 'iphone-390-closed', width: 390, height: 844, open: false, mobile: true },
  { name: 'iphone-360-open', width: 360, height: 800, open: true, mobile: true },
]

function page(test) {
  const nav = ['Visão geral','Operações','Agentes','Financeiro','Aplicações','Usuários','Estabelecimentos','Itens','Notificações','Atividade']
    .map((label, index) => `<button class="${index === 0 ? 'active' : ''}"><span>•</span><b>${label}</b><i>→</i></button>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<style>*{animation:none!important;transition:none!important}</style></head><body>
  <div class="admin-shell" data-admin-page="dashboard" data-sidebar-open="${test.open ? 'true' : 'false'}" data-density="comfortable">
    <div class="sidebar-backdrop ${test.open ? 'visible' : ''}"></div>
    <aside class="sidebar ${test.open ? 'open' : ''}" aria-hidden="${test.open ? 'false' : 'true'}"><a class="brand"><span>PT</span></a><nav><p>GESTÃO</p>${nav}</nav></aside>
    <main class="workspace"><header class="topbar"><button class="hamburger"><span></span><span></span><span></span></button></header><div class="content"><section class="hero-section" data-admin-page-key="dashboard"><h1>Dashboard administrativo</h1></section><section class="metrics-grid" data-admin-page-key="dashboard"><article class="metric-card"><strong>42</strong></article></section></div></main>
  </div>
  <pre id="result" hidden></pre>
  <script>addEventListener('load',()=>requestAnimationFrame(()=>{const shell=document.querySelector('.admin-shell');const sidebar=document.querySelector('.sidebar');const workspace=document.querySelector('.workspace');const backdrop=document.querySelector('.sidebar-backdrop');const checks=[];const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});const side=getComputedStyle(sidebar);const work=workspace.getBoundingClientRect();add('no-horizontal-overflow',document.documentElement.scrollWidth<=innerWidth+2,document.documentElement.scrollWidth+'/'+innerWidth);add('workspace-contained',work.left>=-2&&work.right<=innerWidth+2,JSON.stringify({left:work.left,right:work.right,width:innerWidth}));if(${test.mobile}){add('mobile-sidebar-width',sidebar.getBoundingClientRect().width<=innerWidth*.92+2,String(sidebar.getBoundingClientRect().width));add('mobile-open-state',${test.open} ? side.transform==='none'||side.transform==='matrix(1, 0, 0, 1, 0, 0)' : side.transform!=='none',side.transform);add('mobile-backdrop-state',${test.open} ? getComputedStyle(backdrop).pointerEvents==='auto' : getComputedStyle(backdrop).pointerEvents==='none',getComputedStyle(backdrop).pointerEvents)}else{add('desktop-sidebar-state',${test.open} ? side.transform==='none'||side.transform==='matrix(1, 0, 0, 1, 0, 0)' : side.transform!=='none',side.transform);add('desktop-workspace-offset',${test.open} ? work.left>=295 : work.left<=2,String(work.left));add('desktop-no-backdrop',getComputedStyle(backdrop).pointerEvents==='none',getComputedStyle(backdrop).pointerEvents)}document.querySelector('#result').textContent=JSON.stringify({name:'${test.name}',ok:checks.every(c=>c.pass),checks});document.body.dataset.complete='true'}));<\/script>
  </body></html>`
}

function parse(html) {
  const match = html.match(/<pre id="result" hidden="">([^<]+)<\/pre>/) || html.match(/<pre id="result" hidden>([^<]+)<\/pre>/)
  if (!match) return null
  return JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
}

function runProbe(test, file, attempts = 4) {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const profile = join(output, `.chrome-${test.name}-${attempt}`)
    rmSync(profile, { recursive: true, force: true })
    mkdirSync(profile, { recursive: true })
    const run = spawnSync(chrome, [
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--allow-file-access-from-files','--virtual-time-budget=3500',
      '--disable-background-networking','--disable-component-update','--no-first-run',
      `--user-data-dir=${profile}`,
      `--window-size=${Math.max(500,test.width)},${Math.max(800,test.height)}`,
      '--dump-dom', pathToFileURL(file).href,
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 15000 })
    last = run
    // Chromium can emit a valid dumped DOM and still exit non-zero because of
    // runner-only DBus/desktop-service warnings. The contract is the DOM result,
    // so accept it whenever the probe completed and produced our assertion payload.
    const result = parse(run.stdout)
    rmSync(profile, { recursive: true, force: true })
    if (result) return { result, attempt }
  }
  return { result: null, attempt: attempts, last }
}

const failures = []
for (const test of cases) {
  const file = join(output, `${test.name}.html`)
  writeFileSync(file, page(test))
  const probe = runProbe(test, file)
  const result = probe.result

  if (process.env.ADMIN_CAPTURE_SCREENSHOTS === '1' && result) {
    const profile = join(output, `.chrome-shot-${test.name}`)
    rmSync(profile, { recursive: true, force: true })
    mkdirSync(profile, { recursive: true })
    spawnSync(chrome, [
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--allow-file-access-from-files','--disable-background-networking','--no-first-run',
      `--user-data-dir=${profile}`,
      `--window-size=${Math.max(500,test.width)},${Math.max(800,test.height)}`,
      `--screenshot=${join(output, `${test.name}.png`)}`, pathToFileURL(file).href,
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 15000 })
    rmSync(profile, { recursive: true, force: true })
  }

  if (!result) {
    const detail = probe.last?.stderr?.trim()?.slice(-400) || probe.last?.stdout?.trim()?.slice(-400) || 'sem saída do navegador'
    failures.push(`${test.name}: browser probe não retornou resultado após ${probe.attempt} tentativas (${detail})`)
    continue
  }

  console.log(`${result.ok ? '✓' : '✗'} ${test.name}: ${result.checks.map(c=>`${c.name}=${c.pass?'ok':'FAIL'}`).join(', ')}${probe.attempt > 1 ? ` (tentativa ${probe.attempt})` : ''}`)
  if (!result.ok) failures.push(`${test.name}: ${result.checks.filter(c=>!c.pass).map(c=>`${c.name} (${c.detail})`).join('; ')}`)
}

if (failures.length) {
  failures.forEach(item => console.error('- '+item))
  process.exit(1)
}
console.log(`Admin shell V2 browser smoke passed in ${cases.length} viewport/state combinations.`)
