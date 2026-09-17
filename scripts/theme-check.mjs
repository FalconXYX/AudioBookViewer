#!/usr/bin/env node
/**
 * Enforces the promise at the top of src/styles/theme.css: that it is the only
 * file in the app containing design values. Fails if a colour is hardcoded
 * anywhere else, or if a stylesheet references a variable the theme does not
 * define.
 *
 *   npm run theme:check
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const THEME = 'src/styles/theme.css'

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const files = walk(join(ROOT, 'src'))
  .filter((f) => /\.(css|tsx?)$/.test(f))
  .filter((f) => relative(ROOT, f) !== THEME)
  // The preview harness is a scratch file, not part of the app.
  .filter((f) => !f.endsWith('preview.tsx'))

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\((?!var\()[^)]*\)|\bhsla?\([^)]*\)/g

let failed = false
const offenders = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\/?\*)/.test(line)) return // skip comments
    const hits = line.match(COLOUR)
    if (hits) offenders.push(`${relative(ROOT, file)}:${i + 1}  ${hits.join(' ')}`)
  })
}

if (offenders.length) {
  failed = true
  console.error(`Hardcoded colours outside ${THEME}:`)
  for (const o of offenders) console.error('  ' + o)
}

// Every var() used must be defined in the theme (or locally, as --cover/--spine
// are on .btn and --spine-tint is set inline per book).
const LOCAL = new Set(['--cover', '--spine', '--spine-tint'])
const theme = readFileSync(join(ROOT, THEME), 'utf8')
const defined = new Set([...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
const undef = new Set()
for (const file of files.filter((f) => f.endsWith('.css'))) {
  for (const m of readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) {
    if (!defined.has(m[1]) && !LOCAL.has(m[1])) undef.add(m[1])
  }
}
if (undef.size) {
  failed = true
  console.error(`\nVariables used but not defined in ${THEME}:`)
  for (const v of [...undef].sort()) console.error('  ' + v)
}

// Every hex in the theme must be a literal step from ./colors. The only
// allowance is the wine chosen directly, which is named as such in the file.
const ALLOWED_NON_PALETTE = new Set(['#631918'])
const palette = new Set(
  [...readFileSync(join(ROOT, 'colors'), 'utf8').matchAll(/#[0-9a-fA-F]{6}/g)]
    .map((m) => m[0].toLowerCase()),
)
const invented = [...theme.matchAll(/#[0-9a-fA-F]{6}/g)]
  .map((m) => m[0].toLowerCase())
  .filter((h) => !palette.has(h) && !ALLOWED_NON_PALETTE.has(h))
if (invented.length) {
  failed = true
  console.error(`\nColours in ${THEME} that are not steps from ./colors:`)
  for (const h of [...new Set(invented)]) console.error('  ' + h)
}

if (failed) process.exit(1)
console.log(
  `${THEME} is the only source of design values. ` +
    `${defined.size} tokens, every colour a step from ./colors.`,
)
