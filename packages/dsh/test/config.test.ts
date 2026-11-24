import { fakeModel } from '../src/node/fake-model.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testHome } from './harness.ts'
import type { Service, TestHome } from './harness.ts'

const HOST_ROWS = ['presmium-service', 'presmium-tools', 'presmium-policy', 'presmium-context', 'presmium-skills', 'presmium-turns']
const WEB_ROWS = ['presmium-workspaces', 'presmium-routes']
const UPLOADS = ['session-log-deepseek', 'session-telemetry-otel', 'plugin-package-inventory-deepseek']

describe('[gate] the pinned DeepSeek Harness with Presmium\'s bundle', () => {
  let home: TestHome
  let service: Service
  let dir: string
  beforeAll(async () => {
    home = testHome('config')
    dir = home.workspace('config', { 'lecture.md': '---\ntitle: 配置\n---\n\n# 配置\n\n## 一节\n\n正文。\n' }).dir
    service = await home.serve(dir)
  }, 240_000)
  afterAll(async () => {
    await home?.close()
  })

  it('[gate] composes the bundle\'s rows and Presmium\'s settings on the web, headless and acp carriers', () => {
    const web = home.dump('web')
    for (const id of [...HOST_ROWS, ...WEB_ROWS]) expect(web.get(id)?.disabled, `web: ${id}`).toBe(false)
    expect(web.get('presmium-service')!.text).toContain('process.env.PRESMIUM_SERVICE_URL')
    expect(web.get('workspace-controller')!.text).toContain('documentsDirectory')
    expect(web.get('harness-dev-context')!.disabled).toBe(true)
    const preset = web.get('preset-authoring')
    expect(preset?.disabled, 'web: preset-authoring').toBe(false)
    expect(preset!.text).toContain('id: authoring')
    expect(preset!.text).toContain('The author is a teacher who may know no code')
    for (const tool of ['dsh-tool-schedule', 'dsh-tool-goal', 'dsh-tool-subagent', 'dsh-tool-workflow']) expect(preset!.text, `web: ${tool}`).not.toContain(tool)
    expect(web.get('agent-preset-registry')!.text).toContain('default: authoring')
    expect(web.get('ui-deliverables')?.disabled, 'web: the file cards').toBe(true)
    for (const carrier of ['headless', 'acp'] as const) {
      const rows = home.dump(carrier)
      for (const id of HOST_ROWS) expect(rows.get(id)?.disabled, `${carrier}: ${id}`).toBe(false)
      for (const id of WEB_ROWS) expect(rows.has(id), `${carrier}: ${id}`).toBe(false)
      expect(rows.has('preset-authoring'), `${carrier}: preset-authoring`).toBe(false)
    }
    for (const rows of [web, home.dump('headless'), home.dump('acp')]) {
      for (const id of UPLOADS) expect(rows.get(id)?.disabled, id).toBe(true)
      expect(rows.get('skill-filesystem')!.text).toContain('agentsHome: !!js process.env.DSH_AGENTS_HOME')
      expect(rows.get('sandbox-policy')!.text).toContain('mode: workspace-write')
      expect(rows.get('approval')!.text).toContain('policy: ask')
      expect(rows.get('system-prompt')!.text).toContain('Presmium\'s assistant for the authors of lectures')
    }
  }, 120_000)

  it('[gate] starts the headless and acp carriers without an entry that did not activate', async () => {
    const model = await fakeModel([{ text: '好。' }])
    try {
      const run = home.headless(dir, '你好。', { model, env: service.env })
      expect(await run.exited, run.output()).toBe(0)
      expect(run.output()).not.toMatch(/did not activate|entry \S+ not found/)
      const acp = await home.acp(dir, { env: service.env })
      expect(acp.initialized).toMatchObject({ id: 1, result: expect.anything() })
      expect(acp.stderr).not.toMatch(/did not activate|entry \S+ not found/)
    } finally {
      await model.close()
    }
  }, 180_000)

})
