import type { TrackEvent, TranscriptSegment } from '@lincyaw/kernel'
import type { Clip } from './synthesis.ts'
import { anchorOf } from './timing.ts'
import type { LectureTrack, MediaSegment, Utterance, Voice } from './track.ts'
import { charOffset, locate, realign, reanchor, trackWords } from './words.ts'

export interface SegmentTranscript {
  segment: MediaSegment
  segments: TranscriptSegment[]
}

function stepAt(track: LectureTrack, section: string, t: number): number {
  let step = 0
  for (const [at, type, data] of track.events) {
    if (at > t) break
    if (type === 'go' && data.section === section && typeof data.step === 'number') step = data.step
  }
  return step
}

function anchorAtTime(utterance: Utterance, t: number): number {
  if (utterance.words?.length) {
    const index = utterance.words.findIndex(([start, d]) => start + d > t)
    return index === -1 ? utterance.words.length : index
  }
  const length = [...utterance.text].length
  return Math.round(length * Math.max(0, Math.min(1, (t - utterance.t) / Math.max(1, utterance.d))))
}

export function bindEvents(track: LectureTrack): { track: LectureTrack, bound: number } {
  const ids = new Set(track.utterances.map(u => u.id))
  let bound = 0
  const events = track.events.map(([t, type, data]): TrackEvent => {
    const at = anchorOf(data)
    if (at && ids.has(at[0])) return [t, type, data]
    const { at: _stale, ...rest } = data
    const utterance = track.utterances.find(u => u.t <= t && t < u.t + u.d)
    if (!utterance) return [t, type, rest]
    bound++
    return [t, type, { ...rest, at: [utterance.id, anchorAtTime(utterance, t)] }]
  })
  return { track: { ...track, events }, bound }
}

export function transcribedTrack(track: LectureTrack, transcripts: readonly SegmentTranscript[]): { track: LectureTrack, bound: number } {
  const said = transcripts
    .flatMap(({ segment, segments }) => segments.filter(s => s.text.trim()).map(s => ({ segment, s })))
    .sort((a, b) => (a.segment.start + a.s.start) - (b.segment.start + b.s.start))
  const utterances: Utterance[] = said.map(({ segment, s }, i) => {
    const t = Math.round((segment.start + s.start) * 1000)
    const words = trackWords(s.words.map(w => ({ text: w.text, start: w.start - s.start, end: w.end - s.start })), t)
    return {
      id: `u${i + 1}`,
      t,
      d: Math.max(1, Math.round((s.end - s.start) * 1000)),
      text: s.text.trim(),
      ...words.length ? { words } : {},
      section: segment.section,
      step: stepAt(track, segment.section, t),
    }
  })
  return bindEvents({ ...track, utterances })
}

function moveAnchors(events: readonly TrackEvent[], id: string, anchor: (offset: number) => number): TrackEvent[] {
  return events.map(([t, type, data]): TrackEvent => {
    const at = anchorOf(data)
    return at && at[0] === id ? [t, type, { ...data, at: [id, anchor(at[1])] }] : [t, type, data]
  })
}

export function editUtterance(track: LectureTrack, id: string, text: string): LectureTrack | undefined {
  const index = track.utterances.findIndex(u => u.id === id)
  if (index === -1) return undefined
  const { clip: _clip, ...before } = track.utterances[index]!
  const { utterance, anchor } = realign(before, text.trim())
  const utterances = track.utterances.map((u, i) => (i === index ? utterance : u))
  return { ...track, utterances, events: moveAnchors(track.events, id, anchor) }
}

export function resynthesizedTrack(track: LectureTrack, clips: ReadonlyMap<string, Clip>, voice: Voice): LectureTrack {
  let events = track.events
  let end = 0
  const utterances = [...track.utterances].sort((a, b) => a.t - b.t).map((said) => {
    const clip = clips.get(said.id)
    const t = Math.max(said.t, end)
    const shift = t - said.t
    const u = shift ? { ...said, t, ...said.words ? { words: said.words.map(([at, d, w]): [number, number, string] => [at + shift, d, w]) } : {} } : said
    end = u.t + (clip ? Math.round(clip.duration * 1000) : u.d)
    if (!clip) return u
    const words = clip.words?.length ? trackWords(clip.words, u.t) : undefined
    const before = u.words ?? []
    let anchor: (offset: number) => number
    if (words && before.length) {
      anchor = reanchor(u.text, before, words)
    } else if (words) {
      const places = locate(words.map(w => w[2]), u.text)
      anchor = (offset) => {
        const index = places.findIndex(p => p !== undefined && charOffset(u.text, p.start) >= offset)
        return index === -1 ? words.length : index
      }
    } else {
      const places = locate(before.map(w => w[2]), u.text)
      anchor = offset => (places[offset] ? charOffset(u.text, places[offset]!.start) : [...u.text].length)
    }
    events = moveAnchors(events, u.id, anchor)
    const { words: _words, ...rest } = u
    return { ...rest, d: Math.round(clip.duration * 1000), clip: clip.file, ...words ? { words } : {} }
  })
  return { ...track, voice, utterances, events }
}
