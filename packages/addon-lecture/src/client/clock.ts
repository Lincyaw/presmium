import type { Store } from '@lincyaw/host'
import { createStore } from '@lincyaw/host'

export interface TrackClock {
  now(): number
  readonly playing: Readonly<Store<boolean>>
  readonly rate: Readonly<Store<number>>
  readonly error: Readonly<Store<Error | undefined>>
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

export class MediaClock extends SilentClock {
  private readonly media: { el: HTMLAudioElement, start: number, duration: number, sourceStartMs: number }[]

  constructor(duration: number, media: ClockMedia[]) {
    super(duration)
    this.media = media.map(({ url, start, duration: length, sourceStartMs = 0, volume = 1, muted = false }) => {
      const el = new Audio()
      el.preload = 'auto'
      el.onerror = () => this.fail(new Error([url, el.error?.message].filter(Boolean).join(': ')))
      el.src = url
      el.volume = volume
      el.muted = muted
      return { el, start, duration: length, sourceStartMs }
    })
  }

  private fail(error: Error): void {
    this.pause()
    this.error.set(error)
  }

  private mediaAt(t: number) {
    return this.media.find(m => t >= m.start && t < m.start + m.duration)
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
    for (const { el } of this.media) el.pause()
  }

  override seek(t: number): void {
    super.seek(t)
    for (const m of this.media) {
      if (t >= m.start && t < m.start + m.duration) m.el.currentTime = (m.sourceStartMs + t - m.start) / 1000
      else m.el.pause()
    }
    this.tick()
  }

  override setRate(rate: number): void {
    super.setRate(rate)
    for (const { el } of this.media) el.playbackRate = rate
  }

  override tick(): void {
    super.tick()
    const t = this.now()
    for (const m of this.media) {
      if (!this.playing.getSnapshot() || t < m.start || t >= m.start + m.duration) {
        if (!m.el.paused) m.el.pause()
        continue
      }
      const offset = (m.sourceStartMs + t - m.start) / 1000
      if (m.el.paused || Math.abs(m.el.currentTime - offset) * 1000 > DRIFT_MS) m.el.currentTime = offset
      m.el.playbackRate = this.rate.getSnapshot()
      if (m.el.paused) void m.el.play().then(() => {
        const at = super.now()
        if (!this.playing.getSnapshot() || at < m.start || at >= m.start + m.duration) m.el.pause()
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        this.fail(error instanceof Error ? error : new Error(String(error)))
      })
    }
  }

  override dispose(): void {
    super.dispose()
    for (const { el } of this.media) {
      el.pause()
      el.onerror = null
      const url = el.src
      el.removeAttribute('src')
      el.load()
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }
}
