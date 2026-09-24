import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve('src/SupportAdminApp.jsx')
const source = fs.readFileSync(file, 'utf8')

const required = [
  ['request accepts caller options', 'async function request(path, options = {})'],
  ['list controller', 'const listRequestRef = useRef(null)'],
  ['list abort before refresh', 'listRequestRef.current?.abort()'],
  ['list request sequence', 'const requestSequence = ++listSequenceRef.current'],
  ['stale list guard', 'requestSequence !== listSequenceRef.current'],
  ['detail controller', 'const detailRequestRef = useRef(null)'],
  ['detail abort before selection', 'detailRequestRef.current?.abort()'],
  ['abort error guard', 'isAbortError(err)'],
]

const missing = required.filter(([, fragment]) => !source.includes(fragment))
if (missing.length) {
  console.error(`Support request race contract failed: ${missing.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

console.log('Support request race contract passed.')
