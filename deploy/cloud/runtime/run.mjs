import { cp, mkdir, mkdtemp, readFile, statfs, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// A fixed entry point inside an untrusted task container. No platform credentials are inherited.
const kind = process.env.PRESMIUM_JOB_KIND
const form = process.env.PRESMIUM_JOB_FORM
const format = process.env.PRESMIUM_JOB_FORMAT
const entry = process.env.PRESMIUM_JOB_ENTRY ?? ''
const contentBase = process.env.PRESMIUM_JOB_CONTENT_BASE
const audience = process.env.PRESMIUM_JOB_AUDIENCE
const timeoutSeconds = Number(process.env.PRESMIUM_JOB_TIMEOUT_SECONDS)
if (!['compile', 'export'].includes(kind) || !['web', 'slides', 'notebook', 'lecture'].includes(form)
  || contentBase !== `/__presmium_cloud__/${form}/`
  || (audience && (audience !== 'student' || kind !== 'compile'))
  || !entry || entry.startsWith('/') || /[\\\0]/.test(entry) || entry.split('/').some(part => !part || part === '.' || part === '..')
  || entry.split('/').at(-1) !== 'lecture.json' || !Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86_400
  || (kind === 'export' && !['pdf', 'png', 'pptx'].includes(format))) throw new Error('runtime-input-invalid')
const input = resolve('/work/input', entry)
await mkdir('/work/output', { recursive: true })
await mkdir('/tmp/home', { recursive: true })
if (process.argv[2] === '--execute') {
  let started = performance.now()
  const require = createRequire('/opt/presmium/packages/cli/package.json')
  const { createJiti } = require('jiti')
  const jiti = createJiti('/opt/presmium/packages/cli/package.json', { fsCache: join(process.env.TMPDIR ?? '/tmp', 'jiti') })
  const { Compiler, build, exportDocument } = await jiti.import('@lincyaw/compiler')
  const { irRevision } = await jiti.import('@lincyaw/kernel/node')
  console.log(`runtime import ${Math.round(performance.now() - started)}ms`)
  started = performance.now()
  const compilation = await new Compiler(input, { bundled: '/opt/presmium/packages/presmium', ...audience === 'student' ? { audience } : {} }).compile()
  console.log(`runtime compile ${Math.round(performance.now() - started)}ms`)
  const failed = compilation.doc.diagnostics.filter(finding => finding.severity === 'error')
  for (const finding of failed) console.error(`${finding.checkId}: ${finding.message}`)
  if (failed.length) process.exit(1)
  // This is output metadata, never an editable source or a cloud credential.
  await mkdir('/work/output/_presmium', { recursive: true })
  await writeFile('/work/output/_presmium/job.json', JSON.stringify({ revision: irRevision(compilation.doc), source: compilation.doc.source }))
  started = performance.now()
  if (kind === 'export') {
    const output = await exportDocument(compilation, format, { outDir: '/work/output', options: { timeout: timeoutSeconds * 1000 }, log: line => console.log(line) })
    console.log(`runtime export ${Math.round(performance.now() - started)}ms`)
    if (!output.files.length) throw new Error('runtime-export-output-missing')
    process.exit(0)
  }
  const report = await build(compilation, { outDir: '/work/output', to: [form], base: contentBase, ...audience === 'student' ? { audience } : {}, log: line => console.log(line) })
  console.log(`runtime build ${Math.round(performance.now() - started)}ms`)
  const renderErrors = report.findings.filter(finding => finding.severity === 'error')
  for (const finding of renderErrors) console.error(`${finding.checkId}: ${finding.message}`)
  const rendered = report.outputs.some(output => output.renderer === form)
  if (!rendered) console.error('runtime-renderer-output-missing')
  process.exit(renderErrors.length || !rendered ? 1 : 0)
}
// This path runs before any tenant module. The image seed is never writable by
// a task; misses and cache bookkeeping stay in this container's private tmpfs.
const cacheStarted = performance.now()
const seed = JSON.parse(await readFile('/opt/presmium-runtime/cache-seed.json', 'utf8'))
if (seed.schema !== 1 || !Number.isSafeInteger(seed.bytes) || seed.bytes <= 0 || seed.bytes > 60 * 1024 * 1024) throw new Error('runtime-cache-seed-invalid')
const available = await statfs('/tmp')
if (available.bavail * available.bsize - seed.bytes <= available.blocks * available.bsize / 2) throw new Error('runtime-cache-space-insufficient')
const cache = join(await mkdtemp('/tmp/presmium-runtime-cache-'), 'seed')
await cp('/opt/presmium-runtime/cache-seed', cache, { recursive: true, force: false, errorOnExist: true })
const remaining = await statfs('/tmp')
if (remaining.bavail <= remaining.blocks / 2) throw new Error('runtime-cache-space-insufficient')
process.env.JITI_FS_CACHE = 'true'
process.env.XDG_CACHE_HOME = join(cache, 'xdg')
process.env.TMPDIR = cache
console.log(`runtime cache ${Math.round(performance.now() - cacheStarted)}ms bytes=${seed.bytes} free=${remaining.bavail * remaining.bsize}`)
const args = [fileURLToPath(import.meta.url), '--execute']
const child = spawn(process.execPath, args, { cwd: '/work/input', stdio: 'inherit', detached: true, env: process.env })
let killTimer
const stop = () => {
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  killTimer ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 10_000)
  killTimer.unref()
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
const timer = setTimeout(stop, timeoutSeconds * 1000)
timer.unref()
const code = await new Promise(resolve => { child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1)) })
clearTimeout(timer)
clearTimeout(killTimer)
process.exitCode = code
