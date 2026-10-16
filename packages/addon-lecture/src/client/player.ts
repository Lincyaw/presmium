/**
 * Playing a lecture on the real page (P-131, docs/ir.md 9.2): the clock
 * gives the time, and the picture at time t is the fold of the events up to
 * t, applied through the host's `OPERATIONS`: while playing, the events as
 * their time comes; after a seek, all of them again from a cleared page,
 * fast-forwarded. Events whose block is gone are dropped (the count shows).
 * Whatever the viewer does meanwhile (a step, a run, a spotlight) pauses the
 * lecture: they try it themselves, and going back to the lecture restores
 * the picture at its time.
 */
import type { Operations } from '@presmium/host'
import type { IRDocument } from '@presmium/kernel'
import { shallowRef } from 'vue'
import { eventDrift, lastIndexAt, timedEvents, trackDuration } from '../domain/index.ts'
import type { LectureTrack, TimedEvent } from '../domain/index.ts'
import type { TrackClock } from './clock.ts'

export class LecturePlayer {
  readonly time = shallowRef(0)
  /** The viewer is trying it themselves; the lecture is paused until they go back to it. */
  readonly trying = shallowRef(false)
  readonly duration: number
  /** The events the deck still has, in time order; `go` without its view (the player shows them in its own). */
  readonly events: TimedEvent[]
  /** How many events were dropped because their block or section is gone. */
  readonly dropped: number

  readonly track: LectureTrack
  readonly clock: TrackClock
  private readonly operations: Operations
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
    this.duration = Math.max(trackDuration(track), this.events.at(-1)?.t ?? 0)
    // What the viewer does while the lecture plays is theirs: the lecture pauses (reports during a replay are dropped by the host).
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

  /** Shows the picture at time t; playing goes on from there. */
  seek(t: number): void {
    this.trying.value = false
    this.clock.seek(t)
    this.fold(this.clock.now())
  }

  setRate(rate: number): void {
    this.clock.setRate(rate)
  }

  /** Pauses for the viewer to try it themselves. */
  tryIt(): void {
    if (this.trying.value) return
    this.pause()
    this.trying.value = true
  }

  /** Back to the lecture: the picture at its time again. */
  back(): void {
    this.seek(this.clock.now())
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.unsubscribe()
    this.clock.dispose()
    this.operations.clear()
  }

  /** The fold of the events up to t on a cleared page; the last one is applied as it plays. */
  private fold(t: number): void {
    this.operations.clear()
    // Before its first event the lecture shows where it starts.
    const last = Math.max(lastIndexAt(this.events, t), this.events.findIndex(e => e.type === 'go'))
    for (let i = 0; i <= last; i++) this.apply(this.events[i]!, i < last)
    this.applied = last
    this.time.value = t
  }

  private apply(event: TimedEvent, seeking: boolean): void {
    this.operations.replay({ type: event.type, data: event.data }, seeking)
  }

  /**
   * Moves on to time t (not before the time shown) as playing does: the
   * events up to t apply as they come. The video export steps the lecture
   * so, a frame at a time, with the clock stopped.
   */
  advanceTo(t: number): void {
    while (this.applied + 1 < this.events.length && this.events[this.applied + 1]!.t <= t) this.apply(this.events[++this.applied]!, false)
    this.time.value = t
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
