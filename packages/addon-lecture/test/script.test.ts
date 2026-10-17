// Scripted lectures with the real CLI (WP-83, P-134; docs/ir.md 2.9, 6.3) and the deterministic fake speech
// engine (`presmium-speech fake`, a process of its own, defined as engine `fake` like any engine; it lists the
// requests it got): `presmium build --to lecture` says each paragraph of narration once through SPEECH into
// the synthesis cache and times the cues by the fake engine's word times (220 ms a CJK character, 80 ms
// between words); a second build asks the engine nothing; without the cache and the engine the build fails
// and `presmium check` names the paragraphs. A separate script (`renderers.lecture.script`) replaces the
// narration of its sections in the lecture only, and the check names the line of its paragraph with a problem.
// `{only} lecture` narration is said and not shown; an engine that gives no word times has the cues timed by a
// transcript of each clip (kept beside it), or, without a transcription, by the number of characters (WP-84,
// through a front of the fake engine). `presmium dev` makes the synthesized lecture on demand, and an agent
// reads its plan with the tool `lecture_preview` (MCP); the paid tools `lecture_synthesize` and
// `track_transcribe` ask first (a window of the control channel answers), and send the engine nothing when
// refused. A `{say}` that ends a sentence is one word with the times the speech service gives a lexicon's
// replacement there.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
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

    // A problem of a paragraph of the script is reported at that paragraph's line, not at the section's heading.
    writeFileSync(join(dir, 'lecture.script.md'), '(merge)=\n## 合并\n\n脚本第一段先看代码。\n\n脚本第二段再看\n{cue to=nope}`spot` 结果。\n')
    const checked = await presmium(dir, ['check', '--json'], engine())
    const findings = (JSON.parse(checked.stdout) as { findings: { checkId: string, message: string, source?: { file: string, line?: number } }[] }).findings
    expect(findings.filter(f => f.message.includes('nope')).map(f => [f.checkId, f.source?.file.split('/').at(-1), f.source?.line])).toEqual([['presmium.lecture', 'lecture.script.md', 6]])
  }, 300_000)
})

/**
 * A front of the fake engine: its synthesis answers lose their word times (an engine of the OpenAI shape gives
 * none); with `transcribe` false, it refuses transcriptions too.
 */
async function wordless(state: { transcribe: boolean }): Promise<{ url: string, close(): Promise<void> }> {
  const upstream = new URL(fake.url)
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', async () => {
      const path = req.url ?? '/'
      if (path.endsWith('/audio/transcriptions') && !state.transcribe) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'no transcription here' } }))
        return
      }
      const headers: Record<string, string> = {}
      for (const name of ['authorization', 'content-type']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name]
      const response = await fetch(new URL(path, upstream), { method: req.method, headers, ...req.method === 'GET' ? {} : { body: Buffer.concat(chunks) } })
      let body = Buffer.from(await response.arrayBuffer())
      if (path.endsWith('/audio/speech/timestamps') && response.ok) {
        const { words: _words, ...answer } = JSON.parse(body.toString('utf8')) as Record<string, unknown>
        body = Buffer.from(JSON.stringify(answer))
      }
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream' })
      res.end(body)
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

