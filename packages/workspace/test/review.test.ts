import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { cleanEnv, git, message, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

const TOKEN = 'review-test-token'
const LECTURE = '---\ntitle: 审阅\nplugins: [presmium-fixture-review]\n---\n\n# 审阅\n\n(one)=\n## 第一节\n\n开始时的内容。\n'
const MODEL = 'def model():\n    return 1\n'

function follow(url: string, headers: Record<string, string>): { events: Record<string, any>[], close(): void } {
  const controller = new AbortController()
  const events: Record<string, any>[] = []
  void (async () => {
    const response = await fetch(url, { headers: { ...headers, Accept: 'text/event-stream' }, signal: controller.signal })
    const decoder = new TextDecoder()
    let text = ''
    for await (const chunk of response.body!) {
      text += decoder.decode(chunk as Uint8Array, { stream: true })
      let end
      while ((end = text.indexOf('\n\n')) >= 0) {
        const data = text.slice(0, end).split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
        text = text.slice(end + 2)
        if (data) events.push(JSON.parse(data) as Record<string, any>)
      }
    }
  })().catch(() => undefined)
  return { events, close: () => controller.abort() }
}

describe('the review routes of presmium serve', () => {
  let dir: string
  let home: string
  let serve: Child
  let url: string
  const env = () => cleanEnv({ PRESMIUM_SERVICE_TOKEN: TOKEN, HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') })
  const start = async () => {
    serve = presmiumProcess(dir, ['serve', '--port', '0'], env())
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }
  const route = (path: string, document: string, json?: unknown) => raw(`${url}/__presmium/presmium.workspace/${path}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Presmium-Document': encodeURIComponent(document) },
    ...json === undefined ? {} : { json },
  })
  const read = (file: string) => readFileSync(join(dir, file), 'utf8')

  beforeAll(async () => {
    const source = mkdtempSync(join(tmpdir(), 'presmium-review-source-'))
    writeFileSync(join(source, 'presmium.workspace.yaml'), 'title: 审阅\ndocuments: [intro/lecture.md, old/lecture.md]\nsettings:\n  presmium.assistant:\n    review: required\n')
    for (const doc of ['intro', 'old']) {
      mkdirSync(join(source, doc))
      writeFileSync(join(source, doc, 'lecture.md'), LECTURE)
    }
    mkdirSync(join(source, 'src'))
    writeFileSync(join(source, 'src/model.py'), MODEL)
    dir = workspace('review', source, { 'presmium-fixture-review': 'packages/workspace/test/fixtures/review-plugin' })
    rmSync(source, { recursive: true, force: true })
    home = `${dir}.home`
    mkdirSync(home)
    await start()
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
    remove(home)
  })

  it('a session\'s review: the lock, checkpoints and turns, a page following it, back to a step, a file rejected, one commit with the session\'s trailers', async () => {
    const page = follow(`${url}/__presmium/presmium.workspace/review?document=intro`, { Authorization: `Bearer ${TOKEN}` })
    try {
      const opened = await route('review/open', 'intro', { session: 'session-a', turn: 1 })
      expect(opened.status, opened.text).toBe(200)
      expect(opened.json()).toMatchObject({ review: { document: 'intro', session: 'session-a', holder: 'agent:session-a', turns: { from: 1, to: 1 }, running: true, changes: [] } })
      expect((await route('review/open', 'intro', { session: 'session-b' })).json()).toMatchObject({ locked: { holder: 'agent:session-a' } })
      const version = route('source?path=intro/lecture.md', 'intro').then(r => r.json<{ version: string }>().version)
      const saved = await route('source', 'intro', { path: 'intro/lecture.md', content: 'x', base: await version })
      expect(saved.status).toBe(409)
      expect(saved.json()).toMatchObject({ locked: { document: 'intro', holder: 'agent:session-a' } })

      writeFileSync(join(dir, 'intro/lecture.md'), LECTURE.replace('开始时的内容。', '第一轮。'))
      expect((await route('review/step', 'intro', { session: 'session-a', turn: 1, label: 'write lecture.md', tool: 'write' })).status).toBe(200)
      expect((await route('review/step', 'intro', { session: 'session-a', turn: 1, end: true })).json()).toMatchObject({ review: { running: false } })
      writeFileSync(join(dir, 'intro/notes.md'), '笔记\n')
      await route('review/step', 'intro', { session: 'session-a', turn: 2, label: 'write notes.md', tool: 'write' })
      writeFileSync(join(dir, 'intro/later.md'), '后来的\n')
      await route('review/step', 'intro', { session: 'session-a', turn: 2, label: 'write later.md', tool: 'write' })
      const ended = (await route('review/step', 'intro', { session: 'session-a', turn: 2, end: true })).json<{ review: { turns: unknown, steps: { id: string }[], changes: { path: string }[] } }>()
      expect(ended.review.turns).toEqual({ from: 1, to: 2 })
      expect(ended.review.changes.map(c => c.path)).toEqual(['intro/later.md', 'intro/lecture.md', 'intro/notes.md'])
      expect((await route('review/step', 'intro', { session: 'session-b', label: 'write x' })).status).toBe(409)

      expect((await route('review/restore', 'intro', { step: ended.review.steps[2]!.id })).status).toBe(200)
      expect(existsSync(join(dir, 'intro/later.md'))).toBe(false)
      expect((await route('review/reject', 'intro', { paths: ['intro/notes.md'] })).json()).toMatchObject({ review: { changes: [{ path: 'intro/lecture.md' }] } })
      expect(existsSync(join(dir, 'intro/notes.md'))).toBe(false)

      const accepted = await route('review/accept', 'intro', { message: '第一节改为第一轮' })
      expect(accepted.status, accepted.text).toBe(200)
      expect(accepted.json()).toMatchObject({ ended: { outcome: 'accepted', files: ['intro/lecture.md'] } })
      expect(message(dir)).toMatch(/^第一节改为第一轮\n\n- write lecture\.md\n- write notes\.md\n\nPresmium-Origin: agent\nPresmium-Task: \S+\nPresmium-Session: session-a\nPresmium-Turn: 1-2\nCo-authored-by: /)
      expect(git(dir, ['status', '--porcelain'])).toBe('')
      expect((await route('review', 'intro')).json()).toEqual({})
      expect((await route('source', 'intro', { path: 'intro/lecture.md', content: read('intro/lecture.md'), base: await route('source?path=intro/lecture.md', 'intro').then(r => r.json<{ version: string }>().version) })).status).toBe(200)

      await expect.poll(() => page.events.at(-1)?.ended?.outcome).toBe('accepted')
      expect(page.events[0]).toEqual({ document: 'intro' })
      expect(page.events.some(event => event.review?.changes?.length === 3)).toBe(true)
    } finally {
      page.close()
    }
  }, 120_000)

  it('stopped and started again: resumes a session\'s review with its checkpoints; rolls back the review a task left in a record that still names its directory deck', async () => {
    await route('review/open', 'intro', { session: 'session-c', turn: 4 })
    writeFileSync(join(dir, 'intro/kept.md'), '重启前写的\n')
    await route('review/step', 'intro', { session: 'session-c', turn: 4, label: 'write kept.md', tool: 'write' })
    await route('review/step', 'intro', { session: 'session-c', turn: 4, end: true })
    await serve.stop()

    const deck = realpathSync(join(dir, 'old'))
    const index = join(home, 'snapshot-index')
    const indexed = (args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...process.env, GIT_INDEX_FILE: index }, encoding: 'utf8' })
    indexed(['add', '-A', '--', 'old'])
    const snapshot = indexed(['write-tree']).trim()
    rmSync(index, { force: true })
    const top = realpathSync(dir)
    const record = { deck, dirs: { top, gitDir: join(top, '.git'), commonDir: join(top, '.git') }, snapshot, task: 'task-crashed', pid: 999999999 }
    const records = join(home, 'state/presmium/reviews')
    mkdirSync(records, { recursive: true })
    const file = join(records, `${createHash('sha256').update(deck).digest('hex').slice(0, 24)}.json`)
    writeFileSync(file, JSON.stringify(record))
    writeFileSync(join(dir, 'old/lecture.md'), LECTURE.replace('开始时的内容。', '崩溃时还在审阅。'))
    writeFileSync(join(dir, 'old/crash.md'), '崩溃时的文件\n')

    await start()
    expect(read('old/lecture.md')).toBe(LECTURE)
    expect(existsSync(join(dir, 'old/crash.md'))).toBe(false)
    expect(existsSync(file)).toBe(false)
    expect(serve.output()).toContain('task task-crashed was waiting for its review when the server ended: rolled back (old/crash.md, old/lecture.md)')

    const resumed = (await route('review', 'intro')).json<{ review: { session: string, turns: unknown, steps: { label: string }[], changes: { path: string }[] } }>().review
    expect(resumed).toMatchObject({ session: 'session-c', turns: { from: 4, to: 4 }, steps: [{ label: 'write kept.md' }], changes: [{ path: 'intro/kept.md' }] })
    expect((await route('review/open', 'intro', { session: 'session-d' })).status).toBe(409)
    expect((await route('review/accept', 'intro', {})).status).toBe(200)
    expect(message(dir)).toMatch(/^AI 修改：kept\.md\n[\s\S]*Presmium-Session: session-c\nPresmium-Turn: 4-4\n/)
    expect(read('intro/kept.md')).toBe('重启前写的\n')
  }, 180_000)

  it('reviews and rejects the whole workspace across document switches, excluding other sessions and editor saves', async () => {
    const before = read('old/lecture.md')
    const draft = `${MODEL}\n# uncommitted before the agent\n`
    writeFileSync(join(dir, 'src/model.py'), draft)
    const opened = await route('review/open', 'intro', { session: 'workspace-session', turn: 1 })
    expect(opened.status, opened.text).toBe(200)
    const id = opened.json<{ review: { id: string } }>().review.id
    expect((await route('review/open', 'old', { session: 'other-session' })).json()).toMatchObject({ locked: { holder: 'agent:workspace-session' } })
    expect((await route('review/open', 'old', { session: 'workspace-session' })).json()).toMatchObject({ review: { id } })

    for (const path of ['src/model.py', 'old/lecture.md']) {
      const opened = (await route(`source?path=${encodeURIComponent(path)}`, '')).json<{ version: string }>()
      const saved = await route('source', '', { path, content: 'editor changed it', base: opened.version })
      expect(saved.status, saved.text).toBe(409)
      expect(saved.json()).toMatchObject({ locked: { holder: 'agent:workspace-session' } })
    }
    writeFileSync(join(dir, 'src/model.py'), `${MODEL}\n# agent changed it\n`)
    rmSync(join(dir, 'old'), { recursive: true })
    const ended = await route('review/step', '', { session: 'workspace-session', turn: 1, end: true })
    expect(ended.status, ended.text).toBe(200)
    const shown = (await route('review', '')).json<{ review: { id: string, changes: { path: string }[] } }>().review
    expect(shown.id).toBe(id)
    expect(shown.changes.map(change => change.path)).toEqual(['old/lecture.md', 'src/model.py'])
    expect((await route('review/reject', 'intro', {})).status).toBe(200)
    expect(read('old/lecture.md')).toBe(before)
    expect(read('src/model.py')).toBe(draft)
    expect((await route('review', '')).json()).toEqual({})
    writeFileSync(join(dir, 'src/model.py'), MODEL)
  }, 120_000)

  it('keeps a failed commit review and its lock across restart, then lets the author retry it', async () => {
    const before = git(dir, ['rev-parse', 'HEAD'])
    expect((await route('review/open', '', { session: 'retry-session', turn: 1 })).status).toBe(200)
    writeFileSync(join(dir, 'src/model.py'), `${MODEL}\n# accepted change\n`)
    expect((await route('review/step', '', { session: 'retry-session', turn: 1, end: true })).status).toBe(200)
    const lock = join(dir, '.git/index.lock')
    writeFileSync(lock, 'another git operation\n')
    try {
      const failed = await route('review/accept', '', {})
      expect(failed.status, failed.text).toBe(500)
      expect(failed.text).toContain('index.lock')
      expect(git(dir, ['rev-parse', 'HEAD'])).toBe(before)
      expect((await route('review', 'intro')).json()).toMatchObject({ review: { session: 'retry-session', changes: [{ path: 'src/model.py' }] } })
      expect((await route('review/open', 'old', { session: 'blocked-session' })).status).toBe(409)
      await serve.stop()
    } finally {
      rmSync(lock, { force: true })
    }
    await start()
    expect((await route('review', '')).json()).toMatchObject({ review: { session: 'retry-session', running: false, changes: [{ path: 'src/model.py' }] } })
    const accepted = await route('review/accept', '', {})
    expect(accepted.status, accepted.text).toBe(200)
    expect(accepted.json()).toMatchObject({ ended: { outcome: 'accepted', revision: { files: ['src/model.py'] } } })
    expect(message(dir)).toContain('Presmium-Session: retry-session')
    expect(git(dir, ['status', '--porcelain'])).toBe('')
    expect((await route('review', '')).json()).toEqual({})
  }, 180_000)

  it('keeps plugin tasks scoped to their document and excludes overlapping workspace sessions in both directions', async () => {
    const task = (op: string) => raw(`${url}/__presmium/fixture.review/task`, { headers: { Authorization: `Bearer ${TOKEN}`, 'Presmium-Document': 'intro' }, json: { op } })
    const opened = await task('open')
    expect(opened.status, opened.text).toBe(200)
    expect(opened.json()).toEqual({ root: realpathSync(join(dir, 'intro')) })
    expect((await route('review/open', 'old', { session: 'workspace-after-task' })).json()).toMatchObject({ locked: { holder: 'agent:fixture-task' } })
    const before = read('intro/lecture.md')
    writeFileSync(join(dir, 'intro/lecture.md'), `${before}\nplugin task\n`)
    const other = (await route('source?path=old/lecture.md', 'old')).json<{ content: string, version: string }>()
    expect((await route('source', 'old', { path: 'old/lecture.md', content: other.content, base: other.version })).status).toBe(200)
    expect((await task('rollback')).status).toBe(200)
    expect(read('intro/lecture.md')).toBe(before)

    expect((await route('review/open', '', { session: 'workspace-after-task' })).status).toBe(200)
    const blocked = await task('open')
    expect(blocked.status, blocked.text).toBe(409)
    expect(blocked.text).toContain('agent:workspace-after-task')
    expect((await route('review/reject', '', {})).status).toBe(200)
    expect((await task('open')).status).toBe(200)
    expect((await task('close')).status).toBe(200)
    expect((await route('review/open', '', { session: 'after-plugin-close' })).status).toBe(200)
    expect((await route('review/reject', '', {})).status).toBe(200)
  }, 120_000)

  it('refuses to reinterpret old document session snapshots and keeps every record for the previous version', async () => {
    await serve.stop()
    const records = join(home, 'state/presmium/reviews')
    const pending = ['intro', 'old'].map((document) => {
      const deck = realpathSync(join(dir, document))
      const index = join(home, `legacy-${document}-index`)
      const indexed = (args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...process.env, GIT_INDEX_FILE: index }, encoding: 'utf8' })
      indexed(['add', '-A', '--', document])
      const snapshot = indexed(['write-tree']).trim()
      rmSync(index, { force: true })
      const root = realpathSync(dir)
      const record = JSON.stringify({ deck, dirs: { top: root, gitDir: join(root, '.git'), commonDir: join(root, '.git') }, snapshot, task: `legacy-${document}`, pid: 999999999, session: { session: `session-${document}`, document, member: { id: 'author', name: 'Author', roles: ['owner'] }, turns: { from: 1, to: 1 }, opened: new Date().toISOString(), checkpoints: [], steps: [] } })
      const file = join(records, `${createHash('sha256').update(deck).digest('hex').slice(0, 24)}.json`)
      mkdirSync(records, { recursive: true })
      writeFileSync(file, record)
      return { file, record, snapshot }
    })
    try {
      await expect(start()).rejects.toThrow(/Cannot restore document-scoped session reviews in intro, old[\s\S]*previous Presmium version/)
      for (const { file, record, snapshot } of pending) {
        expect(readFileSync(file, 'utf8')).toBe(record)
        expect(git(dir, ['cat-file', '-t', snapshot]).trim()).toBe('tree')
      }
    } finally {
      for (const { file } of pending) rmSync(file)
      await start()
    }
  }, 180_000)

  it('GET preview without --preview-origin: the previews\' addresses, and no page may frame them', async () => {
    const preview = await route('preview?document=intro', 'intro')
    expect(preview.status, preview.text).toBe(200)
    const { web, slides } = preview.json<{ web: string, slides: string }>()
    expect(web).toBe(`${url}/__app/view?document=intro`)
    for (const address of [web, slides]) {
      const page = await raw(address)
      expect(page.status, address).toBe(200)
      expect(page.headers['content-security-policy'], address).toBe("frame-ancestors 'none'")
    }
  }, 300_000)
})
