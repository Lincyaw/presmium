// SHARED mode (D13) on one machine: `presmium serve` with a login proxy's secret, `presmium gateway` and
// `presmium agent-host`, each a process of its own. The model access (a Messages-compatible service the
// test runs, PRESMIUM_MODEL_URL, _KEY, _PROVIDER=Test Provider) is in the gateway's environment only.
// Before a reader asks, the panel's `info` names Test Provider; the reader's question is answered by the
// bundled DeepSeek Harness in agent-host, which reads the section through Presmium's MCP (via the
// gateway) and gets to the model through the gateway's proxy with its session's token: the model service
// receives the operator's key, the agent's environment holds the session's token and nothing else of
// worth, and once the session ended its token is refused. Then D1, D2 (default `compile: approve`): an
// editor's MCP token calls run_code through the gateway; the approval is on the owner console only, the
// editor's answer is refused, the owner's allows it and the code runs in agent-host; with `compile: off`
// there is no run_code. An editor's agent's build goes to agent-host's state directory, outside the document,
// and the MCP names it there (F-51).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fakeModel } from './fixtures/fake-model.ts'
import type { FakeModel } from './fixtures/fake-model.ts'
import { descendants, env, eventStream, FIXTURES, freePort, PACKAGE, presmium, processInfo, raw, ROOT, workspace } from './helpers.ts'
import type { EventStream, Running } from './helpers.ts'

const CONFIG = (compile: string) => `title: 助手
members:
  owners: [owner@test]
  editors: [editor@test]
settings:
  presmium.workspace:
    plugins: ['@presmium/slidev-addon-assistant', '@presmium/slidev-addon-exec', 'presmium-fixture-runtime', '@presmium/render-notebook']
  # These cases check the process that runs the code (agent-host), not the process sandbox.
  presmium.deltabox:
    sandbox: false
  presmium.exec:
    compile: ${compile}
`

const LECTURE = `---
title: 共享模式中的助手
plugins:
  - '@presmium/slidev-addon-exec'
---

(merge)=
## 合并规则

每一轮合并出现次数最多的一对。

\`\`\`{code} python
:run: live
import os
with open(f'/proc/{os.getppid()}/cmdline') as parent:
    print('PARENT ' + parent.read().replace('\\0', ' '))
\`\`\`
`

const SECRETS = { proxy: 'proxy-secret-c41d', gateway: 'gateway-token-8e2a', agentHost: 'agent-host-token-5b97', model: 'model-key-73f0' }
/** Variables the agent's environment may hold in SHARED mode: the basic ones, its model proxy and token, DeepSeek Harness's own. */
const ALLOWED = /^(?:PATH|HOME|LANG|LC_\w+|TZ|TMPDIR|DEEPSEEK_BASE_URL|DEEPSEEK_API_KEY|DSH_TELEMETRY_MODE|DSH_HOME)$/

let dir: string
let model: FakeModel
let agentHost: Running
let gateway: Running
let serve: Running
let serveUrl: string
let servePort: number
let gatewayUrl: string

/** The headers the login proxy adds for a member on the site's host name (or the console's). */
const as = (email: string, host: 'site' | 'console' = 'site', document = 'doc') => ({
  'Host': `${host}.test:${servePort}`,
  'X-Presmium-Proxy-Secret': SECRETS.proxy,
  'X-Forwarded-Email': email,
  ...host === 'site' ? { 'Presmium-Document': document } : {},
})

async function startServe(): Promise<void> {
  serve = presmium(['serve', '--port', String(servePort)], { cwd: dir, env: env({
    XDG_STATE_HOME: join(dir, '..', `${dir.split('/').at(-1)}-state`),
    PRESMIUM_PROXY_SECRET: SECRETS.proxy,
    PRESMIUM_GATEWAY_URL: gatewayUrl,
    PRESMIUM_GATEWAY_TOKEN: SECRETS.gateway,
    PRESMIUM_AGENT_HOST_URL: (await agentHostUrl)!,
    PRESMIUM_AGENT_HOST_TOKEN: SECRETS.agentHost,
    PRESMIUM_CONSOLE_HOST: 'console.test',
  }) })
  serveUrl = (await serve.wait(/^serve {2}(http\S+)$/m))[1]!
}

