import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@presmium/cli/testing'
import type { FakeModel } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { git, testHome, turns } from './harness.ts'
import type { HostApi, Service, TestHome, Web, Workspace } from './harness.ts'

const lecture = (title: string) => `---\ntitle: ${title}\n---\n\n# ${title}\n\n(one)=\n## 第一节\n\n开始时的内容。\n`
const ALPHA = lecture('文稿甲')
const BETA = lecture('文稿乙')
const ALPHA_CHANGED = ALPHA.replace('开始时的内容。', '改过的内容。')
const BETA_FIRST = BETA.replace('开始时的内容。', '第一次改。')
const BETA_SECOND = BETA.replace('开始时的内容。', '第二次改。')

function files(timeoutMs?: number): Record<string, string> {
  const settings = timeoutMs ? `settings:\n  presmium.assistant:\n    reviewTimeoutMs: ${timeoutMs}\n` : ''
  return {
    'presmium.workspace.yaml': `title: 审阅\ndocuments: [lectures/*/lecture.md]\napprovals: { operate: allow }\n${settings}`,
    'lectures/alpha/lecture.md': ALPHA,
    'lectures/beta/lecture.md': BETA,
  }
}

interface Review {
  id: string
  session: string
  holder: string
  turns: { from: number, to: number }
  running: boolean
  steps: { id: string, label: string, tool?: string }[]
  changes: { path: string }[]
}

