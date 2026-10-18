import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Running } from './helpers.ts'
import { env, FIXTURES, presmiumProcess, processTree, qualification } from './helpers.ts'

const host = qualification()
if (!host.ok) console.warn(`review.test.ts skipped: ${host.why}`)

const LECTURE = `---
title: 审阅
plugins:
  - ${join(FIXTURES, 'review-plugin')}
---

## 第一节

开始时的内容。
`

function agentWrites(root: string, script: string): void {
  const result = spawnSync('sh', ['-c', script], { cwd: root, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
}

describe.skipIf(!host.ok)('change review through deltabox', () => {
  let base: string
  let deck: string
  let state: string
  let dev: Running | undefined
  let server: string

  const lecture = () => readFileSync(join(deck, 'lecture.md'), 'utf8')
  const ir = () => JSON.parse(readFileSync(join(deck, '.presmium/dev/ir.json'), 'utf8')) as { sections: { title: string }[] }
  const call = async (route: string, body?: unknown) => {
    const response = await fetch(`${server}/__presmium/fixture.review/${route}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
    return { status: response.status, json: await response.json() as Record<string, any> }
  }

  async function start(): Promise<Running> {
    const running = presmiumProcess(['dev'], { cwd: deck, env: env({ XDG_STATE_HOME: state }) })
    server = (await running.wait(/^server {2}(http\S+)$/m))[1]!
    await running.wait(/^watching;/m)
    return running
  }

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'presmium-review-'))
    deck = join(base, 'deck')
    state = join(base, 'state')
    mkdirSync(join(deck, 'old'), { recursive: true })
    writeFileSync(join(deck, 'lecture.md'), LECTURE)
    writeFileSync(join(deck, 'old', 'a.md'), '旧\n')
    dev = await start()
  }, 120_000)
  afterEach(() => {
    if (dev) return call('rollback', {}).then(() => {})
  })
  afterAll(async () => {
    await dev?.stop()
    rmSync(base, { recursive: true, force: true })
  })

  it('shows the agent\'s writes through the root as steps and a diff, live in the deck directory; accepts with a file rejected, rolls back, and refuses a second review', async () => {
    const opened = await call('open', {})
    expect(opened.status, JSON.stringify(opened.json)).toBe(200)
    expect(opened.json).toMatchObject({ engine: 'deltabox', visibility: 'immediate' })
    const root = opened.json.root as string
    expect(root).not.toBe(deck)
    expect((await call('open', {})).status).toBe(409)

    agentWrites(root, 'printf "\\n## 第二节\\n\\nagent 写的。\\n" >> lecture.md && printf "# 笔记\\n" > notes.md')
    expect(lecture()).toContain('agent 写的。')
    await expect.poll(() => ir().sections.map(s => s.title), { timeout: 15_000 }).toEqual(['第一节', '第二节'])

    const step = await call('step', { label: '写讲义与笔记' })
    expect(step.json).toMatchObject({ label: '写讲义与笔记', tool: 'edit' })
    expect(step.json.changes.map((c: { path: string, kind: string }) => [c.path, c.kind]).sort()).toEqual([['lecture.md', 'modified'], ['notes.md', 'added']])
    const diff = await call('diff')
    expect(diff.json.changes.map((c: { path: string, kind: string }) => [c.path, c.kind]).sort()).toEqual([['lecture.md', 'modified'], ['notes.md', 'added']])
    expect(diff.json.changes.find((c: { path: string }) => c.path === 'lecture.md').diff).toContain('+agent 写的。')
    expect(diff.json.steps).toHaveLength(1)

    const accepted = await call('accept', { reject: ['lecture.md'] })
    expect(accepted.json).toEqual({ files: ['notes.md'] })
    expect(lecture()).toBe(LECTURE)
    expect(readFileSync(join(deck, 'notes.md'), 'utf8')).toBe('# 笔记\n')

    const again = (await call('open', {})).json.root as string
    agentWrites(again, 'printf "改写\\n" > lecture.md && printf "草稿\\n" > draft.md')
    expect(lecture()).toBe('改写\n')
    expect((await call('rollback', {})).status).toBe(200)
    expect(lecture()).toBe(LECTURE)
    expect(existsSync(join(deck, 'draft.md'))).toBe(false)
    expect(readFileSync(join(deck, 'notes.md'), 'utf8')).toBe('# 笔记\n')
  }, 60_000)

  it('lists files only, not the directories the agent made or removed, and leaves no directory of rejected files behind', async () => {
    const root = (await call('open', {})).json.root as string
    agentWrites(root, 'mkdir -p figs/raw empty && printf png > figs/raw/p.png && printf "图\\n" > figs/note.md && rm -r old')
    const paths = (changes: { path: string, kind: string }[]) => changes.map(c => [c.path, c.kind]).sort()
    const files = [['figs/note.md', 'added'], ['figs/raw/p.png', 'added'], ['old/a.md', 'deleted']]
    expect(paths((await call('step', { label: '整理图片' })).json.changes)).toEqual(files)
    expect(paths((await call('diff')).json.changes)).toEqual(files)

    const accepted = await call('accept', { reject: ['figs/raw/p.png', 'figs'] })
    expect(accepted.json.files.sort()).toEqual(['figs/note.md', 'old/a.md'])
    expect(existsSync(join(deck, 'figs/raw'))).toBe(false)
    expect(readFileSync(join(deck, 'figs/note.md'), 'utf8')).toBe('图\n')
    expect(existsSync(join(deck, 'old'))).toBe(false)
  }, 60_000)

  it('goes back to before a step: the deck directory as at the checkpoint before it, that step and the later ones dropped; the review goes on', async () => {
    const root = (await call('open', {})).json.root as string
    agentWrites(root, 'printf "\\n第一步。\\n" >> lecture.md')
    const first = (await call('step', { label: '第一步' })).json
    agentWrites(root, 'printf "第二步\\n" > second.md && printf "\\n第二步。\\n" >> lecture.md')
    const second = (await call('step', { label: '第二步' })).json
    agentWrites(root, 'printf "第三步\\n" > third.md')
    await call('step', { label: '第三步' })

    expect((await call('restore', { step: second.id })).status).toBe(200)
    expect(lecture()).toBe(`${LECTURE}\n第一步。\n`)
    expect(existsSync(join(deck, 'second.md'))).toBe(false)
    expect(existsSync(join(deck, 'third.md'))).toBe(false)
    const diff = (await call('diff')).json
    expect(diff.steps.map((s: { id: string }) => s.id)).toEqual([first.id])
    expect(diff.changes.map((c: { path: string }) => c.path)).toEqual(['lecture.md'])

    agentWrites(root, 'printf "又一步\\n" > again.md')
    expect((await call('step', { label: '又一步' })).json.changes.map((c: { path: string }) => c.path)).toEqual(['again.md'])
    expect((await call('restore', { step: first.id })).status).toBe(200)
    expect(lecture()).toBe(LECTURE)
    expect(existsSync(join(deck, 'again.md'))).toBe(false)
    expect((await call('diff')).json).toMatchObject({ changes: [], steps: [] })
    expect((await call('rollback', {})).status).toBe(200)
  }, 60_000)

  it('rolls a review whose session faulted back from its own snapshot, ends the session and frees the directory', async () => {
    const root = (await call('open', {})).json.root as string
    agentWrites(root, 'printf "\\n出错之前写的。\\n" >> lecture.md && printf "残留\\n" > faulted.md')
    const stateDir = join(state, 'presmium/deltabox')
    const records = join(stateDir, 'presmium/sessions')
    const session = readdirSync(records).map(name => JSON.parse(readFileSync(join(records, name), 'utf8')) as { session: string, kind: string, project: string })
      .find(record => record.kind === 'review' && record.project === realpathSync(deck))!.session
    rmSync(join(stateDir, session), { recursive: true, force: true })
    expect((await call('diff')).status).toBe(409)

    const rolled = await call('rollback', {})
    expect(rolled.status, JSON.stringify(rolled.json)).toBe(200)
    expect(lecture()).toBe(LECTURE)
    expect(existsSync(join(deck, 'faulted.md'))).toBe(false)
    expect(dev!.output()).toContain('restored from the review\'s snapshot')

    const reopened = await call('open', {})
    expect(reopened.status, JSON.stringify(reopened.json)).toBe(200)
    agentWrites(reopened.json.root as string, 'printf "新的\\n" > fresh.md')
    expect((await call('diff')).json.changes.map((c: { path: string }) => c.path)).toEqual(['fresh.md'])
    expect((await call('rollback', {})).status).toBe(200)
    expect(existsSync(join(deck, 'fresh.md'))).toBe(false)
  }, 60_000)

  it('restores the deck directory when presmium dev starts again after it was killed with its helpers during a review', async () => {
    const root = (await call('open', {})).json.root as string
    agentWrites(root, 'printf "\\n## 崩溃之前\\n" >> lecture.md && printf "残留\\n" > crash.md')
    expect(lecture()).toBe(`${LECTURE}\n## 崩溃之前\n`)
    const exited = new Promise(done => dev!.child.once('exit', done))
    for (const pid of processTree(dev!.child.pid!)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
    }
    await exited
    expect(lecture()).toBe(`${LECTURE}\n## 崩溃之前\n`)

    dev = await start()
    expect(dev.output()).toContain(`已清理崩溃的进程留下的 deltabox 会话：${realpathSync(deck)}`)
    expect(lecture()).toBe(LECTURE)
    expect(existsSync(join(deck, 'crash.md'))).toBe(false)
    await expect.poll(() => ir().sections.map(s => s.title), { timeout: 15_000 }).toEqual(['第一节'])
    const reopened = await call('open', {})
    expect(reopened.status, JSON.stringify(reopened.json) + dev.output()).toBe(200)
    expect((await call('rollback', {})).status).toBe(200)
  }, 120_000)
})
