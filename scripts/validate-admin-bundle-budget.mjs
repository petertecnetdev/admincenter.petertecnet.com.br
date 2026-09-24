import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const assets = join(root, 'dist', 'assets')
if (!existsSync(assets)) throw new Error('dist/assets não encontrado.')

const files = readdirSync(assets).map(name => ({
  name,
  bytes: statSync(join(assets, name)).size,
}))

const js = files.filter(file => file.name.endsWith('.js'))
const css = files.filter(file => file.name.endsWith('.css'))
const entryJs = js.filter(file => file.name.startsWith('index-'))
const lazyJs = js.filter(file => !file.name.startsWith('index-'))
const sum = rows => rows.reduce((total, row) => total + row.bytes, 0)
const kb = bytes => Math.round((bytes / 1024) * 10) / 10

const budgets = {
  entryJs: 320 * 1024,
  totalJs: 700 * 1024,
  // The Admin Center now ships dedicated responsive/detail styles in lazy modules. Keep a strict ceiling with headroom for the current production baseline.\n  totalCss: 330 * 1024,
  largestLazyJs: 125 * 1024,
}

const metrics = {
  entryJs: sum(entryJs),
  totalJs: sum(js),
  totalCss: sum(css),
  largestLazyJs: Math.max(0, ...lazyJs.map(file => file.bytes)),
}

const failures = []
for (const [key, limit] of Object.entries(budgets)) {
  const value = metrics[key]
  const ok = value <= limit
  console.log(`${ok ? '✓' : '✗'} ${key}: ${kb(value)} kB / budget ${kb(limit)} kB`)
  if (!ok) failures.push(`${key} excedeu o budget: ${kb(value)} kB > ${kb(limit)} kB`)
}

const largeChunks = lazyJs.filter(file => file.bytes > 100 * 1024)
if (largeChunks.length) {
  console.log('Chunks lazy acima de 100 kB:')
  largeChunks.forEach(file => console.log(`- ${file.name}: ${kb(file.bytes)} kB`))
}

if (failures.length) {
  failures.forEach(failure => console.error('- '+failure))
  process.exit(1)
}

console.log('Admin Center bundle budget passed.')
