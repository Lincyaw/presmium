import type { Operations } from '@lincyaw/host'
import type { IRDocument } from '@lincyaw/kernel'
import { shallowRef } from 'vue'
import { eventDrift, lastIndexAt, timedEvents, trackDuration } from '../domain/index.ts'
import type { LectureTrack, TimedEvent } from '../domain/index.ts'
import type { TrackClock } from './clock.ts'

export class LecturePlayer {
  readonly time = shallowRef(0)
  /** The time since the lecture reached its current step (ms); undefined while the viewer tries the page out. */
  readonly stepTime = shallowRef<number | undefined>(0)
  readonly trying = shallowRef(false)
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
    this.unsubscribe = operations.subscribe(() => this.tryIt())
  }

  get playing(): boolean {
    return this.clock.playing.value
  }

  play(): void {
    if (this.trying.value) this.back()
    this.clock.play()
    this.loop()
  }

  pause(): void {
    this.clock.pause()
    this.time.value = this.clock.now()
  }

  seek(t: number): void {
    this.trying.value = false
    this.clock.seek(t)
    this.fold(this.clock.now())
  }

  setRate(rate: number): void {
    this.clock.setRate(rate)
  }

  tryIt(): void {
    if (this.trying.value) return
    this.pause()
    this.trying.value = true
    this.stepTime.value = undefined
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

  private fold(t: number): void {
    this.operations.clear()
    const last = Math.max(lastIndexAt(this.events, t), this.events.findIndex(e => e.type === 'go'))
    for (let i = 0; i <= last; i++) this.apply(this.events[i]!, i < last)
    this.applied = last
    this.setTime(t)
  }

  private setTime(t: number): void {
    this.time.value = t
    this.stepTime.value = t - (this.reached[this.applied] ?? 0)
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
      this.clock.tick()
      this.advanceTo(this.clock.now())
      this.frame = this.clock.playing.value ? requestAnimationFrame(step) : 0
    }
    this.frame = requestAnimationFrame(step)
  }
}
