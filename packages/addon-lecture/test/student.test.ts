import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@presmium/cli/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { formatTrack, irHash, sectionHashes } from '../src/domain/index.ts'
import type { IRDocument } from '@presmium/kernel'
import type { LectureTrack } from '../src/domain/index.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))

const STUDENT_CLIP = `${'c'.repeat(32)}.wav`
const TEACHER_CLIP = `${'b'.repeat(32)}.wav`
const TEACHER = ['只给教师看的讲解', '期末考试的第三题', '教师指南', '第三题的答案', '六乘七是四十二', 'OggTeacherAudio', 'TEACHER-CLIP', 'RENAMED-SECRET', 'OggRenamedTeacher']
const CHANGED = ['开场时念出了只给教师的那一段', 'OggIntroAudio', 'ScreenOfIntro', '测验题的录音讲解', '揭晓之后的录音讲解', 'OggQuizAudio', 'MOVED-HINT', 'OggMovedPractice']
const HINT = '提示：先数出每一对相邻符号出现的次数，再决定合并哪一对。'

const DECK = `---
title: 讲授
plugins:
  - ${ADDON}
  - ${SPEECH}
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

${HINT}
`

const BEFORE = DECK.replace(`\n${HINT}\n`, '\n').replace('练习这一节，读者与教师都听到。\n', `练习这一节，读者与教师都听到。\n\n${HINT}\n`)

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
    { id: 'u3', t: 6600, d: 1000, text: 'RENAMED-SECRET 第三题的答案。' },
  ],
  events: [
    [0, 'go', { section: 'practice', step: 0, view: 'present' }],
    [4000, 'go', { section: 'solutions', step: 0, view: 'present' }],
    [6800, 'mark', { label: 'RENAMED-SECRET' }],
  ],
}

const MOVED: LectureTrack = {
  ...REC,
  id: 'moved',
  audio: [{ section: 'practice', start: 0, src: 'audio/practice.ogg', duration: 4 }],
  video: [],
  utterances: [{ id: 'u1', t: 500, d: 2000, text: 'MOVED-HINT 我们先把相邻的两个符号配成对，数一数。', section: 'practice', step: 0 }],
  events: [[0, 'go', { section: 'practice', step: 0, view: 'present' }]],
}

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...process.env }
  delete clean.NODE_ENV
  for (const name of Object.keys(clean)) if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete clean[name]
  return { ...clean, ...extra }
}

let dir: string
let operator: string
let engine: ChildProcess
let fake: string

beforeAll(async () => {
  engine = spawn(process.execPath, [join(SPEECH, 'bin/presmium-speech.mjs'), 'fake', '--port', '0'], { env: env(), stdio: ['ignore', 'pipe', 'inherit'] })
  fake = await new Promise<string>((resolve, reject) => {
    let output = ''
    engine.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const found = /^fake {2}(http\S+)$/m.exec(output)
      if (found) resolve(found[1]!)
    })
    engine.once('exit', code => reject(new Error(`the fake engine exited (${code}): ${output}`)))
  })
  dir = mkdtempSync(join(tmpdir(), 'presmium-lecture-student-'))
  operator = mkdtempSync(join(tmpdir(), 'presmium-lecture-operator-'))
  const recorded = async (deck: string) => {
    const at = mkdtempSync(join(tmpdir(), 'presmium-lecture-recorded-'))
    try {
      writeFileSync(join(at, 'lecture.md'), deck)
      const ir = await run(process.execPath, [PRESMIUM_BIN, 'ir', '--out', join(at, 'ir.json')], { cwd: at, env: env() })
      expect(ir.code, ir.stdout + ir.stderr).toBe(0)
      const doc = JSON.parse(readFileSync(join(at, 'ir.json'), 'utf8')) as IRDocument
      return { hash: irHash(doc), sections: sectionHashes(doc) }
    } finally {
      rmSync(at, { recursive: true, force: true })
    }
  }
  const [whole, before] = await Promise.all([recorded(DECK), recorded(BEFORE)])
  expect(before.sections.practice).not.toBe(whole.sections.practice)
  const files: Record<string, string> = {
    'lecture.md': DECK,
    'lectures/rec/track.json': formatTrack({ ...REC, ir: whole }),
    'lectures/rec/audio/intro.ogg': 'OggIntroAudio',
    'lectures/rec/audio/practice.ogg': 'OggStudentAudio',
    'lectures/rec/audio/quiz.ogg': 'OggQuizAudio',
    'lectures/rec/audio/guide.ogg': 'OggTeacherAudio',
    'lectures/rec/video/intro.screen.webm': 'ScreenOfIntro',
    'lectures/renamed/track.json': formatTrack({ ...RENAMED, ir: { hash: 'renamed', sections: { practice: whole.sections.practice!, solutions: 'renamed' } } }),
    'lectures/moved/track.json': formatTrack({ ...MOVED, ir: before }),
    'lectures/moved/audio/practice.ogg': 'OggMovedPractice',
    'lectures/renamed/audio/practice.ogg': 'OggRenamedPractice',
    'lectures/renamed/audio/solutions.ogg': 'OggRenamedTeacher',
    [`.presmium/speech/${STUDENT_CLIP}`]: 'STUDENT-CLIP',
    [`.presmium/speech/${TEACHER_CLIP}`]: 'TEACHER-CLIP',
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}, 60_000)