let agentHostUrl: Promise<string>

/** Follows a task's events (SSE) until its terminal one. */
async function untilEnd(stream: EventStream): Promise<Record<string, any>[]> {
  const seen: Record<string, any>[] = []
  for (;;) {
    const event = await stream.next('message', 120_000)
    seen.push(event)
    if (event.type === 'done' || event.type === 'error') return seen
  }
}

beforeAll(async () => {
  model = await fakeModel([
    { tool: 'mcp__presmium__get_section', input: { section: 'merge' } },
    { text: '每一轮合并出现次数最多的一对，见[合并规则](presmium://sections/merge)。' },
  ])
  dir = workspace('shared', { 'presmium.workspace.yaml': CONFIG('approve'), 'doc/lecture.md': LECTURE }, {
    '@presmium/slidev-addon-assistant': PACKAGE,
    '@presmium/slidev-addon-exec': join(ROOT, 'packages/addon-exec'),
    'presmium-fixture-runtime': join(FIXTURES, 'runtime-plugin'),
    '@presmium/render-notebook': join(ROOT, 'packages/render-notebook'),
  })
  const state = join(dir, '..', `${dir.split('/').at(-1)}-state`)
  agentHost = presmium(['agent-host', '--port', '0'], { cwd: dir, env: env({ XDG_STATE_HOME: state, XDG_CACHE_HOME: join(state, 'cache'), PRESMIUM_AGENT_HOST_TOKEN: SECRETS.agentHost }) })
  agentHostUrl = agentHost.wait(/^agent-host {2}(http\S+)$/m).then(m => m[1]!)
  // serve names the gateway's address in its tokens, and the gateway serve's: their ports come first.
  const gatewayPort = await freePort()
  servePort = await freePort()
  gatewayUrl = `http://127.0.0.1:${gatewayPort}`
  await startServe()
  gateway = presmium(['gateway', '.', '--serve', serveUrl, '--port', String(gatewayPort), '--operator-dir', join(state, 'operator')], { cwd: dir, env: env({
    PRESMIUM_GATEWAY_TOKEN: SECRETS.gateway,
    PRESMIUM_MODEL_URL: model.url,
    PRESMIUM_MODEL_KEY: SECRETS.model,
    PRESMIUM_MODEL_PROVIDER: 'Test Provider',
  }) })
  await gateway.wait(/^gateway {2}(http\S+)$/m)
}, 300_000)

afterAll(async () => {
  model?.release()
  await serve?.stop()
  await Promise.all([gateway?.stop(), agentHost?.stop()])
  await model?.close()
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    rmSync(join(dir, '..', `${dir.split('/').at(-1)}-state`), { recursive: true, force: true })
  }
}, 120_000)

