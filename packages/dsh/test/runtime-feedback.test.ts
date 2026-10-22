import { randomUUID } from 'node:crypto'
import { fakeModel } from '../src/node/fake-model.ts'
import { connectPresmiumMcp } from '@lincyaw/mcp/client'
import { expect, it } from 'vitest'
import { testHome, turns } from './harness.ts'

it('gives the agent observed browser failures before it edits and leaves its correction for review', async () => {
  const home = testHome('runtime-feedback')
  const workspace = home.workspace('runtime-feedback', {
    'lecture.md': '---\ntitle: Python database\n---\n\n(database)=\n## Database lookup\n\nExplain the latest value.\n',
    'database.py': 'def get(rows, key):\n    return values[key]\n',
  })
  const model = await fakeModel([
    { tool: 'presmium__get_runtime', input: {} },
    { tool: 'read', input: { file_path: 'database.py' } },
    { tool: 'write', input: { file_path: 'database.py', content: 'def get(rows, key):\n    return rows.get(key)\n' } },
    { text: '已根据浏览器的 NameError 修复查询，等待审阅。' },
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
    const review = await api.fetch('/api/presmium/review?document=')
    expect(await review.json()).toMatchObject({ review: { session: sessionId, changes: [{ path: 'database.py' }] } })
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
