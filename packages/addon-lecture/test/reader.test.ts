// A reader's lectures in SHARED mode (WP-84, P-55 × P-131, D17; review-round3 F-12, F-13): on this machine
// `presmium serve` behind a login proxy's secret, `presmium gateway` with the fake speech engine
// (`presmium-speech fake`, a process of its own) and `presmium agent-host`. The document `talk` has teacher-only
// narration, a teacher-only section, a reference to that section in the students' narration, and a recorded
// lecture `rec` that goes there, with its audio and synthesized clips; `ghost` names a voice of an engine
// nobody defined.
// - Synthesis is paid, so a reader's request for `tracks/script` before any editor's is refused (409) and asks
//   the engine for nothing; an editor's request has the whole deck's made, then the students'; the reader gets
//   the students', and the engine no new request.
// - Nothing only teachers see reaches a reader: not through `tracks`, `tracks/script`, `tracks/rec`, its clips
//   and media, an error, nor the plugin's reading tools with a `tutor` token (MCP).
// - The media and clip routes open the file they check: while the sandbox swaps the file for a link to the
//   workspace's `.git/config` and back (security-shared/p3-race*.sh), 3000 requests to each get the file or
//   404, never the link's target.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatTrack } from '../src/domain/index.ts'
import type { LectureTrack } from '../src/domain/index.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))
const TUTOR = fileURLToPath(new URL('fixtures/tutor-token', import.meta.url))
/** Workspaces served live in examples/demo/.presmium (ignored by git), where VitePress resolves. */
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))

/** Clips of the synthesis cache the recorded lecture says its sentences with: a student's and a teacher's. */
const STUDENT_CLIP = `${'c'.repeat(32)}.wav`
const TEACHER_CLIP = `${'b'.repeat(32)}.wav`
/** What only teachers see, and what of it the reader's lectures must not hold. */
const TEACHER = ['只给教师看的讲解', '期末考试的第三题', '教师指南', '第三题的答案', 'OggTeacherAudio', 'TEACHER-CLIP']

const DECK = `---
title: 讲授
plugins:
  - "@presmium/slidev-addon-lecture"
  - "@presmium/slidev-addon-speech"
  - presmium-fixture-lecture-tutor
renderers:
  lecture:
    voice: { engine: fake, voice: alpha }
---

(intro)=
# 开场

读者听到的讲授。

关于答案，见{ref}\`guide\`。

:::{only} web, slides, lecture
:audience: teacher
答案是四十二，这句只给教师看的讲解。
:::

(guide)=
## 教师指南

:::{audience} teacher
:::

整节只给教师：期末考试的第三题就是这个例子。
`

/** The recorded lecture: the opening, then the teachers' section, each with its sentence (said in a synthetic voice) and audio. */
const REC: LectureTrack = {
  track: 1,
  id: 'rec',
  doc: 'lecture.md',
  lang: 'zh-CN',
  ir: { hash: '' },
  voice: { kind: 'recorded', speaker: '林老师' },
  audio: [
    { section: 'intro', start: 0, src: 'audio/intro.ogg', duration: 4 },
    { section: 'guide', start: 4, src: 'audio/guide.ogg', duration: 4 },
  ],
  blocks: {},
  utterances: [
    { id: 'u1', t: 500, d: 2000, text: '开场的录音讲解。', section: 'intro', step: 0, clip: STUDENT_CLIP },
    { id: 'u2', t: 4500, d: 2000, text: '录制的教师讲解：第三题的答案。', section: 'guide', step: 0, clip: TEACHER_CLIP },
  ],
  events: [
    [0, 'go', { section: 'intro', step: 0, view: 'present' }],
    [4000, 'go', { section: 'guide', step: 0, view: 'present' }],
  ],
}

/** The environment without Presmium's variables or credentials, plus `extra`. */
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...process.env }
  delete clean.NODE_ENV
  for (const name of Object.keys(clean)) if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete clean[name]
  return { ...clean, ...extra }
}

interface Running {
  child: ChildProcess
  output(): string
  /** Resolves with the first match of `pattern` in the output. */
  wait(pattern: RegExp): Promise<string>
  stop(): Promise<void>
}