describe('a reader\'s question in SHARED mode', () => {
  it('names the gateway\'s provider before the question; the answer reaches the reader; the model gets the operator\'s key, the agent only its session\'s token, refused once the session ended', async () => {
    // Only the gateway has the model access.
    expect(Object.keys(processInfo(serve.child.pid!)!.environ).filter(name => name.startsWith('PRESMIUM_MODEL_'))).toEqual([])
    expect(Object.keys(processInfo(agentHost.child.pid!)!.environ).filter(name => name.startsWith('PRESMIUM_MODEL_'))).toEqual([])

    const info = await raw(`${serveUrl}/__presmium/presmium.assistant/info`, { headers: as('reader@test') })
    expect(info.status, info.text).toBe(200)
    expect(info.json()).toEqual({ provider: 'Test Provider', kinds: ['question'] })

    model.hold()
    const submitted = await raw(`${serveUrl}/__presmium/presmium.assistant/tasks`, { headers: as('reader@test'), json: { kind: 'question', prompt: '合并的是哪一对？', context: { document: 'doc', section: 'merge' } } })
    expect(submitted.status, submitted.text).toBe(201)
    const id = submitted.json<{ id: string }>().id
    const stream = await eventStream(`${serveUrl}/__presmium/presmium.assistant/tasks/${id}/events`, as('reader@test'))
    const events = untilEnd(stream)

    // While the model holds its first answer: DeepSeek Harness runs in agent-host with the session's token alone.
    await expect.poll(() => model.received.length, { timeout: 120_000 }).toBeGreaterThan(0)
    const agent = descendants(agentHost.child.pid!).find(p => p.cmdline.includes('--profile acp'))!
    expect(agent.cmdline).toContain('presmium-tutor.cordis.yml')
    const seen = processInfo(agent.pid)!.environ
    expect(Object.keys(seen).filter(name => !ALLOWED.test(name))).toEqual([])
    const sessionToken = seen.DEEPSEEK_API_KEY!
    expect(sessionToken).toBeTruthy()
    for (const secret of Object.values(SECRETS)) expect(JSON.stringify(seen)).not.toContain(secret)
    model.release()

    const all = await events
    stream.close()
    expect(all.at(-1)).toEqual({ type: 'done' })
    const answer = all.find(e => e.type === 'message')!
    expect(answer.text).toContain('[合并规则](presmium://sections/merge)')
    expect(answer.citations).toEqual([{ label: '合并规则', section: 'merge' }])
    // The agent read the section through Presmium's MCP, via the gateway.
    expect(all.filter(e => e.type === 'progress').map(e => [e.tool, e.status])).toEqual([['mcp__presmium__get_section', 'running'], ['mcp__presmium__get_section', 'completed']])
    expect(model.received[1]!.body.messages.at(-1).content.some((block: { type: string, content?: unknown }) => block.type === 'tool_result' && JSON.stringify(block.content).includes('合并规则'))).toBe(true)

    // The model service got the operator's key, never the session's token.
    expect(model.received.map(r => r.headers['x-api-key'])).toEqual(model.received.map(() => SECRETS.model))
    expect(JSON.stringify(model.received.map(r => r.headers))).not.toContain(sessionToken)
    // The session ended: its token is refused by the gateway's model proxy.
    const after = await raw(`${gatewayUrl}/presmium.assistant/model/v1/messages`, { headers: { Authorization: `Bearer ${sessionToken}` }, json: { model: 'x', max_tokens: 1, messages: [] } })
    expect(after.status).toBe(401)
  }, 300_000)
})

