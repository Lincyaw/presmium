import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FakeModel } from '../src/node/fake-model.ts'
import { fakeModel } from '../src/node/fake-model.ts'
import type { HostApi, Service, TestHome, Web, Workspace } from './harness.ts'
import { FIXTURES, testHome } from './harness.ts'

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
      'presmium.workspace.yaml': 'title: 两份文稿\nsettings:\n  presmium.assistant:\n    review: required\n',
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

  it('[gate] registers the workspace root without creating a first-use directory', async () => {
    const registered = await api.call<{ workspace: { title: string }, created: boolean }>('workspace/create', { request: { path: ws.dir } })
    expect(registered.created).toBe(false)
    expect(await api.call('workspace/initializeDefault', {})).toBeUndefined()
    expect(existsSync(join(home.home, 'Documents'))).toBe(false)
    expect(existsSync(join(home.dshHome, 'documents'))).toBe(false)
    expect(home.homeEntries()).toEqual([])
  }, 60_000)
})
