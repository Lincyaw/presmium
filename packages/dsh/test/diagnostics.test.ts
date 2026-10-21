import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@lincyaw/cli/testing'
import type { DiagnosticSnapshot } from '@lincyaw/kernel'
import { expect, it } from 'vitest'
import { testHome, turns } from './harness.ts'

function documentContext(value: unknown): string {
  if (typeof value === 'string') return /<presmium-document>([\s\S]*?)<\/presmium-document>/.exec(value)?.[1] ?? ''
  if (!value || typeof value !== 'object') return ''
  return Object.values(value).map(documentContext).filter(Boolean).at(-1) ?? ''
}

it('refreshes concrete diagnostics before a model step, isolates documents and removes repaired problems without a diagnostic tool call', async () => {
  const home = testHome('diagnostics')
  const source = '---\ntitle: Broken plugin\nplugins:\n  - presmium-missing-diagnostics-fixture\n---\n\n# Broken plugin\n\nExplain this document.\n'
  const workspace = home.workspace('diagnostics', {
    'presmium.workspace.yaml': 'title: Diagnostics\ndocuments: [lectures/*/lecture.md]\n',
    'lectures/broken/lecture.md': source,
    'lectures/clean/lecture.md': '---\ntitle: Clean document\n---\n\n# Clean document\n\nNo plugin is needed.\n',
  })
  const model = await fakeModel([{ text: '已看到问题。' }, { text: '当前是另一份文稿。' }, { text: '问题已清除。' }, { text: '诊断服务不可用。' }])
  try {
    const service = await home.serve(workspace.dir)
    const web = await home.web(workspace.dir, 5711, { model, env: service.env })
    const api = await web.api()
    const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: workspace.dir } })
    const select = async (document: string) => {
      const response = await api.fetch('/api/presmium/context', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessionId, document }),
      })
      expect(response.status, await response.text()).toBe(200)
    }
    const prompt = async (count: number) => {
      await api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '说明当前文稿状态。' }] } })
      await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(count)
      return documentContext(turns(model).at(-1)!.messages)
    }
    const diagnostics = async (document: string): Promise<DiagnosticSnapshot> => {
      const response = await api.fetch(`/api/presmium/diagnostics?document=${encodeURIComponent(document)}`)
      expect(response.status).toBe(200)
      return response.json() as Promise<DiagnosticSnapshot>
    }

    await select('lectures/broken')
    const broken = await prompt(1)
    const finding = JSON.parse(broken.split('\n').find(line => line.startsWith('{"checkId":'))!)
    expect(finding.message).toContain('cannot load plugin "presmium-missing-diagnostics-fixture": package not found')
    expect(broken).toContain('"file":"lectures/broken/lecture.md","line":4')
    expect(broken).toContain('"severity":"error"')
    expect(broken).toContain('"origin":"compile"')
    expect(broken).toContain('"revision":')
    const before = await diagnostics('lectures/broken')
    expect(before.diagnostics).toContainEqual(expect.objectContaining({ source: { file: 'lectures/broken/lecture.md', line: 4 } }))

    await select('lectures/clean')
    const clean = await prompt(2)
    expect(clean).toContain('Document "lectures/clean"')
    expect(clean).toContain('0 unresolved.')
    expect(clean).not.toContain('presmium-missing-diagnostics-fixture')

    writeFileSync(join(workspace.dir, 'lectures/broken/lecture.md'), source.replace('plugins:\n  - presmium-missing-diagnostics-fixture\n', ''))
    await expect.poll(async () => (await diagnostics('lectures/broken')).diagnostics, { timeout: 60_000 }).toEqual([])
    expect(turns(model)).toHaveLength(2)
    await select('lectures/broken')
    const repaired = await prompt(3)
    expect(repaired).toContain('Document "lectures/broken"')
    expect(repaired).toContain('0 unresolved.')
    expect(repaired).not.toContain('presmium-missing-diagnostics-fixture')
    expect((await diagnostics('lectures/broken')).version).toBeGreaterThan(before.version)

    await service.stop()
    expect(await prompt(4)).toMatch(/diagnostics(?::| are) unavailable/)
  } finally {
    await model.close()
    await home.close()
  }
}, 240_000)
