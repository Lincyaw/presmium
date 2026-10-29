import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { build, Compiler, playwrightChromium, serveDirectory } from '@lincyaw/compiler'
import { ABSOLUTE_URL, aigcLabel, aigcString, deckLocale, errorMessage } from '@lincyaw/kernel'
import type { CanonicalSource } from '@lincyaw/kernel'
import { audioSegments, clockText, defaultTrack, LECTURE_MESSAGES, parseTrack, trackDuration } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'

export interface ExportOptions {
  deckDir: string
  /** Refuse to render if the fresh compilation differs from the requested canonical document. */
  source?: CanonicalSource
  track?: string
  out?: string
  width?: number
  height?: number
  fps?: number
  /** Draws the captions in this language on the frames (the soft subtitle tracks are always there). */
  burn?: string
  log?: (line: string) => void
  /** How many of the video's frames are drawn. */
  progress?: (done: number, total: number) => void
  /** Stops the export between two frames; it then rejects with the signal's reason. */
  signal?: AbortSignal
}

export interface ExportResult {
  file: string
  track: string
  frames: number
  duration: number
  /** The captions written next to the video, a WebVTT file a language. */
  captions: { lang: string, file: string }[]
  warnings: string[]
}

const ENCODER = `<!doctype html><meta charset="utf-8"><title>presmium-lecture export</title>
<script type="module">
import { AudioBufferSource, CanvasSource, canEncodeAudio, getFirstEncodableVideoCodec, Output, QUALITY_HIGH, StreamTarget, TextSubtitleSource, WebMOutputFormat } from './mediabunny.mjs'
const RATE = 48000
let output, video, audio, canvas, context, fps, total, done = 0, clips = [], subtitled = []
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
  if (buffer.numberOfChannels > 2) throw new Error('the media has more than two audio channels')
  return Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel))
}
/** The lecture's audio from ms a to ms b. */
function mix(a, b) {
  const length = Math.max(1, Math.round((b - a) * RATE / 1000))
  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: RATE })
  for (const clip of clips) {
    if (clip.start >= b || clip.end <= a || clip.muted || clip.volume === 0) continue
    const first = Math.round(clip.sourceStartMs * RATE / 1000)
    const from = Math.round((a - clip.start + clip.sourceStartMs) * RATE / 1000)
    const last = Math.min(clip.samples[0].length, first + Math.round((clip.end - clip.start) * RATE / 1000))
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel), samples = clip.samples[channel] ?? clip.samples[0]
      for (let i = Math.max(0, first - from); i < length && from + i < last; i++) data[i] += samples[from + i] * clip.volume
    }
  }
  for (let channel = 0; channel < 2; channel++) { const data = buffer.getChannelData(channel); for (let i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, data[i])) }
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
      const decoded = new Map()
      for (const a of options.audio) if (!decoded.has(a.url)) decoded.set(a.url, await decode(a.url))
      clips = options.audio.map(a => ({ start: a.start, end: a.start + a.duration, sourceStartMs: a.sourceStartMs ?? 0, volume: a.volume ?? 1, muted: a.muted ?? false, samples: decoded.get(a.url) }))
    }
    const subtitles = options.subtitles.map(({ language, name, vtt }) => {
      const source = new TextSubtitleSource('webvtt')
      output.addSubtitleTrack(source, { ...language ? { languageCode: language } : {}, name })
      return { source, vtt }
    })
    if (options.metadata) output.setMetadataTags(options.metadata)
    await output.start()
    // The muxer interleaves the cues with the frames as they come, so the cues are not awaited here.
    subtitled = subtitles.map(({ source, vtt }) => source.add(vtt))
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
    await Promise.all(subtitled)
    await output.finalize()
  },
}
window.presmiumEncoderReady = true
</script>`

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

// ISO 639-2/T codes of the languages a lecture's captions are likely in (Matroska names a track's language so).
const ISO_639_2: Record<string, string> = { zh: 'zho', en: 'eng', ja: 'jpn', ko: 'kor', fr: 'fra', de: 'deu', es: 'spa', it: 'ita', pt: 'por', ru: 'rus', ar: 'ara', hi: 'hin', vi: 'vie' }

/** The ISO 639-2 code of a caption language: a three-letter language as it is, a two-letter one by the table. */
function subtitleLanguage(lang: string): string | undefined {
  const primary = lang.split('-')[0]!.toLowerCase()
  return /^[a-z]{3}$/.test(primary) ? primary : ISO_639_2[primary]
}

interface CaptionFile {
  lang: string
  vtt: string
}

/** The captions the lecture renderer wrote for each language of the lecture. */
function captionFiles(dir: string, langs: string[]): CaptionFile[] {
  return langs.map(lang => ({ lang, vtt: readFileSync(join(dir, `captions.${lang}.vtt`), 'utf8') }))
}

function localAudio(track: LectureTrack, base: string): { url: string, start: number, duration: number, sourceStartMs?: number, volume?: number, muted?: boolean }[] {
  return audioSegments(track).filter(segment => !ABSOLUTE_URL.test(segment.src)).map(({ src, ...segment }) => ({ url: `${base}${src}`, ...segment }))
}

