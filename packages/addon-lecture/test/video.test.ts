import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@lincyaw/cli/testing'
import { serveDirectory } from '@lincyaw/compiler'
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny'
import { chromium } from 'playwright-chromium'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseTrack, trackDuration } from '../src/domain/index.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))
const LECTURE_BIN = join(ADDON, 'bin/presmium-lecture.mjs')
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))

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

describe('presmium-lecture export', () => {
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
    const tags = await input.getMetadataTags()
    expect(tags.comment).toMatch(/^AIGC=\{"Label":"1","ContentProducer":"Presmium fake"/)
  }, 300_000)

  it('films the lecture without the present view\'s bar of controls, with the AI label', async () => {
    const built = await run(process.execPath, [PRESMIUM_BIN, 'build', '--to', 'web,lecture'], { cwd: dir, env: env(engine) })
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const site = await serveDirectory(join(dir, 'dist'))
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
      await page.goto(`${site.url}/web/?view=lecture&track=script`)
      await page.locator('.pm-lecture-player').waitFor()
      expect(await page.locator('.pm-present__bar').isVisible()).toBe(true)
      await page.goto(`${site.url}/web/?view=lecture&track=script&export`)
      await page.waitForFunction('Boolean(window.presmiumLecture)')
      await page.locator('.pm-present').waitFor()
      expect(await page.locator('.pm-present__bar').isVisible()).toBe(false)
      expect(await page.locator('.pm-lecture-export .pm-lecture-player__ai').textContent()).toBe('AI 合成语音（Presmium fake）')
    } finally {
      await browser.close()
      await site.close()
    }
  }, 300_000)
})
