import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

// Run inside the Studio image. Measures only viewer preparation, not document
// compilation, code bundles, network or browser rendering. Each call has an empty cache.
const { appPlugin, buildViewerApp, coreFingerprint, findViewerApp, appEntry } = await import(pathToFileURL('/opt/presmium/packages/web/src/node/viewer-app.ts'))
const mode = process.argv[2] ?? 'seed', alias = process.argv[3] ?? 'path'
if (!['seed', 'cold'].includes(mode) || !['path', 'name'].includes(alias)) throw new Error('expected cold|seed and path|name')
const seed = process.env.PRESMIUM_VIEWER_SEED
if (mode === 'cold') delete process.env.PRESMIUM_VIEWER_SEED
const names = ['content', 'motion', 'guide', 'lecture', 'speech', 'exec', 'exec-local', 'exec-wasi', 'exec-webgpu', 'exec-jupyter', 'publish']
const plugins = await Promise.all(names.map(name => {
  const dir = `/opt/presmium/packages/addon-${name}`
  return appPlugin(alias === 'path' ? dir : `@lincyaw/addon-${name}`, dir)
}))
const cache = mkdtempSync(join(tmpdir(), 'presmium-viewer-bench-'))
try {
  const start = performance.now(), app = await buildViewerApp(cache, plugins), ready = performance.now()
  const entry = appEntry(app)
  const script = readFileSync(join(app.dir, entry.script))
  const hash = data => createHash('sha256').update(data).digest('hex')
  const fromSeed = Boolean(seed && mode === 'seed' && hash(script) === hash(readFileSync(join(seed, app.manifest.key, entry.script))))
  const core = coreFingerprint()
  const rejectsChangedCore = findViewerApp(cache, 'changed-core', plugins) === undefined
  const rejectsChangedPlugin = findViewerApp(cache, core, [{ ...plugins[0], fingerprint: 'changed-plugin' }, ...plugins.slice(1)]) === undefined
  console.log('VIEWER_BENCH ' + JSON.stringify({ mode, alias, elapsedMs: Math.round(ready - start), fromSeed, rejectsChangedCore, rejectsChangedPlugin, key: app.manifest.key, scriptBytes: script.length, rssKiB: process.resourceUsage().maxRSS }))
} finally { rmSync(cache, { recursive: true, force: true }) }
