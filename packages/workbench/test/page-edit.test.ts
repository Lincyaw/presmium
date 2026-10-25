import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { blockText } from '@lincyaw/kernel'
import type { IrAnswer, SavedAnswer, SourceAnswer } from '@lincyaw/kernel'
import { writePage } from '../src/page-edit.ts'

let dir: string, url: string, serve: ChildProcess
async function raw(address: string, options: { document?: string, json?: unknown } = {}) {
  const response = await fetch(address, {
    headers: { 'Presmium-Document': options.document ?? 'guide', ...options.json === undefined ? {} : { 'Content-Type': 'application/json' } },
    ...options.json === undefined ? {} : { method: 'POST', body: JSON.stringify(options.json) },
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  return { status: response.status, text, json: <T>() => JSON.parse(text) as T }
}
const read = async (document = 'guide') => {
  const response = await raw(`${url}/__presmium/presmium.workspace/source?path=${document}/lecture.md`, { document })
  expect(response.status, response.text).toBe(200)
  return response.json<SourceAnswer>()
}
const ir = async (document = 'guide') => {
  const response = await raw(`${url}/__presmium/presmium.workspace/ir?document=${document}`, { document })
  expect(response.status, response.text).toBe(200)
  return response.json<IrAnswer>()
}
const save = (source: SourceAnswer, content: string, document = 'guide') => raw(`${url}/__presmium/presmium.workspace/source`, { document, json: { path: source.path, content, base: source.version, message: '新增页面' } })

beforeAll(async () => {
  const work = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium/', import.meta.url))
  mkdirSync(work, { recursive: true })
  dir = mkdtempSync(join(work, 'page-edit-'))
  writeFileSync(join(dir, 'presmium.workspace.yaml'), "documents: ['guide/lecture.md', 'included/lecture.md', 'untitled/lecture.md']\n")
  writeFileSync(join(dir, 'package.json'), '{"name":"page-edit-fixture","private":true,"type":"module"}\n')
  writeFileSync(join(dir, '.gitignore'), '.presmium/\n')
  mkdirSync(join(dir, 'guide'))
  mkdirSync(join(dir, 'included'))
  mkdirSync(join(dir, 'untitled'))
  const original = '---\ncontentModel: blocks\nsectionDepth: 2\n---\n\n(cover)=\n# Cover\n\nCover body.\n\n```md\n## This is an example, not a page\n(fake)=\n```\n\n:::{narration}\n:at: 0\n:mode: after\n\nCover narration stays here.\n:::\n\n(existing)=\n## Existing\n\nExisting **body**.\n\n:::{narration}\n:at: 0\n\nExisting narration stays here.\n:::\n\n(last)=\n## Last\n\nLast body without final newline.'
  writeFileSync(join(dir, 'guide/lecture.md'), `\uFEFF${original.replace(/\n/g, '\r\n')}`)
  writeFileSync(join(dir, 'included/lecture.md'), '---\ncontentModel: blocks\n---\n\n# Included document\n\n:::{include} part.md\n:::\n')
  writeFileSync(join(dir, 'included/part.md'), '(part)=\n## Included page\n\nIncluded body.\n')
  writeFileSync(join(dir, 'untitled/lecture.md'), '---\ncontentModel: blocks\nsectionDepth: 3\n---\n\nUntitled cover body.\n')
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

it('creates a labelled page after the complete cover, preserves every existing byte and narration, and undoes once', async () => {
  const original = await read(), { doc } = await ir()
  expect(doc.sections.map(section => section.id)).toEqual(['cover', 'existing', 'last'])
  const next = writePage(doc, doc.sections[0]!, original.content, 'page-created', '新页面')
  const addition = '\r\n(page-created)=\r\n## 新页面\r\n\r\n'
  expect(next.replace(addition, '')).toBe(original.content)
  expect(next.charCodeAt(0)).toBe(0xFEFF)
  expect(next.replace(/\r\n/g, '')).not.toContain('\n')
  expect(next.indexOf('(page-created)=')).toBeGreaterThan(next.indexOf('Cover narration stays here.'))
  expect(next.indexOf('(page-created)=')).toBeLessThan(next.indexOf('(existing)='))
  const answer = await save(original, next)
  expect(answer.status, answer.text).toBe(200)
  const saved = answer.json<SavedAnswer>()
  await expect.poll(async () => (await ir()).doc.sections.map(section => section.id), { timeout: 15_000 }).toEqual(['cover', 'page-created', 'existing', 'last'])
  const compiled = (await ir()).doc
  expect(compiled.sections[1]).toMatchObject({ id: 'page-created', title: '新页面', depth: 2, blocks: [] })
  const retained = (document: typeof doc) => document.sections.filter(section => section.id !== 'page-created').map(section => ({ id: section.id, title: section.title, blocks: section.blocks.map(block => ({ id: block.id, at: block.at, role: block.role, text: blockText(block) })) }))
  expect(retained(compiled)).toEqual(retained(doc))
  expect(readFileSync(join(dir, original.path), 'utf8')).toBe(next)
  const undo = await raw(`${url}/__presmium/presmium.workspace/history/undo`, { json: { expect: saved.revision!.id } })
  expect(undo.status, undo.text).toBe(200)
  expect((await read()).content).toBe(original.content)
  await expect.poll(async () => (await ir()).doc.sections.map(section => section.id), { timeout: 15_000 }).toEqual(['cover', 'existing', 'last'])
})

it('rejects stale ranges and ambiguous included pages, while a last-page insertion retains its depth', async () => {
  const original = await read(), { doc } = await ir()
  const last = doc.sections.at(-1)!
  const appended = writePage(doc, last, original.content, 'last-created', 'Next page')
  expect(appended).toBe(`${original.content}\r\n\r\n(last-created)=\r\n## Next page\r\n\r\n`)
  expect(() => writePage(doc, last, `${original.content}\r\n\r\nA newly saved body.`, 'stale-created', 'Next page')).toThrow('source-changed')
  expect(() => writePage(doc, doc.sections[1]!, original.content.replace('## Existing', '### Existing'), 'stale-heading', 'Next page')).toThrow('source-changed')
  const included = (await ir('included')).doc
  expect(included.sections.at(-1)?.source.file).toBe('included/part.md')
  expect(() => writePage(included, included.sections.at(-1)!, 'irrelevant source', 'included-created', 'Next page')).toThrow('page-multiple-files')
  const untitledSource = await read('untitled'), untitled = (await ir('untitled')).doc
  expect(untitled.sections).toHaveLength(1)
  expect(untitled.sections[0]?.depth).toBe(0)
  const untitledPage = writePage(untitled, untitled.sections[0]!, untitledSource.content, 'untitled-created', 'Next page')
  expect(untitledPage).toContain('(untitled-created)=\n### Next page')
  const created = await save(untitledSource, untitledPage, 'untitled')
  expect(created.status, created.text).toBe(200)
  await expect.poll(async () => (await ir('untitled')).doc.sections.map(section => section.id), { timeout: 15_000 }).toEqual([untitled.sections[0]!.id, 'untitled-created'])
  const undo = await raw(`${url}/__presmium/presmium.workspace/history/undo`, { document: 'untitled', json: { expect: created.json<SavedAnswer>().revision!.id } })
  expect(undo.status, undo.text).toBe(200)
  expect((await read('untitled')).content).toBe(untitledSource.content)
})
