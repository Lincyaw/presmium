// Scripted lectures and speech in lecture tracks (WP-83, P-132 to P-134, N-08) on e2e/fixtures/lecture-script,
// with the deterministic fake speech engine (`presmium-speech fake`, a process of its own) defined as engine
// `fake` of provider `Presmium fake`; its WAV clips carry the text and voice they say (a `pmfk` chunk).
// Synthesized: `presmium build --to web,lecture` says the narration; played back as a static site, the word
// after `{cue to=code-1 lines=2-3}`spot`` spotlights lines 2 and 3 of code-1 when it is said; `{say}` shows
// what it shows and the engine was asked for its alias; the player labels the AI voice with its provider.
// Recorded: under `presmium dev`, with Chromium's fake microphone (flags for this spec only), a lecture is
// recorded, transcribed (a front of the fake engine answers the recorded Ogg/Opus, which the fake engine
// cannot read, with a fixed transcript), one sentence corrected and the lecture said again in another voice;
// in that voice a corrected sentence is said again after a confirmation that names the provider; playing a
// sentence plays its clip (the audio the page plays, spied on `HTMLMediaElement.prototype.play`, is the clip).
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { deckDir, openDevPage, serve, startDev } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/lecture-script')
/** The lecture and speech plugins, which the demo does not depend on. */
const LINK = { '@presmium/slidev-addon-lecture': 'packages/addon-lecture', '@presmium/slidev-addon-speech': 'packages/addon-speech' }
const PROVIDER = 'Presmium fake'

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

type Word = [number, number, string]
interface Utterance { id: string, t: number, d: number, text: string, words?: Word[], clip?: string, section?: string }
interface Track {
  id: string
  voice: { kind: string, voice?: string, provider?: string }
  audio?: { section: string, start: number, src: string, duration: number }[]
  utterances: Utterance[]
  events: [number, string, Record<string, unknown>][]
}

/** `presmium-speech fake --port 0`, a process of its own. */
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

/** The fake engine defined as engine `fake` of `Presmium fake`. */
function speechEnv(url: string): NodeJS.ProcessEnv {
  return { ...process.env, PRESMIUM_SPEECH_FAKE_URL: url, PRESMIUM_SPEECH_FAKE_PROVIDER: PROVIDER }
}

/** `presmium <args>` in a deck with this environment; rejects with the output when it fails. */
async function presmium(dir: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const child = spawn(process.execPath, [join(ROOT, 'packages/cli/bin/presmium.mjs'), ...args], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  if (code !== 0) throw new Error(`presmium ${args.join(' ')} exited (${code}):\n${output}`)
  return output
}

/** What the fake engine embedded in a WAV it made: the text and voice it says. */
function fakeContent(bytes: Buffer): { text: string, voice: string } {
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4)
    if (bytes.toString('latin1', at, at + 4) === 'pmfk') return JSON.parse(bytes.toString('utf8', at + 8, at + 8 + size)) as { text: string, voice: string }
    at += 8 + size + (size % 2)
  }
  throw new Error('not a WAV of the fake engine')
}

function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  const exited = new Promise<void>(done => child.once('exit', () => done()))
  child.kill('SIGTERM')
  return exited
}

