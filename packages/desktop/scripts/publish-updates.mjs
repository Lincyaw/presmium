// Publish a complete, immutable distribution before moving the update feed to it.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
const dir = resolve(process.argv[2] ?? 'installers')
const expected = ['darwin-aarch64-app', 'darwin-x86_64-app', 'windows-aarch64-nsis', 'windows-x86_64-nsis', 'linux-aarch64-deb', 'linux-aarch64-rpm', 'linux-x86_64-deb', 'linux-x86_64-rpm']
const shards = readdirSync(dir).filter(file => /^updater-.+\.json$/.test(file)).map(file => JSON.parse(readFileSync(join(dir, file), 'utf8')))
if (shards.length !== 6) throw new Error('All six platform builds must complete before publishing updates')
const version = shards[0].version
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) || shards.some(shard => shard.version !== version)) throw new Error('Update versions differ')
const platforms = {}
for (const shard of shards) for (const [target, entry] of Object.entries(shard.platforms)) {
  if (!expected.includes(target) || platforms[target]) throw new Error(`Invalid or duplicate platform ${target}`)
  const url = new URL(entry.url)
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/Lincyaw/presmium/releases/download/v${version}/`)) throw new Error('Invalid package URL')
  const file = join(dir, basename(url.pathname))
  if (!existsSync(file) || statSync(file).size === 0 || readFileSync(`${file}.sig`, 'utf8').trim() !== entry.signature) throw new Error(`Missing signed package ${target}`)
  platforms[target] = entry
}
if (expected.some(target => !platforms[target])) throw new Error('Incomplete update manifest')
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const tag = `v${version}`
const release = JSON.parse(gh('release', 'view', tag, '--json', 'isDraft,assets'))
// Published version assets are immutable: uploading different bytes would invalidate clients' signed feeds.
const files = readdirSync(dir).filter(file => !file.startsWith('updater-') && file !== 'latest.json')
for (const file of files) {
  const asset = release.assets.find(asset => asset.name === file)
  if (asset) {
    const remote = asset.digest
    const { createHash } = await import('node:crypto')
    const digest = `sha256:${createHash('sha256').update(readFileSync(join(dir, file))).digest('hex')}`
    if (remote !== digest) throw new Error(`Refusing to replace released asset ${file}`)
  } else gh('release', 'upload', tag, join(dir, file))
}
if (release.isDraft) throw new Error('Publish the version release before promoting its update feed')
const manifest = { version, notes: `Presmium Studio ${version}`, pub_date: new Date().toISOString(), platforms }
const manifestFile = join(dir, 'latest.json'); writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
// Refuse a stale run overtaking a newer version. Tauri's semver comparator handles prereleases too.
const { default: semver } = await import('semver')
let old
try { old = JSON.parse(gh('release', 'view', 'desktop-updates', '--json', 'assets')) } catch { /* The first feed is created below. */ }
if (old?.assets.some(asset => asset.name === 'latest.json')) {
  const bytes = execFileSync('gh', ['release', 'download', 'desktop-updates', '--pattern', 'latest.json', '--output', '-'], { encoding: 'utf8' })
  if (semver.gt(JSON.parse(bytes).version, version)) throw new Error('A newer update feed already exists')
}
if (!old) gh('release', 'create', 'desktop-updates', '--prerelease', '--latest=false', '--target', tag, '--title', 'Presmium Studio updates', '--notes', 'Signed desktop update feed.')
gh('release', 'upload', 'desktop-updates', manifestFile, '--clobber')
console.log(`Published verified update feed for ${version} (${expected.length} package formats)`)
