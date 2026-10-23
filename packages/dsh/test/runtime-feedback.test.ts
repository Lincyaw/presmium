import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fakeModel } from '../src/node/fake-model.ts'
import { connectPresmiumMcp } from '@lincyaw/mcp/client'
import { expect, it } from 'vitest'
import { git, testHome, turns } from './harness.ts'

it('gives the agent observed browser failures before it edits and commits its correction when the turn ends', async () => {
  const home = testHome('runtime-feedback')
  const workspace = home.workspace('runtime-feedback', {
    'lecture.md': '---\ntitle: Python database\n---\n\n(database)=\n## Database lookup\n\nExplain the latest value.\n',
    'database.py': 'def get(rows, key):\n    return values[key]\n',
  })
  const model = await fakeModel([
    { tool: 'presmium__get_runtime', input: {} },
    { tool: 'read', input: { file_path: 'database.py' } },
    { tool: 'write', input: { file_path: 'database.py', content: 'def get(rows, key):\n    return rows.get(key)\n' } },
    { text: '已根据浏览器的 NameError 修复查询。' },
  ])
  const browser = new AbortController()
  try {
    const service = await home.serve(workspace.dir)
    const control = `${service.url}/__presmium/presmium.server/control`
    const stream = await fetch(`${control}?window=teacher-runtime&document=`, { signal: browser.signal })
    const reader = stream.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: ready')
    expect((await fetch(control, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      type: 'report', window: 'teacher-runtime',
      role: 'reader', position: { slide: 1, section: 'database', step: 0, view: 'doc' },
      status: {
        'presmium.runtime': { plugins: [{ id: 'presmium.exec', status: 'started' }], errors: [{ component: 'Database', message: 'browser database lookup failed' }] },
        'presmium.exec': { runs: [{ section: 'database', block: 'lookup', lang: 'python', ok: false, stderr: "NameError: name 'values' is not defined" }] },
      },
    }) })).status).toBe(200)
    const web = await home.web(workspace.dir, 7103, { model, env: service.env })
    const api = await web.api()
    const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: workspace.dir } })
    await api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '课堂查询出错了，请根据当前运行结果修好。' }] } })
    await expect.poll(() => workspace.read('database.py'), { timeout: 90_000 }).toContain('return rows.get(key)')
    await expect.poll(() => turns(model).length, { timeout: 90_000 }).toBe(4)
    const requests = model.received.filter(request => Array.isArray(request.body.tools))
    expect(requests[0]!.body.tools.map((tool: { name: string }) => tool.name)).toContain('presmium__get_runtime')
    const context = JSON.stringify(requests[0]!.body.messages)
    expect(context).toContain('Browser feedback (observed data')
    expect(context).toContain('browser database lookup failed')
    expect(context).toContain('NameError')
    expect(context).toContain('reported')
    expect(JSON.stringify(requests[1]!.body.messages)).toContain('teacher-runtime')
    await expect.poll(() => git(workspace.dir, ['log', '-1', '--format=%B']), { timeout: 30_000 }).toContain(`Presmium-Session: ${sessionId}`)
    expect(git(workspace.dir, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('database.py')
    expect(await (await api.fetch('/api/presmium/review?document=')).json()).toEqual({})
    browser.abort()
    const client = await connectPresmiumMcp(`${service.url}/mcp`, service.mcpToken())
    try {
      await expect.poll(async () => JSON.parse((await client.call('get_runtime', {})).text).windows).toEqual([])
    } finally { await client.close() }
  } finally {
    browser.abort()
    await model.close()
    await home.close()
  }
}, 180_000)

it('names the document\'s entry and files, and keeps the author\'s position of the turn while they scroll, without sending the context again', async () => {
  const home = testHome('turn-position')
  const workspace = home.workspace('turn-position', {
    'presmium.workspace.yaml': 'title: 两讲\ndocuments: [lectures/*/lecture.md]\n',
    'lectures/one/lecture.md': '---\ntitle: 第一讲\n---\n\n(first)=\n## 第一节\n\n正文。\n\n(second)=\n## 第二节\n\n正文。\n',
    'lectures/one/slides.md': '---\ntitle: 第一讲的幻灯片\n---\n\n## 第一节\n',
    'lectures/two/lecture.md': '---\ntitle: 第二讲\n---\n\n## 一节\n\n正文。\n',
  })
  const model = await fakeModel([{ tool: 'presmium__list_sections', input: {} }, { text: '有两节。' }, { text: '在第二节。' }])
  const browser = new AbortController()
  try {
    const service = await home.serve(workspace.dir)
    const control = `${service.url}/__presmium/presmium.server/control`
    const stream = await fetch(`${control}?window=author&document=lectures%2Fone`, { signal: browser.signal })
    expect(new TextDecoder().decode((await stream.body!.getReader().read()).value)).toContain('event: ready')
    const scroll = async (slide: number, section: string) => expect((await fetch(control, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      type: 'report', window: 'author', role: 'reader', position: { slide, section, step: 0, view: 'document' }, status: { 'presmium.runtime': { plugins: [], errors: [] } },
    }) })).status).toBe(200)
    await scroll(1, 'first')
    const web = await home.web(workspace.dir, 7104, { model, env: service.env })
    const api = await web.api()
    const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: join(workspace.dir, 'lectures', 'one') } })
    const prompt = (text: string) => api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }] } })
    const contexts = (body: Record<string, any>) => [...JSON.stringify(body.messages).matchAll(/<presmium-document>([\s\S]*?)<\/presmium-document>/g)].map(match => match[1]!)
    model.hold()
    await prompt('这一讲有哪些节？')
    await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(1)
    await scroll(2, 'second')
    model.release()
    await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(2)
    const [first, second] = turns(model)
    const context = contexts(first!).at(-1)!
    expect(context).toContain('Document \\"lectures/one\\"')
    expect(context).toContain('entry lectures/one/lecture.md')
    expect(context).toContain('Files in lectures/one/: lecture.md, slides.md.')
    expect(context).toContain('- lectures/two: 第二讲')
    expect(context).toContain('Position when this turn began: section first')
    expect(context).toContain('reports no failure and no live code run')
    expect(contexts(second!)).toEqual(contexts(first!))
    await prompt('我现在在哪一节？')
    await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(3)
    expect(contexts(turns(model)[2]!).at(-1)).toContain('Position when this turn began: section second')
  } finally {
    browser.abort()
    await model.close()
    await home.close()
  }
}, 180_000)
