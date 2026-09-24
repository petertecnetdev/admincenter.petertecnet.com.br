import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const quality = read('src/AdminQualityLayer.css')
const responsive = read('src/AdminResponsiveV3.css')
const app = read('src/App.jsx')
const failures = []

const check = (condition, message) => {
  if (!condition) failures.push(message)
}

check(quality.includes('content-visibility: auto') && quality.includes('contain-intrinsic-size'), 'Superfícies extensas devem usar content-visibility com tamanho intrínseco.')
check(/filter\s*:\s*blur\(/.test(quality) === false, 'Quality layer não deve introduzir blur CSS caro.')
check(!/animation\s*:[^;]*(infinite|infinity)/i.test(quality), 'Quality layer não deve introduzir animações infinitas.')
check(quality.includes('transform') || responsive.includes('transform'), 'Movimento deve privilegiar transform/opacity.')
check(app.includes("activePage === 'establishments'") && app.includes("activePage === 'financial'"), 'Módulos devem montar de acordo com a página ativa.')
check(app.includes("activePage === 'agents'") && app.includes("activePage === 'notifications'"), 'Módulos pesados não devem montar fora de sua página.')
check(responsive.includes('overflow-x') && responsive.includes('adm-datatable'), 'Overflow horizontal deve ficar restrito a superfícies densas.')

if (failures.length) {
  console.error('Admin performance contract validation failed:')
  failures.forEach(item => console.error(`- ${item}`))
  process.exit(1)
}

console.log('Admin performance contract validation passed.')
