// The presmium-workspaces row follows the documents (docs/design-dsh.md 6.2; WP-96b's results, carried over to WP-96d):
// on the web carrier every document's directory is a DeepSeek Harness workspace, titled as the document; a document
// made afterwards is registered, a retitled one renamed, a deleted one's registration removed (its directory gone,
// its sessions kept). Read and checked through DeepSeek Harness's Host API, as a page would.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testHome } from './harness.ts'
import type { HostApi, Service, TestHome, Workspace } from './harness.ts'

interface Registered {
  workspace: { workspaceId: string, path: string, title: string }
  created: boolean
}

describe('the documents\' workspaces follow the documents', () => {
  let home: TestHome
  let ws: Workspace
  let service: Service
  let api: HostApi
  beforeAll(async () => {
    home = testHome('workspaces')
    ws = home.workspace('workspaces', {
      'presmium.workspace.yaml': 'title: 跟随\ndocuments: [lectures/*/lecture.md]\n',
      'lectures/alpha/lecture.md': '---\ntitle: 文稿甲\n---\n\n# 文稿甲\n\n## 一节\n\n正文。\n',
    })
    service = await home.serve(ws.dir)
    const web = await home.web(ws.dir, 5648, { env: service.env })
    api = await web.api()
  }, 240_000)
  afterAll(async () => {
    await home?.close()
  })

  /** A document operation of the workspace service, as the workbench's home page makes it. */
  const operate = async (operation: Record<string, string>) => {
    const answer = await fetch(`${service.url}/__presmium/presmium.workspace/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${service.token}` }, body: JSON.stringify(operation) })
    expect(answer.status, await answer.clone().text()).toBe(200)
  }
  /** The registration of a directory: asking to register it again answers it, `created: false` when it was. */
  const registration = (dir: string) => api.call<Registered>('workspace/create', { request: { path: join(ws.dir, dir) } })

  it('a document made is registered, retitled renamed, deleted removed', async () => {
    expect(await registration('lectures/alpha')).toMatchObject({ created: false, workspace: { title: '文稿甲' } })

    // Made: registered by the row within its period (3 s), so asking well after finds it there, titled.
    await operate({ op: 'create', dir: 'lectures/beta', title: '文稿乙' })
    await new Promise(done => setTimeout(done, 8000))
    expect(await registration('lectures/beta')).toMatchObject({ created: false, workspace: { title: '文稿乙' } })

    const file = join(ws.dir, 'lectures/alpha/lecture.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('title: 文稿甲', 'title: 文稿甲（修订）'))
    await expect.poll(async () => (await registration('lectures/alpha')).workspace.title, { timeout: 30_000 }).toBe('文稿甲（修订）')

    // Deleted: its registration goes (renaming it, which changes nothing else, then finds no such workspace).
    const { workspace } = await registration('lectures/beta')
    await operate({ op: 'delete', dir: 'lectures/beta' })
    const rename = () => api.call('workspace/rename', { request: { workspaceId: workspace.workspaceId, title: '文稿乙' } }).then(() => 'registered', (error: Error) => error.message)
    await expect.poll(rename, { timeout: 30_000 }).toMatch(/not.?found/i)
  }, 120_000)
})
