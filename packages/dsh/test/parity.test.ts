import { join } from 'node:path'
import { fakeModel } from '@lincyaw/cli/testing'
import type { FakeModel } from '@lincyaw/cli/testing'
import { connectPresmiumMcp } from '@lincyaw/mcp/client'
import type { PresmiumMcpClient } from '@lincyaw/mcp/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, ROOT, testHome, toolResults, turns } from './harness.ts'
import type { Service, TestHome, Workspace } from './harness.ts'

const LECTURE = `---
title: 一张工具表
plugins:
  - '@lincyaw/slidev-addon-exec'
  - presmium-fixture-dsh
---

# 一张工具表

(first)=
## 第一节

讲解：先算六乘七。

\`\`\`{code} python
:run:
print(6 * 7)
\`\`\`

(second)=
## 第二节

第二节的正文。
`

interface ControlWindow {
  next(event: string, timeoutMs?: number): Promise<Record<string, any>>
  report(body: Record<string, unknown>): Promise<number>
  close(): void
}

const parsed = (text: string) => JSON.parse(text) as Record<string, any>

describe('[gate] one tool table for MCP and DeepSeek Harness', () => {
  let home: TestHome
  let ws: Workspace
  let service: Service
  let mcp: PresmiumMcpClient
  const models: FakeModel[] = []
  const model = async (script: Parameters<typeof fakeModel>[0]) => {
    const made = await fakeModel(script)
    models.push(made)
    return made
  }
  beforeAll(async () => {
    home = testHome('parity')
    ws = home.workspace('parity', { 'presmium.workspace.yaml': 'title: 一张工具表\napprovals: { operate: allow }\n', 'lecture.md': LECTURE }, {
      '@lincyaw/slidev-addon-exec': join(ROOT, 'packages/addon-exec'),
      'presmium-fixture-dsh': join(FIXTURES, 'plugin'),
    })
    service = await home.serve(ws.dir)
    mcp = await connectPresmiumMcp(`${service.url}/mcp`, service.mcpToken(), 'presmium-test')
  }, 240_000)
  afterAll(async () => {
    await mcp?.close()
    for (const made of models) await made.close()
    await home?.close()
  })

  it('[gate] MCP lists the tools DeepSeek Harness offers the model, with the same input schemas', async () => {
    const scripted = await model([{ text: '好。' }])
    const run = home.headless(ws.dir, '有哪些工具？', { model: scripted, env: service.env })
    expect(await run.exited, run.output()).toBe(0)
    const offered = (turns(scripted)[0]!.tools as { name: string, input_schema: unknown }[])
      .filter(tool => tool.name.startsWith('presmium__'))
      .map(tool => ({ name: tool.name.slice('presmium__'.length), schema: tool.input_schema }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const listed = (await mcp.tools()).map(tool => ({ name: tool.name, schema: tool.inputSchema })).sort((a, b) => a.name.localeCompare(b.name))
    expect(offered).toEqual(listed)
    expect(listed.map(tool => tool.name)).toEqual(expect.arrayContaining(['fixture_note', 'get_focus', 'list_sections', 'run_code', 'navigate']))
  }, 180_000)

  it('[gate] a focus the workbench reports is the same through presmium://focus, get_focus and the session\'s context, its excerpt from the file', async () => {
    const reported = await fetch(`${service.url}/__presmium/presmium.server/focus`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${service.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: '', focus: [
        { id: 'pick-1', from: 'web', section: 'first', block: 'code-1', quote: '6 * 7' },
        { id: 'lines-1', from: 'source', source: { file: 'lecture.md', startLine: 13, endLine: 13 } },
      ] }),
    })
    expect(reported.status).toBe(200)
    const resource = await mcp.read('presmium://focus') as Record<string, any>
    const tool = parsed((await mcp.call('get_focus', {})).text)
    expect(tool).toEqual(resource)
    const lines = ws.read('lecture.md').split('\n')
    const [pick, selected] = tool.focus as Record<string, any>[]
    expect(pick).toMatchObject({ id: 'pick-1', from: 'web', document: '', section: 'first', block: 'code-1', quote: '6 * 7', source: { file: 'lecture.md' } })
    expect(pick!.excerpt).toBe(lines.slice(pick!.source.startLine - 1, pick!.source.endLine).join('\n'))
    expect(pick!.excerpt).toContain('print(6 * 7)')
    expect(selected).toMatchObject({ id: 'lines-1', from: 'source', section: 'first', block: expect.any(String), excerpt: '讲解：先算六乘七。' })
    const scripted = await model([{ text: '好。' }])
    const run = home.headless(ws.dir, '看看我指的地方。', { model: scripted, env: service.env })
    expect(await run.exited, run.output()).toBe(0)
    const context = JSON.parse(`"${/<presmium-document>[\s\S]*?Focus, as presmium__get_focus answers: (.*?)\\n(?:Browser feedback|<\/presmium-document>)/.exec(JSON.stringify(turns(scripted)[0]!.messages))![1]}"`) as string
    expect(JSON.parse(context)).toEqual(tool)
  }, 180_000)

  it('[gate] with operate allowed, the agent lists the sections, reads one, runs its code and moves the presentation, which get_position reports', async () => {
    const { controlWindow } = await import(join(ROOT, 'packages/mcp/test/client.ts')) as { controlWindow(url: string, id: string): Promise<ControlWindow> }
    const page = await controlWindow(service.url, 'dsh-page')
    try {
      await page.next('ready')
      expect(await page.report({ position: { slide: 2, step: 0, view: 'present', section: 'first' }, role: 'presenter', status: {} })).toBe(200)
      const scripted = await model([
        { tool: 'presmium__list_sections', input: {} },
        { tool: 'presmium__get_section', input: { section: 'first' } },
        { tool: 'presmium__run_code', input: { section: 'first', block: 'code-1' } },
        { tool: 'presmium__navigate', input: { section: 'second' } },
        { text: '完毕：列出章节、读了第一节、运行了代码并跳到第二节。' },
      ])
      const run = home.headless(ws.dir, '列出章节，读第一节，运行它的代码，再把放映跳到第二节。', { model: scripted, env: service.env })
      const go = await page.next('go', 120_000)
      expect(go).toMatchObject({ section: 'second', step: 0 })
      expect(await page.report({ position: { slide: go.slide, step: go.step, view: 'present', section: go.section }, role: 'presenter', status: {} })).toBe(200)
      expect(await run.exited, run.output()).toBe(0)
      const [sections, section, ran, moved] = toolResults(scripted)
      expect(sections).toContain('\\"id\\": \\"second\\"')
      expect(section).toContain('讲解：先算六乘七。')
      expect(section).toContain('print(6 * 7)')
      expect(ran).toMatch(/\\"stdout\\": \\"42\\\\n\\"/)
      expect(moved).toContain('\\"section\\": \\"second\\"')
      expect(parsed((await mcp.call('get_position', {})).text).position).toMatchObject({ section: 'second', step: 0 })
    } finally {
      page.close()
    }
  }, 240_000)
})