test.describe('a lecture synthesized from the narration (P-134)', () => {
  test.describe.configure({ mode: 'serial' })
  let fake: Awaited<ReturnType<typeof startFake>> | undefined
  let dir: string
  let site: Awaited<ReturnType<typeof serve>> | undefined
  let track: Track

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    fake = await startFake()
    dir = deckDir('lecture-script', LINK)
    cpSync(FIXTURE, dir, { recursive: true })
    await presmium(dir, ['build', '--to', 'web,lecture'], speechEnv(fake.url))
    site = await serve(join(dir, 'dist'))
    track = JSON.parse(readFileSync(join(dir, 'dist/lecture/script/track.json'), 'utf8')) as Track
  })
  test.afterAll(async () => {
    await site?.close()
    await stop(fake?.child)
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('spotlights lines 2 and 3 of code-1 when the word after the cue is said, labels the AI voice, says {say} as its alias (N-08)', async ({ page }) => {
    // The cue is bound to the word after it, 这, and happens when it is said.
    const spot = track.events.find(([, type]) => type === 'spot')!
    expect(spot[2]).toMatchObject({ block: 'merge/code-1', lines: '2-3' })
    const [id, index] = spot[2].at as [string, number]
    const utterance = track.utterances.find(u => u.id === id)!
    expect(utterance.words![index]![2]).toBe('这')
    expect(spot[0]).toBe(utterance.words![index]![0])

    await page.goto(`${site!.url}/web/?view=lecture&track=script`)
    const player = page.getByRole('region', { name: '讲授回放' })
    await expect(player).toHaveAttribute('data-state', 'paused')
    await expect(player.locator('.pm-lecture-player__ai')).toHaveText(`AI 合成语音（${PROVIDER}）`)
    await player.getByRole('button', { name: '逐字稿' }).click()
    const words = page.locator(`.pm-lecture-transcript__item[data-utterance="${id}"] .pm-lecture-word`)
    const present = page.locator('.pm-present')
    // The word before it: no spotlight yet.
    await words.nth(index - 1).click()
    await expect(present).toHaveAttribute('data-section', 'merge')
    expect(Number(await player.getAttribute('data-time'))).toBe(utterance.words![index - 1]![0])
    await expect(page.locator('.pm-adhoc-lines')).toHaveCount(0)
    // The word itself: lines 2 and 3 of code-1 in the spotlight.
    await words.nth(index).click()
    expect(Number(await player.getAttribute('data-time'))).toBe(spot[0])
    await expect(page.locator('.driver-overlay')).toBeVisible()
    const lines = present.locator('.pm-block[data-block="code-1"] .pm-code .line')
    const [box, second, third] = await Promise.all([page.locator('.pm-adhoc-lines').boundingBox(), lines.nth(1).boundingBox(), lines.nth(2).boundingBox()])
    expect(Math.abs(box!.y - second!.y)).toBeLessThan(2)
    expect(Math.abs(box!.y + box!.height - (third!.y + third!.height))).toBeLessThan(2)

    // {say}: the narration, the transcript and the word times show BPE; the engine was asked to say B P E.
    const said = track.utterances.find(u => u.text.includes('BPE'))!
    expect(said.words!.map(w => w[2])).toContain('BPE')
    await expect(page.locator(`.pm-lecture-transcript__item[data-utterance="${said.id}"]`)).toContainText('BPE')
    const clip = fakeContent(readFileSync(join(dir, 'dist/lecture/script/clips', said.clip!)))
    expect(clip.text).toContain('B P E')
    expect(clip.text).not.toContain('BPE')
    expect(clip.voice).toBe('alpha')
    await page.goto(`${site!.url}/web/`)
    await expect(page.locator('.pm-section[data-section="merge"]')).toContainText('BPE 的词表就这样长出来')
    await expect(page.locator('.pm-section[data-section="merge"]')).not.toContainText('B P E')
  })
})

/** A transcript segment with its words evenly in its time, as an OpenAI-shaped `verbose_json` answer has them. */
function segment(text: string, start: number, end: number) {
  const chars = [...text].filter(c => /\p{Script=Han}/u.test(c))
  const step = (end - start) / chars.length
  return { start, end, text, words: chars.map((c, i) => ({ word: c, start: start + i * step, end: start + (i + 1) * step })) }
}

/**
 * A front of the fake engine: it passes every request on, but answers a transcription of recorded
 * audio (Ogg/Opus, which the fake engine cannot read back) with the next of these transcripts.
 */
