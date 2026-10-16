// The ACP client (WP-80, docs/architecture.md 4.8) in `presmium dev`, with the scripted test agent as the
// replacement runtime (PRESMIUM_AGENT_COMMAND): `session/new` gets this process's /mcp and a token
// MCP_ENDPOINT issued, with which the agent lists the tools; the token is refused once the task ended; the
// agent reads the section through get_section and answers citing it; a refused permission request reaches
// it as a refusal; cancelling a task reaches it as `session/cancel` and ends the task's events; the
// credentials of the parent's environment never reach it. Without model access or a replacement runtime,
// or with a replacement runtime but no provider, questions are unavailable and nothing starts.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@presmium/kernel'
import { AGENT_COMMAND, agentLog, call, descendants, dev, env, PACKAGE, taskEvents } from './helpers.ts'
import type { Running } from './helpers.ts'

const LECTURE = `---
title: 助手测试
plugins:
  - ${PACKAGE}
---

(merge)=
## 合并规则

每一轮合并出现次数最多的一对。

\`\`\`python
pairs = count(tokens)
\`\`\`

(more)=
## 第二节

更多内容。
`

const question = (prompt: string, section = 'merge') => ({ kind: 'question', prompt, context: { document: '', section } })

/** Submits a task and follows its events to the end. */
async function ask(server: string, body: Record<string, unknown>, onEvent?: (event: AgentEvent) => void): Promise<{ id: string, events: AgentEvent[] }> {
  const submitted = await call(server, 'tasks', { json: body })
  expect(submitted.status, JSON.stringify(submitted.json)).toBe(201)
  const id = submitted.json.id as string
  return { id, events: await taskEvents(`${server}/__presmium/presmium.assistant/tasks/${id}/events`, {}, onEvent) }
}

