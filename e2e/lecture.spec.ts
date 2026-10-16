// Lecture tracks (WP-77, P-90, P-130, P-131; docs/ir.md section 9) on e2e/fixtures/lecture.
// Recording, under `presmium dev`: in the present view, with Chromium's fake microphone and camera
// (the flags are set for this spec only), the presenter moves to the second section, steps twice,
// points at the code and spotlights it (`s`); the track has `go`, `point` and `spot` events and
// Ogg/Opus audio, and a camera's video only when the camera is on.
// Playback, of a static build (`--to web,lecture`) in a window of another size: the fixture's track
// `lectures/demo` with utterances and an audio file (silence, written before the build).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { deckDir, openDevPage, startDev, useFixture } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/lecture')
/** The lecture plugin, which the demo does not depend on. */
const LINK = { '@presmium/slidev-addon-lecture': 'packages/addon-lecture' }

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

interface Track {
  id: string
  audio?: { section: string, src: string, duration: number }[]
  video?: { section: string, src: string, kind: string }[]
  events: [number, string, Record<string, unknown>][]
}

/** The lectures recorded in the deck directory, by id, but the fixture's own. */
function recorded(dir: string): Map<string, Track> {
  const lectures = join(dir, 'lectures')
  return new Map(readdirSync(lectures)
    .filter(id => id !== 'demo' && existsSync(join(lectures, id, 'track.json')))
    .map(id => [id, JSON.parse(readFileSync(join(lectures, id, 'track.json'), 'utf8')) as Track]))
}

async function record(page: Page, act: () => Promise<void>): Promise<void> {
  const recorder = page.getByRole('region', { name: '讲授录制' })
  await recorder.getByRole('button', { name: '录制' }).click()
  await expect(recorder).toHaveAttribute('data-state', 'recording')
  await act()
  await recorder.getByRole('button', { name: '停止' }).click()
  await expect(recorder.getByRole('status')).toContainText('已保存', { timeout: 30_000 })
}

test.describe('recording in the present view', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  let dir: string
  let dev: DevServer
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = deckDir('lecture-dev', LINK)
    cpSync(FIXTURE, dir, { recursive: true })
    dev = await startDev(dir, 'web')
  })
  test.afterAll(async () => {
    await dev?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('records go, point and spot events with Ogg/Opus audio and no video', async ({ page }) => {
    await openDevPage(page, `${dev.url}?view=present`, page.getByRole('region', { name: '讲授录制' }))
    const present = page.locator('.pm-present')
    const before = new Set(recorded(dir).keys())
    await record(page, async () => {
      await page.waitForTimeout(1200)
      await page.keyboard.press('ArrowRight')
      await expect(present).toHaveAttribute('data-section', 'merge')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await expect(present).toHaveAttribute('data-step', '2')
      // Point at the code, then spotlight it.
      const code = present.locator('.pm-block[data-block="merge-code"]')
      const box = (await code.boundingBox())!
      for (let k = 0; k <= 8; k++) {
        await page.mouse.move(box.x + box.width * (0.2 + k * 0.05), box.y + box.height * (0.3 + k * 0.04))
        await page.waitForTimeout(60)
      }
      await page.waitForTimeout(600)
      await page.keyboard.press('s')
      await expect(page.locator('.driver-overlay')).toBeVisible()
      await page.waitForTimeout(1200)
    })

    const added = [...recorded(dir)].filter(([id]) => !before.has(id))
    expect(added).toHaveLength(1)
    const [id, track] = added[0]!
    const types = new Set(track.events.map(([, type]) => type))
    expect([...types]).toEqual(expect.arrayContaining(['go', 'point', 'spot']))
    expect(track.events.filter(([, type]) => type === 'go').map(([, , data]) => [data.section, data.step])).toEqual(expect.arrayContaining([['intro', 0], ['merge', 0], ['merge', 1], ['merge', 2]]))
    expect(track.events.find(([, type]) => type === 'point')?.[2]).toMatchObject({ block: 'merge/merge-code' })
    expect(track.events.find(([, type]) => type === 'spot')?.[2]).toEqual({ block: 'merge/merge-code' })
    // Times go up, from the start of the recording.
    const times = track.events.map(([t]) => t)
    expect(times).toEqual([...times].sort((a, b) => a - b))

    // One Ogg/Opus file per section, kept out of git; no video.
    expect(track.audio?.map(a => a.section)).toEqual(['intro', 'merge'])
    for (const audio of track.audio!) {
      expect(audio.src).toMatch(/^audio\/.+\.ogg$/)
      const bytes = readFileSync(join(dir, 'lectures', id, audio.src))
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('OggS')
      expect(bytes.subarray(0, 200).toString('latin1')).toContain('OpusHead')
    }
    expect(track.video).toBeUndefined()
    expect(existsSync(join(dir, 'lectures', id, 'video'))).toBe(false)
    expect(readFileSync(join(dir, 'lectures', id, '.gitignore'), 'utf8')).toMatch(/^audio\/$/m)
  })

  test('records the camera when it is on, and the track refers to the video (P-90)', async ({ page }) => {
    await openDevPage(page, `${dev.url}?view=present`, page.getByRole('region', { name: '讲授录制' }))
    const recorder = page.getByRole('region', { name: '讲授录制' })
    await recorder.getByLabel('摄像头').check()
    const before = new Set(recorded(dir).keys())
    await record(page, () => page.waitForTimeout(2500))

    const added = [...recorded(dir)].filter(([id]) => !before.has(id))
    expect(added).toHaveLength(1)
    const [id, track] = added[0]!
    expect(track.video).toEqual([expect.objectContaining({ section: 'intro', kind: 'camera', src: expect.stringMatching(/^video\/.+\.webm$/) })])
    const files = readdirSync(join(dir, 'lectures', id, 'video'))
    expect(files).toEqual([track.video![0]!.src.slice('video/'.length)])
    const bytes = readFileSync(join(dir, 'lectures', id, track.video![0]!.src))
    expect(bytes.subarray(0, 4).toString('hex')).toBe('1a45dfa3')
    expect(track.audio).toHaveLength(1)
  })
})

