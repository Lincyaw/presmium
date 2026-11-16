// Bundle the already-built application: RPM metadata has its own version/release syntax.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const version = semver.parse(JSON.parse(readFileSync(new URL('../../presmium/package.json', import.meta.url), 'utf8')).version)
if (!version || !process.env.npm_execpath) throw new Error('Run this command with pnpm --filter presmium-desktop bundle:rpm after build')
const release = version.prerelease.length ? `0.${version.prerelease.join('.').replaceAll('-', '_')}` : '1'
const config = {
  version: `${version.major}.${version.minor}.${version.patch}`,
  bundle: { createUpdaterArtifacts: false, linux: { rpm: { release } } },
}
// `bundle` never recompiles the binary, which keeps the complete application/updater version.
// Final RPM bytes are signed by collect-updates.mjs with that complete version after packaging.
execFileSync(process.execPath, [process.env.npm_execpath, 'tauri', 'bundle', ...process.argv.slice(2), '--bundles', 'rpm', '--config', JSON.stringify(config)], { cwd: pkg, stdio: 'inherit' })
