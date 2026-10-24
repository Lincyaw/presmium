import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { deckDir, serve, useFixture } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LINK = { '@lincyaw/host': 'packages/host' }
// The places of the scene bpe-merge at the end of each step (:durations: 1.2, 1.2, 1.4, 1.6).
const BPE_ENDS = [1200, 2400, 3800, 5400]

const position = (page: Page, root: string, scene: string) =>
  page.locator(`${root} .pm-scene[data-scene="${scene}"]`).first().evaluate(el => Number((el as HTMLElement).dataset.position))

test.describe('scenes on the steps', () => {
  test.describe.configure({ mode: 'default' })
  const deck = useFixture('motion', { link: LINK })

  test('the present view plays a step\'s part of the scene forward and shows an earlier step settled after going back', async ({ page }) => {
    await page.goto(`${deck().web}/index.html?view=present&section=gsap&step=1`)
    const present = page.locator('.pm-present')
    await expect(present.locator('.pm-scene[data-scene="bpe-merge"]')).toHaveAttribute('data-status', 'ready')
    await expect.poll(() => position(page, '.pm-present', 'bpe-merge')).toBe(BPE_ENDS[1])
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', '2')
    const seen = new Set<number>()
    await expect.poll(async () => {
      seen.add(await position(page, '.pm-present', 'bpe-merge'))
      return Math.max(...seen)
    }).toBe(BPE_ENDS[2])
    expect([...seen].some(at => at > BPE_ENDS[1]! && at < BPE_ENDS[2]!), `places seen: ${[...seen].join(', ')}`).toBe(true)
    await page.keyboard.press('ArrowLeft')
    await expect(present).toHaveAttribute('data-step', '1')
    expect(await position(page, '.pm-present', 'bpe-merge')).toBe(BPE_ENDS[1])
  })
})

async function startFake(): Promise<{ url: string, child: ChildProcess }> {
  const child = spawn(process.execPath, [join(ROOT, 'packages/addon-speech/bin/presmium-speech.mjs'), 'fake', '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^fake {2}(http\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`presmium-speech fake exited (${code}): ${output}`)))
  })
  return { url, child }
}

