import type { Store } from '@lincyaw/host'
import { createStore } from '@lincyaw/host'

export interface TrackClock {
  now(): number
  readonly playing: Readonly<Store<boolean>>
  readonly rate: Readonly<Store<number>>
  readonly error: Readonly<Store<Error | undefined>>
  /** The browser refused to start the sound before the reader acted on this page (autoplay): playback waits for them. */
  readonly blocked: Readonly<Store<boolean>>
  readonly buffering: Readonly<Store<boolean>>
  prepare(t: number, signal?: AbortSignal): Promise<void>
  play(): void
  pause(): void
  seek(t: number): void
  setRate(rate: number): void
  tick(): void
  dispose(): void
}

export class SilentClock implements TrackClock {
  readonly playing = createStore(false)
  readonly rate = createStore(1)
  readonly error = createStore<Error | undefined>(undefined)
  readonly blocked = createStore(false)
  readonly buffering = createStore(false)
  protected at = 0
  protected since = performance.now()
  protected readonly duration: number

  constructor(duration: number) {
    this.duration = duration
  }

  now(): number {
    const t = this.playing.getSnapshot() ? this.at + (performance.now() - this.since) * this.rate.getSnapshot() : this.at
    return Math.min(t, this.duration)
  }

  async prepare(_t: number, _signal?: AbortSignal): Promise<void> {}

  play(): void {
    if (this.playing.getSnapshot()) return
    this.blocked.set(false)
    if (this.at >= this.duration) this.at = 0
    this.since = performance.now()
    this.playing.set(true)
  }

  pause(): void {
    this.at = this.now()
    this.playing.set(false)
  }

  seek(t: number): void {
    this.at = Math.max(0, Math.min(t, this.duration))
    this.since = performance.now()
  }

  setRate(rate: number): void {
    this.at = this.now()
    this.since = performance.now()
    this.rate.set(rate)
  }

  tick(): void {
    if (this.playing.getSnapshot() && this.now() >= this.duration) this.pause()
  }

  dispose(): void {
    this.pause()
  }
}

export interface ClockMedia {
  url: string | ((signal?: AbortSignal) => Promise<string>)
  start: number
  duration: number
  sourceStartMs?: number
  volume?: number
  muted?: boolean
}

const DRIFT_MS = 250
// How far a paused element may be from where it resumes: under a frame, not worth a seek.
const RESUME_MS = 20
export const BUFFER_AHEAD_MS = 30_000
const START_BUFFER_MS = 2_000
const MAX_PREFETCH_FILES = 4
const BUFFER_TIMEOUT_MS = 30_000

/** A part of an audio file on the timeline: from `start` for `duration`, playing the file from `sourceStartMs`. */
interface Clip { start: number, duration: number, sourceStartMs: number, volume: number, muted: boolean }
interface Voice { el: HTMLAudioElement, clips: Clip[], key: ClockMedia['url'], active?: Clip, loading?: Promise<void> }

/**
 * Plays the timeline's audio with one element per file: a clip is where on the timeline a part of its file plays,
 * so clips that continue one another (a score cut at every step) run on in one element, without a pause, a seek or a
 * click at their boundary. A file gets another element only for clips of it that overlap in time.
 */
export class MediaClock extends SilentClock {
  private readonly voices: Voice[] = []
  private readonly lifetime = new AbortController()
  private prefetchedAt = Number.NEGATIVE_INFINITY

  constructor(duration: number, media: ClockMedia[]) {
    super(duration)
    for (const { url, start, duration: length, sourceStartMs = 0, volume = 1, muted = false } of [...media].sort((a, b) => a.start - b.start)) {
      const clip = { start, duration: length, sourceStartMs, volume, muted }
      const key = typeof url === 'string' ? new URL(url, location.href).href : url
      const free = this.voices.find(voice => voice.key === key && voice.clips.at(-1)!.start + voice.clips.at(-1)!.duration <= start)
      if (free) {
        free.clips.push(clip)
        continue
      }
      const el = new Audio()
      el.preload = 'none'
      el.onerror = () => this.fail(new Error('playback-media-unavailable'))
      if (typeof key === 'string') el.src = key
      this.voices.push({ el, clips: [clip], key })
    }
  }

