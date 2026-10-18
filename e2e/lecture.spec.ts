// Lecture tracks (WP-77, WP-79e2, P-90, P-130, P-131; docs/ir.md section 9) on e2e/fixtures/lecture.
// Recording, under `presmium dev`: in the present view, with Chromium's fake microphone and camera
// (the flags are set for this spec only), the presenter moves to the second section, steps twice,
// points at the code and spotlights it (`s`); the track has `go`, `point` (at the time the path
// began) and `spot` events and Ogg/Opus audio, and a camera's video only when the camera is on; the
// screen is asked for before the microphone and the camera.
// The laser and the marker record `ink`, `h` a `hint`; the audio reaches the server every 5 s while
// recording. One section recorded again replaces that section of the lecture, and `presmium check`
// still reports what changed in the other sections since they were recorded.
// Playback, of a static build (`--to web,lecture`) in a window of another size: the fixture's track
// `lectures/demo` with utterances and an audio file (silence, written before the build), and the
// same track without audio, which plays on the page's clock. Lectures written before the build: a transcript
// of an English sentence and a Chinese one with punctuation, shown as written (P-131); English translations,
// one made from an earlier text and marked stale (P-137); a synthesized voice whose label stays over a
// spotlight on a block of a section whose id holds `.` and `:`; and one recorded before a block was relabeled
// and another deleted, which follows the first and skips what was on the second (P-130).
// The view menu offers the lecture view where the deck publishes lectures: under `presmium dev` once the
// first is recorded; in a build whose deck names the lecture renderer among its renderers. A web build of a
// deck whose renderers are the web form's alone neither offers it nor asks for the lecture list (no 404),
// though the deck has a recorded lecture. In the present view, Tab reaches the player that lies over it.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

/** Records a new lecture; resolves with its id and track. */
async function recordNew(page: Page, dir: string, act: () => Promise<void>): Promise<[string, Track]> {
  const before = new Set(recorded(dir).keys())
  await record(page, act)
  const added = [...recorded(dir)].filter(([id]) => !before.has(id))
  expect(added).toHaveLength(1)
  return added[0]!
}

/** Drags the pointer from one point to another in steps, as a stroke. */
async function stroke(page: Page, from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let k = 1; k <= 5; k++) await page.mouse.move(from.x + (to.x - from.x) * k / 5, from.y + (to.y - from.y) * k / 5)
  await page.mouse.up()
}

