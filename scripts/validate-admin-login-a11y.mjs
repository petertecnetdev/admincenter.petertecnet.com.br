import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const appPath = resolve(process.cwd(), 'src/App.jsx')
const source = await readFile(appPath, 'utf8')

const checks = [
  ['login form exposes a submit handler', /<form className="login-card" onSubmit=\{submit\}>/.test(source)],
  ['email field is labeled and uses username autocomplete', /<label>E-mail<input[^>]+autoComplete="username"/.test(source)],
  ['password field is labeled and uses current-password autocomplete', /<label>Senha<input[^>]+autoComplete="current-password"/.test(source)],
  ['login errors use an alert region', /<div className="form-error" role="alert">/.test(source)],
  ['submit button exposes a disabled loading state', /<button className="primary-button" disabled=\{loading \|\| retryAfter > 0\}>/.test(source)],
]

const failed = checks.filter(([, passed]) => !passed)

for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
}

if (failed.length) {
  console.error(`Admin login accessibility validation failed: ${failed.length} check(s).`)
  process.exitCode = 1
} else {
  console.log('Admin login accessibility validation passed.')
}
