// DeepSeek Harness bundled with the assistant (D11, D15). Its pinned version composes the three templates
// (`--dump-config`): none uploads session logs or telemetry; `presmium-tutor` has no shell, network or
// file tool of its own (no reading, searching, directory or skill tool, D-13), `presmium-shared` no shell,
// command-execution or network tool, `presmium` keeps the shell with a `workspace-write` sandbox and asking.
// With only a (fake) DEEPSEEK_API_KEY and no command, `presmium dev`'s assistant starts it: the provider is
// DeepSeek, the runtime is what `initialize` reports, `session/new` succeeds, and nothing goes to the model.
// With the operator's Messages-compatible service (PRESMIUM_MODEL_URL, _KEY, _PROVIDER; a fake one here) its
// environment has the URL and key as DEEPSEEK_BASE_URL and DEEPSEEK_API_KEY and none of Presmium's
// variables, and the service receives that key with the question. A question whose model asks to read the
// deck's source or another document gets no tool for it: no teacher sentence reaches the model (F-07). In
// `presmium serve`, a chat task's agent lists the sections, reads one's narration and code, runs its code
// and moves the presentation through Presmium's MCP, a window allowing the two operations (F-49). The
// question with DeepSeek's real model needs DEEPSEEK_API_KEY and is skipped without it.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@presmium/kernel'
import { dshArgs, dshBin, templateFile } from '../src/node/launch.ts'
import type { Template } from '../src/node/launch.ts'
import { fakeModel, recordingProxy } from './fixtures/fake-model.ts'
import type { FakeModel } from './fixtures/fake-model.ts'
import { call, descendants, dev, env, FIXTURES, PACKAGE, presmium, processInfo, ROOT, taskEvents, workspace } from './helpers.ts'

interface Row { id?: string, disabled: boolean, text: string }

/** The rows of a composed profile tree (`--dump-config`), by id. */
function dump(template: Template, home: string): Map<string, Row> {
  const output = execFileSync(process.execPath, [...dshArgs(dshBin()!, template), '--dump-config'], { env: env({ DSH_HOME: home }), encoding: 'utf8' })
  const rows = new Map<string, Row>()
  for (const text of output.split(/^(?=- )/m).slice(1)) {
    const id = /^- id: (\S+)$/m.exec(text)?.[1]
    if (id) rows.set(id, { id, disabled: /^ {2}disabled: true$/m.test(text), text })
  }
  return rows
}

const SHELL = ['tool-bash', 'tool-pwsh']
const EXECUTION = ['tool-jobs', 'ptc-runtime', 'workflow-ptc', 'tool-workflow', 'tool-subagent', 'tool-subagent-fork']
const NETWORK = ['web', 'web-search-deepseek', 'web-fetch-http', 'tool-web']
const UPLOADS = ['session-log-deepseek', 'session-telemetry-otel', 'plugin-package-inventory-deepseek']
/** The tools that read files: reading, searching, the session's directory, skills. */
const TUTOR_FILES = ['tool-fs', 'tool-fs-search', 'tool-working-directory', 'tool-skill']

