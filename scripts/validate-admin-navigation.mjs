import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const read = path => readFileSync(resolve(root, path), 'utf8')
const failures = []
const check = (name, condition) => {
  if (condition) console.log(`✓ ${name}`)
  else {
    console.error(`✗ ${name}`)
    failures.push(name)
  }
}

const config = read('src/admin/AdminNavigationConfig.js')
const entry = read('src/AdminEntry.jsx')
const shell = read('src/AdminPersistentShell.jsx')
const shellCss = read('src/AdminPersistentShell.css')
const provider = read('src/admin/AdminUiProvider.jsx')
const adminJs = read('src/Admin.js')
const mobile = read('src/components/AdminMobileNavigation.jsx')
const mobileCss = read('src/components/AdminMobileNavigation.css')
const stateBridge = read('src/admin/AdminWorkspaceStateBridge.jsx')
const deepLink = read('src/AdminDeepLinkBridge.jsx')
const homeBridge = read('src/AdminHomeBridge.jsx')
const homeCss = read('src/AdminHomeBridge.css')
const serviceWorker = read('public/service-worker.js')

const requiredRoutes = [
  '/admin',
  '/admin/mission-control',
  '/admin/overview',
  '/admin/activity',
  '/admin/financial',
  '/admin/establishments',
  '/admin/items',
  '/admin/visibility',
  '/admin/marketing',
  '/admin/content',
  '/admin/discovery',
  '/admin/applications',
  '/admin/branding',
  '/admin/ecosystem-launcher',
  '/admin/users',
  '/admin/profiles',
  '/admin/audit',
  '/admin/site',
  '/admin/laora',
]

requiredRoutes.forEach(route => check(`canonical route ${route}`, config.includes(`path: '${route}'`)))
check('Admin home is canonical instead of a command alias', config.includes("key: 'home'") && !config.includes("['/admin', 'command']"))
check('single navigation catalog includes module surface metadata', config.includes("surface: 'module'") && config.includes("surface: 'legacy'"))
check('AdminEntry has one canonical persistent shell', (entry.match(/<AdminPersistentShell\b/g) || []).length === 1)
check('AdminEntry routes Laora inside the canonical shell', entry.includes("path.startsWith('/admin/laora')") && entry.includes('return <LaoraAdminCenter />'))
check('AdminEntry includes workspace state persistence', entry.includes('<AdminWorkspaceStateBridge />'))
check('persistent shell has no duplicated EXTRA_TABS catalog', !shell.includes('EXTRA_TABS'))
check('persistent shell delegates internal navigation to AdminUiProvider', shell.includes('navigate(item.key)') || shell.includes('navigate(key)'))
check('persistent shell brand routes to canonical home', shell.includes('href="/admin"') && shell.includes("go(event, 'home')"))
check('persistent shell keeps current item inside scrollable sidebar viewport', shell.includes('nav.scrollTo') && shellCss.includes('overflow-y: auto'))
check('AdminUiProvider does not hard reload module routes', !provider.includes('window.location.assign(') && !provider.includes('window.location.replace('))
check('AdminUiProvider uses pushState/replaceState for route changes', provider.includes("'pushState'") && provider.includes("'replaceState'"))
check('canonical router keeps legacy tab sync without mutating History.pushState', provider.includes('clickLegacyTabButton') && provider.includes('transition.clicked') && !provider.includes('window.history.pushState = () => undefined'))
check('deep-link recovery delegates tab activation to canonical router', deepLink.includes('requestAdminNavigation(key, { preservePath: true })') && !deepLink.includes("if (button && !button.classList.contains('active')) button.click()"))
check('legacy Admin.js no longer renders AdminModuleNav', !adminJs.includes('AdminModuleNav'))
check('legacy Admin.js no longer owns visibility route', !adminJs.includes('AdminVisibilityPage'))
check('canonical CSS hides nested legacy sidebar', shellCss.includes('.admin-persistent-main > .ecosystem-shell > .ecosystem-sidebar') && shellCss.includes('display: none !important'))
check('Laora sidebar becomes in-content subnavigation', shellCss.includes('.admin-persistent-main .la-admin > aside') && shellCss.includes('position: static !important'))
check('mobile drawer prioritizes canonical persistent sidebar', mobile.includes("document.querySelector('.admin-persistent-sidebar, .ecosystem-sidebar')"))
check('mobile identity routes to canonical home', mobile.includes("navigate('home')") && mobile.includes('href="/admin"'))
check('mobile interaction breakpoint matches drawer layout', mobile.includes("(max-width: 760px)") && mobileCss.includes('@media (max-width: 760px)') && !mobile.includes('(max-width: 900px)'))
check('Admin PWA never falls back to stale executable dashboard HTML', serviceWorker.includes("fetch(request, { cache: 'no-store' })") && serviceWorker.includes('OFFLINE_HTML') && !serviceWorker.includes("caches.match('/admin") && !serviceWorker.includes("'/admin/',"))
check('Admin PWA purges only its own legacy cache namespace', serviceWorker.includes('key.startsWith(ADMIN_CACHE_PREFIX)') && serviceWorker.includes('key !== CACHE_VERSION'))
check('home bridge targets nested legacy workspace rather than canonical main', homeBridge.includes(".admin-persistent-main > .ecosystem-shell > .ecosystem-main") && !homeBridge.includes("document.querySelector('.ecosystem-main')"))
check('home bridge no longer injects parallel navigation button', !homeBridge.includes('HomeNavButton') && !homeCss.includes('.admin-home-nav-button'))
check('home styling no longer suppresses canonical active route', !homeCss.includes('.admin-home-active .ecosystem-sidebar nav button.active'))
check('state bridge only persists filter-oriented controls', stateBridge.includes('.filter-grid input') && stateBridge.includes('.la-filters input'))
check('state bridge excludes password/file controls', stateBridge.includes("['password', 'file', 'hidden', 'submit', 'button']"))
check('state bridge persists pagination state', stateBridge.includes('capturePagination') && stateBridge.includes('restorePagination'))
check('state bridge persists module subnavigation state', stateBridge.includes('captureSubnavigation') && stateBridge.includes('restoreSubnavigation'))
check('state bridge keys detail routes by canonical module', stateBridge.includes('adminTabPath(adminTabFromLocation(normalized))'))
check('state bridge persists in sessionStorage', stateBridge.includes('sessionStorage'))

if (failures.length) {
  console.error(`\n${failures.length} regressão(ões) de navegação administrativa detectada(s).`)
  process.exit(1)
}

console.log(`\nNavegação administrativa canônica validada em ${requiredRoutes.length} rotas.`)
