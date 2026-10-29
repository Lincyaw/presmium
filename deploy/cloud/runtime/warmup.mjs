import { createRequire } from 'node:module'
import { chmod, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

// Image build only: source and plugins come from the pinned operator toolchain,
// never from a tenant. Optional paths let the same public build run locally.
const root = resolve(process.argv[2] ?? '/opt/presmium')
const seed = resolve(process.argv[3] ?? '/opt/presmium-runtime/cache-seed')
await mkdir(seed, { recursive: true })
process.env.JITI_FS_CACHE = 'true'
process.env.XDG_CACHE_HOME = join(seed, 'xdg')
process.env.TMPDIR = seed
process.env.PRESMIUM_MAX_THREADS = '1'
const started = performance.now()
const entry = join(root, 'packages/cli/package.json')
const require = createRequire(entry)
const jiti = require('jiti').createJiti(entry, { fsCache: join(seed, 'jiti') })
const { Compiler, build } = await jiti.import('@lincyaw/compiler')
const { createDocumentPage } = await jiti.import('@lincyaw/kernel')
// Runtime output metadata uses this public Node API as well.
await jiti.import('@lincyaw/kernel/node')
const work = await mkdtemp(join(tmpdir(), 'presmium-runtime-warmup-'))
try {
  // Matches Documents.create: no explicit plugins or renderer configuration.
  const title = 'Runtime cache warmup'
  const empty = { schemaVersion: 1, id: 'runtime-warmup', metadata: { title, lang: 'zh-CN' }, sectionOrder: [], sections: {}, blocks: {}, steps: {}, narrations: {}, assets: {}, definitions: {}, production: { defaults: {}, stepOverrides: {}, mediaClips: [] } }
  let serial = 0
  const document = createDocumentPage(empty, null, title, () => `warmup-${++serial}`).document
  const input = join(work, 'lecture.json')
  await writeFile(input, JSON.stringify(document))
  const compilation = await new Compiler(input, { bundled: join(root, 'packages/presmium') }).compile()
  const failures = compilation.doc.diagnostics.filter(finding => finding.severity === 'error')
  if (failures.length) throw new Error(`runtime-warmup-compile-failed: ${failures.map(finding => finding.checkId).join(',')}`)
  for (const form of ['web', 'slides']) {
    const report = await build(compilation, { outDir: join(work, 'output'), to: [form], base: `/__presmium_cloud__/${form}/`, log: line => console.log(line) })
    if (report.findings.some(finding => finding.severity === 'error') || !report.outputs.some(output => output.renderer === form)) throw new Error(`runtime-warmup-${form}-failed`)
  }
} finally { await rm(work, { recursive: true, force: true }) }

// TMPDIR can also collect tool scratch files. Only the two supported caches
// belong in the image, and they must stay readable after root takes ownership.
for (const item of await readdir(seed)) if (item !== 'jiti' && item !== 'xdg') await rm(join(seed, item), { recursive: true, force: true })
async function measure(directory) {
  await chmod(directory, 0o755)
  let bytes = 0, files = 0
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, item.name)
    if (item.isDirectory()) {
      const nested = await measure(file)
      bytes += nested.bytes; files += nested.files
    } else if (item.isFile()) { await chmod(file, 0o644); bytes += (await stat(file)).size; files++ }
    else throw new Error('runtime-cache-seed-type-invalid')
  }
  return { bytes, files }
}
const [jitiCache, viewerCache, total] = await Promise.all([measure(join(seed, 'jiti')), measure(join(seed, 'xdg')), measure(seed)])
const bytes = total.bytes
// /tmp is 128 MiB. Leave more than half for the task and any plugin cache miss.
if (!jitiCache.bytes || !viewerCache.bytes || bytes > 60 * 1024 * 1024) throw new Error('runtime-cache-seed-size-invalid')
await writeFile(join(dirname(seed), 'cache-seed.json'), JSON.stringify({ schema: 1, ...total, jiti: jitiCache, viewer: viewerCache }))
console.log(`runtime warmup ${Math.round(performance.now() - started)}ms bytes=${bytes} jiti=${jitiCache.bytes} viewer=${viewerCache.bytes}`)
