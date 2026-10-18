import type { IRDocument, TrackEvent } from '@presmium/kernel'
import { blockDrift, blockOf, irHash, sectionHashes } from './drift.ts'
import { anchorOf, timedEvents } from './timing.ts'
import type { LectureTrack, MediaSegment, Utterance } from './track.ts'

interface Cut {
  place(section: string | undefined, step: number): number | undefined
  block(key: string, placed: boolean): boolean
  section(id: string): boolean
  media(id: string): boolean
}

function cut(track: LectureTrack, view: Cut): LectureTrack | undefined {
  const moves = timedEvents(track).filter(event => event.type === 'go' && typeof event.data.section === 'string')
  const at = (t: number) => moves.filter(move => move.t <= t).at(-1)?.data
  const sectionAt = (t: number) => {
    const section = at(t)?.section
    return typeof section === 'string' ? section : undefined
  }
  const stepAt = (t: number) => Number(at(t)?.step ?? 0)

  let changed = false
  const tainted = new Set<string>()
  const dropped = new Set<string>()
  const utterances: Utterance[] = []
  for (const u of track.utterances) {
    const section = u.section ?? sectionAt(u.t)
    const step = view.place(section, u.step ?? stepAt(u.t))
    if (step === undefined) {
      dropped.add(u.id)
      if (section) tainted.add(section)
      continue
    }
    if (u.step !== undefined && step !== u.step) changed = true
    utterances.push(u.step === undefined || step === u.step ? u : { ...u, step })
  }
  const events: TrackEvent[] = []
  for (const [t, type, data] of track.events) {
    const where = sectionAt(t)
    if (type === 'go') {
      const section = typeof data.section === 'string' ? data.section : undefined
      const step = view.place(section, Number(data.step ?? 0))
      if (step !== undefined) {
        if (data.step !== undefined && step !== data.step) changed = true
        events.push([t, type, data.step === undefined || step === data.step ? data : { ...data, step }])
        continue
      }
      for (const name of [section, where]) if (name) tainted.add(name)
      continue
    }
    const block = blockOf(data)
    const anchor = anchorOf(data)
    const placed = view.place(where, stepAt(t)) !== undefined
    const kept = block ? view.block(block, placed) : placed
    if (kept && !(anchor && dropped.has(anchor[0]))) {
      events.push([t, type, data])
      continue
    }
    for (const name of [block?.slice(0, block.lastIndexOf('/')), where]) if (name) tainted.add(name)
  }
  if (utterances.length === 0 && events.length === 0) return undefined
  const media = <T extends MediaSegment>(segments: T[] | undefined) => segments?.filter(segment => view.media(segment.section) && !tainted.has(segment.section))
  const audio = media(track.audio)
  const video = media(track.video)
  const sections = track.ir.sections && Object.fromEntries(Object.entries(track.ir.sections).filter(([id]) => view.section(id)))
  const blocks = Object.fromEntries(Object.entries(track.blocks).filter(([key]) => view.block(key, true)))
  const same = !changed && utterances.length === track.utterances.length && events.length === track.events.length
    && audio?.length === track.audio?.length && video?.length === track.video?.length
    && Object.keys(sections ?? {}).length === Object.keys(track.ir.sections ?? {}).length && Object.keys(blocks).length === Object.keys(track.blocks).length
  if (same) return track
  return {
    ...track,
    ir: { ...track.ir, ...sections ? { sections } : {} },
    ...audio ? { audio } : {},
    ...video ? { video } : {},
    blocks,
    utterances,
    events,
  }
}

export function recordedSections(track: LectureTrack, view: IRDocument): LectureTrack | undefined {
  const now = sectionHashes(view)
  const recorded = track.ir.sections
  const whole = recorded === undefined && track.ir.hash === irHash(view)
  const same = (section: string | undefined) => section !== undefined && (whole || (recorded?.[section] !== undefined && recorded[section] === now[section]))
  const moves = timedEvents(track).filter(event => event.type === 'go' && typeof event.data.section === 'string')
  const sectionAt = (t: number) => {
    const section = moves.filter(move => move.t <= t).at(-1)?.data.section
    return typeof section === 'string' ? section : undefined
  }
  const utterances = track.utterances.filter(u => same(u.section ?? sectionAt(u.t)))
  const said = new Set(utterances.map(u => u.id))
  const events = track.events.filter(([t, type, data]) => {
    if (type === 'go') return true
    const anchor = anchorOf(data)
    return same(sectionAt(t)) && !(anchor && !said.has(anchor[0]))
  })
  const media = <T extends MediaSegment>(segments: T[] | undefined) => segments?.filter(segment => same(segment.section))
  const audio = media(track.audio)
  const video = media(track.video)
  if (utterances.length === track.utterances.length && events.length === track.events.length && audio?.length === track.audio?.length && video?.length === track.video?.length) return track
  if (utterances.length === 0 && !audio?.length && !video?.length) return undefined
  return { ...track, ...audio ? { audio } : {}, ...video ? { video } : {}, utterances, events }
}

export function deckTrack(track: LectureTrack, doc: IRDocument): LectureTrack | undefined {
  const sections = new Set(doc.sections.map(section => section.id))
  const drift = blockDrift(track, doc)
  return cut(track, {
    place: (section, step) => (section === undefined || sections.has(section) ? step : undefined),
    block: key => sections.has(key.slice(0, key.lastIndexOf('/'))) || Boolean(drift.get(key)?.to),
    section: id => sections.has(id),
    media: id => sections.has(id),
  })
}