describe('{only} lecture, and an engine without word times (P-134)', () => {
  let dir: string
  let front: Awaited<ReturnType<typeof wordless>>
  const state = { transcribe: true }
  beforeAll(async () => {
    front = await wordless(state)
    dir = deck(tmpdir(), VOICE, '我们先看 {cue to=code-1 lines=2-3}`spot` 这两行。\n\n:::{only} lecture\n只在讲授中说的一句。\n:::\n\n:::{only} web\n只在网页上显示的一句。\n:::')
  })
  afterAll(async () => {
    await front?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })
  const build = async () => {
    const built = await presmium(dir, ['build', '--to', 'lecture'], { PRESMIUM_SPEECH_FAKE_URL: front.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' })
    expect(built.code, built.stdout + built.stderr).toBe(0)
    return JSON.parse(readFileSync(join(dir, 'dist/lecture/script/track.json'), 'utf8')) as Track
  }

  it('says {only} lecture narration and not {only} web; times the cues by a transcript of each clip, kept beside it, else by the characters', async () => {
    // The words of each clip come from its transcript, kept beside it in the synthesis cache.
    const aligned = await build()
    expect(aligned.utterances.map(u => [u.section, u.text])).toEqual([['intro', '我们先看合并。'], ['merge', '我们先看这两行。'], ['merge', '只在讲授中说的一句。']])
    for (const u of aligned.utterances) {
      expect(u.words).toEqual(fakeWords(u.text, u.t))
      expect(existsSync(join(dir, '.presmium/speech', u.clip.replace(/\.wav$/, '.align.json')))).toBe(true)
    }
    const said = aligned.utterances[1]!
    expect(aligned.events.find(([, type]) => type === 'spot')).toEqual([said.words![4]![0], 'spot', { block: 'merge/code-1', lines: '2-3', at: [said.id, 4] }])

    // Without a transcription either: no words, and the cue at its share of the characters (这 is the fifth of eight).
    rmSync(join(dir, '.presmium/speech'), { recursive: true, force: true })
    state.transcribe = false
    const estimated = await build()
    const again = estimated.utterances[1]!
    expect(estimated.utterances.every(u => u.words === undefined)).toBe(true)
    expect(readdirSync(join(dir, '.presmium/speech')).filter(file => file.endsWith('.align.json'))).toEqual([])
    expect(estimated.events.find(([, type]) => type === 'spot')).toEqual([again.t + Math.round(again.d * 4 / 8), 'spot', { block: 'merge/code-1', lines: '2-3', at: [again.id, 4] }])
  }, 240_000)
})

/** A window of the control channel of `presmium dev` (as a page holds one): it answers the approvals it is asked. */
async function controlWindow(server: string): Promise<{ approval(): Promise<string>, answer(id: string, allow: boolean): Promise<void>, close(): void }> {
  const control = `${server}/__presmium/presmium.server/control`
  const abort = new AbortController()
  const response = await fetch(`${control}?window=lecture-test&document=`, { headers: { Accept: 'text/event-stream' }, signal: abort.signal })
  expect(response.status).toBe(200)
  const asked: string[] = []
  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for await (const chunk of response.body!) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true })
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (/^event: approval$/m.test(block)) asked.push((JSON.parse(/^data: (.*)$/m.exec(block)![1]!) as { id: string }).id)
        }
      }
    } catch {
      // Closed.
    }
  })()
  return {
    async approval() {
      for (let waited = 0; asked.length === 0; waited += 100) {
        if (waited > 30_000) throw new Error('no approval was asked')
        await new Promise(done => setTimeout(done, 100))
      }
      return asked.shift()!
    },
    async answer(id, allow) {
      const answered = await fetch(control, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'answer', id, allow }) })
      expect(answered.status, await answered.text()).toBe(200)
    },
    close: () => abort.abort(),
  }
}

