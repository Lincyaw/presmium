import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@lincyaw/cli/testing'
import type { FakeModel } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, testHome, turns } from './harness.ts'
import type { HostApi, Service, TestHome, Web, Workspace } from './harness.ts'

const documentContext = (body: Record<string, any>) => [...JSON.stringify(body.messages).matchAll(/<presmium-document>([\s\S]*?)<\/presmium-document>/g)].at(-1)?.[1] ?? ''

describe('[gate] each session\'s own document on the web carrier', () => {
  let home: TestHome
  let ws: Workspace
  let service: Service
  let model: FakeModel
  let web: Web
  let api: HostApi
  beforeAll(async () => {
    home = testHome('context')
    ws = home.workspace('context', {
      'presmium.workspace.yaml': 'title: 两份文稿\ndocuments: [lectures/*/lecture.md]\n',
      'lectures/alpha/lecture.md': '---\ntitle: 文稿甲\nplugins:\n  - presmium-fixture-dsh\n---\n\n# 文稿甲\n\n(alpha-one)=\n## 甲的一节\n\n甲的正文。\n',
      'lectures/beta/lecture.md': '---\ntitle: 文稿乙\nlang: en\n---\n\n# 文稿乙\n\n(beta-one)=\n## 乙的一节\n\n乙的正文。\n',
    }, { 'presmium-fixture-dsh': join(FIXTURES, 'plugin') })
    service = await home.serve(ws.dir)
    model = await fakeModel([
      { text: '好。' }, { text: '好。' },
      { tool: 'read', input: { file_path: 'lectures/beta/lecture.md' } },
      { tool: 'write', input: { file_path: 'shared-notes.md', content: '工作区共享笔记\n' } },
      { text: '工作区的文件已读写。' },
      { tool: 'presmium__list_sections', input: {} },
      { text: '现在是乙。' },
    ])
    web = await home.web(ws.dir, 5623, { model, env: service.env })
    api = await web.api()
  }, 240_000)
  afterAll(async () => {
    await model?.close()
    await home?.close()
  })

  it('[gate] two sessions in two documents each get their own document\'s context and tools', async () => {
    const sessions: Record<string, string> = {}
    for (const doc of ['alpha', 'beta']) {
      const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: join(ws.dir, 'lectures', doc) } })
      sessions[doc] = sessionId
      await api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '这份文稿有哪些节？' }] } })
    }
    await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(2)
    const of = (doc: string) => model.received.find(r => r.headers['x-deepseek-harness-session-id'] === sessions[doc] && Array.isArray(r.body.tools))!.body
    const alpha = documentContext(of('alpha'))
    const beta = documentContext(of('beta'))
    expect(alpha).toContain('Document \\"lectures/alpha\\"')
    expect(alpha).toContain('- alpha-one: 甲的一节')
    expect(alpha).not.toContain('beta-one')
    expect(beta).toContain('Document \\"lectures/beta\\"')
    expect(beta).toContain('language en')
    expect(beta).toContain('- beta-one: 乙的一节')
    expect(beta).not.toContain('alpha-one')
    const tools = (doc: string) => of(doc).tools.map((tool: { name: string }) => tool.name).filter((name: string) => name.startsWith('presmium__'))
    expect(tools('alpha')).toContain('presmium__fixture_note')
    expect(tools('beta')).not.toContain('presmium__fixture_note')
    expect(tools('beta')).toContain('presmium__list_sections')
  }, 180_000)

  it('[gate] registers the workspace root without creating a first-use directory', async () => {
    const registered = await api.call<{ workspace: { title: string }, created: boolean }>('workspace/create', { request: { path: ws.dir } })
    expect(registered.created).toBe(false)
    expect(await api.call('workspace/initializeDefault', {})).toBeUndefined()
    expect(existsSync(join(home.home, 'Documents'))).toBe(false)
    expect(existsSync(join(home.dshHome, 'documents'))).toBe(false)
    expect(home.homeEntries()).toEqual([])
  }, 60_000)

  it('keeps one session at the root while its selected document changes and reads and writes across the workspace', async () => {
    const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: ws.dir } })
    const select = (document: string) => api.fetch('/api/presmium/context', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessionId, document }),
    })
    const prompt = () => api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '按当前文稿处理。' }] } })
    expect((await select('lectures/alpha')).status).toBe(200)
    await prompt()
    await expect.poll(() => existsSync(join(ws.dir, 'shared-notes.md')), { timeout: 90_000 }).toBe(true)
    await expect.poll(() => turns(model).length, { timeout: 90_000 }).toBe(5)
    expect(ws.read('shared-notes.md')).toBe('工作区共享笔记\n')
    expect((await select('lectures/beta')).status).toBe(200)
    await prompt()
    await expect.poll(() => turns(model).length, { timeout: 90_000 }).toBe(7)
    const requests = model.received.filter(r => r.headers['x-deepseek-harness-session-id'] === sessionId && Array.isArray(r.body.tools))
    const first = requests[0]!.body
    const last = requests.at(-1)!.body
    expect(documentContext(first)).toContain('lectures/alpha')
    expect(documentContext(last)).toContain('lectures/beta')
    expect(documentContext(last)).toContain('beta-one')
    expect(last.tools.map((tool: { name: string }) => tool.name)).not.toContain('presmium__fixture_note')
    expect(JSON.stringify(last.messages)).toContain(ws.dir)
    expect(new Set(requests.map(r => r.headers['x-deepseek-harness-session-id'])).size).toBe(1)
    const review = await api.fetch('/api/presmium/review?document=lectures%2Fbeta')
    expect(review.status).toBe(200)
    expect(await review.json()).toMatchObject({ review: { session: sessionId, changes: [{ path: 'shared-notes.md' }] } })
    const rejected = await api.fetch('/api/presmium/review/reject?document=lectures%2Fbeta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(rejected.status).toBe(200)
    expect(existsSync(join(ws.dir, 'shared-notes.md'))).toBe(false)
  }, 240_000)

  it('the page reaches the workspace service at /api/presmium/*, with the host\'s cookie only', async () => {
    const listed = await api.fetch('/api/presmium/documents')
    expect(listed.status).toBe(200)
    expect((await listed.json() as { documents: { dir: string }[] }).documents.map(doc => doc.dir)).toEqual(['lectures/alpha', 'lectures/beta'])
    expect((await fetch(`${web.url}/api/presmium/documents`)).status).toBe(401)
    const reported = await api.fetch('/api/presmium/focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: 'lectures/beta', focus: [{ id: 'f1', from: 'web', section: 'beta-one' }] }) })
    expect(reported.status).toBe(200)
    expect(await reported.json()).toMatchObject({ document: 'lectures/beta', focus: [{ id: 'f1', section: 'beta-one', source: { file: 'lecture.md' } }] })
    expect((await fetch(`${service.url}/__presmium/presmium.server/focus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"document":"lectures/beta","focus":[]}' })).status).toBe(401)
  }, 60_000)
})
