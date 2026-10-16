// Scripted lectures with the real CLI (WP-83, P-134; docs/ir.md 2.9, 6.3) and the deterministic fake speech
// engine (`presmium-speech fake`, a process of its own, defined as engine `fake` like any engine; it lists the
// requests it got): `presmium build --to lecture` says each paragraph of narration once through SPEECH into
// the synthesis cache and times the cues by the fake engine's word times (220 ms a CJK character, 80 ms
// between words); a second build asks the engine nothing; without the cache and the engine the build fails
// and `presmium check` names the paragraphs. A separate script (`renderers.lecture.script`) replaces the
// narration of its sections in the lecture only. `presmium dev` makes the synthesized lecture on demand, and
// an agent reads its plan with the tool `lecture_preview` (MCP).
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { PRESMIUM_BIN, run } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))
/** Decks whose web form is built live in examples/demo/.presmium (ignored by git), where VitePress resolves. */
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))

type Word = [number, number, string]
interface Track {
  voice: Record<string, unknown>
  utterances: { id: string, t: number, d: number, text: string, words?: Word[], section: string, step: number, clip: string }[]
  events: [number, string, Record<string, unknown>][]
}

/** The environment without Presmium's variables (a developer's machine may define engines), plus `extra`. */
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...process.env }
  delete clean.NODE_ENV
  for (const name of Object.keys(clean)) if (name.startsWith('PRESMIUM_')) delete clean[name]
  return { ...clean, ...extra }
}

const presmium = (dir: string, args: string[], extra: Record<string, string> = {}) => run(process.execPath, [PRESMIUM_BIN, ...args], { cwd: dir, env: env(extra) })

