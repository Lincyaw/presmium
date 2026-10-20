#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN as PRESMIUM } from '@lincyaw/cli/testing'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const require = createRequire(import.meta.url)
const TYPEDOC = join(dirname(require.resolve('typedoc/package.json')), 'bin/typedoc')

const args = process.argv.slice(2)
function option(name) {
  const at = args.indexOf(name)
  return at >= 0 && args[at + 1] ? args[at + 1] : undefined
}
const SITE = resolve(option('--site') ?? HERE)
const out = resolve(option('--out') ?? join(SITE, 'dist'))
const web = join(out, 'web')

function step(title, command, commandArgs, options = {}) {
  console.log(`\n== ${title}`)
  const result = spawnSync(process.execPath, [command, ...commandArgs], { cwd: SITE, stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf8' })
  if (result.status !== 0 && !options.capture) {
    console.error(`${title} failed (exit ${result.status})`)
    process.exit(1)
  }
  return result
}

const entries = readdirSync(SITE, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(join(SITE, entry.name, 'lecture.md')))
  .flatMap(entry => readdirSync(join(SITE, entry.name)).filter(file => /^lecture(?:\.[\w-]+)?\.md$/.test(file)).sort().map(file => `${entry.name}/${file}`))
let problems = 0
console.log('== presmium check')
for (const entry of entries) {
  const result = step(`presmium check ${entry}`, PRESMIUM, ['check', entry, '--json'], { capture: true })
  let findings
  try {
    findings = JSON.parse(result.stdout).findings
  } catch {
    console.error(`${entry}: presmium check did not answer (exit ${result.status})\n${result.stdout}${result.stderr}`)
    process.exit(1)
  }
  const bad = findings.filter(finding => finding.severity === 'error' || finding.severity === 'warning')
  for (const finding of bad) console.error(`${relative(SITE, finding.source?.file ?? entry)}:${finding.source?.line ?? 1}  ${finding.severity}  ${finding.message}  (${finding.checkId})`)
  problems += bad.length
  console.log(`checked ${entry}: ${bad.length === 0 ? 'no problems' : `${bad.length} problems`}`)
}
if (problems > 0) {
  console.error(`the publication checks found ${problems} problems`)
  process.exit(1)
}

step('presmium build', PRESMIUM, ['build', '.', '--out', out])

step('typedoc', TYPEDOC, ['--options', join(ROOT, 'typedoc.json'), '--out', join(web, 'api')])

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i
const ATTRIBUTE = /\s(?:href|src)="([^"]*)"/g
function fileOf(path) {
  const file = join(web, ...path.split('/'))
  if (path.endsWith('/')) return join(file, 'index.html')
  return existsSync(file) && statSync(file).isDirectory() ? join(file, 'index.html') : file
}
let pages = 0
const dead = new Map()
for (const file of readdirSync(web, { recursive: true, encoding: 'utf8' })) {
  if (!file.endsWith('.html')) continue
  pages++
  const page = `/${file.split(sep).join('/')}`
  for (const [, raw] of readFileSync(join(web, file), 'utf8').matchAll(ATTRIBUTE)) {
    const url = raw.replace(/&amp;/g, '&').trim()
    if (!url || REMOTE.test(url)) continue
    let path = url.replace(/[?#].*$/s, '')
    if (!path) continue
    try {
      path = decodeURI(path)
    } catch {
    }
    const target = path.startsWith('/') ? path : posix.join(posix.dirname(page), path) + (path.endsWith('/') ? '/' : '')
    if (!existsSync(fileOf(target))) dead.set(`${page} -> ${url}`, true)
  }
}
console.log(`\n== links: ${pages} pages`)
if (dead.size > 0) {
  for (const link of dead.keys()) console.error(`dead link: ${link}`)
  console.error(`${dead.size} dead links in the built site`)
  process.exit(1)
}
console.log(`no dead links\n\nthe documentation site is in ${relative(process.cwd(), web) || '.'}`)
