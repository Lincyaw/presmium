import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@presmium/kernel'
import { AGENT_COMMAND, agentLog, call, descendants, dev, env, PACKAGE, presmium, taskEvents, workspace } from './helpers.ts'
import type { Running } from './helpers.ts'

const LECTURE = `---
title: 助手测试
---

# 助手测试

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

const chat = (prompt: string, section = 'merge') => ({ kind: 'chat', prompt, context: { document: '', section } })

async function submit(server: string, body: Record<string, unknown>, onEvent?: (event: AgentEvent) => void): Promise<{ id: string, events: AgentEvent[] }> {
  const submitted = await call(server, 'tasks', { json: body })
  expect(submitted.status, JSON.stringify(submitted.json)).toBe(201)
  const id = submitted.json.id as string
  return { id, events: await taskEvents(`${server}/__presmium/presmium.assistant/tasks/${id}/events`, {}, onEvent) }
}

describe('the ACP client with the scripted agent', () => {
  let dir: string
  let log: string
  let running: Running | undefined
  let server: string

  beforeAll(async () => {
    dir = workspace('acp', {
      'presmium.workspace.yaml': `title: 助手测试\napprovals: { write: off }\nsettings:\n  presmium.workspace:\n    plugins: ['@presmium/slidev-addon-assistant']\n  presmium.assistant:\n    review: auto\n`,
      'lecture.md': LECTURE,
    }, { '@presmium/slidev-addon-assistant': PACKAGE })
    log = `${dir}.agent.log`
    running = presmium(['serve', '--port', '0'], {
      cwd: dir,
      env: env({
        XDG_STATE_HOME: `${dir}.state`,
        XDG_CACHE_HOME: `${dir}.cache`,
        XDG_CONFIG_HOME: `${dir}.config`,
        PRESMIUM_AGENT_COMMAND: AGENT_COMMAND,
        PRESMIUM_AGENT_PROVIDER: 'Test Provider',
        SCRIPTED_AGENT_LOG: log,
        PRESMIUM_SPEECH_VOLCENGINE_APPID: 'speech-appid-7c2e',
        PRESMIUM_SPEECH_TEST_KEY: 'speech-key-9d41',
        DEEPSEEK_BASE_URL: 'http://127.0.0.1:9/elsewhere',
      }),
    })
    server = (await running.wait(/^serve {2}(http\S+)$/m))[1]!
  }, 180_000)
  afterAll(async () => {
    await running?.stop()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.config`, log]) if (path) rmSync(path, { recursive: true, force: true })
  })

  it('gives the agent this process\'s /mcp with a token it lists the tools with, refused once the task ended; the answer cites the section get_section read; no credential of the parent reaches it', async () => {
    await running!.wait(/the assistant is available: provider Test Provider, the replacement runtime \S+ \(from PRESMIUM_AGENT_COMMAND\)/, 60_000)
    const before = await call(server, 'info')
    expect(before.json).toEqual({ provider: 'Test Provider', source: 'environment', kinds: ['annotations', 'chat', 'transcript'], changes: true })

    const progress: AgentEvent[] = []
    const { events } = await submit(server, chat('#read 这段代码做什么？'), event => event.type === 'progress' && progress.push(event))
    expect(events.at(-1)).toEqual({ type: 'done' })
    const answer = events.find(e => e.type === 'message') as Extract<AgentEvent, { type: 'message' }>
    expect(answer.text).toContain('[合并规则](presmium://sections/merge)')
    expect(answer.citations).toEqual([{ label: '合并规则', section: 'merge' }])
    expect(progress.map(e => (e as { status?: string }).status)).toEqual(['running', 'completed'])

    const opened = agentLog(log).find(e => e.event === 'session/new')!
    const [mcp] = opened.mcpServers as { type: string, url: string, headers: { name: string, value: string }[] }[]
    expect(mcp).toMatchObject({ type: 'http', url: `${server}/mcp` })
    const token = /^Bearer (\S+)$/.exec(mcp!.headers.find(h => h.name === 'Authorization')!.value)![1]!
    const tools = agentLog(log).find(e => e.event === 'tools')!.names as string[]
    expect(tools).toEqual(expect.arrayContaining(['get_section', 'list_sections', 'search', 'run_code']))
    const after = await fetch(`${server}/mcp`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    expect(after.status).toBe(401)

    const { env: seen } = agentLog(log).find(e => e.event === 'start')!
    expect(Object.keys(seen).filter(name => name.startsWith('PRESMIUM_'))).toEqual([])
    expect(JSON.stringify(seen)).not.toContain('speech-appid-7c2e')
    expect(JSON.stringify(seen)).not.toContain('speech-key-9d41')
    expect(seen.DEEPSEEK_BASE_URL).toBeUndefined()

    expect((await call(server, 'info')).json).toMatchObject({ provider: 'Test Provider', runtime: 'Scripted Agent 1.0.0' })
    expect((await fetch(`${server}/__presmium/presmium.assistant/info`)).headers.get('cache-control')).toBe('no-store')
  }, 120_000)

  it('refuses the agent\'s request to write outside the document, and the agent hears the refusal', async () => {
    const outside = join(dirname(dir), `${dir.split('/').at(-1)}-outside.md`)
    const { events } = await submit(server, chat(`#write ../${outside.split('/').at(-1)}`))
    expect(events.filter(e => e.type === 'message').map(e => (e as { text: string }).text)).toEqual(['permission: rejected'])
    expect(agentLog(log).filter(e => e.event === 'permission').at(-1)).toMatchObject({ allowed: false })
    expect(existsSync(outside)).toBe(false)
  }, 60_000)

  it('sends session/cancel when a running task is cancelled, and the task\'s events end', async () => {
    const submitted = await call(server, 'tasks', { json: chat('#wait') })
    const id = submitted.json.id as string
    const events = taskEvents(`${server}/__presmium/presmium.assistant/tasks/${id}/events`)
    await expect.poll(() => agentLog(log).some(e => e.event === 'session/prompt' && e.question === '#wait'), { timeout: 30_000 }).toBe(true)
    expect((await call(server, `tasks/${id}/cancel`, { method: 'POST' })).status).toBe(204)
    expect((await events).at(-1)).toEqual({ type: 'done' })
    expect(agentLog(log).some(e => e.event === 'session/cancel')).toBe(true)
  }, 60_000)
})