describe('presmium dev', () => {
  let dir: string
  let dev: ChildProcess | undefined
  let server: string
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
    server = await new Promise<string>((done, fail) => {
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

  it('asks before lecture_synthesize and track_transcribe: refused, the engine gets no request; allowed, they synthesize and transcribe', async () => {
    // A recorded lecture whose audio is the fake engine's clip of a sentence (which its transcription gives back).
    const said = '录下来的一句讲解。'
    const audio = Buffer.from(await (await fetch(`${fake.url}/audio/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: said, voice: 'beta' }) })).arrayBuffer())
    mkdirSync(join(dir, 'lectures/rec/audio'), { recursive: true })
    writeFileSync(join(dir, 'lectures/rec/audio/intro.wav'), audio)
    writeFileSync(join(dir, 'lectures/rec/track.json'), JSON.stringify({ track: 1, id: 'rec', doc: 'lecture.md', lang: 'zh-CN', ir: { hash: '' }, voice: { kind: 'recorded' }, audio: [{ section: 'intro', start: 0, src: 'audio/intro.wav', duration: 2 }], blocks: {}, utterances: [], events: [[0, 'go', { section: 'intro', step: 0 }]] }))
    rmSync(join(dir, '.presmium/speech'), { recursive: true, force: true })
    const asked = async (path: string) => ((await (await fetch(new URL('/requests', fake.url))).json()) as { requests: { method: string, path: string }[] }).requests.filter(r => r.method === 'POST' && r.path.startsWith(path)).length

    const { mcp, token } = JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { mcp: string, token: string }
    const client = new Client({ name: 'presmium-test', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
    const window = await controlWindow(server)
    /** Calls a paid tool and answers its approval; the tool's result as text, and whether it failed. */
    const paid = async (name: string, args: Record<string, unknown>, allow: boolean) => {
      const result = client.callTool({ name, arguments: args }) as Promise<{ isError?: boolean, content: { text: string }[] }>
      await window.answer(await window.approval(), allow)
      const { isError, content } = await result
      return { failed: isError === true, text: content[0]!.text }
    }
    try {
      for (const [name, args, path] of [['lecture_synthesize', {}, '/v1/audio/speech'], ['track_transcribe', { track: 'rec' }, '/v1/audio/transcriptions']] as const) {
        const before = await asked(path)
        const refused = await paid(name, args, false)
        expect(refused, name).toEqual({ failed: true, text: expect.stringContaining('not allowed') })
        expect(await asked(path), name).toBe(before)
      }
      const synthesized = await paid('lecture_synthesize', {}, true)
      expect(synthesized.failed, synthesized.text).toBe(false)
      expect(JSON.parse(synthesized.text)).toMatchObject({ track: 'script', utterances: 3 })
      expect(await asked('/v1/audio/speech')).toBeGreaterThan(0)
      const transcribed = await paid('track_transcribe', { track: 'rec' }, true)
      expect(transcribed.failed, transcribed.text).toBe(false)
      expect((JSON.parse(transcribed.text) as { utterances: { text: string }[] }).utterances.map(u => u.text)).toEqual([said])
      expect((JSON.parse(readFileSync(join(dir, 'lectures/rec/track.json'), 'utf8')) as { utterances: { text: string }[] }).utterances.map(u => u.text)).toEqual([said])
    } finally {
      window.close()
      await client.close()
    }
  }, 240_000)

  it('says a {say} that ends the sentence as one word, timed as the speech service times a lexicon\'s replacement there', async () => {
    const other = deck(tmpdir(), VOICE, '我们用 {say alias="B P E"}`BPE`')
    try {
      const built = await presmium(other, ['build', '--to', 'lecture'], engine())
      expect(built.code, built.stdout + built.stderr).toBe(0)
      const track = JSON.parse(readFileSync(join(other, 'dist/lecture/script/track.json'), 'utf8')) as Track
      const u = track.utterances.find(item => item.text === '我们用 BPE')!
      const lecture = u.words!.map(([t, d, text]) => [t - u.t, d, text])
      const timed = await (await fetch(`${server}/__presmium/presmium.speech/v1/audio/speech/timestamps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice: 'alpha', input: '我们用 BPE', lang: 'zh-CN', lexicon: { BPE: 'B P E' } }) })).json() as { words: { text: string, start: number, end: number }[] }
      expect(lecture).toEqual([[0, 220, '我'], [300, 220, '们'], [600, 220, '用'], [900, 340, 'BPE']])
      expect(timed.words.map(w => [Math.round(w.start * 1000), Math.round((w.end - w.start) * 1000), w.text])).toEqual(lecture)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  }, 240_000)
})
