import type { LectureTrack, Utterance } from './track.ts'

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

export interface Chapter {
  t: number
  section?: string
  title: string
}

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
