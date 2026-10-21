import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
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

  it('refuses Windows separators in workspace reads and saves before resolving them as filesystem paths', async () => {
    const source = `${url}/__presmium/presmium.workspace/source`
    const opened = await raw(`${source}?path=intro/lecture.md`)
    expect(opened.status).toBe(200)
    const { content, version } = opened.json<{ content: string, version: string }>()
    for (const path of ['intro\\lecture.md', '..\\outside.md', 'guide\\..\\intro\\lecture.md', 'C:\\outside.md', '\\\\host\\share\\lecture.md']) {
      expect((await raw(`${source}?path=${encodeURIComponent(path)}`)).status, path).toBe(400)
      expect((await raw(source, { json: { path, content: 'outside the workspace', base: version } })).status, path).toBe(400)
    }
    expect(file('intro/lecture.md')).toBe(content)
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

  it('creates a text file and its directories without overwriting an existing path, then saves through version checks', async () => {
    const endpoint = `${url}/__presmium/presmium.workspace/source/create`
    const path = 'guide/code/database.py'
    const created = await raw(endpoint, { headers: { 'Presmium-Document': 'guide' }, json: { path } })
    expect(created.status, created.text).toBe(201)
    const { version } = created.json<{ version: string }>()
    expect(file(path)).toBe('')
    const content = 'class Database:\n    def __init__(self):\n        self.rows = {}\n'
    expect((await save(path, content, version)).status).toBe(200)
    const duplicate = await raw(endpoint, { json: { path } })
    expect(duplicate.status).toBe(409)
    expect(duplicate.json()).toMatchObject({ exists: true })
    expect(file(path)).toBe(content)
    expect((await raw(`${url}/__presmium/presmium.workspace/source`, { json: { path, content: 'without a version' } })).status).toBe(400)
    expect((await save(path, 'with an old version', version)).status).toBe(409)
    expect(file(path)).toBe(content)
  })

  it('keeps new files inside their editable scope, refuses symbolic link parents and honors document locks', async () => {
    const create = (path: string, document = 'guide') => raw(`${url}/__presmium/presmium.workspace/source/create`, { headers: { 'Presmium-Document': document }, json: { path } })
    for (const path of ['../outside.py', '/tmp/outside.py', 'guide/../intro/new.py', 'guide/.git/new.py', 'guide/.presmium/new.py', 'guide/node_modules/new.py', 'guide\\new.py']) {
      expect((await create(path)).status, path).toBe(400)
    }
    expect((await create('intro/from-guide.py')).status).toBe(403)
    expect((await create('guide/database.sqlite')).status).toBe(415)
    symlinkSync(join(dir, 'intro'), join(dir, 'guide/linked-code'))
    expect((await create('guide/linked-code/new.py')).status).toBe(403)
    expect(existsSync(join(dir, 'intro/new.py'))).toBe(false)
    const lecture = file('guide/lecture.md')
    expect((await create('guide/lecture.md/new.py')).status).toBe(403)
    expect(file('guide/lecture.md')).toBe(lecture)
    const review = await raw(`${url}/__presmium/presmium.workspace/review/open`, { headers: { 'Presmium-Document': 'guide' }, json: { session: 'file-creation-lock', turn: 1 } })
    expect(review.status, review.text).toBe(200)
    try {
      const locked = await create('guide/while-reviewing.py')
      expect(locked.status).toBe(409)
      expect(locked.json()).toHaveProperty('locked')
      expect(existsSync(join(dir, 'guide/while-reviewing.py'))).toBe(false)
    } finally {
      await raw(`${url}/__presmium/presmium.workspace/review/reject`, { headers: { 'Presmium-Document': 'guide' }, json: {} })
    }
  })

  it('shares a selected workspace source range with its draft quote, and refuses unsafe files without replacing the focus', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/database.py'), 'def get(rows, key):\n    return rows[key]\n')
    symlinkSync(join(dir, 'intro/lecture.md'), join(dir, 'src/linked.py'))
    writeFileSync(join(dir, 'src/binary.bin'), Buffer.from([0, 1, 2]))
    const endpoint = `${url}/__presmium/presmium.server/focus`
    const report = (path: string) => raw(endpoint, { json: { document: 'guide', focus: [{ id: 'workspace-code', from: 'source', scope: 'workspace', source: { file: path, startLine: 2, endLine: 2 }, quote: '    return rows.get(key) # unsaved' }] } })
    const selected = await report('src/database.py')
    expect(selected.status, selected.text).toBe(200)
    expect(selected.json()).toMatchObject({ document: 'guide', focus: [{ scope: 'workspace', document: 'guide', source: { file: 'src/database.py', startLine: 2, endLine: 2 }, excerpt: '    return rows[key]', quote: '    return rows.get(key) # unsaved' }] })
    for (const path of ['../outside.py', '..\\outside.py', 'src\\..\\intro\\lecture.md', 'C:\\outside.py', '/etc/passwd', 'src/../src/database.py', 'src/linked.py', 'src/binary.bin']) {
      expect((await report(path)).status, path).toBe(400)
    }
    expect((await raw(`${endpoint}?document=guide`)).json()).toMatchObject({ focus: [{ source: { file: 'src/database.py' } }] })
    writeFileSync(join(dir, 'src/long.py'), `# A generated line\n${'x'.repeat(20_000)}`)
    const long = await report('src/long.py')
    expect(long.status, long.text).toBe(200)
    const excerpt = long.json<{ focus: { excerpt: string }[] }>().focus[0]!.excerpt
    expect(excerpt.length).toBeLessThan(8100)
    expect(excerpt).toContain('excerpt truncated')
    const clear = await raw(endpoint, { json: { document: 'guide', focus: [] } })
    expect(clear.status).toBe(200)
    expect((await raw(`${endpoint}?document=guide`)).json()).toMatchObject({ focus: [] })
  })

  it('lists, reads and saves code in a directory matching the lecture glob without a lecture entry', async () => {
    const path = 'examples/sample-repo/src/bpe.py'
    mkdirSync(join(dir, 'examples/sample-repo/src'), { recursive: true })
    writeFileSync(join(dir, path), 'def get_stats(tokens):\n    return {}\n')
    const opened = await raw(`${url}/__presmium/presmium.workspace/source?path=${encodeURIComponent(path)}`)
    expect(opened.status).toBe(200)
    const { version } = opened.json<{ version: string }>()
    const content = 'def get_stats(tokens):\n    return {"count": len(tokens)}\n'
    expect((await raw(`${url}/__presmium/presmium.workspace/source`, { json: { path, content, base: version } })).status).toBe(200)
    expect(file(path)).toBe(content)
    expect((await read(path)).status).toBe(403)
    const files = (await raw(`${url}/__presmium/presmium.workspace/files`)).json<{ files: { path: string }[] }>().files
    expect(files.filter(item => item.path === path)).toHaveLength(1)
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
