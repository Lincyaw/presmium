// The upgrade gate's second group, context (docs/design-dsh.md 6.2 and 6.4, WP-96b): on the web carrier, which
// runs each session in the workspace the user picked, two sessions in two documents' directories each get
// their own document as context and their own document's tools (one document lists a plugin with an agent
// tool: 17, item 12), whatever directory DeepSeek Harness started in. Every document's directory is a
// workspace (the workspace root is not), registered at start, so DeepSeek Harness makes no first-use
// workspace and nothing under ~/Documents. The page reaches the workspace service through the host's
// /api/presmium/* routes, behind the host's cookie.
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@presmium/cli/testing'
import type { FakeModel } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, testHome, turns } from './harness.ts'
import type { HostApi, Service, TestHome, Web, Workspace } from './harness.ts'

/** The `<presmium-document>` context of a request. */
const documentContext = (body: Record<string, any>) => /<presmium-document>([\s\S]*?)<\/presmium-document>/.exec(JSON.stringify(body.messages))?.[1] ?? ''

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
    model = await fakeModel([{ text: '好。' }, { text: '好。' }])
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

  it('[gate] the documents\' directories are workspaces from the start: no first-use workspace, nothing under ~/Documents', async () => {
    const registered = await api.call<{ workspace: { title: string }, created: boolean }>('workspace/create', { request: { path: join(ws.dir, 'lectures', 'alpha') } })
    expect(registered).toMatchObject({ workspace: { title: '文稿甲' }, created: false })
    expect(await api.call('workspace/initializeDefault', {})).toBeUndefined()
    expect(existsSync(join(home.home, 'Documents'))).toBe(false)
    expect(existsSync(join(home.dshHome, 'documents'))).toBe(false)
    expect(home.homeEntries()).toEqual([])
  }, 60_000)

  it('the page reaches the workspace service at /api/presmium/*, with the host\'s cookie only', async () => {
    const listed = await api.fetch('/api/presmium/documents')
    expect(listed.status).toBe(200)
    expect((await listed.json() as { documents: { dir: string }[] }).documents.map(doc => doc.dir)).toEqual(['lectures/alpha', 'lectures/beta'])
    expect((await fetch(`${web.url}/api/presmium/documents`)).status).toBe(401)
    // The focus goes to the server with the service token, which the page never has.
    const reported = await api.fetch('/api/presmium/focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: 'lectures/beta', focus: [{ id: 'f1', from: 'web', section: 'beta-one' }] }) })
    expect(reported.status).toBe(200)
    expect(await reported.json()).toMatchObject({ document: 'lectures/beta', focus: [{ id: 'f1', section: 'beta-one', source: { file: 'lecture.md' } }] })
    expect((await fetch(`${service.url}/__presmium/presmium.server/focus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"document":"lectures/beta","focus":[]}' })).status).toBe(401)
  }, 60_000)
})