  private fail(error: Error): void {
    this.pause()
    this.error.set(error)
  }

  private static clipAt(clips: readonly Clip[], t: number): Clip | undefined {
    return clips.find(clip => t >= clip.start && t < clip.start + clip.duration)
  }

  private mediaAt(t: number) {
    for (const voice of this.voices) {
      const clip = MediaClock.clipAt(voice.clips, t)
      if (clip) return { voice, clip, el: voice.el, ...clip }
    }
    return undefined
  }

  private load(voice: Voice): Promise<void> {
    if (typeof voice.key === 'string') return Promise.resolve()
    if (voice.loading) return voice.loading
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(BUFFER_TIMEOUT_MS)])
    return voice.loading = voice.key(signal).then(url => {
      if (this.lifetime.signal.aborted) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return }
      voice.el.src = url
      const clip = MediaClock.clipAt(voice.clips, this.at)
      if (clip) voice.el.currentTime = (clip.sourceStartMs + this.at - clip.start) / 1000
    })
  }

  private prefetch(t: number, force = false): void {
    if (!force && Math.abs(t - this.prefetchedAt) < 1_000) return
    this.prefetchedAt = t
    // Keep future files from competing with the audio needed to start or resume this position.
    const active = this.voices.flatMap(voice => {
      const clip = MediaClock.clipAt(voice.clips, t)
      return clip ? [{ voice, clip }] : []
    })
    const ready = active.every(({ voice, clip }) => this.buffered(voice.el, clip, t))
    const upcoming = this.voices.flatMap(voice => {
      const clip = voice.clips.find(clip => clip.start + clip.duration > t && clip.start < t + BUFFER_AHEAD_MS && (ready || clip.start <= t))
      return clip ? [{ voice, at: Math.max(t, clip.start) }] : []
    }).sort((a, b) => a.at - b.at).slice(0, MAX_PREFETCH_FILES)
    for (const { voice } of upcoming) {
      voice.el.preload = 'auto'
      void this.load(voice).catch(() => { if (!this.lifetime.signal.aborted) this.fail(new Error('playback-media-unavailable')) })
    }
  }

  private buffered(el: HTMLAudioElement, clip: Clip, t: number): boolean {
    const offset = (clip.sourceStartMs + t - clip.start) / 1000
    const end = Math.min((clip.sourceStartMs + clip.duration) / 1000, Number.isFinite(el.duration) ? el.duration : Infinity)
    const needed = Math.min(START_BUFFER_MS / 1000 * this.rate.getSnapshot(), end - offset)
    if (el.readyState < 2) return false
    for (let i = 0; i < el.buffered.length; i++) if (el.buffered.start(i) <= offset + 0.05 && el.buffered.end(i) + 0.05 >= offset + needed) return true
    return false
  }

  override async prepare(t: number, signal?: AbortSignal): Promise<void> {
    const batch = new AbortController()
    const pending = AbortSignal.any([batch.signal, this.lifetime.signal, ...signal ? [signal] : []])
    pending.throwIfAborted()
    this.prefetch(t, true)
    const active = this.voices.flatMap(voice => {
      const clip = MediaClock.clipAt(voice.clips, t)
      return clip ? [{ voice, clip }] : []
    })
    await Promise.all(active.map(({ voice }) => this.load(voice)))
    pending.throwIfAborted()
    try { await Promise.all(active.map(({ voice: { el }, clip }) => new Promise<void>((resolve, reject) => {
      const events = ['loadedmetadata', 'progress', 'canplay', 'canplaythrough', 'seeked', 'error']
      const cleanup = () => { clearTimeout(timeout); for (const name of events) el.removeEventListener(name, check); pending.removeEventListener('abort', abort) }
      const abort = () => { cleanup(); reject(pending.reason) }
      const check = () => {
        if (el.error) { cleanup(); reject(new Error('playback-media-unavailable')); return }
        if (this.buffered(el, clip, t)) { cleanup(); resolve() }
      }
      const timeout = setTimeout(() => { cleanup(); reject(new Error('playback-timeout')) }, BUFFER_TIMEOUT_MS)
      for (const name of events) el.addEventListener(name, check)
      pending.addEventListener('abort', abort, { once: true })
      if (pending.aborted) abort()
      else check()
    }))); this.prefetch(t, true) } finally { batch.abort() }
  }

  override now(): number {
    // Keep the current clip as the clock until its sound reaches the end. Wall time must not skip an unloaded clip
    // or a stalled one; it is only the clock in the gaps between clips.
    const current = this.playing.getSnapshot() ? this.mediaAt(this.at) ?? this.mediaAt(super.now()) : undefined
    if (current) {
      const end = current.start + current.duration
      const active = current.voice.active === current.clip
      const ready = active && !current.el.paused && current.el.readyState >= 2
      this.buffering.set(!ready && !(active && current.el.ended))
      const t = active && current.el.ended ? end : ready
        ? Math.max(current.start, Math.min(end, current.start + current.el.currentTime * 1000 - current.sourceStartMs))
        : Math.max(current.start, this.at)
      this.at = Math.min(t, this.duration)
      this.since = performance.now()
      return this.at
    }
    this.buffering.set(false)
    return super.now()
  }

  override play(): void {
    super.play()
    this.tick()
  }

  override pause(): void {
    super.pause()
    this.buffering.set(false)
    for (const { el } of this.voices) el.pause()
  }

  override seek(t: number): void {
    super.seek(t)
    this.prefetch(t, true)
    for (const voice of this.voices) {
      const { el, clips } = voice
      const clip = MediaClock.clipAt(clips, t)
      voice.active = clip
      if (clip) {
        el.preload = 'auto'
        el.currentTime = (clip.sourceStartMs + t - clip.start) / 1000
      }
      else el.pause()
    }
    this.tick()
  }

  override setRate(rate: number): void {
    super.setRate(rate)
    for (const { el } of this.voices) el.playbackRate = rate
  }

  override tick(): void {
    super.tick()
    const t = this.now()
    this.prefetch(t)
    for (const voice of this.voices) {
      const { el, clips } = voice
      const clip = this.playing.getSnapshot() ? MediaClock.clipAt(clips, t) : undefined
      if (!clip) {
        if (!el.paused) el.pause()
        continue
      }
      if (!el.src) continue
      el.volume = clip.volume
      el.muted = clip.muted
      el.preload = 'auto'
      // Where the file should be now; the element is moved only when it is elsewhere (a jump, or a clip that does not
      // continue the last one), never at the boundary between clips that continue each other.
      // A playing element is left alone within DRIFT_MS; a paused one resumes exactly where its clip is.
      const offset = (clip.sourceStartMs + t - clip.start) / 1000
      if (voice.active !== clip && el.ended || Math.abs(el.currentTime - offset) * 1000 > (el.paused ? RESUME_MS : DRIFT_MS)) el.currentTime = offset
      voice.active = clip
      el.playbackRate = this.rate.getSnapshot()
      if (el.paused) void el.play().then(() => {
        if (!this.playing.getSnapshot() || !MediaClock.clipAt(clips, this.now())) el.pause()
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Autoplay without the reader's gesture: not a failure, playback waits for their click.
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          this.pause()
          this.blocked.set(true)
          return
        }
        this.fail(error instanceof Error ? error : new Error(String(error)))
      })
    }
  }

  override dispose(): void {
    this.lifetime.abort()
    super.dispose()
    for (const { el } of this.voices) {
      el.pause()
      el.onerror = null
      const url = el.src
      el.removeAttribute('src')
      el.load()
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }
}
