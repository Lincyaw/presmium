// DeepSeek Harness bundled with the assistant (D11, D15, P-111). Its pinned version composes the template
// (`--dump-config`): no session-log upload or telemetry, the shell with a `workspace-write` sandbox and
// asking, the model of ACP sessions from the operator's model settings.
// With only a (fake) DEEPSEEK_API_KEY and no command, `presmium dev`'s assistant starts it: the provider is
// DeepSeek, the runtime is what `initialize` reports, `session/new` succeeds, and nothing goes to the model.
// With the operator's Messages-compatible service (PRESMIUM_MODEL_URL, _KEY, _PROVIDER; a fake one here) its
// environment has the URL and key as DEEPSEEK_BASE_URL and DEEPSEEK_API_KEY and none of Presmium's
// variables, and the service receives that key with the request. The page's model settings (P-111), saved
// through the assistant's route while the process runs, go to the user's configuration directory (0600, the
// key never answered back), and the next session's service receives their key and model; saved without a
// key, they keep the saved one only for the same service and address (WP-92c); the environment comes first. In `presmium serve`, a chat task's agent lists the sections, reads one's narration and code,
// runs its code and moves the presentation through Presmium's MCP, a window allowing the two operations
// (F-49). The request to DeepSeek's real model needs DEEPSEEK_API_KEY and is skipped without it.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dshArgs, dshBin, templateFile } from '../src/node/launch.ts'
import { fakeModel, recordingProxy } from '@presmium/cli/testing'
import type { FakeModel } from '@presmium/cli/testing'
import { call, descendants, dev, env, FIXTURES, PACKAGE, presmium, processInfo, ROOT, taskEvents, workspace } from './helpers.ts'

interface Row { id?: string, disabled: boolean, text: string }

/** The rows of the composed profile tree (`--dump-config`), by id. */
function dump(home: string): Map<string, Row> {
  const output = execFileSync(process.execPath, [...dshArgs(dshBin()!), '--dump-config'], { env: env({ DSH_HOME: home }), encoding: 'utf8' })
  const rows = new Map<string, Row>()
  for (const text of output.split(/^(?=- )/m).slice(1)) {
    const id = /^- id: (\S+)$/m.exec(text)?.[1]
    if (id) rows.set(id, { id, disabled: /^ {2}disabled: true$/m.test(text), text })
  }
  return rows
}

const UPLOADS = ['session-log-deepseek', 'session-telemetry-otel', 'plugin-package-inventory-deepseek']

describe('the template of the pinned DeepSeek Harness', () => {
  let home: string
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'presmium-dsh-home-'))
  })
  afterAll(() => rmSync(home, { recursive: true, force: true }))

  it('turns off the session-log upload and telemetry, keeps the shell in workspace-write and asking, and takes the model of the settings', () => {
    expect(dshBin()).toBeDefined()
    const tree = dump(home)
    const disabled = (id: string) => {
      const row = tree.get(id)
      expect(row, `row ${id} (the template names a row the pinned version lacks?)`).toBeDefined()
      return row!.disabled
    }
    for (const id of UPLOADS) expect(disabled(id), id).toBe(true)
    expect(disabled('tool-bash')).toBe(false)
    expect(tree.get('sandbox-policy')!.text).toContain('mode: workspace-write')
    expect(tree.get('approval')!.text).toContain('policy: ask')
    expect(tree.get('acp')!.text).toContain('provider: deepseek-official')
    expect(tree.get('acp')!.text).toContain('process.env.DSH_PRESMIUM_MODEL')
    expect(templateFile()).toContain(`${PACKAGE}/dsh/`)
  }, 120_000)
})

const LECTURE = `---
title: 随包的运行时
plugins:
  - ${PACKAGE}
  - ${join(FIXTURES, 'runtime-plugin')}
---

(merge)=
## 合并规则

每一轮合并出现次数最多的一对。
`

