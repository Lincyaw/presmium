import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@presmium/cli/testing'
import type { FakeModel } from '@presmium/cli/testing'
import { connectPresmiumMcp } from '@presmium/mcp/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, ROOT, testHome, toolResults, turns } from './harness.ts'
import type { Service, TestHome } from './harness.ts'

const LECTURE = '---\ntitle: 确认\nplugins:\n  - \'@presmium/slidev-addon-exec\'\n---\n\n# 确认\n\n(first)=\n## 第一节\n\n先算六乘七。\n\n```{code} python\n:run:\nprint(6 * 7)\n```\n'
const RUN = { tool: 'presmium__run_code', input: { section: 'first', block: 'code-1' } }
const FULL_ACCESS = join(FIXTURES, 'full-access.patch.yml')

describe('[gate] Presmium\'s approval policy in DeepSeek Harness', () => {
  let home: TestHome
  const services: Record<'ask' | 'off' | 'allow', Service> = {} as never
  const dirs: Record<string, string> = {}
  const models: FakeModel[] = []
  const model = async (script: Parameters<typeof fakeModel>[0]) => {
    const made = await fakeModel(script)
    models.push(made)
    return made
  }
  beforeAll(async () => {
    home = testHome('policy')
    await Promise.all((['ask', 'off', 'allow'] as const).map(async (policy) => {
      dirs[policy] = home.workspace(`policy-${policy}`, {
        'presmium.workspace.yaml': `title: 确认\napprovals: { operate: ${policy} }\n`,
        'lecture.md': LECTURE,
      }, { '@presmium/slidev-addon-exec': join(ROOT, 'packages/addon-exec') }).dir
      services[policy] = await home.serve(dirs[policy]!)
    }))
  }, 240_000)
  afterAll(async () => {
    for (const made of models) await made.close()
    await home?.close()
  })

  it('[gate] ask: the operation waits for DeepSeek Harness\'s approval, which a headless run has no one to answer: refused', async () => {
    const scripted = await model([RUN, { text: '未能运行。' }])
    const run = home.headless(dirs.ask!, '运行第一节的代码。', { model: scripted, env: services.ask.env })
    expect(await run.exited, run.output()).toBe(0)
    const [result] = toolResults(scripted)
    expect(result).toMatch(/requires approval, but no approval channel is available/)
    expect(result).not.toContain('42')
  }, 180_000)

  it('[gate] off: the kind\'s tools are offered neither to the model nor over MCP', async () => {
    const scripted = await model([{ text: '好。' }])
    const run = home.headless(dirs.off!, '有哪些工具？', { model: scripted, env: services.off.env })
    expect(await run.exited, run.output()).toBe(0)
    const offered = turns(scripted)[0]!.tools.map((tool: { name: string }) => tool.name)
    expect(offered).toContain('presmium__list_sections')
    for (const name of ['run_code', 'build', 'navigate']) expect(offered).not.toContain(`presmium__${name}`)
    const mcp = await connectPresmiumMcp(`${services.off.url}/mcp`, services.off.mcpToken(), 'presmium-test')
    try {
      const listed = (await mcp.tools()).map(tool => tool.name)
      expect(listed).toContain('list_sections')
      expect(listed).not.toContain('run_code')
    } finally {
      await mcp.close()
    }
  }, 180_000)

  it('[gate] allow: the operation runs without asking, in the full-access mode too', async () => {
    const scripted = await model([RUN, { text: '算出来了。' }])
    const run = home.headless(dirs.allow!, '运行第一节的代码。', { model: scripted, env: services.allow.env, patches: [FULL_ACCESS] })
    expect(await run.exited, run.output()).toBe(0)
    expect(toolResults(scripted)[0]).toMatch(/\\"stdout\\": \\"42\\\\n\\"/)
  }, 180_000)

  it('[gate] a session token is the host\'s to ask: its operations ask no window, bound to its document; only the service token gets one', async () => {
    const tokens = `${services.ask.url}/__presmium/presmium.server/tokens`
    const issue = (headers: Record<string, string>) => fetch(tokens, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ document: '', session: 'session-96b' }) })
    expect((await issue({})).status).toBe(401)
    const issued = await issue({ Authorization: `Bearer ${services.ask.token}` })
    expect(issued.status).toBe(201)
    const grant = await issued.json() as { url: string, token: string }
    const session = await connectPresmiumMcp(grant.url, grant.token, 'presmium-test')
    try {
      const listed = (await session.tools()).find(tool => tool.name === 'run_code')
      expect(listed).toMatchObject({ kind: 'operate', approval: 'ask' })
      const ran = await session.call('run_code', { section: 'first', block: 'code-1' })
      expect(ran.text).toMatch(/"stdout": "42\\n"/)
      expect((await session.call('list_sections', { document: 'elsewhere' })).text).toContain('this token is for the document ""')
      await fetch(tokens, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${services.ask.token}` }, body: JSON.stringify({ session: 'session-96b' }) })
      await expect(session.call('list_sections', {})).rejects.toThrow()
    } finally {
      await session.close().catch(() => undefined)
    }
  }, 120_000)

  it('[gate] the operator directory: writing there is refused in the full-access mode too', async () => {
    const planted = join(home.dir, 'state', 'presmium', 'operator', 'any-workspace', 'consent.json')
    const scripted = await model([{ tool: 'write', input: { file_path: planted, content: '{"granted": true}\n' } }, { text: '没有写成。' }])
    const run = home.headless(dirs.ask!, '写一个文件。', { model: scripted, env: services.ask.env, patches: [FULL_ACCESS] })
    expect(await run.exited, run.output()).toBe(0)
    expect(toolResults(scripted)[0]).toContain('the operator directory')
    expect(existsSync(planted)).toBe(false)
  }, 180_000)
})
