import type { Operations, PlaybackControl, PlaybackLease } from '@lincyaw/host'
import type { IRDocument } from '@lincyaw/kernel'
import { createStore } from '@lincyaw/host'
import { eventDrift, lastIndexAt, timedEvents, trackDuration } from '../domain/index.ts'
import type { LectureTrack, TimedEvent } from '../domain/index.ts'
import type { TrackClock } from './clock.ts'

export class LecturePlayer {
  readonly time = createStore(0)
  /** The time since the lecture reached its current step (ms); undefined while the viewer tries the page out. */
  readonly stepTime = createStore<number | undefined>(0)
  readonly trying = createStore(false)
  readonly cursor = createStore<{ sectionId: string, step: number } | undefined>(undefined)
  /** Event-identity selection can expose an empty interval while paused; time seeking and playback cannot. */
  readonly positionMode = createStore<'time' | 'step'>('time')
  readonly duration: number
  readonly events: TimedEvent[]
  readonly dropped: number

  readonly track: LectureTrack
  readonly clock: TrackClock
  private readonly operations: Operations
  // When the lecture reached the position of each event: a `go` that only changes the view (recorded
  // as the presenter switched views) keeps the step's time, as the page's own clock does.
  private readonly reached: number[]
  private applied = -1
  private frame = 0
  private readonly unsubscribe: () => void
  private readonly playback?: PlaybackLease
  private disposed = false
  private generation = 0

  constructor(track: LectureTrack, doc: IRDocument, operations: Operations, clock: TrackClock, playback?: PlaybackControl) {
    this.track = track
    this.clock = clock
    this.operations = operations
    const drift = eventDrift(track, doc)
    const kept = timedEvents(track).filter(event => drift[event.index]?.grade !== 'lost')
    this.dropped = track.events.length - kept.length
    this.events = kept.map((event) => {
      const data = drift[event.index]?.data ?? event.data
      if (event.type !== 'go') return { ...event, data }
      const { view: _view, ...position } = data
      return { ...event, data: position }
    })
    let position: string | undefined
    let since = 0
    this.reached = this.events.map((event) => {
      const at = event.type === 'go' ? `${String(event.data.section)}\u0000${String(event.data.step)}` : position
      if (at !== position) [position, since] = [at, event.t]
      return since
    })
    this.duration = Math.max(trackDuration(track), this.events.at(-1)?.t ?? 0)
    this.unsubscribe = operations.subscribe(operation => {
      if (operation.type === 'go' && typeof operation.data.section === 'string') {
        const step = Number(operation.data.step ?? 0)
        if (this.seekStep(operation.data.section, step)) return
      }
      this.tryIt()
    })
    this.playback = playback?.register(() => this.pause())
  }

  get playing(): boolean {
    return this.clock.playing.getSnapshot()
  }

  async play(): Promise<boolean> {
    if (this.disposed) return false
    if (this.playing) return true
    const generation = ++this.generation
    try {
      if (this.playback && !await this.playback.requestStart()) return false
      if (this.disposed || generation !== this.generation) return false
      if (this.trying.getSnapshot()) {
        // Restore the timeline without cancelling the permission just granted
        // for this start. Explicit Back/Seek still pause through their own API.
        const at = this.clock.now()
        this.trying.set(false)
        this.clock.seek(at)
        this.fold(at)
      }
      if (this.disposed || generation !== this.generation) return false
      this.positionMode.set('time')
      this.clock.error.set(undefined)
      this.clock.play()
      this.loop(generation)
      return this.clock.playing.getSnapshot()
    } catch (error) {
      if (!this.disposed && generation === this.generation) { this.pause(); this.clock.error.set(error instanceof Error ? error : new Error(String(error))) }
      return false
    }
  }

  pause(): void {
    this.generation++
    this.playback?.cancel()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.clock.pause()
    this.setTime(this.clock.now())
  }

  seek(t: number): void {
    this.pause()
    this.positionMode.set('time')
    this.trying.set(false)
    this.clock.seek(t)
    this.fold(this.clock.now())
  }

  /** A step is an event boundary, not just a timestamp: zero-length neighbours stay individually selectable. */
  seekStep(sectionId: string, step: number): boolean {
    if (this.disposed) return false
    const target = this.events.findIndex(event => event.type === 'go' && event.data.section === sectionId && Number(event.data.step ?? 0) === step)
    if (target < 0) return false
    this.pause()
    this.trying.set(false)
    const event = this.events[target]!
    this.clock.seek(event.t)
    this.fold(event.t, target)
    this.positionMode.set('step')
    return true
  }

  setRate(rate: number): void {
    this.clock.setRate(rate)
  }

  tryIt(): void {
    this.pause()
    if (this.trying.getSnapshot()) return
    this.trying.set(true)
    this.stepTime.set(undefined)
  }

  back(): void {
    this.seek(this.clock.now())
  }

  dispose(): void {
    this.disposed = true
    this.playback?.dispose()
    cancelAnimationFrame(this.frame)
    this.unsubscribe()
    this.clock.dispose()
    this.operations.clear()
  }

  private fold(t: number, boundary?: number): void {
    this.operations.clear()
    this.cursor.set(undefined)
    const last = boundary ?? Math.max(lastIndexAt(this.events, t), this.events.findIndex(e => e.type === 'go'))
    for (let i = 0; i <= last; i++) this.apply(this.events[i]!, i < last)
    this.applied = last
    this.setTime(t)
  }

  private setTime(t: number): void {
    this.time.set(t)
    this.stepTime.set(this.trying.getSnapshot() ? undefined : t - (this.reached[this.applied] ?? 0))
  }

  private apply(event: TimedEvent, seeking: boolean): void {
    this.operations.replay({ type: event.type, data: event.data }, seeking)
    if (event.type === 'go' && typeof event.data.section === 'string') this.cursor.set({ sectionId: event.data.section, step: Number(event.data.step ?? 0) })
  }

  advanceTo(t: number): void {
    this.positionMode.set('time')
    while (this.applied + 1 < this.events.length && this.events[this.applied + 1]!.t <= t) this.apply(this.events[++this.applied]!, false)
    this.setTime(t)
  }

  private loop(generation: number): void {
    cancelAnimationFrame(this.frame)
    const step = () => {
      if (generation !== this.generation || !this.clock.playing.getSnapshot()) { this.frame = 0; return }
      this.clock.tick()
      this.advanceTo(this.clock.now())
      this.frame = generation === this.generation && this.clock.playing.getSnapshot() ? requestAnimationFrame(step) : 0
    }
    this.frame = requestAnimationFrame(step)
  }
}
