import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const corePath = resolve('public/ecosystem/peter-frontend-core-v1.js')
const source = readFileSync(corePath, 'utf8')

execFileSync(process.execPath, ['--check', corePath], { stdio: 'inherit' })

const required = [
  "const CORE_VERSION = '1.0.0'",
  "window.PeterTecnetFrontendCore = core",
  "X-Peter-Frontend-Core",
  "features: { isEnabled }",
  "auth:",
  "api: { request }",
  "pwa:",
  "notifications:",
  "telemetry: { track }",
  "beforeinstallprompt",
  "appinstalled",
  "customElements.define(INSTALL_ELEMENT",
  "peter:frontend-core:ready",
]

for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Frontend Core contract marker missing: ${marker}`)
}

if (!source.includes("host.endsWith('.petertecnet.com.br')")) {
  throw new Error('Frontend Core API access must remain restricted to trusted Peter Tecnet domains.')
}

if (/localStorage\.setItem\([^,]+,\s*JSON\.stringify\([^)]*accessToken/i.test(source)) {
  throw new Error('Access tokens must never be JSON-embedded into arbitrary localStorage payloads.')
}

if (/window\.location\.(?:assign|replace)\(/.test(source)) {
  throw new Error('Frontend Core v1 must not navigate applications automatically.')
}

console.log('Peter Tecnet Frontend Core v1 contract OK')
