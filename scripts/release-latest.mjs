#!/usr/bin/env node
// Points the dist-tags of every public package at its current version, once installers can get that version.
//
// `pnpm changeset publish` uploads the packages, but the registry may list a just-published version minutes later (one
// release saw @lincyaw/dsh appear 15 minutes late), and a `latest` set before then names a version that `pnpm add`
// cannot install. This polls the registry, as installers read it, until the current version of every public package
// (the list scripts/check-packages.mjs checks) is listed; since the packages depend on each other's exact versions, none
// is tagged before all are. Then it sets `latest`, and in prerelease mode (.changeset/pre.json) also that mode's tag
// (`rc`), with `pnpm dist-tag add`, and prints the dist-tags the registry confirms. It never moves a tag back: when a
// tag already names a newer version, the checkout is behind the release and nothing is changed.
//
// Usage: node scripts/release-latest.mjs [--dry-run] [--timeout <minutes>] [--interval <seconds>]
//   --dry-run              poll and report only: change no tag
//   --timeout <minutes>    how long to wait for the versions to be listed (default 30)
//   --interval <seconds>   time between two polls (default 15)
// Exits 1 when a version is not listed in time, a tag names a newer version, a tag could not be set, or the registry
// does not confirm a tag; a dry run exits 1 for the first two, which would stop a real run.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { workspaceDirs } from './lib/workspace-packages.mjs'

const root = new URL('..', import.meta.url).pathname
const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'timeout': { type: 'string', default: '30' },
    'interval': { type: 'string', default: '15' },
  },
})
const dryRun = values['dry-run']
const timeoutMs = Number(values.timeout) * 60_000
const intervalMs = Number(values.interval) * 1000
if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
  console.error('release-latest: --timeout takes minutes (0 or more) and --interval seconds (more than 0)')
  process.exit(2)
}

const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'))
const packages = workspaceDirs(root).map(dir => read(`${dir}/package.json`)).filter(pkg => !pkg.private).map(({ name, version }) => ({ name, version }))
const pre = existsSync(join(root, '.changeset/pre.json')) ? read('.changeset/pre.json') : undefined
const tags = ['latest', ...pre?.mode === 'pre' && pre.tag ? [pre.tag] : []]
const registry = registryUrl()
const path = name => name.replace('/', '%2f')

function registryUrl() {
  let url = process.env.npm_config_registry
  if (!url) {
    try {
      url = execFileSync('pnpm', ['config', 'get', 'registry'], { cwd: root, encoding: 'utf8' }).trim()
    } catch {}
  }
  if (!url || url === 'undefined') url = 'https://registry.npmjs.org/'
  return url.endsWith('/') ? url : `${url}/`
}

