import type { Store } from '@lincyaw/host'
import { createStore } from '@lincyaw/host'

export interface TrackClock {
  now(): number
  readonly playing: Readonly<Store<boolean>>
  readonly rate: Readonly<Store<number>>
  readonly error: Readonly<Store<Error | undefined>>
  /** The browser refused to start the sound before the reader acted on this page (autoplay): playback waits for them. */
  readonly blocked: Readonly<Store<boolean>>
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
  url: string
  start: number
  duration: number
  sourceStartMs?: number
  volume?: number
  muted?: boolean
}

const DRIFT_MS = 250

/** A part of an audio file on the timeline: from `start` for `duration`, playing the file from `sourceStartMs`. */
interface Clip { start: number, duration: number, sourceStartMs: number, volume: number, muted: boolean }

/**
 * Plays the timeline's audio with one element per file: a clip is where on the timeline a part of its file plays,
 * so clips that continue one another (a score cut at every step) run on in one element, without a pause, a seek or a
 * click at their boundary. A file gets another element only for clips of it that overlap in time.
 */
export class MediaClock extends SilentClock {
  private readonly voices: { el: HTMLAudioElement, clips: Clip[] }[] = []

  constructor(duration: number, media: ClockMedia[]) {
    super(duration)
    for (const { url, start, duration: length, sourceStartMs = 0, volume = 1, muted = false } of [...media].sort((a, b) => a.start - b.start)) {
      const clip = { start, duration: length, sourceStartMs, volume, muted }
      const free = this.voices.find(voice => voice.el.src === new URL(url, location.href).href && voice.clips.at(-1)!.start + voice.clips.at(-1)!.duration <= start)
      if (free) {
        free.clips.push(clip)
        continue
      }
      const el = new Audio()
      el.preload = 'auto'
      el.onerror = () => this.fail(new Error([url, el.error?.message].filter(Boolean).join(': ')))
      el.src = url
      this.voices.push({ el, clips: [clip] })
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
      if (clip) return { el: voice.el, ...clip }
    }
    return undefined
  }

  override now(): number {
    const current = this.playing.getSnapshot() ? this.mediaAt(super.now()) : undefined
    if (current && !current.el.paused && current.el.readyState >= 2) {
      const t = Math.min(current.start + current.duration, current.start + current.el.currentTime * 1000 - current.sourceStartMs)
      this.at = Math.min(t, this.duration)
      this.since = performance.now()
      return this.at
    }
    return super.now()
  }

  override play(): void {
    super.play()
    this.tick()
  }

  override pause(): void {
    super.pause()
    for (const { el } of this.voices) el.pause()
  }

  override seek(t: number): void {
    super.seek(t)
    for (const { el, clips } of this.voices) {
      const clip = MediaClock.clipAt(clips, t)
      if (clip) el.currentTime = (clip.sourceStartMs + t - clip.start) / 1000
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
    for (const { el, clips } of this.voices) {
      const clip = this.playing.getSnapshot() ? MediaClock.clipAt(clips, t) : undefined
      if (!clip) {
        if (!el.paused) el.pause()
        continue
      }
      el.volume = clip.volume
      el.muted = clip.muted
      // Where the file should be now; the element is moved only when it is elsewhere (a jump, or a clip that does not
      // continue the last one), never at the boundary between clips that continue each other.
      const offset = (clip.sourceStartMs + t - clip.start) / 1000
      if (Math.abs(el.currentTime - offset) * 1000 > DRIFT_MS) el.currentTime = offset
      el.playbackRate = this.rate.getSnapshot()
      if (el.paused) void el.play().then(() => {
        if (!this.playing.getSnapshot() || !MediaClock.clipAt(clips, super.now())) el.pause()
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