/** An editor's agent's MCP client: its token from serve, to the gateway's MCP. */
async function editorClient(): Promise<Client> {
  const issued = await raw(`${serveUrl}/__presmium/fixture.runtime/token`, { method: 'POST', headers: as('editor@test') })
  expect(issued.status, issued.text).toBe(200)
  const { url, token } = issued.json<{ url: string, token: string }>()
  expect(url).toBe(`${gatewayUrl}/mcp`)
  const client = new Client({ name: 'editor-agent', version: '0.1.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  return client
}

describe('run_code of an editor\'s agent in SHARED mode (D1, D2)', () => {
  it('compile: approve: only the owner console is asked; the editor\'s answer is refused; the owner allows it there and the code runs in agent-host', async () => {
    const console = await eventStream(`${serveUrl}/__presmium/presmium.server/control?window=console&console=1`, as('owner@test', 'console'))
    const ownerSite = await eventStream(`${serveUrl}/__presmium/presmium.server/control?window=owner&document=doc`, as('owner@test'))
    const editorSite = await eventStream(`${serveUrl}/__presmium/presmium.server/control?window=editor&document=doc`, as('editor@test'))
    const client = await editorClient()
    try {
      const section = JSON.parse(((await client.callTool({ name: 'get_section', arguments: { section: 'merge' } })).content as { text: string }[])[0]!.text)
      const block = section.blocks.find((b: { kind: string }) => b.kind === 'code').id as string
      const ran = client.callTool({ name: 'run_code', arguments: { section: 'merge', block } })

      const asked = await console.next('approval') as { id: string, request: Record<string, unknown> }
      expect(asked.request).toMatchObject({ kind: 'operate', scope: 'workspace', from: 'presmium.mcp' })
      expect(await ownerSite.next('pending')).toMatchObject({ count: 1 })
      expect(editorSite.events.filter(e => e.event === 'approval')).toEqual([])
      expect(ownerSite.events.filter(e => e.event === 'approval')).toEqual([])
      // The editor answers it on the site: refused.
      const byEditor = await raw(`${serveUrl}/__presmium/presmium.server/control`, { headers: as('editor@test'), json: { window: 'editor', type: 'answer', id: asked.id, allow: true } })
      expect(byEditor.status).toBe(403)
      // The owner allows it on the console.
      const byOwner = await raw(`${serveUrl}/__presmium/presmium.server/control`, {
        headers: { ...as('owner@test', 'console'), 'Origin': `http://console.test:${servePort}`, 'Presmium-Console': '1' },
        json: { window: 'console', type: 'answer', id: asked.id, allow: true },
      })
      expect(byOwner.status, byOwner.text).toBe(200)

      const result = await ran
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
      const output = JSON.parse((result.content as { text: string }[])[0]!.text) as { stdout: string }
      expect(output.stdout).toMatch(/^PARENT .*agent-host/m)
    } finally {
      await client.close()
      for (const stream of [console, ownerSite, editorSite]) stream.close()
    }
  }, 300_000)

  it('compile: off: the editor\'s agent has no run_code', async () => {
    await serve.stop()
    writeFileSync(join(dir, 'presmium.workspace.yaml'), readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8').replace('compile: approve', 'compile: off'))
    await startServe()
    const client = await editorClient()
    try {
      const { tools } = await client.listTools()
      expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(['get_section', 'navigate', 'build']))
      expect(tools.map(t => t.name)).not.toContain('run_code')
    } finally {
      await client.close()
    }
  }, 300_000)
})

describe('build of an editor\'s agent in SHARED mode (F-51)', () => {
  it('builds in agent-host\'s state directory, outside the document, and names that directory', async () => {
    const editorSite = await eventStream(`${serveUrl}/__presmium/presmium.server/control?window=editor&document=doc`, as('editor@test'))
    const client = await editorClient()
    try {
      const built = client.callTool({ name: 'build', arguments: { to: ['notebook'] } })
      // A build is the editor's to allow, on the site.
      const asked = await editorSite.next('approval') as { id: string, request: Record<string, unknown> }
      expect(asked.request).toMatchObject({ kind: 'operate', from: 'presmium.mcp' })
      const answered = await raw(`${serveUrl}/__presmium/presmium.server/control`, { headers: as('editor@test'), json: { window: 'editor', type: 'answer', id: asked.id, allow: true } })
      expect(answered.status, answered.text).toBe(200)

      const result = await built
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
      const { outputs } = JSON.parse((result.content as { text: string }[])[0]!.text) as { outputs: { renderer: string, outDir: string }[] }
      expect(outputs.map(output => output.renderer)).toEqual(['notebook'])
      // The MCP names the directory relative to the document: it is agent-host's, and the document has no dist/.
      const outDir = resolve(dir, 'doc', outputs[0]!.outDir)
      expect(outDir.startsWith(join(dir, '..', `${dir.split('/').at(-1)}-state`, 'cache', 'presmium/agent-host/builds/'))).toBe(true)
      expect(existsSync(join(outDir, 'lecture.ipynb'))).toBe(true)
      expect(existsSync(join(dir, 'doc/dist'))).toBe(false)
    } finally {
      await client.close()
      editorSite.close()
    }
  }, 300_000)
})
