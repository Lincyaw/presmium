// A reader's lectures in SHARED mode (WP-84, P-55 × P-131, D17; review-round3 F-12, F-13): on this machine
// `presmium serve` behind a login proxy's secret, `presmium gateway` with the fake speech engine
// (`presmium-speech fake`, a process of its own) and `presmium agent-host`. The document `talk` has teacher-only
// narration in its opening, a teachers' reveal in its quiz, a teacher-only section, a reference to that section
// in the students' narration, and a recorded lecture `rec` that goes through all of them, with its audio, a screen
// video and synthesized clips; `renamed` was recorded when that section was labeled `solutions`, so the deck has
// no such section now; `ghost` names a voice of an engine nobody defined; `later` has a section relabeled
// teacher-only after its lecture was synthesized; `scripted` says a separate script over a teachers' reveal.
// - Synthesis is paid, so a reader's request for `tracks/script` before any editor's is refused (409) and asks
//   the engine for nothing; an editor's request has the whole deck's made, then the students'; the reader gets
//   the students', and the engine no new request. After the deck changes, the reader gets the students'
//   lecture of the latest IR, said with the clips made for editors, still without a new request.
// - Nothing only teachers see reaches a reader: not through `tracks`, `tracks/script`, `tracks/rec`, its clips
//   and media, an error, nor the plugin's reading tools with a `tutor` token (MCP); nor what was said in a
//   section the deck no longer has (`renamed`): what cannot be placed in the student view is left out. It fails
//   closed: what was said and done at a step where a teachers' block is seen or heard goes, and so do the audio
//   and video of a section with anything left out (the screen showed it); a script's paragraph for such a step too.
// - The media and clip routes open the file they check: while the sandbox swaps the file for a link to the
//   workspace's `.git/config` and back (security-shared/p3-race*.sh), 3000 requests to each get the file or
//   404 (both seen), never the link's target. A FIFO in their place, or as a track, gets 404 or is not listed,
//   at once: serve does not wait for a writer.
// - `presmium build --audience student --to lecture` publishes each recorded lecture without the teachers'
//   sections (its compilation left their blocks out before any pass, so the renderer cannot cut the steps
//   where they were: the contract gap named in WP-89d's report).
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { closeSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
const TEACHER = ['只给教师看的讲解', '期末考试的第三题', '教师指南', '第三题的答案', '六乘七是四十二', 'OggTeacherAudio', 'TEACHER-CLIP', 'RENAMED-SECRET', 'OggRenamedTeacher', 'LATER-SECRET', 'SCRIPT-SECRET']
/** What was said, heard and shown with them in the students' sections: readers do not get it either. */
const OVER_TEACHER = ['只给教师的那一段', '揭晓之后', 'OggIntroAudio', 'ScreenOfIntro', 'OggQuizAudio']

const PLUGINS = 'plugins:\n  - "@presmium/slidev-addon-lecture"\n  - "@presmium/slidev-addon-speech"\n  - presmium-fixture-lecture-tutor\n'
const VOICE = 'renderers:\n  lecture:\n    voice: { engine: fake, voice: alpha }\n'

const DECK = `---
title: 讲授
${PLUGINS}${VOICE}---

(intro)=
# 开场

读者听到的讲授。

关于答案，见{ref}\`guide\`。

:::{only} web, slides, lecture
:audience: teacher
答案是四十二，这句只给教师看的讲解。
:::

(practice)=
## 练习

练习这一节，读者与教师都听到。

(quiz)=
## 测验

:::{slide}
测验：六乘七等于几？
:::

:::{slide}
:label: reveal
:reveal:
:audience: teacher
揭晓：六乘七是四十二。
:::

(guide)=
## 教师指南

:::{audience} teacher
:::

整节只给教师：期末考试的第三题就是这个例子。
`

/**
 * The recorded lecture: the opening (said over the teachers' paragraph, its screen recorded), the practice, the quiz
 * (its teachers' reveal at step 1, spotlighted), then the teachers' section; each with its sentences and audio.
 */
const REC: LectureTrack = {
  track: 1,
  id: 'rec',
  doc: 'lecture.md',
  lang: 'zh-CN',
  ir: { hash: '' },
  voice: { kind: 'recorded', speaker: '林老师' },
  audio: [
    { section: 'intro', start: 0, src: 'audio/intro.ogg', duration: 3 },
    { section: 'practice', start: 3, src: 'audio/practice.ogg', duration: 3 },
    { section: 'quiz', start: 6, src: 'audio/quiz.ogg', duration: 4 },
    { section: 'guide', start: 10, src: 'audio/guide.ogg', duration: 3 },
  ],
  video: [{ section: 'intro', start: 0, src: 'video/intro.screen.webm', duration: 3, kind: 'screen' }],
  blocks: {},
  utterances: [
    { id: 'u1', t: 500, d: 2000, text: '开场时念出了只给教师的那一段。', section: 'intro', step: 0 },
    { id: 'u2', t: 3500, d: 2000, text: '练习的录音讲解。', section: 'practice', step: 0, clip: STUDENT_CLIP },
    { id: 'u3', t: 6500, d: 1000, text: '测验题的录音讲解。', section: 'quiz', step: 0 },
    { id: 'u4', t: 8500, d: 1000, text: '揭晓之后的录音讲解。', section: 'quiz', step: 1 },
    { id: 'u5', t: 10500, d: 2000, text: '录制的教师讲解：第三题的答案。', section: 'guide', step: 0, clip: TEACHER_CLIP },
  ],
  events: [
    [0, 'go', { section: 'intro', step: 0, view: 'present' }],
    [3000, 'go', { section: 'practice', step: 0, view: 'present' }],
    [6000, 'go', { section: 'quiz', step: 0, view: 'present' }],
    [8000, 'go', { section: 'quiz', step: 1, view: 'present' }],
    [8600, 'spot', { block: 'quiz/reveal' }],
    [10000, 'go', { section: 'guide', step: 0, view: 'present' }],
  ],
}

/** Recorded when the teachers' section was labeled `solutions`: what was said there repeats the deck's text. */
const RENAMED: LectureTrack = {
  ...REC,
  id: 'renamed',
  audio: [
    { section: 'practice', start: 0, src: 'audio/practice.ogg', duration: 4 },
    { section: 'solutions', start: 4, src: 'audio/solutions.ogg', duration: 4 },
  ],
  video: [],
  utterances: [
    { id: 'u1', t: 500, d: 2000, text: '练习的另一段录音。', section: 'practice', step: 0 },
    { id: 'u2', t: 4500, d: 2000, text: 'RENAMED-SECRET 整节只给教师：期末考试的第三题就是这个例子。', section: 'solutions', step: 0 },
    // Said in the teachers' section without a section of its own: placed by the move before it.
    { id: 'u3', t: 6600, d: 1000, text: 'RENAMED-SECRET 第三题的答案。' },
  ],
  events: [
    [0, 'go', { section: 'practice', step: 0, view: 'present' }],
    [4000, 'go', { section: 'solutions', step: 0, view: 'present' }],
    [6800, 'mark', { label: 'RENAMED-SECRET' }],
  ],
}

/** A deck whose second section is relabeled teacher-only (`teacher`) after its lecture was synthesized. */
const LATER = (teacher: boolean) => `---
title: 后来
${PLUGINS}${VOICE}---

(intro)=
# 开场

后来这份讲义的开场。

(answers)=
## 答案

${teacher ? ':::{audience} teacher\n:::\n\n' : ''}LATER-SECRET 这一节后来改为只给教师：第三题的答案是四十二。
`

/** A deck said from a separate script, whose second paragraph is for the step of a teachers' reveal. */
const SCRIPTED = `---
title: 脚本
${PLUGINS}renderers:
  lecture:
    voice: { engine: fake, voice: alpha }
    script: lecture.script.md
---

(quiz)=
# 测验

:::{slide}
测验：六乘七等于几？
:::

:::{slide}
:reveal:
:audience: teacher
揭晓：六乘七是四十二。
:::
`

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
      'talk/lectures/rec/audio/intro.ogg': 'OggIntroAudio',
      'talk/lectures/rec/audio/practice.ogg': 'OggStudentAudio',
      'talk/lectures/rec/audio/quiz.ogg': 'OggQuizAudio',
      'talk/lectures/rec/audio/guide.ogg': 'OggTeacherAudio',
      'talk/lectures/rec/video/intro.screen.webm': 'ScreenOfIntro',
      'talk/lectures/renamed/track.json': formatTrack(RENAMED),
      'talk/lectures/renamed/audio/practice.ogg': 'OggRenamedPractice',
      'talk/lectures/renamed/audio/solutions.ogg': 'OggRenamedTeacher',
      [`talk/.presmium/speech/${STUDENT_CLIP}`]: 'STUDENT-CLIP',
      [`talk/.presmium/speech/${TEACHER_CLIP}`]: 'TEACHER-CLIP',
      'ghost/lecture.md': '---\ntitle: 幽灵\nplugins:\n  - "@presmium/slidev-addon-lecture"\n  - "@presmium/slidev-addon-speech"\nrenderers:\n  lecture:\n    voice: { engine: ghost, voice: alpha }\n---\n\n(intro)=\n# 幽灵\n\n没有引擎读得出的这一句讲解。\n',
      'later/lecture.md': LATER(false),
      'scripted/lecture.md': SCRIPTED,
      'scripted/lecture.script.md': '(quiz)=\n# 测验\n\n脚本第一段：先读题。\n\nSCRIPT-SECRET 脚本第二段：揭晓答案是四十二。\n',
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
  /** Calls a tool of Presmium's MCP with a `tutor` token the test plugin's route issues for the reader. */
  const tutor = async () => {
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
    return (name: string, args: Record<string, unknown>) => call('tools/call', { name, arguments: args })
  }

  it('refuses a reader before an editor had it made, asking the engine nothing; then gives the reader the students\' lecture without a new request', async () => {
    const listed = await as('reader@test', 'tracks')
    expect(listed.status, `${listed.text}\n${running[0]!.output()}`).toBe(200)
    expect(JSON.parse(listed.text)).toEqual([
      expect.objectContaining({ id: 'script', voice: expect.objectContaining({ kind: 'synthetic' }) }),
      expect.objectContaining({ id: 'rec', utterances: 2 }),
      expect.objectContaining({ id: 'renamed', utterances: 1 }),
    ])

    const refused = await as('reader@test', 'tracks/script')
    expect(refused.status, refused.text).toBe(409)
    expect(JSON.parse(refused.text).error).toContain('synthesized when an editor opens it')
    expect(await syntheses()).toBe(0)

    const made = await as('editor@test', 'tracks/script')
    expect(made.status, made.text).toBe(200)
    const track = JSON.parse(made.text) as { voice: Record<string, unknown> }
    expect(track.voice).toMatchObject({ kind: 'synthetic', engine: 'fake', voice: 'alpha', provider: 'Presmium fake' })
    expect(texts(made.text)).toEqual(['读者听到的讲授。', '关于答案，见教师指南。', '答案是四十二，这句只给教师看的讲解。', '练习这一节，读者与教师都听到。', '整节只给教师：期末考试的第三题就是这个例子。'])

    // The students' lecture: their sentences, the reference to the teachers' section without its title.
    const read = await as('reader@test', 'tracks/script')
    expect(read.status, read.text).toBe(200)
    expect(texts(read.text)).toEqual(['读者听到的讲授。', '关于答案，见。', '练习这一节，读者与教师都听到。'])
    const asked = await syntheses()
    expect(asked).toBe(6)
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
    expect(texts((await answer('tracks/script')).text)).toEqual(['读者听到的讲授。', '关于答案，见。', '练习这一节，读者与教师都听到。'])
    // Failing closed: nothing of what was said, done, heard or shown at a step where a teachers' block is (the
    // opening's paragraph, the quiz's reveal), nor the audio and screen of a section with anything left out.
    const rec = JSON.parse((await answer('tracks/rec')).text) as LectureTrack
    expect(rec.utterances.map(u => [u.section, u.step, u.text])).toEqual([['practice', 0, '练习的录音讲解。'], ['quiz', 0, '测验题的录音讲解。']])
    expect(rec.events).toEqual([[3000, 'go', { section: 'practice', step: 0, view: 'present' }], [6000, 'go', { section: 'quiz', step: 0, view: 'present' }]])
    expect(rec.audio).toEqual([expect.objectContaining({ section: 'practice', src: 'audio/practice.ogg' })])
    expect(rec.video ?? []).toEqual([])
    // The clip and the audio of the students' part; not those of the teachers' section, nor of a section with teachers' content.
    expect(await answer(`tracks/rec/clips/${STUDENT_CLIP}`)).toEqual({ status: 200, text: 'STUDENT-CLIP' })
    expect(await answer('tracks/rec/audio/practice.ogg')).toEqual({ status: 200, text: 'OggStudentAudio' })
    for (const path of [`clips/${TEACHER_CLIP}`, 'audio/guide.ogg', 'audio/intro.ogg', 'audio/quiz.ogg', 'video/intro.screen.webm']) expect((await answer(`tracks/rec/${path}`)).status, path).toBe(404)
    expect((await answer('tracks/nothing')).status).toBe(404)
    // A section the deck no longer has: what was said and done there, and its audio, are left out.
    const renamed = JSON.parse((await answer('tracks/renamed')).text) as LectureTrack
    expect(renamed.utterances.map(u => u.text)).toEqual(['练习的另一段录音。'])
    expect(renamed.events).toEqual([[0, 'go', { section: 'practice', step: 0, view: 'present' }]])
    expect(renamed.audio).toEqual([expect.objectContaining({ section: 'practice', src: 'audio/practice.ogg' })])
    expect(await answer('tracks/renamed/audio/practice.ogg')).toEqual({ status: 200, text: 'OggRenamedPractice' })
    expect((await answer('tracks/renamed/audio/solutions.ogg')).status).toBe(404)
    // No engine says the voice of `ghost`: the reader is told it cannot play, without the sentence.
    const ghost = await answer('tracks/script', 'ghost')
    expect(ghost.status, ghost.text).toBe(502)
    expect(ghost.text).not.toContain('这一句讲解')
    for (const text of [...TEACHER, ...OVER_TEACHER]) expect(reader.join('\n'), text).not.toContain(text)

    // An editor gets the whole lecture.
    const whole = await as('editor@test', 'tracks/rec')
    expect(texts(whole.text)).toEqual(REC.utterances.map(u => u.text))
    expect((await as('editor@test', 'tracks/rec/audio/guide.ogg')).text).toBe('OggTeacherAudio')
    expect((await as('editor@test', 'tracks/rec/video/intro.screen.webm')).text).toBe('ScreenOfIntro')

    // The tutor token the test plugin's route issues for the reader: the plugin's reading tools read the student view.
    const tool = await tutor()
    const tools = [
      await tool('lecture_preview', { document: 'talk' }),
      await tool('track_narration', { document: 'talk', track: 'rec' }),
      await tool('track_translations', { document: 'talk', track: 'rec', lang: 'en' }),
      await tool('track_narration', { document: 'talk', track: 'renamed' }),
      await tool('track_translations', { document: 'talk', track: 'renamed', lang: 'en' }),
    ]
    expect(tools[0]).toContain('读者听到的讲授')
    expect(tools[1]).toContain('练习的录音讲解')
    expect(tools[2]).toContain('测验题的录音讲解')
    expect(tools[3]).toContain('练习的另一段录音')
    expect(tools[4]).toContain('练习的另一段录音')
    for (const text of [...TEACHER, ...OVER_TEACHER]) expect(tools.join('\n'), text).not.toContain(text)
  }, 180_000)

  it('gives a reader the students\' lecture of the latest IR: a section relabeled teacher-only after synthesis is no longer said, and nothing new is synthesized', async () => {
    const made = await as('editor@test', 'tracks/script', 'later')
    expect(made.status, made.text).toBe(200)
    expect(texts(made.text)).toEqual(['后来这份讲义的开场。', 'LATER-SECRET 这一节后来改为只给教师：第三题的答案是四十二。'])
    const before = await as('reader@test', 'tracks/script', 'later')
    expect(texts(before.text)).toHaveLength(2)
    const secretClip = (JSON.parse(before.text) as LectureTrack).utterances[1]!.clip!
    const asked = await syntheses()

    writeFileSync(join(dir, 'later/lecture.md'), LATER(true))
    // Until serve compiled the change; then the students' lecture of the new IR, said with the clips made before.
    const deadline = Date.now() + 90_000
    let got = before
    while (Date.now() < deadline && got.text.includes('LATER-SECRET')) {
      await new Promise(resolve => setTimeout(resolve, 500))
      got = await as('reader@test', 'tracks/script', 'later')
    }
    expect(got.status, got.text).toBe(200)
    expect(texts(got.text)).toEqual(['后来这份讲义的开场。'])
    expect((await as('reader@test', `tracks/script/clips/${secretClip}`, 'later')).status).toBe(404)
    expect(await syntheses()).toBe(asked)
    // An editor still gets it whole.
    expect(texts((await as('editor@test', 'tracks/script', 'later')).text)).toHaveLength(2)
  }, 180_000)

  it('says a separate script\'s paragraph for the step of a teachers\' reveal to editors only', async () => {
    const made = await as('editor@test', 'tracks/script', 'scripted')
    expect(made.status, made.text).toBe(200)
    expect(texts(made.text)).toEqual(['脚本第一段：先读题。', 'SCRIPT-SECRET 脚本第二段：揭晓答案是四十二。'])
    const read = await as('reader@test', 'tracks/script', 'scripted')
    expect(read.status, read.text).toBe(200)
    expect(texts(read.text)).toEqual(['脚本第一段：先读题。'])
    const preview = await (await tutor())('lecture_preview', { document: 'scripted' })
    expect(preview).toContain('脚本第一段')
    expect(preview).not.toContain('SCRIPT-SECRET')
  }, 180_000)

  it('publishes each recorded lecture without the teachers\' sections in a build for students (P-55)', async () => {
    const out = mkdtempSync(join(tmpdir(), 'presmium-lecture-student-'))
    try {
      const built = spawnSync(process.execPath, [PRESMIUM_BIN, 'build', '--audience', 'student', '--to', 'lecture', '--out', out], {
        cwd: join(dir, 'talk'),
        env: env({ PRESMIUM_SPEECH_FAKE_URL: fake, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake', PRESMIUM_OPERATOR_DIR: operator }),
        encoding: 'utf8',
        timeout: 150_000,
      })
      expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0)
      const published = (id: string) => JSON.parse(readFileSync(join(out, 'lecture', id, 'track.json'), 'utf8')) as LectureTrack
      expect(published('rec').utterances.map(u => u.section)).not.toContain('guide')
      expect(published('rec').utterances.map(u => u.text)).toContain('练习的录音讲解。')
      expect(published('renamed').utterances.map(u => u.text)).toEqual(['练习的另一段录音。'])
      expect(published('renamed').audio).toEqual([expect.objectContaining({ section: 'practice' })])
      expect(readFileSync(join(out, 'lecture/rec/audio/practice.ogg'), 'utf8')).toBe('OggStudentAudio')
      expect(existsSync(join(out, 'lecture/rec/audio/guide.ogg'))).toBe(false)
      expect(existsSync(join(out, 'lecture/renamed/audio/solutions.ogg'))).toBe(false)
      expect(existsSync(join(out, 'lecture/rec/clips', TEACHER_CLIP))).toBe(false)
      const files = readdirSync(out, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name))
      const text = files.map(file => readFileSync(file, 'utf8')).join('\n')
      for (const secret of TEACHER) expect(text, secret).not.toContain(secret)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 180_000)

  it('serves the media and clip routes from the file it opened: a link swapped in gives 404, never its target', async () => {
    const secret = join(dir, '.git/config')
    // Swaps the file for the link and back for as long as it runs; says `swapping` once it has swapped both ways.
    const flip = async (file: string, real: string) => {
      const child = spawn(process.execPath, ['-e', `
        const { renameSync, rmSync, symlinkSync, writeFileSync } = require('node:fs')
        const [file, real, secret] = process.argv.slice(1)
        for (let n = 0; ; n++) {
          writeFileSync(file + '.real', real)
          renameSync(file + '.real', file)
          rmSync(file + '.link', { force: true })
          symlinkSync(secret, file + '.link')
          renameSync(file + '.link', file)
          if (n === 0) process.stdout.write('swapping\\n')
        }`, file, real, secret], { stdio: ['ignore', 'pipe', 'ignore'] })
      await new Promise<void>((resolve, reject) => {
        child.stdout!.once('data', () => resolve())
        child.once('exit', code => reject(new Error(`the swapping process exited (${code})`)))
      })
      return child
    }
    const routes = [
      { path: 'tracks/rec/audio/practice.ogg', file: join(dir, 'talk/lectures/rec/audio/practice.ogg'), real: 'OggStudentAudio' },
      { path: `tracks/rec/clips/${STUDENT_CLIP}`, file: join(dir, 'talk/.presmium/speech', STUDENT_CLIP), real: 'STUDENT-CLIP' },
    ]
    for (const route of routes) {
      const flipper = await flip(route.file, route.real)
      const seen = new Map<string, number>()
      try {
        let sent = 0
        // 3000 requests, and more until one came while the link was there (the race was run), up to 30000.
        await Promise.all(Array.from({ length: 6 }, async () => {
          while (sent < 3000 || (!seen.has('404') && sent < 30_000)) {
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
      expect(seen.get('404'), route.path).toBeGreaterThan(0)
      expect([...seen.values()].reduce((a, b) => a + b), route.path).toBeGreaterThanOrEqual(3000)
    }
  }, 300_000)

  it('does not wait for a writer of a FIFO in place of a track, a medium or a clip: it is not listed, or 404, and serve answers', async () => {
    /** A request that must be answered within 10 s (serve waiting on a FIFO answers none). */
    const soon = <T>(promise: Promise<T>, what: string) => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer to ${what} in 10 s`)), 10_000))])
    const fifos: string[] = []
    const fifo = (file: string) => {
      rmSync(file, { force: true })
      mkdirSync(dirname(file), { recursive: true })
      execFileSync('mkfifo', [file])
      fifos.push(file)
    }
    const media = join(dir, 'talk/lectures/rec/audio/practice.ogg')
    const clip = join(dir, 'talk/.presmium/speech', STUDENT_CLIP)
    try {
      fifo(join(dir, 'talk/lectures/evil/track.json'))
      fifo(media)
      fifo(clip)
      const listed = await soon(as('reader@test', 'tracks'), 'tracks')
      expect(listed.status, listed.text).toBe(200)
      expect((JSON.parse(listed.text) as { id: string }[]).map(track => track.id)).toEqual(['script', 'rec', 'renamed'])
      expect((await soon(as('reader@test', 'tracks/rec/audio/practice.ogg'), 'the medium')).status).toBe(404)
      expect((await soon(as('reader@test', `tracks/rec/clips/${STUDENT_CLIP}`), 'the clip')).status).toBe(404)
      expect((await soon(as('editor@test', 'tracks/rec'), 'an editor\'s request')).status).toBe(200)
    } finally {
      // A serve that waits gets its writer, so the suite can end.
      for (const file of fifos) {
        try {
          closeSync(openSync(file, constants.O_WRONLY | constants.O_NONBLOCK))
        } catch {
          // No reader waits.
        }
        rmSync(file, { force: true })
      }
      writeFileSync(media, 'OggStudentAudio')
      writeFileSync(`${clip}.tmp`, 'STUDENT-CLIP')
      renameSync(`${clip}.tmp`, clip)
    }
  }, 60_000)
})
