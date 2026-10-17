/**
 * Time on a lecture track (docs/ir.md 9.1, 9.2): an event bound to a word of
 * an utterance (`at: [utterance, offset]`) happens when that word is said, so
 * new text or a new voice moves it along; the picture at time t is the fold
 * of the events up to t.
 */
import type { LectureTrack, Utterance } from './track.ts'

/** An event at its time, with its index in the track's events. */
export interface TimedEvent {
  t: number
  type: string
  data: Record<string, unknown>
  index: number
}

/**
 * The time of word `offset` of an utterance: its own time when it has word
 * times (past the last word, the end of the last word), else a linear
 * estimate by characters.
 */
export function wordTime(utterance: Utterance, offset: number): number {
  const words = utterance.words
  if (words?.length) {
    if (offset >= words.length) return words.at(-1)![0] + words.at(-1)![1]
    return words[Math.max(0, offset)]![0]
  }
  const length = Math.max(1, [...utterance.text].length)
  return utterance.t + Math.round(utterance.d * Math.max(0, Math.min(offset, length)) / length)
}

/** The utterance anchor of an event's data, if it has one. */
export function anchorOf(data: Record<string, unknown>): [string, number] | undefined {
  const at = data.at
  return Array.isArray(at) && typeof at[0] === 'string' && typeof at[1] === 'number' ? [at[0], at[1]] : undefined
}

/**
 * The events in time order, those bound to a word at that word's time. An
 * event bound to an utterance the track no longer has keeps its own time.
 */
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

/** A piece of an utterance's text as the transcript shows it: a word, with its time, or the text between words. */
export interface TextPiece {
  text: string
  /** A word's start, ms. */
  t?: number
}

/**
 * An utterance's text in pieces (P-131): its words where they are in it, in
 * order, and the spaces and punctuation between them; undefined without
 * word times, or when a word is not found in the text (the text alone then).
 */
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

/** The utterance being said at time t, if any. */
export function utteranceAt(track: LectureTrack, t: number): Utterance | undefined {
  return track.utterances.find(u => u.t <= t && t < u.t + u.d)
}

/** Index of the last event at or before t; -1 before the first. */
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

/** A chapter of the lecture: a section it moves to, or a `mark`. */
export interface Chapter {
  t: number
  /** The section id, for a chapter that starts a section. */
  section?: string
  /** The `mark`'s label, or the section's title when `titles` names it, else its id. */
  title: string
}

/** The chapters: every move to another section and every `mark`, in time order. */
export function chapters(events: readonly TimedEvent[], titles: (section: string) => string | undefined = () => undefined): Chapter[] {
  const list: Chapter[] = []
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

/** A step of the lecture: where it moves to a step of a section. */
export interface StepStop {
  t: number
  section: string
  step: number
}

/** Every move to another section or step (`go`), in time order: where the player can jump by step. */
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