function start(command: string, args: string[], cwd: string, extra: Record<string, string>): Running {
  const child = spawn(process.execPath, [command, ...args], { cwd, env: env(extra), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => output += chunk)
  child.stderr!.on('data', (chunk: Buffer) => output += chunk)
  return {
    child,
    output: () => output,
    wait: pattern => new Promise((resolve, reject) => {
      const check = () => {
        const found = pattern.exec(output)
        if (found) resolve(found[1]!)
      }
      child.stdout!.on('data', check)
      child.stderr!.on('data', check)
      child.once('exit', code => reject(new Error(`exited (${code}) before ${pattern}:\n${output}`)))
      check()
    }),
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      await exited
    },
  }
}

/** A GET with exactly these headers (`Host` included, which fetch cannot set). */
function get(url: string, headers: Record<string, string>): Promise<{ status: number, text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { headers, setHost: false, timeout: 120_000 }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => req.destroy(new Error(`timed out: ${url}`)))
    req.on('error', reject)
    req.end()
  })
}

describe('a reader\'s lectures (SHARED)', () => {
  const id = Math.random().toString(36).slice(2, 10)
  const secrets = { proxy: `proxy-${id}`, gateway: `gateway-${id}`, agentHost: `agent-host-${id}` }
  let dir: string
  let operator: string
  const running: Running[] = []
  let fake: string
  let url: string

  beforeAll(async () => {
    const engine = start(join(SPEECH, 'bin/presmium-speech.mjs'), ['fake', '--port', '0'], tmpdir(), {})
    running.push(engine)
    fake = await engine.wait(/^fake {2}(http\S+)$/m)
    mkdirSync(WORK, { recursive: true })
    dir = mkdtempSync(join(WORK, 'lecture-reader-'))
    operator = mkdtempSync(join(tmpdir(), 'presmium-lecture-operator-'))
    const files: Record<string, string> = {
      'presmium.workspace.yaml': 'title: 讲授\nmembers:\n  owners: [owner@test]\n  editors: [editor@test]\nsettings:\n  presmium.workspace:\n    plugins: ["@presmium/slidev-addon-lecture", "@presmium/slidev-addon-speech", presmium-fixture-lecture-tutor]\n',
      'talk/lecture.md': DECK,
      'talk/lectures/rec/track.json': formatTrack(REC),
      'talk/lectures/rec/audio/intro.ogg': 'OggStudentAudio',
      'talk/lectures/rec/audio/guide.ogg': 'OggTeacherAudio',
      [`talk/.presmium/speech/${STUDENT_CLIP}`]: 'STUDENT-CLIP',
      [`talk/.presmium/speech/${TEACHER_CLIP}`]: 'TEACHER-CLIP',
      'ghost/lecture.md': '---\ntitle: 幽灵\nplugins:\n  - "@presmium/slidev-addon-lecture"\n  - "@presmium/slidev-addon-speech"\nrenderers:\n  lecture:\n    voice: { engine: ghost, voice: alpha }\n---\n\n(intro)=\n# 幽灵\n\n没有引擎读得出的这一句讲解。\n',
      '.gitignore': 'node_modules/\ndist/\n',
      'package.json': `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`,
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
    symlinkSync(ADDON, join(dir, 'node_modules/@presmium/slidev-addon-lecture'), 'junction')
    symlinkSync(SPEECH, join(dir, 'node_modules/@presmium/slidev-addon-speech'), 'junction')
    cpSync(TUTOR, join(dir, 'node_modules/presmium-fixture-lecture-tutor'), { recursive: true })
    const git = (args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir })
    git(['init', '-q', '-b', 'main'])
    git(['add', '-A'])
    git(['commit', '-q', '-m', 'Initial commit'])

    const agentHost = start(PRESMIUM_BIN, ['agent-host', '--port', '0'], dir, { PRESMIUM_AGENT_HOST_TOKEN: secrets.agentHost })
    const gateway = start(PRESMIUM_BIN, ['gateway', '--port', '0', '--operator-dir', operator], dir, { PRESMIUM_GATEWAY_TOKEN: secrets.gateway, PRESMIUM_SPEECH_FAKE_URL: fake, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' })
    running.push(agentHost, gateway)
    const [agentHostUrl, gatewayUrl] = await Promise.all([agentHost.wait(/^agent-host {2}(http\S+)$/m), gateway.wait(/^gateway {2}(http\S+)$/m)])
    const serve = start(PRESMIUM_BIN, ['serve', '--port', '0'], dir, {
      PRESMIUM_PROXY_SECRET: secrets.proxy,
      PRESMIUM_GATEWAY_URL: gatewayUrl,
      PRESMIUM_GATEWAY_TOKEN: secrets.gateway,
      PRESMIUM_AGENT_HOST_URL: agentHostUrl,
      PRESMIUM_AGENT_HOST_TOKEN: secrets.agentHost,
      PRESMIUM_CONSOLE_HOST: 'console.test',
    })
    running.unshift(serve)
    url = await serve.wait(/^serve {2}(http\S+)$/m)
  }, 240_000)

  afterAll(async () => {
    for (const child of running) await child.stop()
    for (const path of [dir, operator]) if (path) rmSync(path, { recursive: true, force: true })
  }, 60_000)

  /** A route of the lecture plugin as the login proxy forwards a member's request. */
  const as = (email: string, path: string, document = 'talk', plugin = 'presmium.lecture') => get(`${url}/__presmium/${plugin}/${path}`, {
    'Host': `site.test:${new URL(url).port}`,
    'X-Presmium-Proxy-Secret': secrets.proxy,
    'X-Forwarded-Email': email,
    'Presmium-Document': document,
  })
  const syntheses = async () => ((await (await fetch(new URL('/requests', fake))).json()) as { requests: { method: string, path: string }[] }).requests.filter(r => r.method === 'POST' && r.path.startsWith('/v1/audio/speech')).length
  const texts = (body: string) => (JSON.parse(body) as { utterances: { text: string }[] }).utterances.map(u => u.text)

  it('refuses a reader before an editor had it made, asking the engine nothing; then gives the reader the students\' lecture without a new request', async () => {
    const listed = await as('reader@test', 'tracks')
    expect(listed.status, `${listed.text}\n${running[0]!.output()}`).toBe(200)
    expect(JSON.parse(listed.text)).toEqual([expect.objectContaining({ id: 'script', voice: expect.objectContaining({ kind: 'synthetic' }) }), expect.objectContaining({ id: 'rec', utterances: 1 })])

    const refused = await as('reader@test', 'tracks/script')
    expect(refused.status, refused.text).toBe(409)
    expect(JSON.parse(refused.text).error).toContain('synthesized when an editor opens it')
    expect(await syntheses()).toBe(0)

    const made = await as('editor@test', 'tracks/script')
    expect(made.status, made.text).toBe(200)
    const track = JSON.parse(made.text) as { voice: Record<string, unknown> }
    expect(track.voice).toMatchObject({ kind: 'synthetic', engine: 'fake', voice: 'alpha', provider: 'Presmium fake' })
    expect(texts(made.text)).toEqual(['读者听到的讲授。', '关于答案，见教师指南。', '答案是四十二，这句只给教师看的讲解。', '整节只给教师：期末考试的第三题就是这个例子。'])

    // The students' lecture: their sentences, the reference to the teachers' section without its title.
    const read = await as('reader@test', 'tracks/script')
    expect(read.status, read.text).toBe(200)
    expect(texts(read.text)).toEqual(['读者听到的讲授。', '关于答案，见。'])
    const asked = await syntheses()
    expect(asked).toBe(5)
    expect((await as('reader@test', 'tracks/script')).text).toBe(read.text)
    expect(await syntheses()).toBe(asked)
  }, 180_000)

  it('gives a reader nothing only teachers see: lectures, clips, media, errors, and the reading tools of a tutor token', async () => {
    const reader: string[] = []
    const answer = async (path: string, document?: string) => {
      const got = await as('reader@test', path, document)
      reader.push(`${path} ${got.status} ${got.text}`)
      return got
    }
    await answer('tracks')
    expect(texts((await answer('tracks/script')).text)).toEqual(['读者听到的讲授。', '关于答案，见。'])
    const rec = JSON.parse((await answer('tracks/rec')).text) as LectureTrack
    expect(rec.utterances.map(u => u.text)).toEqual(['开场的录音讲解。'])
    expect(rec.events).toEqual([[0, 'go', { section: 'intro', step: 0, view: 'present' }]])
    expect(rec.audio).toEqual([expect.objectContaining({ section: 'intro', src: 'audio/intro.ogg' })])
    // The clip and the audio of the students' part; not those of the teachers' section.
    expect(await answer(`tracks/rec/clips/${STUDENT_CLIP}`)).toEqual({ status: 200, text: 'STUDENT-CLIP' })
    expect(await answer('tracks/rec/audio/intro.ogg')).toEqual({ status: 200, text: 'OggStudentAudio' })
    expect((await answer(`tracks/rec/clips/${TEACHER_CLIP}`)).status).toBe(404)
    expect((await answer('tracks/rec/audio/guide.ogg')).status).toBe(404)
    expect((await answer('tracks/nothing')).status).toBe(404)
    // No engine says the voice of `ghost`: the reader is told it cannot play, without the sentence.
    const ghost = await answer('tracks/script', 'ghost')
    expect(ghost.status, ghost.text).toBe(502)
    expect(ghost.text).not.toContain('这一句讲解')
    for (const text of TEACHER) expect(reader.join('\n'), text).not.toContain(text)

    // An editor gets the whole lecture.
    const whole = await as('editor@test', 'tracks/rec')
    expect(texts(whole.text)).toEqual(['开场的录音讲解。', '录制的教师讲解：第三题的答案。'])
    expect((await as('editor@test', 'tracks/rec/audio/guide.ogg')).text).toBe('OggTeacherAudio')

    // The tutor token the test plugin's route issues for the reader: the plugin's reading tools read the student view.
    const grant = await as('reader@test', 'tutor', 'talk', 'fixture.lectureTutor')
    expect(grant.status, grant.text).toBe(200)
    const { token } = JSON.parse(grant.text) as { token: string }
    const call = async (method: string, params: Record<string, unknown>) => {
      const response = await fetch(`${url}/mcp`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json, text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      const text = await response.text()
      expect(response.status, text).toBe(200)
      return text.trimStart().startsWith('{') ? text : text.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('')
    }
    await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'presmium-test', version: '0.1.0' } })
    const tools = [
      await call('tools/call', { name: 'lecture_preview', arguments: { document: 'talk' } }),
      await call('tools/call', { name: 'track_narration', arguments: { document: 'talk', track: 'rec' } }),
      await call('tools/call', { name: 'track_translations', arguments: { document: 'talk', track: 'rec', lang: 'en' } }),
    ]
    expect(tools[0]).toContain('读者听到的讲授')
    expect(tools[1]).toContain('开场的录音讲解')
    expect(tools[2]).toContain('开场的录音讲解')
    for (const text of TEACHER) expect(tools.join('\n'), text).not.toContain(text)
  }, 180_000)

  it('serves the media and clip routes from the file it opened: a link swapped in gives 404, never its target', async () => {
    const secret = join(dir, '.git/config')
    const flip = (file: string, real: string) => spawn(process.execPath, ['-e', `
      const { renameSync, rmSync, symlinkSync, writeFileSync } = require('node:fs')
      const [file, real, secret] = process.argv.slice(1)
      for (;;) {
        writeFileSync(file + '.real', real)
        renameSync(file + '.real', file)
        rmSync(file + '.link', { force: true })
        symlinkSync(secret, file + '.link')
        renameSync(file + '.link', file)
      }`, file, real, secret], { stdio: 'ignore' })
    const routes = [
      { path: 'tracks/rec/audio/intro.ogg', file: join(dir, 'talk/lectures/rec/audio/intro.ogg'), real: 'OggStudentAudio' },
      { path: `tracks/rec/clips/${STUDENT_CLIP}`, file: join(dir, 'talk/.presmium/speech', STUDENT_CLIP), real: 'STUDENT-CLIP' },
    ]
    for (const route of routes) {
      const flipper = flip(route.file, route.real)
      const seen = new Map<string, number>()
      try {
        let sent = 0
        await Promise.all(Array.from({ length: 6 }, async () => {
          while (sent < 3000) {
            sent++
            const got = await as('reader@test', route.path)
            const what = got.status === 200 ? got.text : String(got.status)
            seen.set(what, (seen.get(what) ?? 0) + 1)
          }
        }))
      } finally {
        flipper.kill('SIGKILL')
      }
      // The file, or 404 while the link is there: nothing else, the link's target least of all.
      expect([...seen.keys()].filter(what => what !== '404' && what !== route.real), route.path).toEqual([])
      expect(seen.get(route.real), route.path).toBeGreaterThan(0)
      expect([...seen.values()].reduce((a, b) => a + b), route.path).toBeGreaterThanOrEqual(3000)
    }
  }, 300_000)
})