async function transcribingFront(fake: string, transcripts: ReturnType<typeof segment>[][]): Promise<{ url: string, asked: number, close(): Promise<void> }> {
  const upstream = new URL(fake)
  const state = { url: '', asked: 0, close: async () => {} }
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (req.method === 'POST' && req.url?.endsWith('/audio/transcriptions') && body.includes('OggS')) {
        const segments = transcripts[state.asked++] ?? []
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ text: segments.map(s => s.text).join(''), language: 'zh', duration: segments.at(-1)?.end ?? 0, segments, words: segments.flatMap(s => s.words) }))
        return
      }
      const headers: Record<string, string> = {}
      for (const name of ['authorization', 'content-type']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name]
      void fetch(new URL(req.url ?? '/', upstream), { method: req.method, headers, ...req.method === 'GET' ? {} : { body } }).then(async (response) => {
        res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream' })
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  state.close = () => new Promise((done) => {
    server.close(() => done())
    server.closeAllConnections()
  })
  return state
}

test.describe('a recorded lecture transcribed, corrected and said again (P-132, P-133)', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 })
  let fake: Awaited<ReturnType<typeof startFake>> | undefined
  let front: Awaited<ReturnType<typeof transcribingFront>> | undefined
  let dir: string
  let dev: DevServer | undefined

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    fake = await startFake()
    // The opening's audio says one sentence; the merge section's two, the first while the code is spotlighted.
    front = await transcribingFront(fake.url, [
      [segment('我们从开场讲起', 0.2, 1.0)],
      [segment('现在看合并函数的代码', 0.3, 2.6), segment('注意这几行', 2.8, 3.4)],
    ])
    dir = deckDir('lecture-script-dev', LINK)
    cpSync(FIXTURE, dir, { recursive: true })
    dev = await startDev(dir, 'web', { PRESMIUM_SPEECH_FAKE_URL: front.url, PRESMIUM_SPEECH_FAKE_PROVIDER: PROVIDER })
  })
  test.afterAll(async () => {
    await dev?.stop()
    await front?.close()
    await stop(fake?.child)
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  const recorded = (): string[] => (existsSync(join(dir, 'lectures')) ? readdirSync(join(dir, 'lectures')) : [])
  const read = (id: string) => JSON.parse(readFileSync(join(dir, 'lectures', id, 'track.json'), 'utf8')) as Track

  test('transcribes with the provider named, then a corrected sentence said in a new voice plays its new clip; unbound events keep their times', async ({ page }) => {
    // The audio the page starts playing, by its URL (it calls through).
    await page.addInitScript(() => {
      const played: string[] = []
      Object.assign(window, { playedMedia: played })
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        played.push(this.src)
        return play.call(this)
      }
    })
    // Record: the opening, then the merge section, where the code is spotlighted while the first sentence is said.
    await openDevPage(page, `${dev!.url}?view=present`, page.getByRole('region', { name: '讲授录制' }))
    const recorder = page.getByRole('region', { name: '讲授录制' })
    const present = page.locator('.pm-present')
    const before = new Set(recorded())
    await recorder.getByRole('button', { name: '录制' }).click()
    await expect(recorder).toHaveAttribute('data-state', 'recording')
    await page.waitForTimeout(1500)
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', 'merge')
    await page.waitForTimeout(800)
    const code = present.locator('.pm-block[data-block="code-1"]')
    const box = (await code.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.press('s')
    await page.waitForTimeout(2500)
    await recorder.getByRole('button', { name: '停止' }).click()
    await expect(recorder.getByRole('status')).toContainText('已保存', { timeout: 30_000 })
    const id = recorded().find(name => !before.has(name))!
    expect(read(id).audio?.map(a => a.section)).toEqual(['intro', 'merge'])

    // Transcribe: the entry and its confirmation name the provider.
    await page.goto(`${dev!.url}?view=lecture&track=${id}`)
    const player = page.getByRole('region', { name: '讲授回放' })
    await expect(player).toHaveAttribute('data-state', 'paused')
    await player.getByRole('button', { name: '逐字稿' }).click()
    const editor = page.getByRole('group', { name: '讲授的文字与语音' })
    await editor.getByRole('button', { name: `转写（${PROVIDER}）` }).click()
    const ask = editor.getByRole('alertdialog')
    await expect(ask).toContainText(`把讲授 ${id} 的录音发给 ${PROVIDER}`)
    await ask.getByRole('button', { name: '确定' }).click()
    await expect(editor.getByRole('status')).toHaveText('已转写 3 句', { timeout: 30_000 })
    expect(front!.asked).toBe(2)
    const transcribed = read(id)
    expect(transcribed.utterances.map(u => [u.id, u.section, u.text])).toEqual([['u1', 'intro', '我们从开场讲起'], ['u2', 'merge', '现在看合并函数的代码'], ['u3', 'merge', '注意这几行']])
    // The spotlight came while u2 was said: it is bound to a word of it; the moves between sentences are not.
    expect(transcribed.events.find(([, type]) => type === 'spot')![2].at).toEqual(['u2', expect.any(Number)])
    const unbound = transcribed.events.filter(([, , data]) => !data.at)
    expect(unbound.map(([, type]) => type)).toContain('go')

    // Correct the last sentence, then say the lecture again in voice beta.
    const last = page.locator('.pm-lecture-transcript__item[data-utterance="u3"]')
    await last.getByRole('button', { name: '修改语音段 u3' }).click()
    await last.getByRole('textbox', { name: '修改语音段 u3' }).fill('注意这两行代码')
    await last.getByRole('button', { name: '保存' }).click()
    await expect(last).toContainText('注意这两行代码')
    await editor.getByLabel('音色').selectOption('beta')
    await editor.getByRole('button', { name: `重新合成（${PROVIDER}）` }).click()
    await expect(ask).toContainText(`用 ${PROVIDER}`)
    await expect(ask).toContainText(`的音色“假音色乙 Beta”重新合成这段讲授的 3 句话`)
    await ask.getByRole('button', { name: '确定' }).click()
    await expect(editor.getByRole('status')).toHaveText('已重新合成', { timeout: 30_000 })
    await expect(player.locator('.pm-lecture-player__ai')).toHaveText(`AI 合成语音（${PROVIDER}）`)

    // In the synthetic voice a corrected sentence is said again: the button and its confirmation name the provider (N-08).
    const first = page.locator('.pm-lecture-transcript__item[data-utterance="u1"]')
    await first.getByRole('button', { name: '修改语音段 u1' }).click()
    await first.getByRole('textbox', { name: '修改语音段 u1' }).fill('我们从开场白讲起')
    await first.getByRole('button', { name: `保存并重新合成（${PROVIDER}）` }).click()
    const sayAgain = first.getByRole('alertdialog')
    await expect(sayAgain).toContainText(`把改过的这句话发给 ${PROVIDER} 重新合成`)
    await sayAgain.getByRole('button', { name: '确定' }).click()
    await expect(first).toContainText('我们从开场白讲起', { timeout: 30_000 })

    // The corrected sentences have new clips: the new text in the new voice.
    const said = read(id)
    expect(said.voice).toMatchObject({ kind: 'synthetic', voice: 'beta', provider: PROVIDER })
    expect(fakeContent(readFileSync(join(dir, '.presmium/speech', said.utterances.find(u => u.id === 'u1')!.clip!)))).toMatchObject({ text: '我们从开场白讲起', voice: 'beta' })
    await page.locator('.pm-lecture-transcript__item[data-utterance="u3"] .pm-lecture-transcript__time').click()
    const clip = await player.getAttribute('data-clip')
    expect(clip).toBe(said.utterances.find(u => u.id === 'u3')!.clip)
    expect(fakeContent(readFileSync(join(dir, '.presmium/speech', clip!)))).toMatchObject({ text: '注意这两行代码', voice: 'beta' })
    // Playing from there plays that clip, as the server serves it (ClipClock).
    const played = () => page.evaluate(() => (window as unknown as { playedMedia: string[] }).playedMedia)
    await page.evaluate(() => (window as unknown as { playedMedia: string[] }).playedMedia.splice(0))
    await player.getByRole('button', { name: '播放', exact: true }).click()
    await expect.poll(async () => (await played()).length).toBeGreaterThan(0)
    const bytes = await page.evaluate(async (src) => Array.from(new Uint8Array(await (await fetch(src)).arrayBuffer())), (await played())[0]!)
    expect(fakeContent(Buffer.from(bytes))).toMatchObject({ text: '注意这两行代码', voice: 'beta' })
    // The events not bound to words keep their times; the bound ones follow their words.
    expect(said.events.filter(([, , data]) => !data.at)).toEqual(unbound)
    const spot = said.events.find(([, type]) => type === 'spot')!
    const [, at] = spot[2].at as [string, number]
    expect(said.utterances.find(u => u.id === 'u2')!.words![at]![2]).toBe(transcribed.utterances.find(u => u.id === 'u2')!.words![(transcribed.events.find(([, type]) => type === 'spot')![2].at as [string, number])[1]]![2])
  })
})
