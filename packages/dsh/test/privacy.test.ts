// The upgrade gate's second group, privacy and persona (docs/design-dsh.md 6.4 and 6.6, WP-96b): the model's
// requests carry no session log and no plugin inventory; the skill catalog has Presmium's skills and none of
// the user's (~/.agents/skills); nothing is written outside the test's directory (no ~/Documents). The
// profile's own patch turning the uploads back on (what a change in DeepSeek Harness's settings writes) does
// not reach the start: Presmium's patch comes after it, and without Presmium's patch the same profile does
// upload (17, item 5). The system message has Presmium's role, not DeepSeek Harness's coding agent's.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fakeModel } from '@presmium/cli/testing'
import type { FakeModel } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DSH, running, testHome, turns } from './harness.ts'
import type { Service, TestHome } from './harness.ts'

const UPLOADS = ['session-log-deepseek', 'session-telemetry-otel', 'plugin-package-inventory-deepseek']
const LECTURE = '---\ntitle: 隐私\n---\n\n# 隐私\n\n(first)=\n## 第一节\n\n正文。\n'
const GUIDE = 'This is a Presmium workspace'

/** Whether any of the model's requests has one of the upload fields. */
const uploads = (model: FakeModel) => {
  const bodies = JSON.stringify(model.received.map(r => r.body))
  return ['dsh_session_log', 'dsh_plugin_packages'].filter(field => bodies.includes(field))
}

/** The skills the catalog of a turn's request lists. */
const catalog = (body: Record<string, any>) => [...JSON.stringify(body.messages).matchAll(/\\n- `([\w-]+)`: /g)].map(match => match[1])

describe('[gate] privacy and persona of Presmium\'s DeepSeek Harness', () => {
  let home: TestHome
  let service: Service
  let dir: string
  const models: FakeModel[] = []
  const model = async (script: Parameters<typeof fakeModel>[0]) => {
    const made = await fakeModel(script)
    models.push(made)
    return made
  }
  beforeAll(async () => {
    home = testHome('privacy')
    dir = home.workspace('privacy', { 'lecture.md': LECTURE }).dir
    service = await home.serve(dir)
  }, 240_000)
  afterAll(async () => {
    for (const made of models) await made.close()
    await home?.close()
  })

  it('[gate] the requests carry no upload, the skills are Presmium\'s only, and nothing is written outside the test\'s directory', async () => {
    // A skill of the user's own, which no request may carry.
    mkdirSync(join(home.home, '.agents/skills/private-notes-96b'), { recursive: true })
    writeFileSync(join(home.home, '.agents/skills/private-notes-96b/SKILL.md'), '---\nname: private-notes-96b\ndescription: The user\'s private notes 96b.\n---\n\nPrivate.\n')
    const scripted = await model([{ text: '好。' }])
    const run = home.headless(dir, '你好。', { model: scripted, env: service.env })
    expect(await run.exited, run.output()).toBe(0)
    expect(uploads(scripted)).toEqual([])
    expect(catalog(turns(scripted)[0]!).sort()).toEqual(['presmium-author', 'presmium-present'])
    expect(JSON.stringify(scripted.received.map(r => r.body))).not.toContain('private-notes-96b')
    // HOME holds the user's skill and nothing DeepSeek Harness or Presmium made: no Documents.
    expect(home.homeEntries()).toEqual(['.agents'])
  }, 180_000)

  it('[gate] the uploads the profile\'s own patch turns back on stay off: Presmium\'s patch comes after it on every start', async () => {
    const other = testHome('privacy-patch')
    try {
      const profile = other.profile('headless')
      // What a change in DeepSeek Harness's settings writes: the profile's own patch.
      writeFileSync(join(other.dshHome, 'profiles', profile, 'cordis.patch.yml'), UPLOADS.map(id => `- id: ${id}\n  disabled: false\n`).join(''))
      const rows = other.dump('headless')
      for (const id of UPLOADS) expect(rows.get(id)?.disabled, id).toBe(true)
      const presmium = await model([{ text: '好。' }])
      const run = other.headless(dir, '你好。', { model: presmium, env: service.env })
      expect(await run.exited, run.output()).toBe(0)
      expect(uploads(presmium)).toEqual([])
      // The same profile started without Presmium's patch does upload: what the assertion above would see.
      const bare = await model([{ text: '好。' }])
      const without = running(spawn(process.execPath, [DSH, '--profile', profile, '你好。'], { cwd: dir, env: other.env({ ...service.env, DEEPSEEK_BASE_URL: bare.url, DEEPSEEK_API_KEY: 'model-key-96b' }), stdio: ['ignore', 'pipe', 'pipe'] }))
      expect(await without.exited, without.output()).toBe(0)
      expect(uploads(bare)).toEqual(['dsh_session_log', 'dsh_plugin_packages'])
    } finally {
      await other.close()
    }
  }, 180_000)

  it('[gate] persona: the system message has Presmium\'s role and guide, not DeepSeek Harness\'s coding agent\'s context', async () => {
    const headless = await model([{ text: '好。' }])
    const run = home.headless(dir, '你是谁？', { model: headless, env: service.env })
    expect(await run.exited, run.output()).toBe(0)
    const system = JSON.stringify(turns(headless)[0]!.system)
    expect(system).toContain('You are Presmium\'s assistant for the authors of lectures')
    expect(system).toContain(GUIDE)
    expect(system).not.toContain('You are a coding agent')
    // The web carrier: its presets keep their own persona; the coding agent's context of DeepSeek Harness's checkout and GUI is gone.
    const page = await model([{ text: '好。' }])
    const web = await home.web(dir, 5624, { model: page, env: service.env })
    try {
      const api = await web.api()
      const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: dir } })
      await api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '你是谁？' }] } })
      await expect.poll(() => turns(page).length, { timeout: 60_000 }).toBeGreaterThan(0)
      const asked = JSON.stringify(turns(page)[0])
      expect(asked).toContain(GUIDE)
      expect(asked).not.toContain('DeepSeek Harness implementation checkout')
      expect(asked).not.toContain('DeepSeek Harness Web GUI')
    } finally {
      await web.stop()
    }
  }, 180_000)
})
