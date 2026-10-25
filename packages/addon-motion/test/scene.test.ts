import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, presmium, run } from '@lincyaw/cli/testing'
import type { ComponentNode, IRDocument } from '@lincyaw/kernel'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const LECTURE = fileURLToPath(new URL('../../addon-lecture', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
// Decks whose web form is built live here, where they find the workspace's packages (as the lecture's video test does).
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))

const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function deck(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-motion-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'scenes/bpe'), { recursive: true })
  writeFileSync(join(dir, 'scenes/bpe/merge.ts'), 'export default {}\n')
  writeFileSync(join(dir, 'lecture.md'), text)
  return dir
}

const SCENES = `---
lang: zh-CN
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
---

(film)=
## 合并

(merge)=
:::{scene} bpe/merge
:durations: 1.2, 800ms, 2s
:aspect: 4:3
三个词的字节对合并。
:::
`

it('makes a scene a component with a step a duration; the notebook shows its description', async () => {
  const dir = deck(SCENES)
  writeFileSync(join(dir, 'scenes/unused.js'), 'export default {}\n')
  const ir = await presmium(dir, ['ir'])
  expect(ir.code, ir.stdout + ir.stderr).toBe(0)
  const doc = JSON.parse(ir.stdout) as IRDocument
  expect(doc.config.presmium['presmium.motion']).toMatchObject({ scenes: ['bpe/merge', 'unused'] })
  const block = doc.sections.find(s => s.id === 'film')!.blocks.find(b => b.id === 'merge')!
  const node = block.node as ComponentNode
  expect([block.at, block.span]).toEqual([0, 2])
  expect([node.plugin, node.name, node.durations]).toEqual(['presmium.motion', 'PmScene', [1200, 800, 2000]])
  expect(node.props).toEqual({ scene: 'bpe/merge', aspect: '4/3', alt: '三个词的字节对合并。' })

  const built = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  const cells = (JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')) as { cells: { source: string[] }[] }).cells
  expect(cells.map(cell => cell.source.join('')).join('\n')).toContain('三个词的字节对合并。')
})

it('fails the build on a scene the deck does not have and on a duration it cannot read, at their lines', async () => {
  const text = SCENES.replace('{scene} bpe/merge', '{scene} bpe/split').replace('800ms', 'fast')
  const dir = deck(text)
  const line = text.split('\n').findIndex(row => row.startsWith(':::{scene}')) + 1
  const { code, stdout, stderr } = await presmium(dir, ['check'])
  expect(code).toBe(1)
  expect(stdout + stderr).toMatch(new RegExp(`lecture\\.md:${line} +error +\\{scene\\}: the deck has no scenes/bpe/split\\.ts`))
  expect(stdout + stderr).toMatch(new RegExp(`lecture\\.md:${line} +error +\\{scene\\}: :durations: takes durations .* not fast`))
})

it('compiles the deck again under presmium dev when the scene file it lacked is added', async () => {
  const dir = deck(SCENES.replace('{scene} bpe/merge', '{scene} later'))
  const env = { ...process.env }
  delete env.NODE_ENV
  const child = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', 'notebook'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const until = (pattern: RegExp) => new Promise<void>((done, fail) => {
    const started = Date.now()
    const check = setInterval(() => {
      if (!pattern.test(output) && Date.now() - started < 60_000 && child.exitCode === null) return
      clearInterval(check)
      if (pattern.test(output)) done()
      else fail(new Error(`no ${pattern} in:\n${output}`))
    }, 100)
  })
  try {
    await until(/the deck has no scenes\/later\.ts[\s\S]*watching/)
    writeFileSync(join(dir, 'scenes/later.ts'), 'export default {}\n')
    await until(/compiled 1 sections; no problems/)
  } finally {
    child.kill('SIGTERM')
  }
}, 120_000)

describe('a synthesized lecture', () => {
  let fake: { url: string, child: ChildProcess }
  beforeAll(async () => {
    const env = { ...process.env }
    delete env.NODE_ENV
    const child = spawn(process.execPath, [join(SPEECH, 'bin/presmium-speech.mjs'), 'fake', '--port', '0'], { env, stdio: ['ignore', 'pipe', 'inherit'] })
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

  const LECTURE_DECK = (narration: string) => `---
title: 动画讲授
plugins:
  - ${ADDON}
  - ${LECTURE}
  - ${SPEECH}
renderers:
  lecture:
    voice: { engine: fake, voice: alpha }
---

(intro)=
# 开场

(film)=
## 动画

(merge)=
:::{scene} bpe/merge
:durations: 2, 3s
:::

${narration}

(end)=
## 结尾

完。
`
  const build = (dir: string) => presmium(dir, ['build', '--to', 'lecture'], { PRESMIUM_SPEECH_FAKE_URL: fake.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' })

  it('waits for a scene\'s animation before it moves on, also after the last word of a section', async () => {
    const dir = deck(LECTURE_DECK('看。'))
    const built = await build(dir)
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const track = JSON.parse(readFileSync(join(dir, 'dist/lecture/script/track.json'), 'utf8')) as { events: [number, string, Record<string, unknown>][] }
    const go = (section: string, step: number) => track.events.find(([, type, data]) => type === 'go' && data.section === section && data.step === step)![0]
    // The narration of the first step is shorter than its animation, the second step has none.
    expect(go('film', 1) - go('film', 0)).toBe(2000)
    expect(go('end', 0) - go('film', 1)).toBe(3000)
    const holds = track.events.filter(([, type, data]) => type === 'pause' && data.hold === true)
    expect(holds.map(([t, , data]) => t + (data.ms as number))).toEqual([go('film', 1), go('end', 0)])
  }, 120_000)

  it('moves on at a {cue}`next` said before the animation has played, and the build warns at the narration', async () => {
    const text = LECTURE_DECK('看 {cue}`next` 下一步。')
    const dir = deck(text)
    const built = await build(dir)
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const line = text.split('\n').findIndex(row => row.startsWith('看 {cue}')) + 1
    expect(built.stdout + built.stderr).toMatch(new RegExp(`lecture\\.md:${line} +warning +lecture script: \\{cue\\}\`next\` moves on \\d+ ms before the animation of step 0 of section film has played`))
  }, 120_000)

  it('stops the video export at a frame whose scene cannot be drawn, saying which frame and why', async () => {
    mkdirSync(WORK, { recursive: true })
    const dir = mkdtempSync(join(WORK, 'motion-broken-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'scenes'))
    writeFileSync(join(dir, 'scenes/broken.ts'), 'export default { engine: \'custom\', create: async () => { throw new Error(\'no WebGL here\') } }\n')
    writeFileSync(join(dir, 'lecture.md'), `---
plugins:
  - ${ADDON}
  - ${LECTURE}
  - ${SPEECH}
renderers:
  web: {}
  lecture:
    voice: { engine: fake, voice: alpha }
---

(film)=
## 动画

:::{scene} broken
:durations: 1
:::

看。
`)
    const env: NodeJS.ProcessEnv = { ...process.env, PRESMIUM_SPEECH_FAKE_URL: fake.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' }
    delete env.NODE_ENV
    const exported = await run(process.execPath, [join(LECTURE, 'bin/presmium-lecture.mjs'), 'export', '.', '--out', join(dir, 'out.webm'), '--fps', '4', '--size', '640x360'], { cwd: dir, env })
    expect(exported.code, exported.stdout + exported.stderr).toBe(2)
    expect(exported.stderr).toMatch(/presmium-lecture: the frame at 0:00 cannot be drawn: .*no WebGL here/)
  }, 300_000)
})