/** A WAV of silence, as the fixture's lecture audio. */
function silence(seconds: number, rate = 8000): Buffer {
  const data = Buffer.alloc(seconds * rate * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

test.describe('playback of a lecture track', () => {
  test.describe.configure({ mode: 'default' })
  // Another window size than the recording's.
  test.use({ viewport: { width: 960, height: 720 } })
  const deck = useFixture('lecture', {
    to: 'web,lecture',
    link: LINK,
    bases: true,
    edit(dir) {
      mkdirSync(join(dir, 'lectures/demo/audio'))
      writeFileSync(join(dir, 'lectures/demo/audio/demo.wav'), silence(12))
    },
  })

  /** Opens the lecture `demo` and resolves with its player. */
  async function open(page: Page) {
    await page.goto(`${deck().web}/?view=lecture&track=demo`)
    const player = page.getByRole('region', { name: '讲授回放' })
    await expect(player).toHaveAttribute('data-state', 'paused')
    return player
  }

  const time = async (page: Page) => Number(await page.getByRole('region', { name: '讲授回放' }).getAttribute('data-time'))

  test('seeks to a go and to a sentence, and restores the lecture after the viewer tried it (P-131)', async ({ page }) => {
    const player = await open(page)
    const present = page.locator('.pm-present')
    await expect(present).toHaveAttribute('data-section', 'intro')

    // The second go is the move to the section 合并: its chapter.
    await player.getByRole('button', { name: '章节' }).click()
    await page.locator('.pm-lecture-chapters__item[data-section="merge"]').click()
    await expect(present).toHaveAttribute('data-section', 'merge')
    await expect(present).toHaveAttribute('data-step', '0')
    await expect(player.locator('.pm-lecture-player__chapter')).toHaveText('合并')
    expect(await time(page)).toBe(3000)

    // A sentence of the transcript: its time, its section and step; the spotlight and the pointer of that time.
    await player.getByRole('button', { name: '逐字稿' }).click()
    await page.locator('.pm-lecture-transcript__item[data-utterance="u3"] .pm-lecture-transcript__time').click()
    expect(await time(page)).toBe(6100)
    await expect(present).toHaveAttribute('data-step', '1')
    await expect(page.locator('.driver-overlay')).toBeVisible()
    await expect(page.locator('.pm-lecture-transcript__item[data-utterance="u3"]')).toHaveAttribute('aria-current', 'true')

    // Paused, the viewer moves on alone; back to the lecture, the picture of its time again.
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', '2')
    await expect(player).toHaveAttribute('data-state', 'trying')
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', 'end')
    await player.getByRole('button', { name: '回到讲授' }).click()
    await expect(player).toHaveAttribute('data-state', 'paused')
    await expect(present).toHaveAttribute('data-section', 'merge')
    await expect(present).toHaveAttribute('data-step', '1')
    expect(await time(page)).toBe(6100)
  })

  test('plays at twice the speed, with captions of the current utterance (P-131)', async ({ page }) => {
    const player = await open(page)
    await player.getByLabel('倍速').selectOption('2')
    await player.getByRole('button', { name: '播放' }).click()
    // The clock a second later, read in the page.
    const played = await page.evaluate(() => new Promise<number>(done => setTimeout(() => done(Number(document.querySelector('.pm-lecture-player')!.getAttribute('data-time'))), 1000)))
    expect(Math.abs(played - 2000)).toBeLessThanOrEqual(300)
    await player.getByRole('button', { name: '暂停' }).click()
    await expect(player).toHaveAttribute('data-state', 'paused')

    await player.getByRole('button', { name: '字幕' }).click()
    await player.getByRole('button', { name: '逐字稿' }).click()
    await page.locator('.pm-lecture-transcript__item[data-utterance="u2"] .pm-lecture-transcript__time').click()
    await expect(page.locator('.pm-lecture-caption')).toHaveText('接着看合并函数')
  })
})