async function get(url, accept = 'application/json') {
  const response = await fetch(url, { headers: { accept }, signal: AbortSignal.timeout(30_000) })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

/** Whether installers see the version: the abbreviated metadata that pnpm and npm install from lists it. */
async function listed({ name, version }) {
  const doc = await get(`${registry}${path(name)}`, 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*')
  return Boolean(doc?.versions?.[version])
}

async function distTags({ name }) {
  return await get(`${registry}-/package/${path(name)}/dist-tags`) ?? {}
}

/** Semantic version order, prereleases included (1.0.0-rc.9 < 1.0.0-rc.10 < 1.0.0). */
function compareVersions(a, b) {
  const parse = (version) => {
    const [core, ...pre] = version.split('+')[0].split('-')
    return { core: core.split('.').map(Number), pre: pre.length ? pre.join('-').split('.') : [] }
  }
  const x = parse(a), y = parse(b)
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return Math.sign(x.core[i] - y.core[i])
  if (!x.pre.length || !y.pre.length) return Math.sign(y.pre.length - x.pre.length)
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]]
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1
    if (p === q) continue
    const [m, n] = [/^\d+$/.test(p), /^\d+$/.test(q)]
    if (m && n) return Math.sign(Number(p) - Number(q))
    if (m !== n) return m ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

/** Runs `check` on every item, a few at a time; a failed check counts as false, with its error kept. */
async function each(items, check) {
  const results = new Map()
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        results.set(item, { value: await check(item) })
      } catch (error) {
        results.set(item, { value: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  return results
}

const id = pkg => `${pkg.name}@${pkg.version}`
const elapsed = started => `${Math.round((Date.now() - started) / 1000)} s`

console.log(`${dryRun ? 'dry run: ' : ''}${packages.length} public packages, tags ${tags.join(', ')}, registry ${registry}`)

// 1. Wait until the registry lists every current version.
const started = Date.now()
let pending = [...packages]
const errors = new Map()
for (;;) {
  const results = await each(pending, listed)
  pending = pending.filter((pkg) => {
    const result = results.get(pkg)
    if (result.error) errors.set(pkg, result.error)
    if (result.value) console.log(`listed   ${id(pkg)}  (after ${elapsed(started)})`)
    return !result.value
  })
  if (pending.length === 0 || Date.now() - started + intervalMs > timeoutMs) break
  console.log(`waiting  ${pending.length} not listed yet: ${pending.map(id).join(', ')}`)
  await sleep(intervalMs)
}
if (pending.length > 0) {
  console.error(`\nrelease-latest: after ${elapsed(started)} the registry does not list ${pending.length} of ${packages.length} versions; no tag was changed:`)
  for (const pkg of pending) console.error(`  ${id(pkg)}${errors.has(pkg) ? `  (last poll failed: ${errors.get(pkg)})` : ''}`)
  console.error('If pnpm changeset publish uploaded them, the registry has not shown them yet: run this again later.')
  process.exit(1)
}
console.log(`all ${packages.length} versions are listed (after ${elapsed(started)})`)

// 2. Point the tags at them, never back: a tag at a newer version means this checkout is behind the release.
const before = await each(packages, distTags)
const unread = packages.filter(pkg => before.get(pkg).error)
if (unread.length > 0) {
  console.error(`\nrelease-latest: could not read the dist-tags of ${unread.map(pkg => `${pkg.name} (${before.get(pkg).error})`).join(', ')}; no tag was changed`)
  process.exit(1)
}
const newer = packages.flatMap(pkg => tags.flatMap((tag) => {
  const current = before.get(pkg).value[tag]
  return current && compareVersions(current, pkg.version) > 0 ? [`${pkg.name} ${tag}=${current} (here ${pkg.version})`] : []
}))
if (newer.length > 0) {
  console.error(`\nrelease-latest: the registry has newer versions than this checkout; ${dryRun ? 'a real run would stop here' : 'no tag was changed'}:`)
  for (const line of newer) console.error(`  ${line}`)
  console.error('Update the checkout to the release that was published, then run this again.')
  process.exit(1)
}
const failed = []
if (!dryRun) {
  for (const pkg of packages) {
    const current = before.get(pkg).value
    for (const tag of tags) {
      if (current[tag] === pkg.version) continue
      const result = spawnSync('pnpm', ['dist-tag', 'add', id(pkg), tag], { cwd: root, stdio: 'inherit' })
      if (result.status !== 0) failed.push(`${id(pkg)} ${tag}`)
    }
  }
}

// 3. Report what the registry says now: tags that already point at the current version are confirmed.
let confirmed = new Map()
const unconfirmed = () => packages.filter(pkg => tags.some(tag => confirmed.get(pkg)?.value?.[tag] !== pkg.version))
const confirming = Date.now()
for (;;) {
  confirmed = await each(packages, distTags)
  if (dryRun || unconfirmed().length === 0 || Date.now() - confirming > 2 * 60_000) break
  await sleep(intervalMs)
}
console.log('')
const width = Math.max(...packages.map(pkg => pkg.name.length))
for (const pkg of packages) {
  const current = confirmed.get(pkg)?.value || {}
  const cells = tags.map(tag => current[tag] === pkg.version ? `${tag}=${pkg.version}` : `${tag}=${current[tag] ?? '(none)'}${dryRun ? ` -> ${pkg.version}` : ' MISMATCH'}`)
  console.log(`${pkg.name.padEnd(width)}  ${cells.join('  ')}`)
}
const missing = unconfirmed()
if (dryRun) {
  console.log(`\ndry run: ${missing.length === 0 ? `every tag already points at the current version` : `${missing.length} packages would get new tags`}; nothing was changed`)
  process.exit(0)
}
if (failed.length > 0) console.error(`\nrelease-latest: pnpm dist-tag add failed for ${failed.join(', ')}`)
if (missing.length > 0) console.error(`\nrelease-latest: the registry does not confirm the tags of ${missing.map(id).join(', ')}`)
if (failed.length > 0 || missing.length > 0) process.exit(1)
console.log(`\nconfirmed: ${tags.join(' and ')} of all ${packages.length} public packages point at their current versions`)
