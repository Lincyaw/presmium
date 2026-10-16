/**
 * The time of a lecture being played (`TrackClock`, docs/domain-model.md
 * section 15): `SilentClock` runs on the page's clock, for a lecture with
 * captions only; `MediaClock` follows the audio of a recorded lecture, one
 * file per section, and runs on the page's clock between and after them.
 * Times in ms since the lecture started.
 */
import type { Ref } from 'vue'
import { shallowRef } from 'vue'

export interface TrackClock {
  /** The lecture's time now. */
  now(): number
  readonly playing: Readonly<Ref<boolean>>
  readonly rate: Readonly<Ref<number>>
  play(): void
  pause(): void
  seek(t: number): void
  setRate(rate: number): void
  /** Keeps the media in step; the player calls it every frame while it plays. */
  tick(): void
  dispose(): void
}

export class SilentClock implements TrackClock {
  readonly playing = shallowRef(false)
  readonly rate = shallowRef(1)
  /** The time at `since`, and the page time since when it has run. */
  protected at = 0
  protected since = performance.now()
  protected readonly duration: number

  constructor(duration: number) {
    this.duration = duration
  }

  now(): number {
    const t = this.playing.value ? this.at + (performance.now() - this.since) * this.rate.value : this.at
    return Math.min(t, this.duration)
  }

  play(): void {
    if (this.playing.value) return
    if (this.at >= this.duration) this.at = 0
    this.since = performance.now()
    this.playing.value = true
  }

  pause(): void {
    this.at = this.now()
    this.playing.value = false
  }

  seek(t: number): void {
    this.at = Math.max(0, Math.min(t, this.duration))
    this.since = performance.now()
  }

  setRate(rate: number): void {
    this.at = this.now()
    this.since = performance.now()
    this.rate.value = rate
  }

  tick(): void {
    if (this.playing.value && this.now() >= this.duration) this.pause()
  }

  dispose(): void {
    this.pause()
  }
}

/** One audio file of the lecture: from `start` for `duration`, ms. */
export interface ClockMedia {
  url: string
  start: number
  duration: number
}

/** How far the audio may drift from the clock before it is moved, ms. */
const DRIFT_MS = 250

export class MediaClock extends SilentClock {
  private readonly media: { el: HTMLAudioElement, start: number, duration: number }[]

  constructor(duration: number, media: ClockMedia[]) {
    super(duration)
    this.media = media.map(({ url, start, duration: length }) => {
      const el = new Audio()
      el.preload = 'auto'
      el.src = url
      return { el, start, duration: length }
    })
  }

  /** The audio that plays at time t. */
  private mediaAt(t: number) {
    return this.media.find(m => t >= m.start && t < m.start + m.duration)
  }

  /** While a file plays, the lecture's time is the file's. */
  override now(): number {
    const current = this.playing.value ? this.mediaAt(super.now()) : undefined
    if (current && !current.el.paused && current.el.readyState >= 2) {
      const t = current.start + current.el.currentTime * 1000
      // The page clock follows the audio, so it goes on from there between files.
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
      if (t >= m.start && t < m.start + m.duration) m.el.currentTime = (t - m.start) / 1000
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
    const current = this.playing.value ? this.mediaAt(t) : undefined
    for (const m of this.media) {
      if (m !== current) {
        if (!m.el.paused) m.el.pause()
        continue
      }
      const offset = (t - m.start) / 1000
      if (Math.abs(m.el.currentTime - offset) * 1000 > DRIFT_MS) m.el.currentTime = offset
      m.el.playbackRate = this.rate.value
      // A browser that does not let it play (autoplay rules, no device) leaves the page clock running.
      if (m.el.paused) void m.el.play().catch(() => undefined)
    }
  }

  override dispose(): void {
    super.dispose()
    for (const { el } of this.media) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
  }
}
