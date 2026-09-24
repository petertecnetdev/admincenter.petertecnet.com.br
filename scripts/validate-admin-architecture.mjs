import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'

const root = resolve(process.cwd())
const srcRoot = join(root, 'src')
const entry = join(srcRoot, 'main.jsx')
const visited = new Set()
const failures = []
const allowedManualDom = new Set([
  normalize(join(srcRoot, 'utils/uiDialog.js')),
  normalize(join(srcRoot, 'services/googleIdentity.js')),
])

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  if (extname(base)) return existsSync(base) ? base : null
  for (const extension of ['.jsx', '.js', '.mjs']) {
    const candidate = base + extension
    if (existsSync(candidate)) return candidate
  }
  for (const extension of ['.jsx', '.js']) {
    const candidate = join(base, 'index' + extension)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function importsOf(file, source) {
  const found = []
  const patterns = [
    /(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source))) found.push(match[1])
  }
  return found.map(specifier => resolveImport(file, specifier)).filter(Boolean)
}

function inspect(file) {
  const normalized = normalize(file)
  if (visited.has(normalized)) return
  visited.add(normalized)
  const source = readFileSync(file, 'utf8')

  const relative = normalize(file).replace(normalize(root) + '/', '')
  if (/\bcreatePortal\b/.test(source)) failures.push(`${relative}: createPortal proibido no runtime administrativo`)
  if (/\bMutationObserver\b/.test(source)) failures.push(`${relative}: MutationObserver proibido no runtime administrativo`)
  if (/document\.addEventListener\(\s*['"]click['"][\s\S]{0,140},\s*true\s*\)/.test(source)) failures.push(`${relative}: captura global de clique proibida`)
  if (/querySelector\(\s*['"][^'"]*top-actions[^'"]*icon-button/.test(source)) failures.push(`${relative}: refresh global por clique programático proibido`)
  if ((/document\.createElement\(/.test(source) || /document\.body\.append/.test(source)) && !allowedManualDom.has(normalized)) {
    failures.push(`${relative}: criação manual de DOM proibida fora do serviço central de diálogo`)
  }

  for (const dependency of importsOf(file, source)) inspect(dependency)
}

inspect(entry)

console.log(`Arquivos de runtime verificados: ${visited.size}`)
if (failures.length) {
  console.error('Arquitetura administrativa instável detectada:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Admin runtime architecture contract validated.')
