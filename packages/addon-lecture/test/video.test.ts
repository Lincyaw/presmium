// `presmium-lecture export` (WP-83, P-135): the synthesized lecture of a test deck (said by the deterministic
// fake speech engine, a process of its own) played in Chromium a frame at a time and written as WebM with its
// audio. The file is read back with Mediabunny: a video and an Opus audio track, as long as the lecture track
// (within a second), labeled as AI-generated speech. The deck lives in examples/demo/.presmium (ignored by
// git), where its web form builds.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@presmium/cli/testing'
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseTrack, trackDuration } from '../src/domain/index.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))
const LECTURE_BIN = join(ADDON, 'bin/presmium-lecture.mjs')
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...process.env }
  delete clean.NODE_ENV
  for (const name of Object.keys(clean)) if (name.startsWith('PRESMIUM_')) delete clean[name]
  return { ...clean, ...extra }
}

let fake: ChildProcess | undefined
let dir: string
let engine: Record<string, string>

beforeAll(async () => {
  fake = spawn(process.execPath, [join(SPEECH, 'bin/presmium-speech.mjs'), 'fake', '--port', '0'], { env: env(), stdio: ['ignore', 'pipe', 'inherit'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    fake!.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^fake {2}(http\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    fake!.once('exit', code => fail(new Error(`presmium-speech fake exited (${code}): ${output}`)))
  })
  engine = { PRESMIUM_SPEECH_FAKE_URL: url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' }
  mkdirSync(WORK, { recursive: true })
  dir = mkdtempSync(join(WORK, 'lecture-video-'))
  writeFileSync(join(dir, 'lecture.md'), `---
title: 导出视频
plugins:
  - ${ADDON}
  - ${SPEECH}
renderers:
  web: {}
  lecture:
    voice: { engine: fake, voice: alpha }
---

(intro)=
# 导出视频

先说开场。

(merge)=
## 合并

\`\`\`python
print("merge")
\`\`\`

再看合并的代码。
`)
}, 60_000)

afterAll(() => {
  fake?.kill('SIGTERM')
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('presmium-lecture export (P-135)', () => {
  it('writes the lecture as a video with its audio, as long as the track', async () => {
    const built = await run(process.execPath, [PRESMIUM_BIN, 'build', '--to', 'lecture'], { cwd: dir, env: env(engine) })
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const track = parseTrack(JSON.parse(readFileSync(join(dir, 'dist/lecture/script/track.json'), 'utf8'))).track!
    const length = trackDuration(track) / 1000
    expect(length).toBeGreaterThan(3)

    const file = join(dir, 'lecture.webm')
    const exported = await run(process.execPath, [LECTURE_BIN, 'export', '.', '--out', file, '--fps', '4', '--size', '640x360'], { cwd: dir, env: env(engine) })
    expect(exported.code, exported.stdout + exported.stderr).toBe(0)
    expect(exported.stdout).toContain('exported lecture.webm (lecture script')
    expect(existsSync(join(dir, '.presmium/lecture-export'))).toBe(false)

    const input = new Input({ source: new BufferSource(readFileSync(file)), formats: ALL_FORMATS })
    const [video] = await input.getVideoTracks()
    const [audio] = await input.getAudioTracks()
    expect(await video!.getCodec()).toMatch(/^vp[89]$/)
    expect([video!.displayWidth, video!.displayHeight]).toEqual([640, 360])
    expect(await audio!.getCodec()).toBe('opus')
    expect(Math.abs(await input.computeDuration() - length)).toBeLessThanOrEqual(1)
    expect(Math.abs(await audio!.computeDuration() - length)).toBeLessThanOrEqual(1)
    // The voice is synthesized: the file says so, as its clips do (N-08).
    const tags = await input.getMetadataTags()
    expect(tags.comment).toMatch(/^AIGC=\{"Label":"1","ContentProducer":"Presmium fake"/)
  }, 300_000)
})
