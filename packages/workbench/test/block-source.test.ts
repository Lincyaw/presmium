import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { IrAnswer, SavedAnswer, SourceAnswer } from '@lincyaw/kernel'
import { PREVIEW_PROTOCOL, previewEnvelope, toPreviewCommand, toPreviewReport } from '@lincyaw/kernel'
import { blockSourceTarget, previewBlockSource, readBlockSource, savedBlockSource, writeBlockSource } from '../src/block-source.ts'

let dir: string, url: string, serve: ChildProcess
async function raw(address: string, options: { headers?: Record<string, string>, json?: unknown } = {}) {
  const response = await fetch(address, {
    headers: { ...options.headers, ...options.json === undefined ? {} : { 'Content-Type': 'application/json' } },
    ...options.json === undefined ? {} : { method: 'POST', body: JSON.stringify(options.json) },
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  return { status: response.status, text, json: <T>() => JSON.parse(text) as T }
}
const headers = { 'Presmium-Document': 'guide' }
const read = async (path: string) => {
  const response = await raw(`${url}/__presmium/presmium.workspace/source?path=${encodeURIComponent(path)}`, { headers })
  expect(response.status, response.text).toBe(200)
  return response.json<SourceAnswer>()
}
const ir = async () => {
  const response = await raw(`${url}/__presmium/presmium.workspace/ir?document=guide`)
  expect(response.status, response.text).toBe(200)
  return response.json<IrAnswer>()
}
const save = (path: string, content: string, base: string) => raw(`${url}/__presmium/presmium.workspace/source`, { headers, json: { path, content, base } })

beforeAll(async () => {
  const work = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium/', import.meta.url))
  mkdirSync(work, { recursive: true })
  dir = mkdtempSync(join(work, 'block-source-'))
  writeFileSync(join(dir, 'presmium.workspace.yaml'), "documents: ['guide/lecture.md']\n")
  writeFileSync(join(dir, 'package.json'), '{"name":"block-source-fixture","private":true,"type":"module"}\n')
  writeFileSync(join(dir, '.gitignore'), '.presmium/\n')
  mkdirSync(join(dir, 'guide/scenes'), { recursive: true })
  mkdirSync(join(dir, 'guide/components'))
  writeFileSync(join(dir, 'guide/components/Local.tsx'), 'export default function Local() { return null }\n')
  writeFileSync(join(dir, 'guide/scenes/shared.ts'), 'export default { create() { return { seek() {} } } }\n')
  const motion = fileURLToPath(new URL('../../addon-motion', import.meta.url))
  writeFileSync(join(dir, 'guide/lecture.md'), `---\ncontentModel: blocks\nplugins: ['${motion}']\n---\n\n(page)=\n# Block source\n\n(first)=\n:::{scene} shared\n:durations: 1000ms, 2000ms\n:::\n\nUnchanged body.\n\n(second)=\n:::{scene} shared\n:durations: 1000ms, 2000ms\n:::\n\n(local)=\n:::{component} Local\n:::\n`)
  const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, stdio: 'pipe' })
  git(['init', '-q', '-b', 'main']); git(['add', '-A']); git(['commit', '-q', '-m', 'Initial'])
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CACHE_HOME: join(dir, '.presmium/cache') }
  for (const key of Object.keys(env)) if (key.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/.test(key)) delete env[key]
  serve = spawn(process.execPath, [fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url)), 'serve', '--port', '0'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  url = await new Promise<string>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`The service did not start: ${output}`)), 90_000)
    const receive = (chunk: Buffer) => {
      output += chunk.toString()
      const found = /^serve {2}(http\S+)$/m.exec(output)
      if (found) { clearTimeout(timer); resolve(found[1]!) }
    }
    serve.stdout!.on('data', receive); serve.stderr!.on('data', receive)
    serve.once('exit', code => { clearTimeout(timer); reject(new Error(`The service exited (${code}): ${output}`)) })
  })
}, 120_000)
afterAll(async () => {
  if (serve && serve.exitCode === null && serve.signalCode === null) {
    const stopped = new Promise(resolve => serve.once('exit', resolve))
    serve.kill('SIGTERM')
    const timer = setTimeout(() => serve.kill('SIGKILL'), 20_000)
    await stopped
    clearTimeout(timer)
  }
  if (dir) rmSync(dir, { recursive: true, force: true })
})

