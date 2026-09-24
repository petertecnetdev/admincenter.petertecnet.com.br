import { readFile } from 'node:fs/promises'
import process from 'node:process'

const source = await readFile(new URL('../src/utils/uiDialog.js', import.meta.url), 'utf8')

if (!source.includes("icon.setAttribute('aria-hidden', 'true')")) {
  console.error('Dialog decorative icon must be hidden from assistive technology.')
  process.exit(1)
}

if (!source.includes("panel.setAttribute('aria-labelledby', title.id)")) {
  console.error('Dialog must expose its visible title as the accessible name.')
  process.exit(1)
}

console.log('Dialog accessibility validation passed.')