export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  const deckDir = resolve(options.deckDir)
  const log = options.log ?? (() => {})
  const [width, height, fps] = [options.width ?? 1280, options.height ?? 720, options.fps ?? 30]
  const work = join(deckDir, '.presmium', 'lecture-export')
  rmSync(work, { recursive: true, force: true })
  try {
    log('building the web form and the lectures…')
    const compilation = await new Compiler(deckDir).compile()
    const actual = compilation.doc.source
    if (options.source && (!actual || actual.documentId !== options.source.documentId || actual.version !== options.source.version || actual.fingerprint !== options.source.fingerprint)) throw new Error('job-source-changed')
    const report = await build(compilation, { outDir: work, to: ['web', 'lecture'] })
    const errors = report.findings.filter(f => f.severity === 'error')
    // The first reason first: a one-line summary (a workbench shows it) says what to fix.
    if (errors.length > 0) throw new Error(`${errors[0]!.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}\n${errors.map(f => `  ${f.message}`).join('\n')}`)
    const warnings = report.findings.filter(f => f.severity === 'warning').map(f => f.message)
    const web = report.outputs.find(o => o.renderer === 'web')
    const lectures = report.outputs.find(o => o.renderer === 'lecture')
    if (!web || !lectures) throw new Error('the web form or the lectures were not built')
    const index = JSON.parse(readFileSync(join(lectures.outDir, 'index.json'), 'utf8')) as { id: string, captions?: string[] }[]
    const ids = index.map(entry => entry.id)
    const id = options.track ?? defaultTrack(ids)
    if (!id || !ids.includes(id)) throw new Error(ids.length ? `name the lecture with --track: ${ids.join(', ')}` : LECTURE_MESSAGES[deckLocale(compilation.doc.meta.lang)].production.noPreparedLecture)
    const track = parseTrack(JSON.parse(readFileSync(join(lectures.outDir, id, 'track.json'), 'utf8'))).track!
    const file = resolve(options.out ?? join(deckDir, 'dist', `${id}.webm`))
    mkdirSync(dirname(file), { recursive: true })
    const captions = captionFiles(join(lectures.outDir, id), index.find(entry => entry.id === id)?.captions ?? [])
    if (options.burn && !captions.some(c => c.lang === options.burn)) throw new Error(`lecture ${id} has no captions in ${options.burn}: ${captions.map(c => c.lang).join(', ') || 'none'}`)
    for (const { lang } of captions) {
      if (!subtitleLanguage(lang)) warnings.push(`the subtitle track of the captions in ${lang} has no language code: its ISO 639-2 code is not known`)
    }

    const mediabunny = join(dirname(createRequire(import.meta.url).resolve('mediabunny')), 'mediabunny.min.mjs')
    const server = await serveDirectory(work, {
      extra: {
        '/__export/encoder.html': { body: ENCODER, type: 'text/html; charset=utf-8' },
        '/__export/mediabunny.mjs': { file: mediabunny, type: 'text/javascript' },
      },
    })
    try {
      const browser = await (await playwrightChromium<Chromium>(deckDir, import.meta.url)).launch()
      try {
        const handle = await open(file, 'w')
        try {
          const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
          const [player, encoder] = [await context.newPage(), await context.newPage()]
          const failures: string[] = []
          for (const page of [player, encoder]) page.on('pageerror', error => failures.push(String(error.message)))
          await player.goto(`${server.url}${web.base}?view=lecture&track=${encodeURIComponent(id)}&export${options.burn ? `&captions=${encodeURIComponent(options.burn)}` : ''}`)
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
          const label = voice.kind === 'synthetic' ? aigcLabel(voice.provider ?? voice.engine, id) : undefined
          await encoder.evaluate(options => (window as unknown as Hooks).presmiumEncoder.start(options), {
            width,
            height,
            fps,
            duration: frames * 1000 / fps,
            audio: localAudio(track, `${server.url}${lectures.base}${encodeURIComponent(id)}/`),
            subtitles: captions.map(({ lang, vtt }) => ({ language: subtitleLanguage(lang), name: lang, vtt })),
            metadata: { title: compilation.doc.meta.title, ...label ? { comment: aigcString(label), raw: { AIGC: JSON.stringify(label) } } : {} },
          })
          log(`playing lecture ${id}: ${frames} frames at ${fps} fps, ${width}x${height}`)
          for (let i = 0; i < frames; i++) {
            options.signal?.throwIfAborted()
            const at = Math.round(i * 1000 / fps)
            await player.evaluate(t => (window as unknown as Hooks).presmiumLecture.advance(t), at).catch((error: unknown) => {
              throw new Error(`the frame at ${clockText(at)} cannot be drawn: ${errorMessage(error).replace(/^page\.evaluate: (Error: )?/, '')}`)
            })
            const jpeg = await player.screenshot({ type: 'jpeg', quality: 85 })
            await encoder.evaluate(([data, n]) => (window as unknown as Hooks).presmiumEncoder.frame(data, n), [jpeg.toString('base64'), i] as [string, number])
            if (failures.length) throw new Error(failures.join('\n'))
            if ((i + 1) % Math.max(1, Math.round(frames / 10)) === 0) log(`  ${Math.round((i + 1) * 100 / frames)}%`)
            options.progress?.(i + 1, frames)
          }
          await encoder.evaluate(() => (window as unknown as Hooks).presmiumEncoder.finish(), undefined)
          // The captions go beside the video once the video is whole.
          const sidecars = captions.map(({ lang, vtt }) => {
            const sidecar = `${file.replace(/\.webm$/i, '')}.${lang}.vtt`
            writeFileSync(sidecar, vtt)
            return { lang, file: sidecar }
          })
          return { file, track: id, frames, duration: frames * 1000 / fps, captions: sidecars, warnings }
        } finally {
          await handle.close()
        }
      } finally {
        await browser.close()
      }
    } finally {
      await server.close()
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