it('opens and saves the real shared definition while keeping its block configuration separate', async () => {
  const { doc } = await ir()
  const target = blockSourceTarget(doc, 'page', 'first')
  expect(target).toMatchObject({ part: 'definition', path: 'guide/scenes/shared.ts', language: 'typescript', shared: 2 })
  const localTarget = blockSourceTarget(doc, 'page', 'local')
  expect(localTarget).toMatchObject({ part: 'definition', path: 'guide/components/Local.tsx', language: 'tsx', shared: 1 })
  expect(previewBlockSource(readBlockSource(doc, 'page', 'local', await read(localTarget.path))).content).toContain('function Local()')
  const opened = readBlockSource(doc, 'page', 'first', await read(target.path))
  expect(previewBlockSource(opened)).toMatchObject({ part: 'definition', language: 'typescript', shared: 2 })
  const configuration = blockSourceTarget(doc, 'page', 'first', 'block')
  expect(configuration).toMatchObject({ part: 'block', path: 'guide/lecture.md', language: 'markdown', shared: 1 })
  const config = readBlockSource(doc, 'page', 'first', await read(configuration.path), 'block')
  expect(config.content).toContain(':::{scene} shared')
  expect(config.content).not.toContain('Unchanged body.')
  const code = 'export default { create() { return { seek(at: number) { void at } } } }\n'
  // Use the real preview wire representation before saving through the running service.
  // A source revision must never overwrite the envelope's numeric protocol version.
  const request = previewEnvelope('source-integration', { type: 'source-save', section: 'page', block: 'first', request: 1, path: opened.source.path, base: opened.source.version, content: code })
  expect(request.version).toBe(PREVIEW_PROTOCOL)
  const decoded = toPreviewReport(JSON.parse(JSON.stringify(request)), 'source-integration')
  expect(decoded?.type).toBe('source-save')
  if (decoded?.type !== 'source-save') throw new Error('the preview source-save request was rejected')
  const written = writeBlockSource(doc, opened, decoded.path, decoded.base, decoded.content)
  expect(() => writeBlockSource(doc, opened, 'guide/lecture.md', opened.source.version, code)).toThrow('source-changed')
  const response = await save(decoded.path, written, decoded.base)
  expect(response.status, response.text).toBe(200)
  const savedVersion = response.json<SavedAnswer>().version
  const acknowledgement = previewEnvelope('source-integration', { type: 'source-saved', section: 'page', block: 'first', request: decoded.request, sourceVersion: savedVersion })
  expect(acknowledgement.version).toBe(PREVIEW_PROTOCOL)
  expect(toPreviewCommand(JSON.parse(JSON.stringify(acknowledgement)), 'source-integration')).toMatchObject({ type: 'source-saved', sourceVersion: savedVersion })
  const next = savedBlockSource(opened, written, code, savedVersion)
  expect(next.content).toBe(code)
  expect(readFileSync(join(dir, target.path), 'utf8')).toBe(code)
  expect(readFileSync(join(dir, configuration.path), 'utf8')).toContain(config.content)
})

it('updates a source fragment range after multiline saves and refuses a stale file version', async () => {
  const { doc } = await ir()
  const target = blockSourceTarget(doc, 'page', 'first', 'block')
  let draft = readBlockSource(doc, 'page', 'first', await read(target.path), 'block')
  const replacement = ':::{scene} shared\n:durations: 500ms, 800ms\n:aspect: 4/3\n\nA changed caption.\n:::'
  const firstFile = writeBlockSource(doc, draft, target.path, draft.source.version, replacement)
  const first = await save(target.path, firstFile, draft.source.version)
  expect(first.status, first.text).toBe(200)
  draft = savedBlockSource(draft, firstFile, replacement, first.json<SavedAnswer>().version)
  draft = readBlockSource(doc, 'page', 'first', await read(target.path), 'block', draft)
  expect(draft.content).toBe(replacement)
  const shorter = ':::{scene} shared\n:durations: 900ms\n:::'
  const secondFile = writeBlockSource(doc, draft, target.path, draft.source.version, shorter)
  const second = await save(target.path, secondFile, draft.source.version)
  expect(second.status, second.text).toBe(200)
  expect(readFileSync(join(dir, target.path), 'utf8')).toContain('Unchanged body.')
  expect(readFileSync(join(dir, target.path), 'utf8')).not.toContain('A changed caption.')
  const stale = await save(target.path, firstFile, draft.source.version)
  expect(stale.status).toBe(409)
  expect(readFileSync(join(dir, target.path), 'utf8')).toBe(secondFile)
})
