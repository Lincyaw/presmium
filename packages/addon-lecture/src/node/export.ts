/**
 * `presmium-lecture export` (P-135): a lecture as a video file. The deck's
 * web form and lectures are built into a work directory and served on this
 * machine; Chromium (playwright-chromium) opens the lecture in the export
 * mode of the player (`&export`, no controls) and the exporter steps it a
 * frame at a time (`window.presmiumLecture.advance(t)`), taking a screenshot
 * of each. A second page muxes the frames and the lecture's audio (the
 * clips of a synthesized lecture, or the recorded audio, each at its time)
 * into WebM with Mediabunny's WebCodecs path: VP9 or VP8 video, Opus audio.
 * No MP4: the FFmpeg that `@mediabunny/server` brings is built with GPL
 * parts (docs/design-v0.7.md section 11). A synthesized voice is labeled in
 * the file's metadata (`AIGC`), as its clips are.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build, Compiler } from '@presmium/compiler'
import { CLIPS_DIR, parseTrack, SCRIPT_TRACK, trackDuration } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'

export interface ExportOptions {
  deckDir: string
  /** The lecture: default the synthesized one, else the only recorded one. */
  track?: string
  /** The video file (`.webm`); default `<deck>/dist/<track>.webm`. */
  out?: string
  width?: number
  height?: number
  fps?: number
  /** Reports progress, a line at a time. */
  log?: (line: string) => void
}

export interface ExportResult {
  file: string
  track: string
  frames: number
  /** ms. */
  duration: number
  warnings: string[]
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
}

/**
 * The encoder page: Mediabunny's WebM output written through the page's
 * `presmiumWrite(position, base64)`, frames drawn on a canvas, the audio
 * mixed a second at a time from the decoded files at their times.
 */
const ENCODER = `<!doctype html><meta charset="utf-8"><title>presmium-lecture export</title>
<script type="module">
import { AudioBufferSource, CanvasSource, canEncodeAudio, getFirstEncodableVideoCodec, Output, QUALITY_HIGH, StreamTarget, WebMOutputFormat } from './mediabunny.mjs'
const RATE = 48000
let output, video, audio, canvas, context, fps, total, done = 0, clips = []
const base64 = (bytes) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
const bytes = (text) => Uint8Array.from(atob(text), c => c.charCodeAt(0))
async function decode(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status)
  const buffer = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await response.arrayBuffer())
  const mono = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) buffer.getChannelData(c).forEach((v, i) => mono[i] += v / buffer.numberOfChannels)
  return mono
}
/** The lecture's audio from ms a to ms b. */
function mix(a, b) {
  const length = Math.max(1, Math.round((b - a) * RATE / 1000))
  const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: RATE })
  const data = buffer.getChannelData(0)
  for (const clip of clips) {
    if (clip.start >= b || clip.end <= a) continue
    const from = Math.round((a - clip.start) * RATE / 1000)
    const last = Math.min(clip.samples.length, Math.round((clip.end - clip.start) * RATE / 1000))
    for (let i = Math.max(0, -from); i < length && from + i < last; i++) data[i] += clip.samples[from + i]
  }
  return buffer
}
async function audioUntil(ms) {
  while (audio && done < Math.min(ms, total)) {
    const next = Math.min(done + 1000, total)
    await audio.add(mix(done, next))
    done = next
  }
}
window.presmiumEncoder = {
  async start(options) {
    fps = options.fps
    total = options.duration
    canvas = new OffscreenCanvas(options.width, options.height)
    context = canvas.getContext('2d')
    const writable = new WritableStream({ write: chunk => window.presmiumWrite(chunk.position, base64(chunk.data)) })
    output = new Output({ format: new WebMOutputFormat(), target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }) })
    const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width: options.width, height: options.height })
    if (!codec) throw new Error('this browser encodes neither VP9 nor VP8 video')
    video = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 5 })
    output.addVideoTrack(video, { frameRate: fps })
    if (options.audio.length > 0) {
      if (!(await canEncodeAudio('opus'))) throw new Error('this browser encodes no Opus audio')
      audio = new AudioBufferSource({ codec: 'opus', bitrate: QUALITY_HIGH })
      output.addAudioTrack(audio)
      clips = await Promise.all(options.audio.map(async a => ({ start: a.start, end: a.start + a.duration, samples: await decode(a.url) })))
    }
    if (options.metadata) output.setMetadataTags(options.metadata)
    await output.start()
  },
  async frame(jpeg, index) {
    const bitmap = await createImageBitmap(new Blob([bytes(jpeg)], { type: 'image/jpeg' }))
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    await video.add(index / fps, 1 / fps)
    await audioUntil((index + 1) * 1000 / fps)
  },
  async finish() {
    await audioUntil(total)
    await output.finalize()
  },
}
window.presmiumEncoderReady = true
</script>`