test.describe('recording in the present view', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  let dir: string
  let dev: DevServer
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = deckDir('lecture-dev', LINK)
    cpSync(FIXTURE, dir, { recursive: true })
    // No lecture yet: the first test records the first.
    rmSync(join(dir, 'lectures/demo'), { recursive: true, force: true })
    dev = await startDev(dir, 'web')
  })
  test.afterAll(async () => {
    await dev?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('records go, point and spot events with Ogg/Opus audio and no video', async ({ page }) => {
    await openDevPage(page, `${dev.url}?view=present`, page.getByRole('region', { name: '讲授录制' }))
    const present = page.locator('.pm-present')
    // The server lists no lecture yet, so the view menu does not offer the lecture view.
    const lectureView = page.locator('select.pm-view-menu').first().locator('option[value="lecture"]')
    await expect(lectureView).toHaveCount(0)
    // The page times of the key presses and of the first move over the code, as the page's events have them.
    await page.evaluate(() => {
      const times: { keys: number[], move?: number } = { keys: [] }
      ;(window as unknown as { times: typeof times }).times = times
      window.addEventListener('keydown', event => times.keys.push(event.timeStamp), true)
      window.addEventListener('pointermove', (event) => {
        if (!times.move && (event.target as Element).closest('.pm-block[data-block="merge-code"]')) times.move = event.timeStamp
      }, true)
    })
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
    // Once it is saved, the server lists it: the view menu offers the lecture view.
    await expect(lectureView).toHaveCount(1)
    const types = new Set(track.events.map(([, type]) => type))
    expect([...types]).toEqual(expect.arrayContaining(['go', 'point', 'spot']))
    expect(track.events.filter(([, type]) => type === 'go').map(([, , data]) => [data.section, data.step])).toEqual(expect.arrayContaining([['intro', 0], ['merge', 0], ['merge', 1], ['merge', 2]]))
    expect(track.events.find(([, type]) => type === 'point')?.[2]).toMatchObject({ block: 'merge/merge-code' })
    expect(track.events.find(([, type]) => type === 'spot')?.[2]).toEqual({ block: 'merge/merge-code' })
    // Times go up, from the start of the recording.
    const times = track.events.map(([t]) => t)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    // The pointer's path is reported once it has rested, but its event is at the time it began: as
    // long after the move to step 2 as the first move over the code came after the third key press.
    const pageTimes = await page.evaluate(() => (window as unknown as { times: { keys: number[], move: number } }).times)
    const point = track.events.find(([, type]) => type === 'point')![0]
    const step = track.events.find(([, type, data]) => type === 'go' && data.step === 2)![0]
    expect(Math.abs((point - step) - (pageTimes.move - pageTimes.keys[2]!))).toBeLessThan(150)

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

  test('records strokes of the laser and the marker as ink and a hint as hint, uploading the audio every 5 s while it records (P-90)', async ({ page }) => {
    await openDevPage(page, `${dev.url}?view=present&section=merge`, page.getByRole('region', { name: '讲授录制' }))
    const recorder = page.getByRole('region', { name: '讲授录制' })
    const code = page.locator('.pm-present .pm-block[data-block="merge-code"]')
    const lines = code.locator('.pm-code .line')
    const before = new Set(readdirSync(join(dir, 'lectures')))
    /** The bytes of audio the server has of the recording under way. */
    const uploaded = () => readdirSync(join(dir, 'lectures')).filter(id => !before.has(id))
      .flatMap(id => existsSync(join(dir, 'lectures', id, 'audio')) ? readdirSync(join(dir, 'lectures', id, 'audio')).map(file => statSync(join(dir, 'lectures', id, 'audio', file)).size) : [])
      .reduce((sum, size) => sum + size, 0)
    const [, track] = await recordNew(page, dir, async () => {
      // The laser over lines 3 to 5 of the code; the marker over a box of it.
      await recorder.getByRole('button', { name: '激光笔' }).click()
      const [third, fifth] = [(await lines.nth(2).boundingBox())!, (await lines.nth(4).boundingBox())!]
      await stroke(page, { x: third.x + 20, y: third.y + third.height / 2 }, { x: fifth.x + 60, y: fifth.y + fifth.height / 2 })
      await recorder.getByRole('button', { name: '荧光笔' }).click()
      const box = (await code.boundingBox())!
      await stroke(page, { x: box.x + box.width * 0.6, y: box.y + box.height * 0.1 }, { x: box.x + box.width * 0.9, y: box.y + box.height * 0.3 })
      await recorder.getByRole('button', { name: '荧光笔' }).click()
      // A hint on the code, under the pointer.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.press('h')
      // The audio reaches the server while the recording goes on.
      await expect.poll(uploaded, { timeout: 15_000 }).toBeGreaterThan(0)
    })
    const inks = track.events.filter(([, type]) => type === 'ink').map(([, , data]) => data)
    expect(inks).toEqual([
      { block: 'merge/merge-code', tool: 'laser', lines: '3-5' },
      { block: 'merge/merge-code', tool: 'marker', range: [expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)] },
    ])
    expect(track.events.filter(([, type]) => type === 'hint').map(([, , data]) => data)).toEqual([{ block: 'merge/merge-code' }])
    expect(track.audio?.[0]?.duration).toBeGreaterThan(5)
  })

  test('records one section again: the lecture keeps the other sections, and the check still reports what changed in them since (P-90, P-130)', async ({ page }) => {
    await openDevPage(page, `${dev.url}?view=present`, page.getByRole('region', { name: '讲授录制' }))
    const present = page.locator('.pm-present')
    const code = present.locator('.pm-block[data-block="merge-code"]')
    const [id, first] = await recordNew(page, dir, async () => {
      await page.waitForTimeout(1200)
      await page.keyboard.press('ArrowRight')
      await expect(present).toHaveAttribute('data-section', 'merge')
      const box = (await code.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.press('s')
      await page.waitForTimeout(800)
    })
    const intro = first.audio!.find(a => a.section === 'intro')!
    const ofMerge = (track: Track) => track.events.filter(([, , data]) => data.section === 'merge' || data.block === 'merge/merge-code')
    const merge = ofMerge(first)

    // The code changes after the recording; then the opening is recorded again, which ends on leaving it.
    const file = join(dir, 'lecture.md')
    const source = readFileSync(file, 'utf8')
    writeFileSync(file, source.replace('    out = []', '    out = []  # merged ids'))
    try {
      await openDevPage(page, `${dev.url}?view=present&section=intro`, page.getByRole('region', { name: '讲授录制' }))
      await page.keyboard.press('ArrowRight')
      await expect(code.locator('.pm-code')).toContainText('# merged ids', { timeout: 30_000 })
      await page.keyboard.press('ArrowLeft')
      await expect(present).toHaveAttribute('data-section', 'intro')
      const recorder = page.getByRole('region', { name: '讲授录制' })
      await recorder.getByLabel('讲授').selectOption(id)
      await recorder.getByRole('button', { name: '重录本节' }).click()
      await expect(recorder).toHaveAttribute('data-state', 'recording')
      await page.waitForTimeout(1500)
      await page.keyboard.press('ArrowRight')
      await expect(recorder.getByRole('status')).toContainText('已保存', { timeout: 30_000 })

      const track = recorded(dir).get(id)!
      // The opening's audio is the new recording's, the old file is gone; the section after it is as it
      // was, moved as a whole by the difference in length.
      const audio = track.audio!.find(a => a.section === 'intro')!
      expect(audio.src).not.toBe(intro.src)
      expect(existsSync(join(dir, 'lectures', id, intro.src))).toBe(false)
      expect(existsSync(join(dir, 'lectures', id, audio.src))).toBe(true)
      const kept = ofMerge(track)
      expect(kept.map(([, type, data]) => [type, data])).toEqual(merge.map(([, type, data]) => [type, data]))
      expect(kept.map(([t]) => t - kept[0]![0])).toEqual(merge.map(([t]) => t - merge[0]![0]))
      expect(track.events.filter(([, type, data]) => type === 'go' && data.section === 'intro')).toHaveLength(1)

      // The spotlight on the code was recorded before the code changed: the check says so.
      const checked = spawnSync(process.execPath, [join(ROOT, 'packages/cli/bin/presmium.mjs'), 'check', '--json'], { cwd: dir, encoding: 'utf8' })
      const findings = (JSON.parse(checked.stdout) as { findings: { checkId: string, message: string }[] }).findings.filter(f => f.checkId === 'presmium.lecture')
      expect(findings.map(f => f.message)).toContainEqual(expect.stringMatching(new RegExp(`^lecture ${id} at .*: spot on merge/merge-code: the block changed since the recording \\(fuzzy\\)$`)))
    } finally {
      writeFileSync(file, source)
    }
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

  test('records the screen too, asking for it before the microphone and the camera (P-90)', async ({ page }) => {
    // The page's requests for media, in order; the screen is the fake camera, as headless Chromium shares no screen.
    await page.addInitScript(() => {
      const media = navigator.mediaDevices
      const asked: string[] = (window as unknown as { asked: string[] }).asked = []
      const user = media.getUserMedia.bind(media)
      media.getUserMedia = (constraints) => {
        asked.push(constraints?.audio ? 'microphone' : 'camera')
        return user(constraints)
      }
      media.getDisplayMedia = () => {
        asked.push('screen')
        return user({ video: true })
      }
    })
    await openDevPage(page, `${dev.url}?view=present`, page.getByRole('region', { name: '讲授录制' }))
    const recorder = page.getByRole('region', { name: '讲授录制' })
    await recorder.getByLabel('摄像头').check()
    await recorder.getByLabel('屏幕').check()
    const [, track] = await recordNew(page, dir, () => page.waitForTimeout(2000))
    expect(await page.evaluate(() => (window as unknown as { asked: string[] }).asked)).toEqual(['screen', 'microphone', 'camera'])
    expect(track.video?.map(v => v.kind).sort()).toEqual(['camera', 'screen'])
  })
})

const sha256 = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`

/** A recorded lecture of the fixture deck, without audio. */
function lecture(id: string, fields: { utterances: unknown[], events: unknown[], voice?: unknown, blocks?: unknown }) {
  return { track: 1, id, doc: 'lecture.md', lang: 'zh-CN', ir: { hash: '0' }, voice: { kind: 'recorded' }, blocks: {}, ...fields }
}

/** The lectures the playback tests write into the deck before it is built. */
const TRACKS = [
  // Words of an English sentence and of a Chinese one with punctuation (P-131).
  lecture('words', {
    utterances: [
      { id: 'u1', t: 500, d: 2000, text: 'Now look at these lines, then we merge.', section: 'merge', step: 0, words: [[500, 200, 'Now'], [750, 200, 'look'], [1000, 150, 'at'], [1200, 200, 'these'], [1450, 200, 'lines'], [1700, 200, 'then'], [1950, 150, 'we'], [2150, 300, 'merge']] },
      { id: 'u2', t: 3000, d: 2000, text: '开场白。我们用 GPU 来算。', section: 'merge', step: 0, words: [[3000, 200, '开'], [3200, 200, '场'], [3400, 200, '白'], [3700, 200, '我'], [3900, 200, '们'], [4100, 200, '用'], [4350, 300, 'GPU'], [4700, 200, '来'], [4900, 200, '算']] },
    ],
    events: [[0, 'go', { section: 'merge', step: 0, view: 'present' }]],
  }),
  // English translations, the second made from an earlier text of its sentence (P-137).
  lecture('translated', {
    utterances: [
      { id: 'u1', t: 500, d: 1500, text: '我们先看开场', section: 'intro', step: 0, translations: { en: { text: 'First, the opening', source: sha256('我们先看开场') } } },
      { id: 'u2', t: 2500, d: 1500, text: '再来看合并函数', section: 'intro', step: 0, translations: { en: { text: 'Then the merge function', source: sha256('再看合并函数') } } },
    ],
    events: [[0, 'go', { section: 'intro', step: 0, view: 'present' }]],
  }),
  // A synthesized voice, and a spotlight on a block of the section `part.two:x` (P-131, N-08).
  lecture('said', {
    voice: { kind: 'synthetic', engine: 'fake', voice: 'alpha', provider: 'Presmium fake' },
    utterances: [{ id: 'u1', t: 600, d: 1500, text: '合成的讲解。', section: 'part.two:x', step: 0 }],
    events: [[0, 'go', { section: 'part.two:x', step: 0, view: 'present' }], [500, 'spot', { block: 'part.two:x/part-code' }]],
  }),
  // Recorded when the merge code was labeled old-code (its content is the same), and on a block deleted since.
  lecture('drift', {
    blocks: { 'merge/old-code': { fp: 'ae0e1c225779dde0', lines: 11 }, 'merge/gone': { fp: '0000000000000000' } },
    utterances: [{ id: 'u1', t: 1200, d: 1000, text: '看这段代码', section: 'merge', step: 0 }],
    events: [[0, 'go', { section: 'merge', step: 0, view: 'present' }], [1000, 'spot', { block: 'merge/old-code' }], [1100, 'spot', { block: 'merge/gone' }]],
  }),
]

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
      // The deck publishes its lectures: it names the lecture renderer among its renderers.
      const entry = join(dir, 'lecture.md')
      writeFileSync(entry, readFileSync(entry, 'utf8').replace('renderers:\n', 'renderers:\n  lecture: {}\n'))
      mkdirSync(join(dir, 'lectures/demo/audio'))
      writeFileSync(join(dir, 'lectures/demo/audio/demo.wav'), silence(12))
      // The same lecture without audio.
      const { audio: _audio, ...silent } = JSON.parse(readFileSync(join(dir, 'lectures/demo/track.json'), 'utf8')) as Record<string, unknown>
      mkdirSync(join(dir, 'lectures/silent'))
      writeFileSync(join(dir, 'lectures/silent/track.json'), JSON.stringify({ ...silent, id: 'silent' }, null, 2))
      for (const track of TRACKS) {
        mkdirSync(join(dir, 'lectures', track.id))
        writeFileSync(join(dir, 'lectures', track.id, 'track.json'), JSON.stringify(track, null, 2))
      }
    },
  })

  /** Opens a lecture (`demo` by default) and resolves with its player. */
  async function open(page: Page, track = 'demo') {
    await page.goto(`${deck().web}/?view=lecture&track=${track}`)
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

  test('jumps to a step of a section (P-131)', async ({ page }) => {
    const player = await open(page)
    const present = page.locator('.pm-present')
    await player.getByRole('button', { name: '章节' }).click()
    const step = page.locator('.pm-lecture-chapters__step[data-section="merge"][data-step="2"]')
    await expect(step).toHaveText('0:08 第 2 步')
    await step.click()
    await expect(present).toHaveAttribute('data-section', 'merge')
    await expect(present).toHaveAttribute('data-step', '2')
    expect(await time(page)).toBe(8000)
    await expect(step.locator('..')).toHaveAttribute('aria-current', 'true')
  })

  test('a lecture without audio plays on the page\'s clock', async ({ page }) => {
    const player = await open(page, 'silent')
    await player.getByRole('button', { name: '播放' }).click()
    const played = await page.evaluate(() => new Promise<number>(done => setTimeout(() => done(Number(document.querySelector('.pm-lecture-player')!.getAttribute('data-time'))), 1000)))
    expect(Math.abs(played - 1000)).toBeLessThanOrEqual(300)
    await player.getByRole('button', { name: '暂停' }).click()
    await expect(player).toHaveAttribute('data-state', 'paused')
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

  test('shows each sentence of the transcript as written, its words in it; a word seeks to its time (P-131)', async ({ page }) => {
    const player = await open(page, 'words')
    await player.getByRole('button', { name: '逐字稿' }).click()
    for (const u of TRACKS[0]!.utterances as { id: string, text: string }[]) {
      expect(await page.locator(`.pm-lecture-transcript__item[data-utterance="${u.id}"] .pm-lecture-transcript__text`).textContent()).toBe(u.text)
    }
    await page.locator('.pm-lecture-transcript__item[data-utterance="u1"] .pm-lecture-word', { hasText: 'lines' }).click()
    expect(await time(page)).toBe(1450)
    await page.locator('.pm-lecture-transcript__item[data-utterance="u2"] .pm-lecture-word', { hasText: 'GPU' }).click()
    expect(await time(page)).toBe(4350)
  })

  test('marks a translation made from an earlier text of its sentence as stale, in the transcript and the captions (P-137)', async ({ page }) => {
    const player = await open(page, 'translated')
    await player.getByLabel('字幕语言').selectOption('en')
    await player.getByRole('button', { name: '字幕' }).click()
    await player.getByRole('button', { name: '逐字稿' }).click()
    const stale = page.locator('.pm-lecture-transcript__item[data-utterance="u2"]')
    await expect(stale).toHaveAttribute('data-stale', 'true')
    await expect(stale.getByRole('img', { name: '译文过期：原句在翻译之后改过' })).toBeVisible()
    // The mark is the host's line icon, not a glyph (N-10).
    await expect(stale.getByRole('img', { name: '译文过期：原句在翻译之后改过' }).locator('svg.pm-ui-icon')).toHaveCount(1)
    await expect(stale).not.toContainText('⚠')
    await expect(page.locator('.pm-lecture-transcript__item[data-utterance="u1"]')).not.toHaveAttribute('data-stale', /.*/)
    await stale.locator('.pm-lecture-transcript__time').click()
    await expect(page.locator('.pm-lecture-caption')).toHaveAttribute('data-stale', 'true')
    await expect(page.locator('.pm-lecture-caption')).toContainText('Then the merge function')
  })

  test('keeps the AI label over a spotlight, which finds its block in a section whose id holds . and : (N-08, P-131)', async ({ page }) => {
    const player = await open(page, 'said')
    const present = page.locator('.pm-present')
    await expect(present).toHaveAttribute('data-section', 'part.two:x')
    await player.getByRole('button', { name: '逐字稿' }).click()
    await page.locator('.pm-lecture-transcript__item[data-utterance="u1"] .pm-lecture-transcript__time').click()
    await expect(page.locator('.driver-overlay')).toBeVisible()
    await expect(present.locator('.pm-block[data-block="part-code"]')).toHaveClass(/driver-active-element/)
    const label = player.locator('.pm-lecture-player__ai')
    await expect(label).toHaveText('AI 合成语音（Presmium fake）')
    // The dimming lets the pointer through; made to catch it, the point is on whatever lies on top.
    await page.addStyleTag({ content: '.driver-overlay, .driver-overlay * { pointer-events: auto !important; }' })
    const box = (await label.boundingBox())!
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.classList.contains('pm-lecture-player__ai'), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true)
  })

  test('follows a block relabeled since the recording, and skips the actions on one deleted, saying so (P-130)', async ({ page }) => {
    const player = await open(page, 'drift')
    await expect(player.locator('.pm-lecture-player__notice')).toHaveText('讲义改动后有 1 个操作失效，回放时略过')
    await player.getByRole('button', { name: '逐字稿' }).click()
    await page.locator('.pm-lecture-transcript__item[data-utterance="u1"] .pm-lecture-transcript__time').click()
    await expect(page.locator('.driver-overlay')).toBeVisible()
    await expect(page.locator('.pm-present .pm-block[data-block="merge-code"]')).toHaveClass(/driver-active-element/)
  })

  test('reaches the player with Tab, a lecture chosen from the list (N-06, P-131)', async ({ page }) => {
    await page.goto(`${deck().web}/?view=lecture`)
    await page.getByRole('button', { name: '播放讲授 demo' }).click()
    const player = page.getByRole('region', { name: '讲授回放' })
    await expect(player).toHaveAttribute('data-state', 'paused')
    // Tab cycles through the present view and what lies over it, the player among them.
    let reached = false
    for (let n = 0; n < 40 && !reached; n++) {
      await page.keyboard.press('Tab')
      reached = await player.evaluate(region => region.contains(document.activeElement))
    }
    expect(reached).toBe(true)
  })

  test('offers the lecture view in the view menu (P-131)', async ({ page }) => {
    await page.goto(`${deck().web}/`)
    await expect(page.locator('select.pm-view-menu').first().locator('option[value="lecture"]')).toHaveText('讲授')
  })
})

test.describe('a web build of a deck whose renderers are the web form\'s alone (P-131)', () => {
  test.describe.configure({ mode: 'default' })
  // The fixture names only `web` among its renderers, and has a recorded lecture (lectures/demo).
  const deck = useFixture('lecture', { to: 'web', link: LINK })

  test('offers no lecture view, and asks for no lecture list', async ({ page }) => {
    const missing: string[] = []
    page.on('response', (response) => {
      if (response.status() === 404) missing.push(response.url())
    })
    page.on('console', (message) => {
      if (message.type() === 'error') missing.push(message.text())
    })
    await page.goto(`${deck().web}/`)
    const menu = page.locator('select.pm-view-menu').first()
    await expect(menu.locator('option[value="present"]')).toHaveCount(1)
    await expect(menu.locator('option[value="lecture"]')).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    expect(missing.filter(what => /lecture|404/.test(what))).toEqual([])
  })
})