async function build(dir: string, env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(process.execPath, [join(ROOT, 'packages/cli/bin/presmium.mjs'), 'build', '--to', 'web,lecture'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  if (code !== 0) throw new Error(`presmium build exited (${code}):\n${output}`)
}

type Event = [number, string, Record<string, unknown>]
interface Track { utterances: { id: string, t: number, words?: [number, number, string][] }[], events: Event[] }

test.describe('scenes on the lecture\'s time', () => {
  test.describe.configure({ mode: 'serial' })
  let fake: Awaited<ReturnType<typeof startFake>> | undefined
  let dir: string
  let site: Awaited<ReturnType<typeof serve>> | undefined
  let track: Track
  const go = (section: string, step: number) => track.events.find(([, type, data]) => type === 'go' && data.section === section && data.step === step)![0]

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    fake = await startFake()
    dir = deckDir('motion-lecture', LINK)
    cpSync(join(ROOT, 'e2e/fixtures/motion'), dir, { recursive: true })
    // A recorded lecture whose presenter switched views on step 1 of the GSAP section, a second after reaching it;
    // of its two sentences, the first has an English translation.
    mkdirSync(join(dir, 'lectures/views'), { recursive: true })
    writeFileSync(join(dir, 'lectures/views/track.json'), JSON.stringify({
      track: 1, id: 'views', doc: 'lecture.md', lang: 'zh-CN', ir: { hash: '0' }, voice: { kind: 'recorded', speaker: '讲者' }, blocks: {},
      utterances: [
        { id: 'u1', t: 100, d: 800, text: '先看字母', section: 'gsap', step: 0, translations: { en: { text: 'First the letters', source: 'sha256:0' } } },
        { id: 'u2', t: 1100, d: 800, text: '再看字节对', section: 'gsap', step: 1 },
      ],
      events: [[0, 'go', { section: 'gsap', step: 0, view: 'present' }], [1000, 'go', { section: 'gsap', step: 1, view: 'present' }], [1500, 'go', { section: 'gsap', step: 1, view: 'presenter' }], [4000, 'mark', { label: 'end' }]],
    }))
    const env: NodeJS.ProcessEnv = { ...process.env, PRESMIUM_SPEECH_FAKE_URL: fake.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' }
    delete env.NODE_ENV
    await build(dir, env)
    site = await serve(join(dir, 'dist'))
    track = JSON.parse(readFileSync(join(dir, 'dist/lecture/script/track.json'), 'utf8')) as Track
  })
  test.afterAll(async () => {
    await site?.close()
    fake?.child.kill('SIGTERM')
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  /** Opens the synthesized lecture with its transcript; `word(t)` jumps to the first word said from `t` on and gives its time. */
  async function openTranscript(page: Page) {
    await page.goto(`${site!.url}/web/?view=lecture&track=script`)
    const player = page.getByRole('region', { name: '讲授回放' })
    await expect(player).toHaveAttribute('data-state', 'paused')
    await player.getByRole('button', { name: '逐字稿' }).click()
    const word = async (t: number) => {
      const utterance = track.utterances.filter(u => u.t <= t).at(-1)!
      const index = utterance.words!.findIndex(w => w[0] >= t)
      await page.locator(`.pm-lecture-transcript__item[data-utterance="${utterance.id}"] .pm-lecture-word`).nth(index).click()
      return utterance.words![index]![0]
    }
    return { player, word }
  }

  test('a word of the lecture shows the scene as far into its step as the word, and the clicks said so far', async ({ page }) => {
    const { word } = await openTranscript(page)

    const at = await word(go('gsap', 1) + 500)
    await expect(page.locator('.pm-present')).toHaveAttribute('data-step', '1')
    expect(await position(page, '.pm-present', 'bpe-merge')).toBe(BPE_ENDS[0]! + Math.min(at - go('gsap', 1), 1200))

    const clicks = track.events.filter(([, type]) => type === 'click').map(([t]) => t)
    expect(clicks).toHaveLength(2)
    const counter = page.locator('.pm-present .merge-counter')
    await word(clicks[1]! + 1)
    await expect(counter).toHaveAttribute('data-merges', '2')
    await word(go('click', 2))
    await expect(counter).toHaveAttribute('data-merges', '0')
    await word(clicks[0]! + 1)
    await expect(counter).toHaveAttribute('data-merges', '1')
  })

  test('a viewer who tries the page out in the lecture sees the scene go on from where the lecture left it', async ({ page }) => {
    const { player, word } = await openTranscript(page)
    const at = await word(go('gsap', 1) + 300)
    const left = await position(page, '.pm-present', 'bpe-merge')
    expect(left).toBe(BPE_ENDS[0]! + (at - go('gsap', 1)))
    // A spotlight of the viewer's own (s over the scene) tries the page out: the lecture stops giving the time.
    const box = (await page.locator('.pm-present .pm-block[data-block="bpe"]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.press('s')
    await expect(player).toHaveAttribute('data-state', 'trying')
    expect(await position(page, '.pm-present', 'bpe-merge')).toBeGreaterThanOrEqual(left)
    await expect.poll(() => position(page, '.pm-present', 'bpe-merge')).toBe(BPE_ENDS[1])
  })

  test('a recorded switch of views keeps the step\'s time: the scene goes on from where its step began', async ({ page }) => {
    await page.goto(`${site!.url}/web/?view=lecture&track=views&export`)
    await page.waitForFunction('Boolean(window.presmiumLecture)')
    await page.evaluate(ms => (window as unknown as { presmiumLecture: { advance(t: number): Promise<void> } }).presmiumLecture.advance(ms), 2000)
    const scene = page.locator('.pm-present .pm-scene[data-scene="bpe-merge"]')
    await expect(scene).toHaveAttribute('data-status', 'ready')
    expect(Number(await scene.getAttribute('data-position'))).toBe(BPE_ENDS[0]! + 1000)
  })

  test('the captions an export draws are those of the subtitle track: a sentence without a translation has none', async ({ page }) => {
    await page.goto(`${site!.url}/web/?view=lecture&track=views&export&captions=en`)
    await page.waitForFunction('Boolean(window.presmiumLecture)')
    const caption = page.locator('.pm-lecture-caption')
    const advance = (ms: number) => page.evaluate(t => (window as unknown as { presmiumLecture: { advance(t: number): Promise<void> } }).presmiumLecture.advance(t), ms)
    await advance(500)
    await expect(caption).toHaveText('First the letters')
    await advance(1500)
    await expect(caption).toHaveCount(0)
    expect(readFileSync(join(dir, 'dist/lecture/views/captions.en.vtt'), 'utf8')).not.toContain('再看字节对')
  })

  test('an exported frame is drawn from its time alone: the same time draws the same picture, a later time of a playing scene another', async ({ page }) => {
    const frame = async (t: number) => {
      await page.goto(`${site!.url}/web/?view=lecture&track=script&export`)
      await page.waitForFunction('Boolean(window.presmiumLecture)')
      await page.evaluate(ms => (window as unknown as { presmiumLecture: { advance(t: number): Promise<void> } }).presmiumLecture.advance(ms), t)
      const scene = page.locator('.pm-present .pm-scene[data-scene="embedding"]')
      await expect(scene).toHaveAttribute('data-status', 'ready')
      return { picture: await scene.screenshot(), position: Number(await scene.getAttribute('data-position')) }
    }
    const gathering = go('three', 1) + 900
    const [first, again, later] = [await frame(gathering), await frame(gathering), await frame(gathering + 600)]
    expect(first.position).toBe(1500 + 900)
    expect(later.position).toBe(1500 + 1500)
    expect(again.picture.equals(first.picture)).toBe(true)
    expect(later.picture.equals(first.picture)).toBe(false)
  })
})