afterAll(() => {
  engine?.kill('SIGTERM')
  for (const path of [dir, operator]) if (path) rmSync(path, { recursive: true, force: true })
})

it('publishes each recorded lecture without the teachers\' sections, nor what was said and shown in a section that lost something for the teachers since its recording, in a build for students (P-55, F-13)', async () => {
  const out = join(dir, 'student')
  const built = await run(process.execPath, [PRESMIUM_BIN, 'build', '--audience', 'student', '--to', 'lecture', '--out', out], {
    cwd: dir,
    env: env({ PRESMIUM_SPEECH_FAKE_URL: fake, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake', PRESMIUM_OPERATOR_DIR: operator }),
  })
  expect(built.code, `${built.stdout}\n${built.stderr}`).toBe(0)
  const published = (id: string) => JSON.parse(readFileSync(join(out, 'lecture', id, 'track.json'), 'utf8')) as LectureTrack
  expect(published('rec').utterances.map(u => u.text)).toEqual(['练习的录音讲解。'])
  expect(published('rec').audio).toEqual([expect.objectContaining({ section: 'practice' })])
  expect(published('rec').video).toEqual([])
  expect(existsSync(join(out, 'lecture/rec/audio/intro.ogg'))).toBe(false)
  expect(existsSync(join(out, 'lecture/rec/video/intro.screen.webm'))).toBe(false)
  expect(existsSync(join(out, 'lecture/moved'))).toBe(false)
  expect((JSON.parse(readFileSync(join(out, 'lecture/index.json'), 'utf8')) as { id: string }[]).map(entry => entry.id).sort()).toEqual(['rec', 'renamed', 'script'])
  expect(published('renamed').utterances.map(u => u.text)).toEqual(['练习的另一段录音。'])
  expect(published('renamed').audio).toEqual([expect.objectContaining({ section: 'practice' })])
  expect(readFileSync(join(out, 'lecture/rec/audio/practice.ogg'), 'utf8')).toBe('OggStudentAudio')
  expect(existsSync(join(out, 'lecture/rec/audio/guide.ogg'))).toBe(false)
  expect(existsSync(join(out, 'lecture/renamed/audio/solutions.ogg'))).toBe(false)
  expect(existsSync(join(out, 'lecture/rec/clips', TEACHER_CLIP))).toBe(false)
  const written = readdirSync(out, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name))
  const text = written.map(file => readFileSync(file, 'utf8')).join('\n')
  for (const secret of [...TEACHER, ...CHANGED]) expect(text, secret).not.toContain(secret)
}, 180_000)