function withoutHarness(base: string): string {
  const copy = join(base, 'assistant')
  for (const part of ['src', 'dsh', 'package.json']) cpSync(join(PACKAGE, part), join(copy, part), { recursive: true })
  for (const name of ['@presmium/kernel', '@presmium/host', '@agentclientprotocol/sdk', 'vue']) {
    mkdirSync(dirname(join(copy, 'node_modules', name)), { recursive: true })
    symlinkSync(realpathSync(join(PACKAGE, 'node_modules', name)), join(copy, 'node_modules', name), 'junction')
  }
  return copy
}

describe('without an agent runtime', () => {
  const cases: [string, Record<string, string>, RegExp, Record<string, unknown>, ((base: string) => string)?][] = [
    ['neither model access nor a replacement runtime', {}, /the assistant is unavailable: no model access: fill in the model settings in the page, or set DEEPSEEK_API_KEY/, { code: 'model' }],
    ['a part of the PRESMIUM_MODEL_* variables', { PRESMIUM_MODEL_URL: 'http://127.0.0.1:9/v1' }, /the assistant is unavailable: no model access: .*\(PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY, PRESMIUM_MODEL_PROVIDER go together; PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER are missing\)/, { code: 'model', variables: ['PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] }],
    ['a replacement runtime without a provider', { PRESMIUM_AGENT_COMMAND: AGENT_COMMAND }, /the assistant is unavailable: a replacement runtime .* needs its model's provider/, { code: 'provider' }],
    ['model access, but the bundled DeepSeek Harness is not installed', { DEEPSEEK_API_KEY: 'key-not-used', NODE_PATH: '' }, /the assistant is unavailable: the bundled DeepSeek Harness is not installed/, { code: 'harness' }, withoutHarness],
  ]
  for (const [name, extra, reason, missing, plugin] of cases) {
    it(`says what to set and starts nothing: ${name}`, async () => {
      const base = mkdtempSync(join(tmpdir(), 'presmium-acp-none-'))
      const log = join(base, 'agent.log')
      mkdirSync(join(base, 'deck'))
      writeFileSync(join(base, 'deck', 'lecture.md'), LECTURE.replace('title: 助手测试\n', `title: 助手测试\nplugins:\n  - ${plugin?.(base) ?? PACKAGE}\n`))
      const { running, server } = await dev(join(base, 'deck'), env({ XDG_STATE_HOME: join(base, 'state'), XDG_CONFIG_HOME: join(base, 'config'), SCRIPTED_AGENT_LOG: log, ...extra }))
      try {
        await running.wait(reason, 10_000)
        const info = (await call(server, 'info')).json
        expect(info).toMatchObject({ kinds: [], changes: false })
        expect(info.missing).toEqual(missing)
        expect((await call(server, 'tasks', { json: chat('有人吗？') })).status).toBe(503)
        expect(descendants(running.child.pid!).filter(p => /scripted-agent|dsh/.test(p.cmdline))).toEqual([])
        expect(agentLog(log)).toEqual([])
      } finally {
        await running.stop()
        rmSync(base, { recursive: true, force: true })
      }
    }, 120_000)
  }
})
