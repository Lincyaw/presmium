import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child, RawResponse } from './helpers.ts'
import { cleanEnv, commits, git, message, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

const lecture = (title: string, head = '') => `---\ntitle: ${title}\n${head}---\n\n# ${title}\n\n(one)=\n## 一\n\n开始时的内容。\n`
const STACK = `${lecture('撤销')}\n[目标](../target/lecture.md)\n`
const version = (n: number) => `${STACK}\n第 ${n} 版。\n`

interface History {
  revisions: { id: string }[]
  undo?: string
  redo?: string
}

describe('every save a revision, undone and redone by revision', () => {
  let dir: string
  let home: string
  let serve: Child
  let url: string
  const read = (path: string) => readFileSync(join(dir, path), 'utf8')
  const head = () => git(dir, ['rev-parse', 'HEAD']).trim()
  const route = (path: string, document: string, json?: unknown): Promise<RawResponse> => raw(`${url}/__presmium/presmium.workspace/${path}`, {
    headers: { 'Presmium-Document': encodeURIComponent(document) },
    ...json === undefined ? {} : { json },
  })
  const save = async (path: string, content: string, message?: string) => {
    const document = path.split('/')[0]!
    const { version } = (await route(`source?path=${encodeURIComponent(path)}`, document)).json<{ version: string }>()
    return route('source', document, { path, content, base: version, ...message ? { message } : {} })
  }
  const saved = async (path: string, content: string) => {
    const answer = await save(path, content)
    expect(answer.status, answer.text).toBe(200)
    return answer.json<{ revision: { id: string } }>().revision.id
  }
  const history = async (document: string, limit?: number) => (await route(`revisions${limit ? `?limit=${limit}` : ''}`, document)).json<History>()
  const targets = async (document: string) => {
    const { revisions: _revisions, ...next } = await history(document)
    return next
  }
  const undo = (document: string, expected?: string) => route('history/undo', document, expected ? { expect: expected } : {})
  const redo = (document: string, expected?: string) => route('history/redo', document, expected ? { expect: expected } : {})
  const reverted = async (answer: Promise<RawResponse>) => {
    const done = await answer
    expect(done.status, done.text).toBe(200)
    expect(done.json()).toMatchObject({ ok: true })
    return done.json<{ revision: { id: string } }>().revision.id
  }

  beforeAll(async () => {
    const source = mkdtempSync(join(tmpdir(), 'presmium-history-source-'))
    writeFileSync(join(source, 'presmium.workspace.yaml'), 'title: 修改历史\ndocuments: [\'*/lecture.md\']\n')
    const files: Record<string, string> = { 'intro/lecture.md': lecture('导论'), 'en/lecture.md': lecture('English', 'lang: en\n'), 'stack/lecture.md': STACK, 'target/lecture.md': lecture('目标') }
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(source, path.split('/')[0]!))
      writeFileSync(join(source, path), content)
    }
    dir = workspace('history', source)
    rmSync(source, { recursive: true, force: true })
    home = `${dir}.home`
    mkdirSync(home)
    serve = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') }))
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
    remove(home)
  })

  it('a save commits its one file: the default summary in the document\'s language, or the first line of the author\'s, at most 200 characters; an unchanged save commits nothing', async () => {
    writeFileSync(join(dir, 'intro/draft.md'), '另一个没提交的文件\n')
    const first = await save('intro/lecture.md', lecture('导论').replace('开始时的内容。', '第一次保存。'))
    expect(first.status, first.text).toBe(200)
    expect(first.json()).toMatchObject({ version: expect.any(String), revision: { id: head(), files: ['intro/lecture.md'], origin: { kind: 'editor' } } })
    expect(message(dir)).toMatch(/^编辑 lecture\.md\n\nPresmium-Origin: editor\nCo-authored-by: /)
    expect(git(dir, ['status', '--porcelain'])).toBe('?? intro/draft.md\n')
    rmSync(join(dir, 'intro/draft.md'))

    await saved('en/lecture.md', lecture('English', 'lang: en\n').replace('开始时的内容。', 'Saved once.'))
    expect(message(dir)).toMatch(/^Edit lecture\.md\n\nPresmium-Origin: editor\n/)

    const given = await save('intro/lecture.md', lecture('导论').replace('开始时的内容。', '第二次保存。'), `  ${'改'.repeat(250)}\n第二行不进说明`)
    expect(given.status, given.text).toBe(200)
    expect(message(dir).split('\n')[0]).toBe('改'.repeat(200))
    expect(message(dir)).not.toContain('第二行')

    const before = commits(dir)
    const same = await save('intro/lecture.md', read('intro/lecture.md'))
    expect(same.status).toBe(200)
    expect(same.json()).not.toHaveProperty('revision')
    expect(commits(dir)).toBe(before)
  })

  it('undo, undo and redo walk the document\'s revisions; a new save clears the redo; a stale expect is refused; a document operation is a barrier', async () => {
    const path = 'stack/lecture.md'
    expect(await targets('stack')).toEqual({})
    expect((await undo('stack')).status).toBe(409)
    expect((await redo('stack')).status).toBe(409)
    const c1 = await saved(path, version(1))
    const c2 = await saved(path, version(2))
    expect(await targets('stack')).toEqual({ undo: c2 })

    const stale = await undo('stack', c1)
    expect(stale.status).toBe(409)
    expect(read(path)).toBe(version(2))
    const u2 = await reverted(undo('stack', c2))
    expect(read(path)).toBe(version(1))
    expect(message(dir)).toMatch(new RegExp(`^Revert "编辑 lecture\\.md"\\n\\nThis reverts commit ${c2}\\.\\n\\nPresmium-Origin: editor\\nPresmium-Revert: ${c2}\\n`))
    expect(await targets('stack')).toEqual({ undo: c1, redo: u2 })
    const u1 = await reverted(undo('stack'))
    expect(read(path)).toBe(STACK)
    expect(await targets('stack')).toEqual({ redo: u1 })
    expect((await undo('stack')).status).toBe(409)

    expect((await redo('stack', u2)).status).toBe(409)
    await reverted(redo('stack', u1.slice(0, 10)))
    expect(read(path)).toBe(version(1))
    const cut = await history('stack', 1)
    expect(cut.revisions).toHaveLength(1)
    expect(cut).toMatchObject({ undo: c1, redo: u2 })

    const c3 = await saved(path, version(3))
    expect(await targets('stack')).toEqual({ undo: c3 })
    expect((await redo('stack')).status).toBe(409)
    const u3 = await reverted(undo('stack'))
    expect(read(path)).toBe(version(1))
    expect(await targets('stack')).toEqual({ undo: c1, redo: u3 })

    const renamed = await raw(`${url}/__presmium/presmium.workspace/documents`, { json: { op: 'rename', dir: 'target', to: 'moved' } })
    expect(renamed.status, renamed.text).toBe(200)
    expect(read(path)).toContain('[目标](../moved/lecture.md)')
    expect(await targets('stack')).toEqual({})
    expect((await undo('stack')).status).toBe(409)
    expect((await redo('stack')).status).toBe(409)
    const c4 = await saved(path, `${read(path)}改名之后。\n`)
    expect(await targets('stack')).toEqual({ undo: c4 })
  })

  it('commits an agent\'s turn when it ends, without a review to accept, and the next undo takes it back', async () => {
    const opened = await route('review/open', 'intro', { session: 'auto-session', turn: 1 })
    expect(opened.status, opened.text).toBe(200)
    expect(opened.json()).toMatchObject({ review: { mode: 'auto', session: 'auto-session' } })
    writeFileSync(join(dir, 'intro/notes.md'), '笔记\n')
    expect((await route('review/step', 'intro', { session: 'auto-session', turn: 1, label: 'write notes.md', tool: 'write' })).status).toBe(200)
    const ended = await route('review/step', 'intro', { session: 'auto-session', turn: 1, end: true })
    expect(ended.status, ended.text).toBe(200)
    expect(ended.json()).toEqual({})
    expect(message(dir)).toMatch(/^AI 修改：notes\.md\n\n- write notes\.md\n\nPresmium-Origin: agent\nPresmium-Task: \S+\nPresmium-Session: auto-session\nPresmium-Turn: 1-1\nCo-authored-by: /)
    expect(git(dir, ['status', '--porcelain'])).toBe('')
    expect((await route('review', 'intro')).json()).toEqual({})

    const turn = head()
    expect(await targets('intro')).toEqual({ undo: turn })
    await reverted(undo('intro', turn))
    expect(existsSync(join(dir, 'intro/notes.md'))).toBe(false)
  })
})