/** A chat request to an agent session of the server's runtime (the test plugin's `prompt` route): its messages, or why it failed. */
async function prompt(server: string, text: string): Promise<{ status: number, messages?: string[], error?: string }> {
  const response = await fetch(`${server}/__presmium/fixture.runtime/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text }) })
  return { status: response.status, ...await response.json() as { messages?: string[], error?: string } }
}

/** The model settings route (`settings`): its status and answer as text. */
async function settings(server: string, method = 'GET', body?: unknown): Promise<{ status: number, text: string, json: Record<string, any> }> {
  const response = await fetch(`${server}/__presmium/presmium.assistant/settings`, {
    method,
    ...body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  })
  const text = await response.text()
  return { status: response.status, text, json: text ? JSON.parse(text) as Record<string, any> : {} }
}

describe('presmium dev with the bundled DeepSeek Harness', () => {
  let base: string
  let deck: string
  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'presmium-dsh-'))
    deck = join(base, 'deck')
    mkdirSync(deck)
    writeFileSync(join(deck, 'lecture.md'), LECTURE)
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('with only DEEPSEEK_API_KEY: the provider is DeepSeek, the runtime is what initialize reports, session/new succeeds, nothing goes to the model', async () => {
    const proxy = await recordingProxy()
    const { running, server } = await dev(deck, env({
      XDG_STATE_HOME: join(base, 'state'),
      XDG_CONFIG_HOME: join(base, 'config'),
      DEEPSEEK_API_KEY: 'sk-fake-for-presmium-tests',
      // Anything DeepSeek Harness sends off this machine goes through the proxy, which records it.
      HTTPS_PROXY: proxy.url,
      HTTP_PROXY: proxy.url,
      NO_PROXY: '',
    }))
    try {
      // `presmium dev` commits no change: its pages offer none.
      expect((await call(server, 'info')).json).toEqual({ provider: 'DeepSeek', source: 'environment', kinds: [], changes: false })
      expect(running.output()).toMatch(/the assistant is available: provider DeepSeek, the bundled DeepSeek Harness \S+ \(from DEEPSEEK_API_KEY\)/)
      const opened = await fetch(`${server}/__presmium/fixture.runtime/open`, { method: 'POST' })
      const body = await opened.json() as { provider: string, runtime: string, error?: string }
      expect(opened.status, body.error).toBe(200)
      expect(body.provider).toBe('DeepSeek')
      expect(body.runtime).toMatch(/^deepseek-harness\S* \S+$/)
      expect((await call(server, 'info')).json).toEqual({ provider: 'DeepSeek', source: 'environment', runtime: body.runtime, kinds: [], changes: false })
      await fetch(`${server}/__presmium/fixture.runtime/close`, { method: 'POST' })
      expect(proxy.attempts).toEqual([])
    } finally {
      await running.stop()
      await proxy.close()
    }
  }, 180_000)

  it('with the operator\'s Messages service: its URL and key are DeepSeek Harness\'s, no Presmium variable is; the service receives that key, and none of the user\'s own skills', async () => {
    const model = await fakeModel([{ text: '每一轮合并出现次数最多的一对，见[合并规则](presmium://sections/merge)。' }])
    // A skill of the user's own (~/.agents/skills), which the request must not carry.
    const home = join(base, 'home')
    mkdirSync(join(home, '.agents/skills/private-notes-7c1'), { recursive: true })
    writeFileSync(join(home, '.agents/skills/private-notes-7c1/SKILL.md'), '---\nname: private-notes-7c1\ndescription: The user\'s private notes 7c1.\n---\n\nPrivate.\n')
    const { running, server } = await dev(deck, env({
      HOME: home,
      XDG_STATE_HOME: join(base, 'state'),
      XDG_CONFIG_HOME: join(base, 'config'),
      PRESMIUM_MODEL_URL: model.url,
      PRESMIUM_MODEL_KEY: 'model-key-5e8b',
      PRESMIUM_MODEL_PROVIDER: 'Test Provider',
    }))
    try {
      expect((await call(server, 'info')).json).toMatchObject({ provider: 'Test Provider', source: 'environment' })
      // The model holds its answer while the test reads the agent's environment.
      model.hold()
      const answered = prompt(server, '合并的是哪一对？')
      await expect.poll(() => model.received.length, { timeout: 60_000 }).toBeGreaterThan(0)
      const agent = descendants(running.child.pid!).find(p => p.cmdline.includes('--profile acp'))!
      const seen = processInfo(agent.pid)!.environ
      expect(seen.DEEPSEEK_BASE_URL).toBe(model.url)
      expect(seen.DEEPSEEK_API_KEY).toBe('model-key-5e8b')
      expect(seen.DSH_TELEMETRY_MODE).toBe('DISABLED')
      expect(Object.keys(seen).filter(name => name.startsWith('PRESMIUM_'))).toEqual([])
      expect(agent.cmdline).toContain('presmium.cordis.yml')
      model.release()
      const done = await answered
      expect(done.status, done.error).toBe(200)
      expect(done.messages!.join('')).toContain('[合并规则](presmium://sections/merge)')
      expect(model.received[0]!.headers['x-api-key']).toBe('model-key-5e8b')
      expect(model.received[0]!.path).toBe('/v1/messages')
      // No model named: the pinned version's default.
      expect(model.received[0]!.body.model).toBe('deepseek-v4-flash')
      expect(seen.DSH_AGENTS_HOME).toBe(join(base, 'state/presmium/dsh/agents'))
      expect(JSON.stringify(model.received.map(r => r.body))).not.toContain('private-notes-7c1')
    } finally {
      model.release()
      await running.stop()
      await model.close()
    }
  }, 180_000)

  it('with the page\'s model settings: saved while it runs, readable by the user only, never answered back; the next session takes their key and model; the environment comes first', async () => {
    const config = join(base, 'page-config')
    const model = await fakeModel([{ text: '页面中的设置生效了。' }])
    const { running, server } = await dev(deck, env({ XDG_STATE_HOME: join(base, 'state'), XDG_CONFIG_HOME: config }))
    const file = join(config, 'presmium', 'assistant.json')
    try {
      await running.wait(/the assistant is unavailable: no model access: fill in the model settings in the page/, 10_000)
      expect((await call(server, 'info')).json).toMatchObject({ kinds: [], missing: { code: 'model' } })
      expect((await settings(server)).json).toEqual({ source: 'none', missing: { code: 'model' }, saved: { key: false }, file })
      // An address that is no URL, or one without its provider, is refused.
      expect((await settings(server, 'POST', { provider: 'Test Provider', url: 'not a url', key: 'k' })).status).toBe(400)
      expect((await settings(server, 'POST', { url: model.url, key: 'k' })).status).toBe(400)

      const saved = await settings(server, 'POST', { provider: 'Test Provider', url: model.url, key: 'page-key-7f1', model: 'page-model-1' })
      expect(saved.status, saved.text).toBe(200)
      expect(saved.json).toEqual({ source: 'page', provider: 'Test Provider', saved: { provider: 'Test Provider', url: model.url, model: 'page-model-1', key: true }, file })
      expect(saved.text).not.toContain('page-key-7f1')
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(statSync(join(config, 'presmium')).mode & 0o777).toBe(0o700)
      // In effect without a restart.
      expect((await call(server, 'info')).json).toMatchObject({ provider: 'Test Provider', source: 'page' })
      const done = await prompt(server, '设置生效了吗？')
      expect(done.status, done.error).toBe(200)
      expect(model.received[0]!.headers['x-api-key']).toBe('page-key-7f1')
      expect(model.received[0]!.body.model).toBe('page-model-1')
      // Saved again without a key: the key stays.
      expect((await settings(server, 'POST', { provider: 'Test Provider', url: model.url, model: 'page-model-2' })).json.saved).toEqual({ provider: 'Test Provider', url: model.url, model: 'page-model-2', key: true })
      // Another service without a key: refused, so the saved key never goes to it; both ways (WP-92c).
      const refused = await settings(server, 'POST', { model: 'deepseek-chat' })
      expect(refused.status, refused.text).toBe(400)
      expect(refused.text).toContain('give its key')
      expect((await settings(server, 'POST', { provider: 'Test Provider', url: `${model.url}/other`, model: 'page-model-2' })).status).toBe(400)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ provider: 'Test Provider', url: model.url, key: 'page-key-7f1' })
      expect((await settings(server, 'POST', { model: 'deepseek-chat', key: 'deepseek-page-key' })).json).toMatchObject({ source: 'page', provider: 'DeepSeek', saved: { model: 'deepseek-chat', key: true } })
      expect((await settings(server, 'POST', { provider: 'Test Provider', url: model.url, model: 'page-model-2' })).status).toBe(400)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ model: 'deepseek-chat', key: 'deepseek-page-key' })
      expect((await settings(server, 'POST', { provider: 'Test Provider', url: model.url, key: 'page-key-7f1', model: 'page-model-2' })).status).toBe(200)
    } finally {
      await running.stop()
      await model.close()
    }

    // The environment comes first; the page's settings stay saved, and go when cleared.
    const again = await dev(deck, env({ XDG_STATE_HOME: join(base, 'state'), XDG_CONFIG_HOME: config, DEEPSEEK_API_KEY: 'sk-fake-for-presmium-tests' }))
    try {
      expect((await settings(again.server)).json).toMatchObject({ source: 'environment', provider: 'DeepSeek', from: ['DEEPSEEK_API_KEY'], saved: { provider: 'Test Provider', key: true } })
      expect((await settings(again.server, 'DELETE')).json.saved).toEqual({ key: false })
      expect(existsSync(file)).toBe(false)
    } finally {
      await again.running.stop()
    }
  }, 240_000)

  const key = process.env.DEEPSEEK_API_KEY
  if (!key) console.warn('dsh.test.ts: the request to DeepSeek\'s real model is skipped: set DEEPSEEK_API_KEY to run it')
  it.skipIf(!key)('answers a request with DeepSeek\'s real model (needs DEEPSEEK_API_KEY)', async () => {
    const { running, server } = await dev(deck, env({ XDG_STATE_HOME: join(base, 'state'), XDG_CONFIG_HOME: join(base, 'config'), DEEPSEEK_API_KEY: key! }))
    try {
      const done = await prompt(server, '这一节讲的合并规则是什么？只回答，不要改任何文件。')
      expect(done.status, done.error).toBe(200)
      expect(done.messages!.join('').trim().length).toBeGreaterThan(0)
    } finally {
      await running.stop()
    }
  }, 300_000)
})

/** A window of the control channel (`controlWindow` of packages/mcp/test/client.ts). */
interface ControlWindow {
  next(event: string, timeoutMs?: number): Promise<Record<string, any>>
  report(body: Record<string, unknown>): Promise<number>
  answer(id: string, allow: boolean): Promise<number>
  close(): void
}

describe('presmium serve with the bundled DeepSeek Harness on Presmium\'s MCP (6.12, F-49)', () => {
  let dir: string
  let model: FakeModel
  afterAll(async () => {
    await model?.close()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  it('its agent lists the sections, reads a section\'s narration and code, runs the code and moves the presentation; a window allows the two operations', async () => {
    dir = workspace('dsh-mcp', {
      'presmium.workspace.yaml': `title: DSH 与 MCP\nsettings:\n  presmium.workspace:\n    plugins: ['@presmium/slidev-addon-assistant', '@presmium/slidev-addon-exec']\n`,
      'lecture.md': '---\ntitle: DSH 与 MCP\nplugins:\n  - \'@presmium/slidev-addon-exec\'\n---\n\n# DSH 与 MCP\n\n(first)=\n## 第一节\n\n讲解：先算六乘七。\n\n```{code} python\n:run:\nprint(6 * 7)\n```\n\n(second)=\n## 第二节\n\n第二节的正文。\n',
    }, { '@presmium/slidev-addon-assistant': PACKAGE, '@presmium/slidev-addon-exec': join(ROOT, 'packages/addon-exec') })
    // The model's script: the four tools of Presmium's MCP, one after the other, then its answer.
    model = await fakeModel([
      { tool: 'mcp__presmium__list_sections', input: {} },
      { tool: 'mcp__presmium__get_section', input: { section: 'first' } },
      { tool: 'mcp__presmium__run_code', input: { section: 'first', block: 'code-1' } },
      { tool: 'mcp__presmium__navigate', input: { section: 'second' } },
      { text: '完毕：列出章节、读了第一节、运行了代码并跳到第二节。' },
    ])
    const running = presmium(['serve', '--port', '0'], { cwd: dir, env: env({ XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache`, PRESMIUM_MODEL_URL: model.url, PRESMIUM_MODEL_KEY: 'model-key-f49', PRESMIUM_MODEL_PROVIDER: 'Test Provider' }) })
    // A window of the control channel, as a presenting page holds one (the MCP client of packages/mcp's tests, used as it is).
    const { controlWindow } = await import(join(ROOT, 'packages/mcp/test/client.ts')) as { controlWindow(url: string, id: string): Promise<ControlWindow> }
    try {
      const server = (await running.wait(/^serve {2}(http\S+)$/m))[1]!
      const page = await controlWindow(server, 'dsh-page')
      try {
        await page.next('ready')
        expect(await page.report({ position: { slide: 1, step: 0, view: 'present' }, role: 'presenter', status: {} })).toBe(200)
        const submitted = await call(server, 'tasks', { json: { kind: 'chat', prompt: '列出章节，读第一节，运行它的代码，再把放映跳到第二节。', context: { document: '', section: 'first' } } })
        expect(submitted.status, JSON.stringify(submitted.json)).toBe(201)
        const events = taskEvents(`${server}/__presmium/presmium.assistant/tasks/${submitted.json.id}/events`)
        // The window allows running the code, then the move.
        const asked: Record<string, any>[] = []
        for (let i = 0; i < 2; i++) {
          const approval = await page.next('approval', 120_000)
          asked.push(approval.request)
          expect(await page.answer(approval.id, true)).toBe(200)
        }
        expect(asked.map(request => request.kind)).toEqual(['operate', 'operate'])
        expect((await events).at(-1)).toMatchObject({ type: 'done' })
        expect(await page.next('go', 10_000)).toMatchObject({ step: 0 })

        // What DeepSeek Harness gave the model back, call by call.
        const results = model.received.filter(r => r.path.endsWith('/v1/messages')).flatMap((r) => {
          const last = (r.body.messages as { content: unknown }[] | undefined)?.at(-1)
          return (Array.isArray(last?.content) ? last.content as { type: string, content: unknown }[] : []).filter(c => c.type === 'tool_result').map(c => JSON.stringify(c.content))
        })
        expect(results).toHaveLength(4)
        const [sections, section, run, moved] = results as [string, string, string, string]
        expect(sections).toContain('\\"id\\": \\"first\\"')
        expect(sections).toContain('\\"id\\": \\"second\\"')
        expect(section).toContain('讲解：先算六乘七。')
        expect(section).toContain('print(6 * 7)')
        expect(run).toContain('\\"stdout\\": \\"42\\\\n\\"')
        expect(moved).toContain('\\"section\\": \\"second\\"')
      } finally {
        page.close()
      }
    } finally {
      await running.stop()
    }
  }, 300_000)
})
