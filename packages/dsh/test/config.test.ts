// The upgrade gate's first group (docs/design-dsh.md section 12, WP-96b): the pinned DeepSeek Harness composes
// Presmium's bundle as designed. `--dump-config` of each carrier has the bundle's rows (the web carrier's two
// more), the three upload rows off, the skills, sandbox, persona and first-use settings of Presmium's profile
// patch; headless and acp start without an entry that did not activate; a bundle whose `engines.dsh` the
// pinned version does not satisfy is refused at installation and skipped at start.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeProfile } from '../src/node/launch.ts'
import { DSH, PACKAGE, rowsOf, testHome } from './harness.ts'
import type { Service, TestHome } from './harness.ts'

/** The bundle's rows on every carrier, and the web carrier's own. */
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
    for (const carrier of ['headless', 'acp'] as const) {
      const rows = home.dump(carrier)
      for (const id of HOST_ROWS) expect(rows.get(id)?.disabled, `${carrier}: ${id}`).toBe(false)
      for (const id of WEB_ROWS) expect(rows.has(id), `${carrier}: ${id}`).toBe(false)
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

  it('[gate] refuses to install a bundle the pinned version does not satisfy (engines.dsh), and skips it at start', () => {
    // This package as it would be with a requirement of another version.
    const other = mkdtempSync(join(home.dir, 'bundle-'))
    cpSync(join(PACKAGE, 'cordis.patch.yml'), join(other, 'cordis.patch.yml'))
    const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as { engines: Record<string, string>, dependencies?: unknown, devDependencies?: unknown, peerDependencies?: unknown }
    writeFileSync(join(other, 'package.json'), JSON.stringify({ ...manifest, engines: { ...manifest.engines, dsh: '^0.3.0' }, dependencies: {}, devDependencies: {}, peerDependencies: {} }, null, 2))
    const installing = spawnSync(process.execPath, [DSH, 'plugin', '--profile', 'presmium-other', 'add', `link:${other}`], { cwd: home.dir, env: home.env(), encoding: 'utf8' })
    expect(installing.status).not.toBe(0)
    expect(`${installing.stdout}${installing.stderr}`).toMatch(/incompatible with dsh 0\.2\.1-alpha\.4[\s\S]*nothing was installed/)
    // Linked by hand as a launcher links it: the start leaves it out.
    writeProfile(home.dshHome, 'presmium-linked', 'headless', other)
    const started = spawnSync(process.execPath, [DSH, '--profile', 'presmium-linked', '--dump-config'], { cwd: home.dir, env: home.env(), encoding: 'utf8' })
    expect(started.stderr).toMatch(/skipping profile bundle "@presmium\/dsh"[\s\S]*incompatible with dsh 0\.2\.1-alpha\.4/)
    expect(rowsOf(started.stdout).has('presmium-service')).toBe(false)
  }, 120_000)
})
