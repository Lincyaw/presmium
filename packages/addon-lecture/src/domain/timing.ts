import type { LectureTrack, Utterance } from './track.ts'
import { SCRIPT_TRACK } from './track.ts'

export interface TimedEvent {
  t: number
  type: string
  data: Record<string, unknown>
  index: number
}

export function wordTime(utterance: Utterance, offset: number): number {
  const words = utterance.words
  if (words?.length) {
    if (offset >= words.length) return words.at(-1)![0] + words.at(-1)![1]
    return words[Math.max(0, offset)]![0]
  }
  const length = Math.max(1, [...utterance.text].length)
  return utterance.t + Math.round(utterance.d * Math.max(0, Math.min(offset, length)) / length)
}

export function anchorOf(data: Record<string, unknown>): [string, number] | undefined {
  const at = data.at
  return Array.isArray(at) && typeof at[0] === 'string' && typeof at[1] === 'number' ? [at[0], at[1]] : undefined
}

export function timedEvents(track: LectureTrack): TimedEvent[] {
  const utterances = new Map(track.utterances.map(u => [u.id, u]))
  return track.events
    .map(([t, type, data], index): TimedEvent => {
      const at = anchorOf(data)
      const utterance = at && utterances.get(at[0])
      return { t: utterance ? wordTime(utterance, at![1]) : t, type, data, index }
    })
    .sort((a, b) => a.t - b.t || a.index - b.index)
}

export interface TextPiece {
  text: string
  t?: number
}

export function textPieces(utterance: Utterance): TextPiece[] | undefined {
  if (!utterance.words?.length) return undefined
  const pieces: TextPiece[] = []
  let at = 0
  for (const [t, , word] of utterance.words) {
    const index = word ? utterance.text.indexOf(word, at) : -1
    if (index < 0) return undefined
    if (index > at) pieces.push({ text: utterance.text.slice(at, index) })
    pieces.push({ text: word, t })
    at = index + word.length
  }
  if (at < utterance.text.length) pieces.push({ text: utterance.text.slice(at) })
  return pieces
}

export function utteranceAt(track: LectureTrack, t: number): Utterance | undefined {
  return track.utterances.find(u => u.t <= t && t < u.t + u.d)
}

export function lastIndexAt(events: readonly { t: number }[], t: number): number {
  let low = 0
  let high = events.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (events[mid]!.t <= t) low = mid + 1
    else high = mid
  }
  return low - 1
}

export interface TrackChapter {
  t: number
  section?: string
  title: string
}

export function trackChapters(events: readonly TimedEvent[], titles: (section: string) => string | undefined = () => undefined): TrackChapter[] {
  const list: TrackChapter[] = []
  let section: string | undefined
  for (const event of events) {
    if (event.type === 'go' && typeof event.data.section === 'string' && event.data.section !== section) {
      section = event.data.section
      list.push({ t: event.t, section, title: titles(section) ?? section })
    } else if (event.type === 'mark' && typeof event.data.label === 'string') {
      list.push({ t: event.t, title: event.data.label })
    }
  }
  return list
}

export interface StepStop {
  t: number
  section: string
  step: number
}

export function stepStops(events: readonly TimedEvent[]): StepStop[] {
  const list: StepStop[] = []
  for (const event of events) {
    const { section, step } = event.data
    if (event.type !== 'go' || typeof section !== 'string') continue
    const at = typeof step === 'number' && Number.isFinite(step) ? step : 0
    const last = list.at(-1)
    if (!last || last.section !== section || last.step !== at) list.push({ t: event.t, section, step: at })
  }
  return list
}

/**
 * Where the lecture plays `position` (`sections`: the page IDs in the document's order): the first time it reaches that
 * step; for a step it leaves out, the first step it plays after it in the document's order, else the last one before.
 */
export function playedStop(events: readonly TimedEvent[], sections: readonly string[], position: { section: string, step: number }): StepStop | undefined {
  if (!sections.includes(position.section)) return undefined
  const order = (a: { section: string, step: number }, b: { section: string, step: number }) => sections.indexOf(a.section) - sections.indexOf(b.section) || a.step - b.step
  let after: StepStop | undefined, before: StepStop | undefined
  for (const stop of stepStops(events)) {
    if (!sections.includes(stop.section)) continue
    const at = order(stop, position)
    if (at === 0) return stop
    if (at > 0 && (!after || order(stop, after) < 0)) after = stop
    if (at < 0 && (!before || order(stop, before) > 0)) before = stop
  }
  return after ?? before
}

/**
 * Where a lecture starts for the preview's `position`. The synthesized lecture (`script`) plays every step it keeps, so
 * a step it leaves out starts at the nearest played one (`playedStop`); a recorded lecture holds only the steps it was
 * recorded on, and starts at the position only where it went there.
 */
export function startStop(trackId: string, events: readonly TimedEvent[], sections: readonly string[], position: { section: string, step: number }): StepStop | undefined {
  if (trackId === SCRIPT_TRACK) return playedStop(events, sections, position)
  return stepStops(events).find(stop => stop.section === position.section && stop.step === position.step)
}

/**
 * How long each step's voice lasts from the step's start (ms), by `section\u0000step`: until the last sentence heard in
 * the step ends, at most until the next step. Pauses and holds after the voice do not count. A step where no sentence is
 * heard has no length, nor one whose voice waits for its animation (`after-animation`: a hold at the step's start). A
 * step reached again keeps what it had the first time.
 */
export function voicedLengths(events: readonly TimedEvent[], utterances: readonly Utterance[], end: number): Map<string, number> {
  const stops = stepStops(events)
  const waits = new Set(events.flatMap(event => event.type === 'pause' && event.data.hold === true ? [event.t] : []))
  const seen = new Set<string>()
  const lengths = new Map<string, number>()
  for (const [i, stop] of stops.entries()) {
    const key = `${stop.section}\u0000${stop.step}`
    if (seen.has(key)) continue
    seen.add(key)
    if (waits.has(stop.t)) continue
    const until = stops[i + 1]?.t ?? end
    let voiced = stop.t
    for (const u of utterances) if (!u.silent && u.d > 0 && u.t < until && u.t + u.d > stop.t) voiced = Math.max(voiced, Math.min(until, u.t + u.d))
    if (voiced > stop.t) lengths.set(key, voiced - stop.t)
  }
  return lengths
}
