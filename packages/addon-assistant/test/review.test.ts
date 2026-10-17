// Where a path is, in the assistant's review, permissions and change tasks (F-11): a file of the document named
// `..notes.md` is in the document (as the compiler's `inside` says), not outside it. Under `presmium serve` with
// the scripted test agent and the assistant's git review: the agent writes it without asking, the review lists
// it, rejecting all takes it away and accepting commits it; a file of that name outside the document is still
// the owner's to allow, and refused, it is not written.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@presmium/kernel'
import { AGENT_COMMAND, agentLog, env, eventStream, git, PACKAGE, presmium, taskEvents, workspace } from './helpers.ts'
import type { EventStream, Running } from './helpers.ts'

const LECTURE = `---
title: 审阅的路径
plugins:
  - '@presmium/slidev-addon-assistant'
---

# 审阅的路径

## 合并规则

每一轮合并出现次数最多的一对。
`

describe('a file of the document named ..notes.md', () => {
  let dir: string
  let running: Running
  let server: string
  const log = () => `${dir}.agent.log`
  const headers = { 'Presmium-Document': 'intro' }
  const route = (path: string, json?: unknown) => fetch(`${server}/__presmium/presmium.assistant/${path}`, {
    method: json === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...json === undefined ? {} : { 'Content-Type': 'application/json' } },
    ...json === undefined ? {} : { body: JSON.stringify(json) },
  })

  /** A chat task of the document: its id, and its events until `review` or the end. */
  async function chat(prompt: string): Promise<{ id: string, events: AgentEvent[] }> {
    const submitted = await route('tasks', { kind: 'chat', prompt, context: { document: 'intro', section: 'x' } })
    const { id } = await submitted.json() as { id: string }
    expect(submitted.status).toBe(201)
    const events: AgentEvent[] = []
    await taskEvents(`${server}/__presmium/presmium.assistant/tasks/${id}/events`, headers, event => events.push(event)).catch(() => undefined)
    return { id, events }
  }

  /** The events of a task until its review (a page following it). */
  async function untilReview(prompt: string): Promise<{ id: string, review: Extract<AgentEvent, { type: 'review' }>, stream: EventStream }> {
    const submitted = await route('tasks', { kind: 'chat', prompt, context: { document: 'intro', section: 'x' } })
    expect(submitted.status).toBe(201)
    const { id } = await submitted.json() as { id: string }
    const stream = await eventStream(`${server}/__presmium/presmium.assistant/tasks/${id}/events`, headers)
    for (;;) {
      const event = await stream.next('message', 60_000) as AgentEvent
      if (event.type === 'review') return { id, review: event, stream }
      if (event.type === 'error' || event.type === 'done') throw new Error(`no review: ${JSON.stringify(event)}`)
    }
  }

  beforeAll(async () => {
    dir = workspace('review', {
      // deltabox's review off: the assistant's own git review.
      'presmium.workspace.yaml': 'title: 审阅的路径\nsettings:\n  presmium.workspace:\n    plugins: [\'@presmium/slidev-addon-assistant\']\n  presmium.deltabox:\n    review: false\n',
      'intro/lecture.md': LECTURE,
    }, { '@presmium/slidev-addon-assistant': PACKAGE })
    running = presmium(['serve', '--port', '0'], { cwd: dir, env: env({ PRESMIUM_AGENT_COMMAND: AGENT_COMMAND, PRESMIUM_AGENT_PROVIDER: 'Test Provider', SCRIPTED_AGENT_LOG: log(), XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache` }) })
    server = (await running.wait(/^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await running?.stop()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, log()]) if (path) rmSync(path, { recursive: true, force: true })
  })

  it('is in the review: rejecting all takes it away; accepting commits it', async () => {
    const rejected = await untilReview('#append ..notes.md 两个点开头的笔记')
    try {
      expect(rejected.review.engine).toBe('git')
      expect(rejected.review.changes.map(c => c.path)).toEqual(['intro/..notes.md'])
      // Written in the document, so without asking.
      expect(agentLog(log()).filter(e => e.event === 'permission')).toEqual([])
      expect(existsSync(join(dir, 'intro/..notes.md'))).toBe(true)
      expect((await route(`tasks/${rejected.id}/review`, { accept: false })).status).toBe(204)
      expect(await rejected.stream.next('message', 60_000)).toMatchObject({ type: 'done' })
      expect(existsSync(join(dir, 'intro/..notes.md'))).toBe(false)
    } finally {
      rejected.stream.close()
    }

    const accepted = await untilReview('#append ..notes.md 两个点开头的笔记')
    try {
      expect((await route(`tasks/${accepted.id}/review`, { accept: true })).status).toBe(204)
      const done = await accepted.stream.next('message', 60_000) as Extract<AgentEvent, { type: 'done' }>
      expect(done.revision).toBeTruthy()
      expect(git(dir, ['show', '--name-only', '--format=', done.revision!]).trim()).toBe('intro/..notes.md')
      expect(readFileSync(join(dir, 'intro/..notes.md'), 'utf8')).toBe('两个点开头的笔记\n')
    } finally {
      accepted.stream.close()
    }
  }, 120_000)

  it('outside the document, a file of that name is the owner\'s to allow: refused, it is not written', async () => {
    const window = await eventStream(`${server}/__presmium/presmium.server/control?window=owner&document=intro`)
    try {
      const asking = window.next('approval', 60_000).then(async (asked) => {
        expect(asked.request).toMatchObject({ kind: 'write', scope: 'workspace' })
        await fetch(`${server}/__presmium/presmium.server/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ window: 'owner', type: 'answer', id: asked.id, allow: false }) })
      })
      const { events } = await chat('#append ../..notes.md 文稿之外的笔记')
      await asking
      expect(events.at(-1)).toEqual({ type: 'done' })
      expect(agentLog(log()).filter(e => e.event === 'permission').at(-1)).toMatchObject({ allowed: false, file: join(dir, '..notes.md') })
      expect(existsSync(join(dir, '..notes.md'))).toBe(false)
    } finally {
      window.close()
    }
  }, 120_000)
})
