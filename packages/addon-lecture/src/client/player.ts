import type { Operations } from '@lincyaw/host'
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

  constructor(track: LectureTrack, doc: IRDocument, operations: Operations, clock: TrackClock) {
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
        const target = this.events.findIndex(event => event.type === 'go' && event.data.section === operation.data.section && Number(event.data.step ?? 0) === step)
        if (target >= 0) {
          // Navigation chooses a new playback origin. It must not resume the previous step on Play.
          this.pause()
          this.trying.set(false)
          const event = this.events[target]!
          this.clock.seek(event.t)
          this.fold(event.t, target)
          return
        }
      }
      this.tryIt()
    })
  }

  get playing(): boolean {
    return this.clock.playing.getSnapshot()
  }

  play(): void {
    if (this.trying.getSnapshot()) this.back()
    this.clock.play()
    this.loop()
  }

  pause(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.clock.pause()
    this.time.set(this.clock.now())
  }

  seek(t: number): void {
    this.pause()
    this.trying.set(false)
    this.clock.seek(t)
    this.fold(this.clock.now())
  }

  setRate(rate: number): void {
    this.clock.setRate(rate)
  }

  tryIt(): void {
    if (this.trying.getSnapshot()) return
    this.pause()
    this.trying.set(true)
    this.stepTime.set(undefined)
  }

  back(): void {
    this.seek(this.clock.now())
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.unsubscribe()
    this.clock.dispose()
    this.operations.clear()
  }

  private fold(t: number, boundary?: number): void {
    this.operations.clear()
    const last = boundary ?? Math.max(lastIndexAt(this.events, t), this.events.findIndex(e => e.type === 'go'))
    for (let i = 0; i <= last; i++) this.apply(this.events[i]!, i < last)
    this.applied = last
    this.setTime(t)
  }

  private setTime(t: number): void {
    this.time.set(t)
    this.stepTime.set(t - (this.reached[this.applied] ?? 0))
  }

  private apply(event: TimedEvent, seeking: boolean): void {
    this.operations.replay({ type: event.type, data: event.data }, seeking)
  }

  advanceTo(t: number): void {
    while (this.applied + 1 < this.events.length && this.events[this.applied + 1]!.t <= t) this.apply(this.events[++this.applied]!, false)
    this.setTime(t)
  }

  private loop(): void {
    cancelAnimationFrame(this.frame)
    const step = () => {
      if (!this.clock.playing.getSnapshot()) { this.frame = 0; return }
      this.clock.tick()
      this.advanceTo(this.clock.now())
      this.frame = this.clock.playing.getSnapshot() ? requestAnimationFrame(step) : 0
    }
    this.frame = requestAnimationFrame(step)
  }
}