function routes(service: Service) {
  const call = (path: string, document: string, body?: unknown) => fetch(`${service.url}/__presmium/presmium.workspace/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Authorization': `Bearer ${service.token}`, 'Presmium-Document': encodeURIComponent(document), ...body === undefined ? {} : { 'Content-Type': 'application/json' } },
    ...body === undefined ? {} : { body: JSON.stringify(body) },
  })
  return {
    call,
    async review(document: string): Promise<Review | undefined> {
      return (await (await call('review', document)).json() as { review?: Review }).review
    },
    async settled(document: string, to: number): Promise<Review> {
      let found: Review | undefined
      await expect.poll(async () => {
        found = await this.review(document)
        return Boolean(found && !found.running && found.turns.to === to)
      }, { timeout: 120_000, interval: 300 }).toBe(true)
      return found!
    },
  }
}

async function session(api: HostApi, dir: string) {
  const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: dir } })
  return {
    id: sessionId,
    prompt: (text: string) => api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }] } }),
  }
}

describe('a session\'s review in the workspace service', () => {
  let home: TestHome
  let ws: Workspace
  let service: Service
  let model: FakeModel
  let web: Web
  let api: HostApi
  let reviews: ReturnType<typeof routes>
  const alpha = () => join(ws.dir, 'lectures/alpha')
  const beta = () => join(ws.dir, 'lectures/beta')

  beforeAll(async () => {
    home = testHome('turns')
    ws = home.workspace('turns', files())
    service = await home.serve(ws.dir)
    reviews = routes(service)
    model = await fakeModel([
      { tool: 'read', input: { file_path: 'lecture.md' } },
      { tool: 'write', input: { file_path: 'lecture.md', content: ALPHA_CHANGED } },
      { text: '改好了。' },
      { tool: 'write', input: { file_path: 'notes.md', content: '笔记\n' } },
      { text: '写了笔记。' },
      { text: '知道了。' },
      { tool: 'read', input: { file_path: 'lecture.md' } },
      { tool: 'write', input: { file_path: 'lecture.md', content: BETA_FIRST } },
      { tool: 'write', input: { file_path: 'lecture.md', content: BETA_SECOND } },
      { tool: 'presmium__build', input: { to: ['notebook'] } },
      { tool: 'write', input: { file_path: 'extra.md', content: '多出来的\n' } },
      { text: '改了两次，构建了，又加了一个文件。' },
      { tool: 'write', input: { file_path: 'restart.md', content: '重启之前写的\n' } },
      { text: '写好了。' },
    ])
    web = await home.web(ws.dir, 5633, { model, env: service.env })
    api = await web.api()
  }, 240_000)
  afterAll(async () => {
    await model?.close()
    await home?.close()
  })

  it('opens before the first write and holds the lock; two turns, one review; a rejected file back, one commit with the session and turns; undone, and the session told', async () => {
    const s1 = await session(api, alpha())
    await s1.prompt('把第一节改一下。')
    let review = await reviews.settled('lectures/alpha', 1)
    expect(review).toMatchObject({ session: s1.id, holder: `agent:${s1.id}`, turns: { from: 1, to: 1 } })
    expect(review.changes.map(c => c.path)).toEqual(['lectures/alpha/lecture.md'])
    expect(review.steps.map(s => s.tool)).toEqual(['write'])
    expect(ws.read('lectures/alpha/lecture.md')).toBe(ALPHA_CHANGED)

    const opened = await (await reviews.call('source?path=lectures/alpha/lecture.md', 'lectures/alpha')).json() as { version: string }
    const saved = await reviews.call('source', 'lectures/alpha', { path: 'lectures/alpha/lecture.md', content: `${ALPHA_CHANGED}编辑器的一行。\n`, base: opened.version })
    expect(saved.status).toBe(409)
    expect(await saved.json()).toMatchObject({ locked: { document: 'lectures/alpha', holder: `agent:${s1.id}` } })

    await s1.prompt('再写个笔记。')
    review = await reviews.settled('lectures/alpha', 2)
    expect(review.turns).toEqual({ from: 1, to: 2 })
    expect(review.changes.map(c => c.path)).toEqual(['lectures/alpha/lecture.md', 'lectures/alpha/notes.md'])

    expect((await reviews.call('review/reject', 'lectures/alpha', { paths: ['lectures/alpha/notes.md'] })).status).toBe(200)
    expect(existsSync(join(alpha(), 'notes.md'))).toBe(false)
    const accepted = await (await reviews.call('review/accept', 'lectures/alpha', {})).json() as { ended: { outcome: string, revision: { id: string }, files: string[] } }
    expect(accepted.ended).toMatchObject({ outcome: 'accepted', files: ['lectures/alpha/lecture.md'] })
    const message = git(ws.dir, ['log', '-1', '--format=%B'])
    expect(message).toContain(`Presmium-Task: ${review.id}`)
    expect(message).toMatch(/^Presmium-Origin: agent$/m)
    expect(message).toMatch(new RegExp(`^Presmium-Session: ${s1.id}\\nPresmium-Turn: 1-2\\nCo-authored-by: `, 'm'))
    expect(git(ws.dir, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('lectures/alpha/lecture.md')
    expect(await reviews.review('lectures/alpha')).toBeUndefined()
    expect((await reviews.call('source', 'lectures/alpha', { path: 'lectures/alpha/lecture.md', content: ALPHA_CHANGED, base: opened.version })).status).toBe(200)

    const reverted = await reviews.call('revisions/revert', 'lectures/alpha', { id: accepted.ended.revision.id })
    expect(reverted.status).toBe(200)
    expect(ws.read('lectures/alpha/lecture.md')).toBe(ALPHA)
    await expect.poll(async () => JSON.stringify(await api.call('session/projections', { request: { sessionId: s1.id } })), { timeout: 30_000 }).toContain('[Presmium] The author undid')
    await s1.prompt('现在呢？')
    await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(6)
    const told = JSON.stringify(turns(model)[5]!.messages)
    expect(told).toContain('[Presmium] The author undid the change this session made (turns 1-2)')
    expect(told).toContain(accepted.ended.revision.id.slice(0, 10))
  }, 300_000)

  it('back to a checkpoint, the files are as before that tool call; the build is neither in the review nor in the change card', async () => {
    const s2 = await session(api, beta())
    await s2.prompt('改两次，构建，再加个文件。')
    const review = await reviews.settled('lectures/beta', 1)
    expect(review.changes.map(c => c.path)).toEqual(['lectures/beta/extra.md', 'lectures/beta/lecture.md'])
    expect(git(ws.dir, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean).map(line => line.slice(3)).sort()).toEqual(['lectures/beta/extra.md', 'lectures/beta/lecture.md'])
    const carded: string[] = []
    for (let seq = 1; seq <= 400; seq++) {
      const answer = await api.fetch(`/api/changes.summary?sessionId=${encodeURIComponent(s2.id)}&seq=${seq}`)
      if (answer.status === 200) carded.push(...(await answer.json() as { files: { path: string }[] }).files.map(f => f.path))
      else await answer.body?.cancel()
    }
    expect(carded.sort()).toEqual(['extra.md', 'lecture.md'])

    expect(review.steps.map(s => s.label)).toEqual(['write lecture.md', 'write lecture.md', 'write extra.md'])
    const restored = await reviews.call('review/restore', 'lectures/beta', { step: review.steps[1]!.id })
    expect(restored.status).toBe(200)
    expect(ws.read('lectures/beta/lecture.md')).toBe(BETA_FIRST)
    expect(existsSync(join(beta(), 'extra.md'))).toBe(false)
    expect((await reviews.review('lectures/beta'))!.steps).toHaveLength(1)

    const before = git(ws.dir, ['rev-parse', 'HEAD'])
    expect((await reviews.call('review/reject', 'lectures/beta', {})).status).toBe(200)
    expect(ws.read('lectures/beta/lecture.md')).toBe(BETA)
    expect(git(ws.dir, ['rev-parse', 'HEAD'])).toBe(before)
  }, 300_000)

  it('outlives the host: restarted, the new host\'s page accepts the review', async () => {
    const s3 = await session(api, alpha())
    await s3.prompt('写一个文件。')
    await reviews.settled('lectures/alpha', 1)
    await web.stop()
    const again = await home.web(ws.dir, 5634, { env: service.env })
    const page = await again.api()
    const shown = await (await page.fetch('/api/presmium/review?document=lectures%2Falpha')).json() as { review: Review }
    expect(shown.review).toMatchObject({ session: s3.id, changes: [{ path: 'lectures/alpha/restart.md' }] })
    const accepted = await page.fetch('/api/presmium/review/accept?document=lectures%2Falpha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(accepted.status).toBe(200)
    expect(git(ws.dir, ['log', '-1', '--format=%B'])).toContain(`Presmium-Session: ${s3.id}`)
    expect(readFileSync(join(alpha(), 'restart.md'), 'utf8')).toBe('重启之前写的\n')
    expect(home.homeEntries()).toEqual([])
  }, 300_000)
})

describe('a review no page follows', () => {
  let home: TestHome
  let ws: Workspace
  let service: Service
  let model: FakeModel
  let web: Web

  beforeAll(async () => {
    home = testHome('turns-unattended')
    ws = home.workspace('turns-unattended', files(3000))
    service = await home.serve(ws.dir)
    model = await fakeModel([
      { tool: 'write', input: { file_path: 'left.md', content: '没人审阅\n' } },
      { text: '写好了。' },
    ])
    web = await home.web(ws.dir, 5635, { model, env: service.env })
  }, 240_000)
  afterAll(async () => {
    await model?.close()
    await home?.close()
  })

  it('is rolled back once the operator\'s time is over', async () => {
    const reviews = routes(service)
    const s = await session(await web.api(), join(ws.dir, 'lectures/alpha'))
    await s.prompt('写一个文件。')
    await expect.poll(() => existsSync(join(ws.dir, 'lectures/alpha/left.md')), { timeout: 120_000, interval: 100 }).toBe(true)
    await expect.poll(() => existsSync(join(ws.dir, 'lectures/alpha/left.md')), { timeout: 60_000 }).toBe(false)
    expect(await reviews.review('lectures/alpha')).toBeUndefined()
    expect(service.process.output()).toMatch(/no page followed it for 3 s: rolled back/)
  }, 300_000)
})