describe('the templates of the pinned DeepSeek Harness', () => {
  let home: string
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'presmium-dsh-home-'))
  })
  afterAll(() => rmSync(home, { recursive: true, force: true }))

  it('turn off the session-log upload and telemetry; the tutor reads only, the shared author has no shell, command execution or network, the local author keeps the shell in workspace-write and asks', () => {
    expect(dshBin()).toBeDefined()
    const trees = Object.fromEntries((['presmium', 'presmium-shared', 'presmium-tutor'] as Template[]).map(t => [t, dump(t, home)]))
    const disabled = (t: Template, id: string) => {
      const row = trees[t]!.get(id)
      expect(row, `${t}: row ${id} (the template names a row the pinned version lacks?)`).toBeDefined()
      return row!.disabled
    }
    for (const t of Object.keys(trees) as Template[]) {
      for (const id of UPLOADS) expect(disabled(t, id), `${t}: ${id}`).toBe(true)
    }
    for (const id of [...SHELL, ...EXECUTION, ...NETWORK]) {
      expect(disabled('presmium-tutor', id), `presmium-tutor: ${id}`).toBe(true)
      expect(disabled('presmium-shared', id), `presmium-shared: ${id}`).toBe(true)
    }
    // The tutor reads the deck through Presmium's MCP only (the student view): no file tool of its own (D-13).
    for (const id of TUTOR_FILES) expect(disabled('presmium-tutor', id), `presmium-tutor: ${id}`).toBe(true)
    expect(trees['presmium-tutor']!.get('sandbox-policy')!.text).toContain('mode: read-only')
    expect(disabled('presmium-shared', 'tool-fs')).toBe(false)
    expect(disabled('presmium', 'tool-bash')).toBe(false)
    expect(trees.presmium!.get('sandbox-policy')!.text).toContain('mode: workspace-write')
    expect(trees.presmium!.get('approval')!.text).toContain('policy: ask')
    // Every template is a file of the package.
    for (const t of Object.keys(trees) as Template[]) expect(templateFile(t)).toContain(`${PACKAGE}/dsh/`)
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
      DEEPSEEK_API_KEY: 'sk-fake-for-presmium-tests',
      // Anything DeepSeek Harness sends off this machine goes through the proxy, which records it.
      HTTPS_PROXY: proxy.url,
      HTTP_PROXY: proxy.url,
      NO_PROXY: '',
    }))
    try {
      expect((await call(server, 'info')).json).toEqual({ provider: 'DeepSeek', kinds: ['question'] })
      const opened = await fetch(`${server}/__presmium/fixture.runtime/open`, { method: 'POST' })
      const body = await opened.json() as { provider: string, runtime: string, error?: string }
      expect(opened.status, body.error).toBe(200)
      expect(body.provider).toBe('DeepSeek')
      expect(body.runtime).toMatch(/^deepseek-harness\S* \S+$/)
      expect((await call(server, 'info')).json).toEqual({ provider: 'DeepSeek', runtime: body.runtime, kinds: ['question'] })
      await fetch(`${server}/__presmium/fixture.runtime/close`, { method: 'POST' })
      expect(proxy.attempts).toEqual([])
    } finally {
      await running.stop()
      await proxy.close()
    }
  }, 180_000)

  it('with the operator\'s Messages service: its URL and key are DeepSeek Harness\'s, no Presmium variable is; the service receives that key', async () => {
    const model = await fakeModel([{ text: '每一轮合并出现次数最多的一对，见[合并规则](presmium://sections/merge)。' }])
    const { running, server } = await dev(deck, env({
      XDG_STATE_HOME: join(base, 'state'),
      PRESMIUM_MODEL_URL: model.url,
      PRESMIUM_MODEL_KEY: 'model-key-5e8b',
      PRESMIUM_MODEL_PROVIDER: 'Test Provider',
    }))
    try {
      expect((await call(server, 'info')).json).toMatchObject({ provider: 'Test Provider', kinds: ['question'] })
      // The model holds its answer while the test reads the agent's environment.
      model.hold()
      const submitted = await call(server, 'tasks', { json: { kind: 'question', prompt: '合并的是哪一对？', context: { document: '', section: 'merge' } } })
      expect(submitted.status).toBe(201)
      const events = taskEvents(`${server}/__presmium/presmium.assistant/tasks/${submitted.json.id}/events`)
      await expect.poll(() => model.received.length, { timeout: 60_000 }).toBeGreaterThan(0)
      const agent = descendants(running.child.pid!).find(p => p.cmdline.includes('--profile acp'))!
      const seen = processInfo(agent.pid)!.environ
      expect(seen.DEEPSEEK_BASE_URL).toBe(model.url)
      expect(seen.DEEPSEEK_API_KEY).toBe('model-key-5e8b')
      expect(seen.DSH_TELEMETRY_MODE).toBe('DISABLED')
      expect(Object.keys(seen).filter(name => name.startsWith('PRESMIUM_'))).toEqual([])
      expect(agent.cmdline).toContain('presmium-tutor.cordis.yml')
      model.release()
      const done = await events
      expect(done.at(-1)).toEqual({ type: 'done' })
      expect(done.find((e): e is Extract<AgentEvent, { type: 'message' }> => e.type === 'message')?.citations).toEqual([{ label: '合并规则', section: 'merge' }])
      expect(model.received[0]!.headers['x-api-key']).toBe('model-key-5e8b')
      expect(model.received[0]!.path).toBe('/v1/messages')
    } finally {
      model.release()
      await running.stop()
      await model.close()
    }
  }, 180_000)

  it('a question whose model asks to read the deck\'s source and another document gets no file tool: no teacher sentence reaches the model (F-07)', async () => {
    const tutor = join(base, 'tutor')
    mkdirSync(tutor)
    writeFileSync(join(tutor, 'lecture.md'), `${LECTURE}\n\`\`\`{note}\n:audience: teacher\nTEACHER-ONLY-SECRET the quiz answer is option B.\n\`\`\`\n`)
    mkdirSync(join(base, 'other'))
    writeFileSync(join(base, 'other/notes.md'), 'OTHER-DOCUMENT-SECRET grading rubric\n')
    // The model asks for the source, a search of the files and another document, as the audit's probe did.
    const model = await fakeModel([
      { tool: 'read', input: { file_path: join(tutor, 'lecture.md') } },
      { tool: 'grep', input: { pattern: 'SECRET', path: base } },
      { tool: 'read', input: { file_path: join(base, 'other/notes.md') } },
      { text: '我读不到源码，只能经 Presmium 的工具读学生看到的内容。' },
    ])
    const { running, server } = await dev(tutor, env({ XDG_STATE_HOME: join(base, 'state'), PRESMIUM_MODEL_URL: model.url, PRESMIUM_MODEL_KEY: 'model-key-f07', PRESMIUM_MODEL_PROVIDER: 'Test Provider' }))
    try {
      const submitted = await call(server, 'tasks', { json: { kind: 'question', prompt: '这一节的测验答案是什么？', context: { document: '', section: 'merge' } } })
      expect(submitted.status).toBe(201)
      const events = await taskEvents(`${server}/__presmium/presmium.assistant/tasks/${submitted.json.id}/events`)
      expect(events.at(-1)).toEqual({ type: 'done' })
      const messages = model.received.filter(r => r.path.endsWith('/v1/messages'))
      // The model went on after each of its calls, and was offered no tool that reads a file.
      expect(messages.length).toBeGreaterThanOrEqual(4)
      const offered = (messages[0]!.body.tools as { name: string }[]).map(t => t.name)
      expect(offered.filter(name => ['read', 'grep', 'glob', 'working_directory', 'skill'].includes(name))).toEqual([])
      expect(offered).toEqual(expect.arrayContaining(['mcp__presmium__get_section']))
      const sent = JSON.stringify(messages.map(r => r.body))
      expect(sent).not.toContain('TEACHER-ONLY-SECRET')
      expect(sent).not.toContain('OTHER-DOCUMENT-SECRET')
    } finally {
      await running.stop()
      await model.close()
    }
  }, 180_000)

  const key = process.env.DEEPSEEK_API_KEY
  if (!key) console.warn('dsh.test.ts: the question with DeepSeek\'s real model is skipped: set DEEPSEEK_API_KEY to run it')
  it.skipIf(!key)('answers a question with DeepSeek\'s real model (needs DEEPSEEK_API_KEY)', async () => {
    const { running, server } = await dev(deck, env({ XDG_STATE_HOME: join(base, 'state'), DEEPSEEK_API_KEY: key! }))
    try {
      const submitted = await call(server, 'tasks', { json: { kind: 'question', prompt: '这一节讲的合并规则是什么？', context: { document: '', section: 'merge' } } })
      const events = await taskEvents(`${server}/__presmium/presmium.assistant/tasks/${submitted.json.id}/events`)
      expect(events.at(-1)).toEqual({ type: 'done' })
      expect(events.some(e => e.type === 'message' && e.text.trim().length > 0)).toBe(true)
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