describe('the ACP client with the scripted agent', () => {
  let base: string
  let deck: string
  let log: string
  let running: Running | undefined
  let server: string

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'presmium-acp-'))
    deck = join(base, 'deck')
    log = join(base, 'agent.log')
    mkdirSync(deck)
    writeFileSync(join(deck, 'lecture.md'), LECTURE)
    ;({ running, server } = await dev(deck, env({
      XDG_STATE_HOME: join(base, 'state'),
      PRESMIUM_AGENT_COMMAND: AGENT_COMMAND,
      PRESMIUM_AGENT_PROVIDER: 'Test Provider',
      SCRIPTED_AGENT_LOG: log,
      // Credentials of the parent that the agent must not see.
      PRESMIUM_PROXY_SECRET: 'proxy-secret-1f3a',
      PRESMIUM_SPEECH_VOLCENGINE_APPID: 'speech-appid-7c2e',
      PRESMIUM_SPEECH_TEST_KEY: 'speech-key-9d41',
      DEEPSEEK_BASE_URL: 'http://127.0.0.1:9/elsewhere',
    })))
  }, 180_000)
  afterAll(async () => {
    await running?.stop()
    rmSync(base, { recursive: true, force: true })
  })

  it('gives the agent this process\'s /mcp with a token it lists the tools with, refused once the task ended; the answer cites the section get_section read; no credential of the parent reaches it', async () => {
    const before = await call(server, 'info')
    expect(before.json).toEqual({ provider: 'Test Provider', kinds: ['question'] })

    const progress: AgentEvent[] = []
    const { events } = await ask(server, question('这段代码做什么？'), event => event.type === 'progress' && progress.push(event))
    expect(events.at(-1)).toEqual({ type: 'done' })
    const answer = events.find(e => e.type === 'message') as Extract<AgentEvent, { type: 'message' }>
    expect(answer.text).toContain('[合并规则](presmium://sections/merge)')
    expect(answer.citations).toEqual([{ label: '合并规则', section: 'merge' }])
    expect(progress.map(e => (e as { status?: string }).status)).toEqual(['running', 'completed'])

    // session/new: this process's /mcp and a bearer token; the agent listed the tools with it (a tutor token: reading only).
    const opened = agentLog(log).find(e => e.event === 'session/new')!
    expect(opened.cwd).toBe(deck)
    const [mcp] = opened.mcpServers as { type: string, url: string, headers: { name: string, value: string }[] }[]
    expect(mcp).toMatchObject({ type: 'http', url: `${server}/mcp` })
    const token = /^Bearer (\S+)$/.exec(mcp!.headers.find(h => h.name === 'Authorization')!.value)![1]!
    const tools = agentLog(log).find(e => e.event === 'tools')!.names as string[]
    expect(tools).toEqual(expect.arrayContaining(['get_section', 'list_sections', 'search']))
    expect(tools).not.toContain('run_code')
    // The task ended: its token is refused.
    const after = await fetch(`${server}/mcp`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    expect(after.status).toBe(401)

    // The agent's environment: none of Presmium's variables, no credential of the parent, no model address.
    const { env: seen } = agentLog(log).find(e => e.event === 'start')!
    expect(Object.keys(seen).filter(name => name.startsWith('PRESMIUM_'))).toEqual([])
    expect(JSON.stringify(seen)).not.toContain('proxy-secret-1f3a')
    expect(JSON.stringify(seen)).not.toContain('speech-appid-7c2e')
    expect(JSON.stringify(seen)).not.toContain('speech-key-9d41')
    expect(seen.DEEPSEEK_BASE_URL).toBeUndefined()

    // Once an agent started, the panel names its runtime besides the provider.
    expect((await call(server, 'info')).json).toEqual({ provider: 'Test Provider', runtime: 'Scripted Agent 1.0.0', kinds: ['question'] })
  }, 120_000)

  it('refuses the agent\'s permission request of a question, and the agent hears the refusal', async () => {
    const { events } = await ask(server, question('#write notes.md'))
    expect(events.filter(e => e.type === 'message').map(e => (e as { text: string }).text)).toEqual(['permission: rejected'])
    expect(agentLog(log).filter(e => e.event === 'permission').at(-1)).toMatchObject({ allowed: false })
    expect(existsSync(join(deck, 'notes.md'))).toBe(false)
  }, 60_000)

  it('sends session/cancel when a running task is cancelled, and the task\'s events end', async () => {
    const submitted = await call(server, 'tasks', { json: question('#wait') })
    const id = submitted.json.id as string
    const events = taskEvents(`${server}/__presmium/presmium.assistant/tasks/${id}/events`)
    // The agent got the prompt and waits.
    await expect.poll(() => agentLog(log).some(e => e.event === 'session/prompt' && e.question === '#wait'), { timeout: 30_000 }).toBe(true)
    expect((await call(server, `tasks/${id}/cancel`, { method: 'POST' })).status).toBe(204)
    expect((await events).at(-1)).toEqual({ type: 'done' })
    expect(agentLog(log).some(e => e.event === 'session/cancel')).toBe(true)
  }, 60_000)
})

describe('without an agent runtime', () => {
  const cases: [string, Record<string, string>, RegExp][] = [
    ['neither model access nor a replacement runtime', {}, /the assistant is unavailable: no model access: set DEEPSEEK_API_KEY/],
    ['a replacement runtime without a provider', { PRESMIUM_AGENT_COMMAND: AGENT_COMMAND }, /the assistant is unavailable: a replacement runtime .* needs its model's provider/],
  ]
  for (const [name, extra, reason] of cases) {
    it(`questions are unavailable and nothing starts: ${name}`, async () => {
      const base = mkdtempSync(join(tmpdir(), 'presmium-acp-none-'))
      const log = join(base, 'agent.log')
      mkdirSync(join(base, 'deck'))
      writeFileSync(join(base, 'deck', 'lecture.md'), LECTURE)
      const { running, server } = await dev(join(base, 'deck'), env({ XDG_STATE_HOME: join(base, 'state'), SCRIPTED_AGENT_LOG: log, ...extra }))
      try {
        expect((await call(server, 'info')).json).toEqual({ kinds: [] })
        expect((await call(server, 'tasks', { json: question('有人吗？') })).status).toBe(503)
        await running.wait(reason, 10_000)
        expect(descendants(running.child.pid!).filter(p => /scripted-agent|dsh/.test(p.cmdline))).toEqual([])
        expect(agentLog(log)).toEqual([])
      } finally {
        await running.stop()
        rmSync(base, { recursive: true, force: true })
      }
    }, 120_000)
  }
})
