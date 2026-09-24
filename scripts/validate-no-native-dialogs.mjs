import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import process from 'node:process'

const ROOT = new URL('../src/', import.meta.url)
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])
const FORBIDDEN = [
  { name: 'alert', pattern: /\b(?:window\.)?alert\s*\(/g },
  { name: 'confirm', pattern: /\b(?:window\.)?confirm\s*\(/g },
  { name: 'prompt', pattern: /\b(?:window\.)?prompt\s*\(/g },
]

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path)
  }
  return files
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length
}

const srcPath = ROOT.pathname
const violations = []

for (const file of await filesUnder(srcPath)) {
  const source = await readFile(file, 'utf8')
  for (const rule of FORBIDDEN) {
    rule.pattern.lastIndex = 0
    for (const match of source.matchAll(rule.pattern)) {
      violations.push({
        file: relative(srcPath, file).replaceAll('\\', '/'),
        line: lineNumber(source, match.index),
        api: rule.name,
      })
    }
  }
}

if (violations.length) {
  console.error('\nNative browser dialogs are forbidden in the Peter Tecnet frontend.\n')
  for (const violation of violations) {
    console.error(`- src/${violation.file}:${violation.line} uses ${violation.api}()`)
  }
  console.error('\nUse src/utils/uiDialog.js so confirmations and notices follow the product UI standard.\n')
  process.exit(1)
}

console.log('UI dialog validation passed: no native alert(), confirm() or prompt() calls found in src/.')
