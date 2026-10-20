import type { TrackEvent } from '@lincyaw/kernel'
import { blockOf } from './drift.ts'
import { timedEvents } from './timing.ts'
import type { LectureTrack, MediaSegment, TrackBlock, Utterance, VideoSegment, Voice } from './track.ts'
import { sortEvents, TRACK_VERSION, trackDuration } from './track.ts'

export type PathPoint = [dt: number, x: number, y: number]

function distance([, x, y]: PathPoint, [, x1, y1]: PathPoint, [, x2, y2]: PathPoint): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = dx * dx + dy * dy
  if (length === 0) return Math.hypot(x - x1, y - y1)
  const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length))
  return Math.hypot(x - (x1 + k * dx), y - (y1 + k * dy))
}

export function simplifyPath(path: readonly PathPoint[], tolerance = 0.01): PathPoint[] {
  const round = ([t, x, y]: PathPoint): PathPoint => [Math.round(t), Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]
  if (path.length <= 2) return path.map(round)
  const keep = new Set([0, path.length - 1])
  const split = (from: number, to: number) => {
    let farthest = -1
    let worst = tolerance
    for (let i = from + 1; i < to; i++) {
      const d = distance(path[i]!, path[from]!, path[to]!)
      if (d > worst) {
        worst = d
        farthest = i
      }
    }
    if (farthest === -1) return
    keep.add(farthest)
    split(from, farthest)
    split(farthest, to)
  }
  split(0, path.length - 1)
  return [...keep].sort((a, b) => a - b).map(i => round(path[i]!))
}

export interface Recording {
  events: TrackEvent[]
  audio: MediaSegment[]
  video: VideoSegment[]
  utterances: Utterance[]
  duration: number
}

export interface TrackHead {
  id: string
  doc: string
  lang: string
  irHash: string
  sections: Record<string, string>
  voice: Voice
  blocks: Record<string, TrackBlock>
}

export function recordedTrack(head: TrackHead, recording: Recording): LectureTrack {
  return {
    track: TRACK_VERSION,
    id: head.id,
    doc: head.doc,
    lang: head.lang,
    ir: { hash: head.irHash, sections: head.sections },
    voice: head.voice,
    ...recording.audio.length ? { audio: recording.audio } : {},
    ...recording.video.length ? { video: recording.video } : {},
    blocks: pruneBlocks(head.blocks, recording.events),
    utterances: recording.utterances,
    events: sortEvents(recording.events),
  }
}

function pruneBlocks(blocks: Record<string, TrackBlock>, events: readonly TrackEvent[]): Record<string, TrackBlock> {
  const used = new Set(events.flatMap(([, , data]) => blockOf(data) ?? []))
  return Object.fromEntries(Object.entries(blocks).filter(([key]) => used.has(key)))
}

export function sectionSpan(track: LectureTrack, section: string, end: number): [number, number] | undefined {
  const goes = timedEvents(track).filter(e => e.type === 'go' && typeof e.data.section === 'string')
  const first = goes.findIndex(e => e.data.section === section)
  if (first === -1) return undefined
  const next = goes.slice(first + 1).find(e => e.data.section !== section)
  return [goes[first]!.t, next?.t ?? end]
}

function splicedIr(track: LectureTrack, section: string, head: TrackHead): LectureTrack['ir'] {
  const before = track.ir.sections ?? (track.ir.hash === head.irHash ? head.sections : {})
  const unknown = Object.fromEntries(Object.keys(head.sections).filter(id => !(id in before)).map(id => [id, '']))
  const sections = { ...unknown, ...before, ...section in head.sections ? { [section]: head.sections[section]! } : {} }
  const current = Object.entries(sections).every(([id, hash]) => head.sections[id] === hash)
  return { hash: current ? head.irHash : track.ir.hash, sections }
}

export function spliceSection(track: LectureTrack, section: string, recording: Recording, head: TrackHead): { track: LectureTrack, unused: string[] } {
  const end = Math.round(trackDuration(track))
  const [from, to] = sectionSpan(track, section, end) ?? [end, end]
  const shift = recording.duration - (to - from)
  const inside = (t: number) => t >= from && t < to
  const moved = (t: number) => (t >= to ? t + shift : t)
  const keepMedia = <T extends MediaSegment>(segments: T[] = []) => segments
    .filter(s => !(s.section === section && inside(s.start * 1000)))
    .map(s => ({ ...s, start: Math.round(moved(s.start * 1000)) / 1000 }))
  const offset = <T extends MediaSegment>(segments: T[]) => segments.map(s => ({ ...s, start: Math.round(s.start * 1000 + from) / 1000 }))
  const removed = new Set(track.utterances.filter(u => inside(u.t)).map(u => u.id))
  const events: TrackEvent[] = [
    ...track.events.filter(([t]) => !inside(t)).map(([t, type, data]): TrackEvent => [moved(t), type, data]),
    ...recording.events.map(([t, type, data]): TrackEvent => [t + from, type, data]),
  ]
  const audio = [...keepMedia(track.audio), ...offset(recording.audio)].sort((a, b) => a.start - b.start)
  const video = [...keepMedia(track.video), ...offset(recording.video)].sort((a, b) => a.start - b.start)
  const kept = new Set([...audio, ...video].map(s => s.src))
  const unused = [...track.audio ?? [], ...track.video ?? []].map(s => s.src).filter(src => !kept.has(src))
  const next: LectureTrack = {
    ...track,
    ir: splicedIr(track, section, head),
    ...audio.length ? { audio } : { audio: undefined },
    ...video.length ? { video } : { video: undefined },
    blocks: pruneBlocks({ ...track.blocks, ...head.blocks }, events),
    utterances: [
      ...track.utterances.filter(u => !removed.has(u.id)).map(u => ({ ...u, t: moved(u.t), words: u.words?.map(([t, d, w]): [number, number, string] => [moved(t), d, w]) })),
      ...recording.utterances.map(u => ({ ...u, t: u.t + from, words: u.words?.map(([t, d, w]): [number, number, string] => [t + from, d, w]) })),
    ].sort((a, b) => a.t - b.t),
    events: sortEvents(events),
  }
  if (!next.audio) delete next.audio
  if (!next.video) delete next.video
  return { track: next, unused }
}