let fake: { url: string, child: ChildProcess }
const engine = () => ({ PRESMIUM_SPEECH_FAKE_URL: fake.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' })
/** The fake engine's synthesis requests so far. */
async function syntheses(): Promise<number> {
  const { requests } = await (await fetch(new URL('/requests', fake.url))).json() as { requests: { method: string, path: string }[] }
  return requests.filter(r => r.method === 'POST' && r.path.startsWith('/v1/audio/speech')).length
}
async function requests(): Promise<number> {
  return ((await (await fetch(new URL('/requests', fake.url))).json()) as { requests: unknown[] }).requests.length
}

beforeAll(async () => {
  const child = spawn(process.execPath, [join(SPEECH, 'bin/presmium-speech.mjs'), 'fake', '--port', '0'], { env: env(), stdio: ['ignore', 'pipe', 'inherit'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^fake {2}(http\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`presmium-speech fake exited (${code}): ${output}`)))
  })
  fake = { url, child }
}, 60_000)

afterAll(() => {
  fake?.child.kill('SIGTERM')
})

const CODE = '(code-1)=\n```python\na = 1\nb = 2\nc = 3\n```'

/** A deck in a new directory under `parent`: the lecture and speech plugins, the voice, and these renderers and sections. */
function deck(parent: string, renderers: string, body: string): string {
  mkdirSync(parent, { recursive: true })
  const dir = mkdtempSync(join(parent, 'presmium-lecture-script-'))
  writeFileSync(join(dir, 'lecture.md'), `---
title: 脚本化讲授
plugins:
  - ${ADDON}
  - ${SPEECH}
renderers:
${renderers}
---

(intro)=
# 开场

我们先看合并。

(merge)=
## 合并

${CODE}

${body}
`)
  return dir
}

const VOICE = '  lecture:\n    voice: { engine: fake, voice: alpha }'
const NARRATION = `我们先看 {cue to=code-1 lines=2-3}\`spot\` 这两行，{cue}\`next\` 再合并。

:::{slide}
:reveal:
第二步
:::

合并之后词表变大。`

/** The fake engine's words of a text said from t: CJK characters 220 ms each, 80 ms apart. */
function fakeWords(text: string, t: number): Word[] {
  return [...text].filter(c => /\p{Script=Han}/u.test(c)).map((c, i): Word => [t + i * 300, 220, c])
}

describe('presmium build --to lecture (P-134)', () => {
  let dir: string
  beforeAll(() => {
    dir = deck(tmpdir(), VOICE, NARRATION)
  })
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('synthesizes each paragraph once into the cache, timed by the engine\'s words; a second build asks nothing; without cache and engine, build and check name the paragraphs', async () => {
    const asked = await syntheses()
    const built = await presmium(dir, ['build', '--to', 'lecture'], engine())
    expect(built.code, built.stdout + built.stderr).toBe(0)
    // One request per paragraph: the opening's and the two of the merge section.
    expect(await syntheses() - asked).toBe(3)

    // The plan: the opening said at its first step; the merge section's first paragraph at step 0, where the
    // spotlight comes with 这 and the next step with 再; after the paragraph and the gap (500 ms), the second.
    const out = join(dir, 'dist/lecture/script')
    const track = JSON.parse(readFileSync(join(out, 'track.json'), 'utf8')) as Track
    expect(track.voice).toEqual({ kind: 'synthetic', engine: 'fake', model: 'fake-tts', voice: 'alpha', provider: 'Presmium fake' })
    expect(track.utterances.map(u => [u.id, u.section, u.step, u.t, u.d, u.text])).toEqual([
      ['u1', 'intro', 0, 0, 1720, '我们先看合并。'],
      ['u2', 'merge', 0, 2220, 2920, '我们先看这两行，再合并。'],
      ['u3', 'merge', 1, 5640, 2320, '合并之后词表变大。'],
    ])
    for (const u of track.utterances) expect(u.words).toEqual(fakeWords(u.text, u.t))
    expect(track.events).toEqual([
      [0, 'go', { section: 'intro', step: 0 }],
      [2220, 'go', { section: 'merge', step: 0 }],
      [3420, 'spot', { block: 'merge/code-1', lines: '2-3', at: ['u2', 4] }],
      [4320, 'go', { section: 'merge', step: 1, at: ['u2', 7] }],
    ])
    // The clips: in the synthesis cache, published beside the track, listed in the lock; the captions.
    for (const u of track.utterances) {
      expect(existsSync(join(dir, '.presmium/speech', u.clip))).toBe(true)
      expect(existsSync(join(out, 'clips', u.clip))).toBe(true)
    }
    const lock = JSON.parse(readFileSync(join(dir, '.presmium/speech.lock.json'), 'utf8')) as { synthesis: Record<string, unknown> }
    expect(Object.keys(lock.synthesis).sort()).toEqual(track.utterances.map(u => u.clip.slice(0, -'.wav'.length)).sort())
    expect(readFileSync(join(out, 'captions.zh-CN.vtt'), 'utf8')).toBe('WEBVTT\n\nu1\n00:00:00.000 --> 00:00:01.720\n我们先看合并。\n\nu2\n00:00:02.220 --> 00:00:05.140\n我们先看这两行，再合并。\n\nu3\n00:00:05.640 --> 00:00:07.960\n合并之后词表变大。\n')

    // Again: every clip is in the cache, so the engine gets no request at all.
    const before = await requests()
    const again = await presmium(dir, ['build', '--to', 'lecture'], engine())
    expect(again.code, again.stdout + again.stderr).toBe(0)
    expect(await requests()).toBe(before)
    expect(JSON.parse(readFileSync(join(out, 'track.json'), 'utf8'))).toEqual(track)

    // Without the cache and without an engine: the build fails and the check names each paragraph.
    rmSync(join(dir, '.presmium/speech'), { recursive: true, force: true })
    const failed = await presmium(dir, ['build', '--to', 'lecture'])
    expect(failed.code).toBe(1)
    for (const u of track.utterances) expect(failed.stdout + failed.stderr).toContain(`「${u.text}」`)
    const checked = await presmium(dir, ['check', '--json'])
    expect(checked.code).toBe(1)
    const findings = (JSON.parse(checked.stdout) as { findings: { checkId: string, severity: string, message: string }[] }).findings.filter(f => f.checkId === 'presmium.lecture')
    expect(findings.map(f => [f.severity, /「(.*)」/.exec(f.message)?.[1]])).toEqual(track.utterances.map(u => ['error', u.text]))
    expect(await requests()).toBe(before)
  }, 240_000)
})

describe('a separate lecture script (P-134)', () => {
  let dir: string
  beforeAll(() => {
    dir = deck(WORK, `  web: {}\n${VOICE}\n    script: lecture.script.md`, NARRATION)
    writeFileSync(join(dir, 'lecture.script.md'), '(merge)=\n## 合并\n\n脚本第一段先看代码。\n\n脚本第二段再看 {cue to=code-1}`spot` 结果。\n')
  })
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('says the script\'s paragraphs at the steps of its section, the k-th at step k, and the narration elsewhere; the web form shows the narration', async () => {
    const built = await presmium(dir, ['build', '--to', 'web,lecture'], engine())
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const track = JSON.parse(readFileSync(join(dir, 'dist/lecture/script/track.json'), 'utf8')) as Track
    expect(track.utterances.map(u => [u.section, u.step, u.text])).toEqual([
      ['intro', 0, '我们先看合并。'],
      ['merge', 0, '脚本第一段先看代码。'],
      ['merge', 1, '脚本第二段再看结果。'],
    ])
    // The first paragraph is said at step 0, the next step comes after it and the gap, and the cue with 结.
    expect(track.utterances.map(u => [u.id, u.t])).toEqual([['u1', 0], ['u2', 2220], ['u3', 5340]])
    expect(track.events).toEqual([
      [0, 'go', { section: 'intro', step: 0 }],
      [2220, 'go', { section: 'merge', step: 0 }],
      [5340, 'go', { section: 'merge', step: 1 }],
      [5340 + 7 * 300, 'spot', { block: 'merge/code-1', at: ['u3', 7] }],
    ])
    // The web form keeps the deck's narration of the section.
    const page = readdirSync(join(dir, 'dist/web')).filter(file => file.endsWith('.html')).map(file => readFileSync(join(dir, 'dist/web', file), 'utf8')).join('\n')
    expect(page).toContain('合并之后词表变大')
    expect(page).not.toContain('脚本第一段')
  }, 300_000)
})

describe('presmium dev', () => {
  let dir: string
  let dev: ChildProcess | undefined
  afterAll(async () => {
    if (dev && dev.exitCode === null) {
      const exited = new Promise(done => dev!.once('exit', done))
      dev.kill('SIGTERM')
      await exited
    }
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('makes the synthesized lecture on demand, and an agent reads its plan with lecture_preview', async () => {
    dir = deck(tmpdir(), VOICE, NARRATION)
    dev = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', 'notebook'], { cwd: dir, env: env(engine()), stdio: ['ignore', 'pipe', 'pipe'] })
    const server = await new Promise<string>((done, fail) => {
      let output = ''
      const read = (chunk: Buffer) => {
        output += chunk
        const match = /^server {2}(http\S+)$/m.exec(output)
        if (match) done(match[1]!)
      }
      dev!.stdout!.on('data', read)
      dev!.stderr!.on('data', read)
      dev!.once('exit', code => fail(new Error(`presmium dev exited (${code}): ${output}`)))
    })
    const route = (path: string) => fetch(`${server}/__presmium/presmium.lecture/${path}`)
    expect(await (await route('tracks')).json()).toEqual([{ id: 'script', lang: 'zh-CN', voice: { kind: 'synthetic', engine: 'fake', voice: 'alpha' } }])
    const asked = await syntheses()
    const track = await (await route('tracks/script')).json() as Track
    expect(track.utterances.map(u => u.text)).toEqual(['我们先看合并。', '我们先看这两行，再合并。', '合并之后词表变大。'])
    expect(await syntheses() - asked).toBe(3)
    const clip = await route(`tracks/script/clips/${track.utterances[0]!.clip}`)
    expect([clip.status, clip.headers.get('content-type')]).toEqual([200, 'audio/wav'])

    const { mcp, token } = JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { mcp: string, token: string }
    const client = new Client({ name: 'presmium-test', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
    try {
      const result = await client.callTool({ name: 'lecture_preview', arguments: { section: 'merge' } }) as { content: { text: string }[] }
      const preview = JSON.parse(result.content[0]!.text) as { voice: unknown, sections: { section: string, paragraphs: { step: number, said: { text: string, cues: { cue: string, before: string }[] }[] }[] }[] }
      expect(preview.voice).toEqual({ engine: 'fake', voice: 'alpha' })
      expect(preview.sections.map(s => s.paragraphs.map(p => [p.step, p.said.map(said => [said.text, said.cues.map(c => [c.cue, c.before[0]])])]))).toEqual([[
        [0, [['我们先看这两行，再合并。', [['spot', '这'], ['next', '再']]]]],
        [1, [['合并之后词表变大。', []]]],
      ]])
    } finally {
      await client.close()
    }
  }, 240_000)
})