/** Serves the build's output under its paths, and the encoder page and Mediabunny under `/__export/`. */
async function serve(root: string): Promise<{ url: string, close(): Promise<void> }> {
  const require = createRequire(import.meta.url)
  // Its CommonJS entry is in dist/bundles, beside the browser's ES module bundle.
  const mediabunny = join(dirname(require.resolve('mediabunny')), 'mediabunny.min.mjs')
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    if (path === '/__export/encoder.html') {
      response.writeHead(200, { 'Content-Type': TYPES['.html']! })
      response.end(ENCODER)
      return
    }
    let file = path === '/__export/mediabunny.mjs' ? mediabunny : join(root, path)
    if (file !== mediabunny && !file.startsWith(root + sep) && file !== root) file = root
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

/** What the two pages offer the exporter (`window` of the player in export mode, and of the encoder page). */
interface Hooks {
  presmiumLecture: { duration: number, advance(t: number): Promise<void> }
  presmiumEncoder: { start(options: unknown): Promise<void>, frame(jpeg: string, index: number): Promise<void>, finish(): Promise<void> }
}

interface Page {
  goto(url: string): Promise<unknown>
  waitForFunction(fn: string, arg?: unknown, options?: { timeout?: number }): Promise<unknown>
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>
  exposeFunction(name: string, fn: (...args: never[]) => unknown): Promise<void>
  screenshot(options: { type: 'jpeg', quality: number }): Promise<Buffer>
  on(event: 'console' | 'pageerror', listener: (value: { text?(): string, message?: string }) => void): void
}

interface Chromium {
  launch(): Promise<{
    newContext(options: Record<string, unknown>): Promise<{ newPage(): Promise<Page> }>
    close(): Promise<void>
  }>
}

/** Playwright's Chromium: the deck's playwright-chromium (as `slidev export` uses it), else this package's. */
async function chromium(deckDir: string): Promise<Chromium> {
  for (const from of [join(deckDir, 'package.json'), import.meta.url]) {
    try {
      const entry = createRequire(from).resolve('playwright-chromium')
      return (await import(pathToFileURL(entry).href) as { chromium: Chromium }).chromium
    } catch {
      // Not there; the next one.
    }
  }
  throw new Error('the lecture is played with playwright-chromium; install it (pnpm exec playwright install chromium for its browser)')
}

/** The lecture's audio at its times: a synthesized voice's clips, else the recorded files (local ones). */
function audioOf(track: LectureTrack, base: string): { url: string, start: number, duration: number }[] {
  if (track.voice.kind === 'synthetic') {
    return track.utterances.filter(u => u.clip).map(u => ({ url: `${base}${CLIPS_DIR}/${u.clip}`, start: u.t, duration: u.d }))
  }
  return (track.audio ?? []).filter(a => !/^[a-z][a-z\d+.-]*:/i.test(a.src)).map(a => ({ url: `${base}${a.src}`, start: a.start * 1000, duration: a.duration * 1000 }))
}

/** Builds the deck's web form and lectures, plays a lecture in Chromium and writes it as a WebM file. */
export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  const deckDir = resolve(options.deckDir)
  const log = options.log ?? (() => {})
  const [width, height, fps] = [options.width ?? 1280, options.height ?? 720, options.fps ?? 10]
  const work = join(deckDir, '.presmium', 'lecture-export')
  rmSync(work, { recursive: true, force: true })
  try {
    log('building the web form and the lectures…')
    const compilation = await new Compiler(deckDir).compile()
    const report = await build(compilation, { outDir: work, to: ['web', 'lecture'] })
    const errors = report.findings.filter(f => f.severity === 'error')
    if (errors.length > 0) throw new Error(`the build failed:\n${errors.map(f => `  ${f.message}`).join('\n')}`)
    const warnings = report.findings.filter(f => f.severity === 'warning').map(f => f.message)
    const web = report.outputs.find(o => o.renderer === 'web')
    const lectures = report.outputs.find(o => o.renderer === 'lecture')
    if (!web || !lectures) throw new Error('the web form or the lectures were not built')
    const index = JSON.parse(readFileSync(join(lectures.outDir, 'index.json'), 'utf8')) as { id: string }[]
    const ids = index.map(entry => entry.id)
    const id = options.track ?? (ids.includes(SCRIPT_TRACK) ? SCRIPT_TRACK : ids.length === 1 ? ids[0] : undefined)
    if (!id || !ids.includes(id)) throw new Error(ids.length ? `name the lecture with --track: ${ids.join(', ')}` : 'the deck has no lecture: record one, or name a voice (renderers.lecture.voice)')
    const track = parseTrack(JSON.parse(readFileSync(join(lectures.outDir, id, 'track.json'), 'utf8'))).track!
    const file = resolve(options.out ?? join(deckDir, 'dist', `${id}.webm`))
    mkdirSync(dirname(file), { recursive: true })

    const server = await serve(work)
    const browser = await (await chromium(deckDir)).launch()
    const handle = await open(file, 'w')
    try {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
      const [player, encoder] = [await context.newPage(), await context.newPage()]
      const failures: string[] = []
      for (const page of [player, encoder]) page.on('pageerror', error => failures.push(String(error.message)))
      await player.goto(`${server.url}${web.base}?view=lecture&track=${encodeURIComponent(id)}&export`)
      await player.waitForFunction('Boolean(window.presmiumLecture)', undefined, { timeout: 120_000 })
      const duration = Math.max(trackDuration(track), await player.evaluate(() => (window as unknown as Hooks).presmiumLecture.duration, undefined))
      const frames = Math.max(1, Math.ceil(duration * fps / 1000))
      await encoder.exposeFunction('presmiumWrite', async (position: number, data: string) => {
        const bytes = Buffer.from(data, 'base64')
        await handle.write(bytes, 0, bytes.length, position)
      })
      await encoder.goto(`${server.url}/__export/encoder.html`)
      await encoder.waitForFunction('window.presmiumEncoderReady === true', undefined, { timeout: 60_000 })
      const voice = track.voice
      const label = voice.kind === 'synthetic'
        ? `AIGC=${JSON.stringify({ Label: '1', ContentProducer: voice.provider ?? voice.engine, ProduceID: id, ReservedCode1: '', ContentPropagator: '', PropagateID: '', ReservedCode2: '' })}`
        : undefined
      await encoder.evaluate(options => (window as unknown as Hooks).presmiumEncoder.start(options), {
        width,
        height,
        fps,
        duration: frames * 1000 / fps,
        audio: audioOf(track, `${server.url}${lectures.base}${encodeURIComponent(id)}/`),
        metadata: { title: compilation.doc.meta.title, ...label ? { comment: label, raw: { AIGC: label.slice('AIGC='.length) } } : {} },
      })
      log(`playing lecture ${id}: ${frames} frames at ${fps} fps, ${width}x${height}`)
      for (let i = 0; i < frames; i++) {
        await player.evaluate(t => (window as unknown as Hooks).presmiumLecture.advance(t), Math.round(i * 1000 / fps))
        const jpeg = await player.screenshot({ type: 'jpeg', quality: 85 })
        await encoder.evaluate(([data, n]) => (window as unknown as Hooks).presmiumEncoder.frame(data, n), [jpeg.toString('base64'), i] as [string, number])
        if (failures.length) throw new Error(failures.join('\n'))
        if ((i + 1) % Math.max(1, Math.round(frames / 10)) === 0) log(`  ${Math.round((i + 1) * 100 / frames)}%`)
      }
      await encoder.evaluate(() => (window as unknown as Hooks).presmiumEncoder.finish(), undefined)
      return { file, track: id, frames, duration: frames * 1000 / fps, warnings }
    } finally {
      await handle.close()
      await browser.close()
      await server.close()
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
