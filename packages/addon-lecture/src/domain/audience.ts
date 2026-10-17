/**
 * A recorded lecture as a build publishes it (P-55 × P-131): without what
 * was said and done in the sections the built deck does not have
 * (`deckTrack`), and in a version for an audience (the students') only in
 * the sections that version has as they were recorded (`recordedSections`,
 * F-13). It fails closed: what it cannot place goes, and so do the audio
 * and video of a section that lost something since the recording.
 */
import type { IRDocument, TrackEvent } from '@presmium/kernel'
import { blockDrift, blockOf, irHash, sectionHashes } from './drift.ts'
import { anchorOf, timedEvents } from './timing.ts'
import type { LectureTrack, MediaSegment, Utterance } from './track.ts'

/** How a lecture is cut to a view: where its things are in the view, and which sections and recordings it keeps. */
interface Cut {
  /** The step a place has in the view; undefined when the view does not have it (`section` undefined: before the first move). */
  place(section: string | undefined, step: number): number | undefined
  /** Whether an event on a block (by its key as recorded) stays; `placed`: the view has the place it was done at. */
  block(key: string, placed: boolean): boolean
  /** Whether the view has a section. */
  section(id: string): boolean
  /** Whether the view keeps a section's audio and video. */
  media(id: string): boolean
}

/**
 * The lecture cut to a view: the utterances and events of the places it
 * has (renumbered as it numbers its steps), the events on blocks it keeps,
 * and the audio and video of the sections it keeps them of and nothing was
 * left out of (a section's recording is one file, which holds what was said
 * and shown there). Undefined when nothing is left; the track itself when
 * nothing changed.
 */
function cut(track: LectureTrack, view: Cut): LectureTrack | undefined {
  /** Where the lecture is at a time: the last move at or before it. */
  const moves = timedEvents(track).filter(event => event.type === 'go' && typeof event.data.section === 'string')
  const at = (t: number) => moves.filter(move => move.t <= t).at(-1)?.data
  const sectionAt = (t: number) => {
    const section = at(t)?.section
    return typeof section === 'string' ? section : undefined
  }
  const stepAt = (t: number) => Number(at(t)?.step ?? 0)

  let changed = false
  /** Sections something was left out of: their recordings are left out too. */
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

/**
 * A recorded lecture as a version for an audience (`view`, its IR: the
 * students') publishes it (F-13, P-55): what was said, the audio and the
 * video only of the sections the version has as they were recorded, by the
 * hash of each section the track keeps (`track.ir.sections`, `sectionHashes`
 * of the web form's blocks). A section whose hash is not the version's
 * lost something since (content for another audience, or content moved into
 * a section only for another audience after the recording), and what was
 * said or shown there may have been it: its utterances, its media and its
 * events but the moves go. It fails closed: a track without the hashes of
 * its sections keeps them only when the hash of the whole IR is the
 * version's. Undefined when nothing is left; the track itself when nothing
 * changed.
 */
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

/**
 * The lecture of a deck that leaves nothing out, as a build publishes it:
 * without what was said and done in the sections `doc` does not have (one
 * relabeled or deleted since the recording, or left out of the build) and
 * their audio and video. The rest stays as recorded: the player follows a
 * block that moved and skips the actions on one that is gone, saying so.
 */
export function deckTrack(track: LectureTrack, doc: IRDocument): LectureTrack | undefined {
  const sections = new Set(doc.sections.map(section => section.id))
  const drift = blockDrift(track, doc)
  return cut(track, {
    place: (section, step) => (section === undefined || sections.has(section) ? step : undefined),
    // An action on a block of a section the deck does not have goes with that section, unless the block moved to one it has.
    block: key => sections.has(key.slice(0, key.lastIndexOf('/'))) || Boolean(drift.get(key)?.to),
    section: id => sections.has(id),
    media: id => sections.has(id),
  })
}
