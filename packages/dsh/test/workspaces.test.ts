import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testHome } from './harness.ts'
import type { HostApi, Service, TestHome, Workspace } from './harness.ts'

interface Registered {
  workspace: { workspaceId: string, path: string, title: string }
  created: boolean
}

describe('one Harness workspace for the Presmium workspace root', () => {
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

  const operate = async (operation: Record<string, string>) => {
    const answer = await fetch(`${service.url}/__presmium/presmium.workspace/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${service.token}` }, body: JSON.stringify(operation) })
    expect(answer.status, await answer.clone().text()).toBe(200)
  }
  const registration = (dir: string) => api.call<Registered>('workspace/create', { request: { path: join(ws.dir, dir) } })

  it('keeps the root registration while documents are created, renamed and deleted', async () => {
    const registered = await registration('')
    expect(registered).toMatchObject({ created: false, workspace: { path: ws.dir, title: basename(ws.dir) } })

    await operate({ op: 'create', dir: 'lectures/beta', title: '文稿乙' })
    expect(await registration('')).toEqual(registered)

    const file = join(ws.dir, 'lectures/alpha/lecture.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('title: 文稿甲', 'title: 文稿甲（修订）'))
    await operate({ op: 'rename', dir: 'lectures/beta', to: 'lectures/renamed' })

    await operate({ op: 'delete', dir: 'lectures/renamed' })
    expect(await registration('')).toEqual(registered)
    expect(await registration('lectures/alpha')).toMatchObject({ created: true, workspace: { title: 'alpha' } })
  }, 120_000)
})
