import { readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child, RawResponse } from './helpers.ts'
import { FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

describe('the source routes', () => {
  let dir: string
  let serve: Child
  let url: string
  const file = (path: string) => readFileSync(join(dir, path), 'utf8')
  const read = (path: string, headers: Record<string, string> = {}): Promise<RawResponse> =>
    raw(`${url}/__presmium/presmium.workspace/source?path=${encodeURIComponent(path)}`, { headers: { 'Presmium-Document': 'guide', ...headers } })
  const save = (path: string, content: string, base: string, headers: Record<string, string> = {}): Promise<RawResponse> =>
    raw(`${url}/__presmium/presmium.workspace/source`, { headers: { 'Presmium-Document': 'guide', ...headers }, json: { path, content, base } })

  beforeAll(async () => {
    dir = workspace('source', join(FIXTURES, 'documents'))
    serve = presmiumProcess(dir, ['serve', '--port', '0'])
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
  })

  it('refuses a path that leaves the page\'s scope (400)', async () => {
    for (const path of ['../package.json', 'guide/../intro/lecture.md', '/etc/hostname', 'guide/./lecture.md', 'guide/.git/config']) {
      const answer = await read(path)
      expect(answer.status, path).toBe(400)
    }
    const before = file('intro/lecture.md')
    expect((await save('guide/../intro/lecture.md', 'overwritten', 'x')).status).toBe(400)
    expect(file('intro/lecture.md')).toBe(before)
  })

  it('refuses a file reached through a symbolic link, to another document or out of the workspace (403)', async () => {
    symlinkSync(join(dir, 'intro/lecture.md'), join(dir, 'guide/linked.md'))
    symlinkSync(process.execPath, join(dir, 'guide/outside.md'))
    for (const path of ['guide/linked.md', 'guide/outside.md']) expect((await read(path)).status, path).toBe(403)
    const before = file('intro/lecture.md')
    expect((await save('guide/linked.md', 'through the link', 'x')).status).toBe(403)
    expect(file('intro/lecture.md')).toBe(before)
    const files = await raw(`${url}/__presmium/presmium.workspace/files`, { headers: { 'Presmium-Document': 'guide' } })
    expect(files.json<{ files: { path: string }[] }>().files.map(f => f.path)).toEqual(['guide/img/plan.svg', 'guide/lecture.md'])
  })

  it('refuses another document\'s file, and the workspace\'s configuration, to a document\'s page (403)', async () => {
    const opened = await read('intro/lecture.md')
    expect(opened.status).toBe(403)
    expect(opened.json().error).toMatch(/is not a file this page edits/)
    expect((await read('presmium.workspace.yaml')).status).toBe(403)
    const before = file('intro/lecture.md')
    expect((await save('intro/lecture.md', 'from the guide', 'x')).status).toBe(403)
    expect(file('intro/lecture.md')).toBe(before)
  })

  it('refuses a binary file, or one that is not UTF-8 text (415)', async () => {
    writeFileSync(join(dir, 'guide/data.bin'), Buffer.from([0, 1, 2, 3]))
    writeFileSync(join(dir, 'guide/nul.md'), Buffer.from('text\0more'))
    writeFileSync(join(dir, 'guide/latin1.md'), Buffer.from([0x63, 0x61, 0x66, 0xE9]))
    for (const path of ['guide/data.bin', 'guide/nul.md', 'guide/latin1.md']) expect((await read(path)).status, path).toBe(415)
    const files = await raw(`${url}/__presmium/presmium.workspace/files`, { headers: { 'Presmium-Document': 'guide' } })
    expect(files.json<{ files: { path: string, binary?: true }[] }>().files).toContainEqual({ path: 'guide/data.bin', binary: true })
  })

  it('lets the workspace owner open and save a root text file through the same versioned editor routes', async () => {
    writeFileSync(join(dir, 'notes.md'), '# Notes\n')
    const endpoint = `${url}/__presmium/presmium.workspace/source?path=notes.md`
    const opened = await raw(endpoint)
    expect(opened.status).toBe(200)
    const { version } = opened.json<{ version: string }>()
    const saved = await raw(`${url}/__presmium/presmium.workspace/source`, { json: { path: 'notes.md', content: '# Edited notes\n', base: version } })
    expect(saved.status).toBe(200)
    expect(file('notes.md')).toBe('# Edited notes\n')
    expect((await read('notes.md')).status).toBe(403)
    const files = await raw(`${url}/__presmium/presmium.workspace/files`)
    expect(files.json<{ files: { path: string }[] }>().files.map(file => file.path)).toContain('notes.md')
  })

  it('refuses a request from another site (403), reading or saving', async () => {
    const opened = await read('guide/lecture.md')
    expect(opened.status).toBe(200)
    const { version } = opened.json<{ version: string }>()
    const foreign = { Origin: 'https://other.example' }
    expect((await read('guide/lecture.md', foreign)).status).toBe(403)
    const before = file('guide/lecture.md')
    expect((await save('guide/lecture.md', 'from another site', version, foreign)).status).toBe(403)
    expect(file('guide/lecture.md')).toBe(before)
  })

  it('refuses a save of a version the file no longer has (409), with the text on the disk and its version', async () => {
    const opened = (await read('guide/lecture.md')).json<{ content: string, version: string }>()
    const disk = `${opened.content}\n磁盘上的编辑器加的一行。\n`
    writeFileSync(join(dir, 'guide/lecture.md'), disk)
    const stale = await save('guide/lecture.md', `${opened.content}\n页面上加的一行。\n`, opened.version)
    expect(stale.status).toBe(409)
    const { conflict } = stale.json<{ conflict: { content: string, version: string } }>()
    expect(conflict.content).toBe(disk)
    expect(conflict.version).not.toBe(opened.version)
    expect(file('guide/lecture.md')).toBe(disk)
    const saved = await save('guide/lecture.md', `${disk}页面上加的一行。\n`, conflict.version)
    expect(saved.status).toBe(200)
    expect(file('guide/lecture.md')).toContain('页面上加的一行。')
  })
})
