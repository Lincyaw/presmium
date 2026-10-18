import type { Operations, ServerClient } from '@presmium/host'
import type { IRDocument, Operation, TrackEvent } from '@presmium/kernel'
import { shallowRef } from 'vue'
import { irHash, LECTURE_ID, referencedBlocks, sectionHashes } from '../domain/index.ts'
import type { MediaSegment, Recording, VideoSegment } from '../domain/index.ts'
import type { Capture, Chunk } from './media.ts'
import { captureAudio, captureVideo } from './media.ts'

const UPLOAD_MS = 5000

export type RecorderState = 'starting' | 'recording' | 'saving' | 'saved' | 'failed'

export interface RecorderOptions {
  server: ServerClient
  operations: Operations
  doc: () => IRDocument
  position: () => { section: string, step: number }
  speaker?: string
  camera?: boolean
  screen?: boolean
  track?: string
}

type Source = 'audio' | 'camera' | 'screen'

interface Segment {
  source: Source
  section: string
  start: number
  end?: number
  capture: Capture
  src: Promise<string>
  pending: Chunk[]
  stopped?: Promise<void>
}

async function answer<T>(response: Promise<Response>): Promise<T> {
  const r = await response
  const body = await r.json().catch(() => ({})) as T & { error?: string }
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  return body
}

export class LectureRecorder {
  readonly state = shallowRef<RecorderState>('starting')
  readonly error = shallowRef<string>()
  readonly elapsed = shallowRef(0)
  id?: string
  readonly section?: string
  private current?: string

  private readonly options: RecorderOptions
  private readonly events: TrackEvent[] = []
  private readonly paths = new WeakMap<object, number>()
  private readonly segments: Segment[] = []
  private streams: Partial<Record<Source, MediaStream>> = {}
  private t0 = 0
  private timers: ReturnType<typeof setInterval>[] = []
  private unsubscribe?: () => void
  private uploading = Promise.resolve()
  private rotating = Promise.resolve()
  private stopping?: Promise<void>

  constructor(options: RecorderOptions) {
    this.options = options
    if (options.track) this.section = options.position().section
  }

  now(): number {
    return Math.round(performance.now() - this.t0)
  }

  async start(): Promise<void> {
    try {
      if (this.options.screen) this.streams.screen = await navigator.mediaDevices.getDisplayMedia({ video: true })
      this.streams.audio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (this.options.camera) this.streams.camera = await navigator.mediaDevices.getUserMedia({ video: true })
      const { id } = await answer<{ id: string }>(this.post('recordings', { track: this.options.track }))
      this.id = id
      this.t0 = performance.now()
      const position = this.options.position()
      this.current = position.section
      this.events.push([0, 'go', { section: position.section, step: position.step, view: 'present' }])
      await this.open(position.section)
      this.unsubscribe = this.options.operations.subscribe(operation => this.record(operation))
      this.timers.push(setInterval(() => void this.upload(), UPLOAD_MS), setInterval(() => this.elapsed.value = this.now(), 250))
      this.state.value = 'recording'
    } catch (error) {
      this.fail(error)
      this.release()
    }
  }

  pathStarted(data: Record<string, unknown>, at: number): void {
    this.paths.set(data, at)
  }

  stop(): Promise<void> {
    this.stopping ??= this.finish()
    return this.stopping
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.options.server.fetch(LECTURE_ID, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }

  private record({ type, data }: Operation): void {
    if (this.state.value !== 'recording') return
    const began = this.paths.get(data)
    const path = type === 'point' && Array.isArray(data.path) ? data.path as [number, number, number][] : undefined
    const t = Math.max(0, Math.round(began !== undefined ? began - this.t0 : this.now() - (path?.at(-1)?.[0] ?? 0)))
    if (type === 'go' && typeof data.section === 'string' && data.section !== this.current) {
      if (this.section) {
        void this.stop()
        return
      }
      this.current = data.section
      this.events.push([t, type, data])
      const section = data.section
      this.rotating = this.rotating.then(() => this.rotate(section)).catch(error => this.fail(error))
      return
    }
    this.events.push([t, type, data])
  }

  private async open(section: string): Promise<void> {
    const start = this.now()
    const sources: Source[] = ['audio', ...this.streams.camera ? ['camera' as const] : [], ...this.streams.screen ? ['screen' as const] : []]
    for (const source of sources) {
      const stream = this.streams[source]!
      const track = source === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
      if (!track) continue
      const segment = { source, section, start, pending: [] as Chunk[] } as Omit<Segment, 'capture' | 'src'> as Segment
      const capture = await (source === 'audio' ? captureAudio : captureVideo)(track, chunk => segment.pending.push(chunk))
      if (!capture) {
        if (source === 'audio') throw new Error('no audio encoder')
        continue
      }
      capture.failed.catch(error => this.fail(error))
      segment.capture = capture
      segment.src = answer<{ src: string }>(this.post(`recordings/${this.id}/media`, {
        folder: source === 'audio' ? 'audio' : 'video',
        section,
        ...source === 'audio' ? {} : { kind: source },
        ext: capture.ext,
      })).then(({ src }) => src)
      segment.src.catch(error => this.fail(error))
      this.segments.push(segment)
    }
  }

  private close(segment: Segment): Promise<void> {
    segment.end ??= this.now()
    segment.stopped ??= segment.capture.stop()
    return segment.stopped
  }

  private async rotate(section: string): Promise<void> {
    const open = this.segments.filter(s => s.end === undefined)
    open.forEach(s => s.end = this.now())
    await this.open(section)
    await Promise.all(open.map(s => this.close(s)))
  }

  private upload(): Promise<void> {
    this.uploading = this.uploading.then(async () => {
      for (const segment of this.segments) {
        const chunks = segment.pending.splice(0)
        if (chunks.length === 0) continue
        const src = await segment.src
        const runs: Chunk[] = []
        for (const chunk of chunks) {
          const last = runs.at(-1)
          if (last && last.position + last.data.byteLength === chunk.position) {
            const joined = new Uint8Array(last.data.byteLength + chunk.data.byteLength)
            joined.set(last.data)
            joined.set(chunk.data, last.data.byteLength)
            runs[runs.length - 1] = { data: joined, position: last.position }
          } else {
            runs.push(chunk)
          }
        }
        for (const run of runs) {
          await answer(this.options.server.fetch(LECTURE_ID, `recordings/${this.id}/files/${src.split('/').map(encodeURIComponent).join('/')}?at=${run.position}`, {
            method: 'PUT',
            body: run.data,
          }))
        }
      }
    }).catch(error => this.fail(error))
    return this.uploading
  }

  private async finish(): Promise<void> {
    if (this.state.value !== 'recording') {
      this.release()
      return
    }
    this.state.value = 'saving'
    this.unsubscribe?.()
    const duration = this.now()
    try {
      await this.rotating
      await Promise.all(this.segments.map(s => this.close(s)))
      await this.upload()
      if (this.failed()) return
      const media = async (s: Segment) => ({ section: s.section, start: s.start / 1000, src: await s.src, duration: (s.end! - s.start) / 1000 })
      const recording: Recording = {
        events: this.events,
        audio: await Promise.all(this.segments.filter(s => s.source === 'audio').map(media)) as MediaSegment[],
        video: await Promise.all(this.segments.filter(s => s.source !== 'audio').map(async s => ({ ...await media(s), kind: s.source }))) as VideoSegment[],
        utterances: [],
        duration,
      }
      const doc = this.options.doc()
      const head = {
        doc: doc.meta.entry,
        lang: doc.meta.lang ?? 'zh-CN',
        irHash: irHash(doc),
        sections: sectionHashes(doc),
        voice: { kind: 'recorded', ...this.options.speaker ? { speaker: this.options.speaker } : {} },
        blocks: referencedBlocks(doc, this.events),
      }
      await answer(this.post(`recordings/${this.id}/finish`, { head, recording, ...this.section ? { section: this.section } : {} }))
      this.state.value = 'saved'
    } catch (error) {
      this.fail(error)
    } finally {
      this.release()
    }
  }

  private failed(): boolean {
    return this.state.value === 'failed'
  }

  private fail(error: unknown): void {
    if (this.state.value === 'failed') return
    console.error('[presmium] lecture recording failed', error)
    this.error.value = error instanceof Error ? error.message : String(error)
    this.state.value = 'failed'
  }

  private release(): void {
    this.timers.forEach(clearInterval)
    this.timers = []
    this.unsubscribe?.()
    for (const stream of Object.values(this.streams)) stream?.getTracks().forEach(track => track.stop())
    this.streams = {}
  }
}
