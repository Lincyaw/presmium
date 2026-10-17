/**
 * A recorded lecture as an audience sees the deck (P-55 × P-131): a view of
 * the deck for an audience (the students') leaves out sections and blocks,
 * so its lecture leaves out what was said and done with them, and plays on
 * the steps the view numbers. It fails closed: what it cannot place in the
 * view (a section or a block the deck no longer has, as after a teachers'
 * section was relabeled since the recording) is left out too.
 */
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, IRSection, TrackEvent } from '@presmium/kernel'
import { blockDrift, blockKey, blockOf } from './drift.ts'
import { anchorOf, timedEvents } from './timing.ts'
import type { LectureTrack, MediaSegment, Utterance } from './track.ts'

/** What a view of a document leaves out of it: section ids, and blocks by key (`blockKey`). */
export interface LeftOut {
  sections: ReadonlySet<string>
  blocks: ReadonlySet<string>
}

/** What `view` leaves out of `whole`: the sections and blocks of `whole` it does not have. */
export function leftOut(whole: IRDocument, view: IRDocument): LeftOut {
  const shown = new Map(view.sections.map(section => [section.id, new Set([...irBlocks(section.blocks)].map(block => block.id))]))
  const sections = new Set<string>()
  const blocks = new Set<string>()
  for (const section of whole.sections) {
    const kept = shown.get(section.id)
    if (!kept) sections.add(section.id)
    for (const block of irBlocks(section.blocks)) if (!kept?.has(block.id)) blocks.add(blockKey(section.id, block.id))
  }
  return { sections, blocks }
}

/** Whether a view leaves nothing out. */
export function leavesNothing(left: LeftOut): boolean {
  return left.sections.size === 0 && left.blocks.size === 0
}

/**
 * The steps of a section as its view numbers them, the view keeping the
 * blocks `kept` (as the compiler's view renumbers the steps no visual block
 * takes any more); undefined for a step the view does not have.
 */
function viewSteps(section: IRSection, kept: ReadonlySet<string>): (step: number) => number | undefined {
  const blocks = [...irBlocks(section.blocks)]
  if (blocks.every(block => kept.has(block.id))) return step => step
  const used = new Set([0])
  for (const block of blocks) {
    if (block.role !== 'visual' || !kept.has(block.id)) continue
    for (let step = block.at; step <= block.at + (block.span ?? 0); step++) used.add(step)
    if (block.until !== undefined) used.add(block.until)
  }
  if (used.size > section.steps) return step => step
  const steps: (number | undefined)[] = []
  for (let step = 0, n = -1; step <= section.steps; step++) steps.push(used.has(step) ? ++n : undefined)
  return step => steps[Math.min(step, section.steps)]
}

/** How a lecture is cut to a view: where its things are in the view, and which sections the view has. */
interface Cut {
  /** The step a place has in the view; undefined when the view does not have it (`section` undefined: before the first move). */
  place(section: string | undefined, step: number): number | undefined
  /** Whether an event on a block (by its key as recorded) stays. */
  block(key: string): boolean
  /** Whether the view has a section. */
  section(id: string): boolean
}

/**
 * The lecture cut to a view: the utterances and events of the places it
 * has (renumbered as it numbers its steps), the events on blocks it keeps,
 * and the audio and video of the sections nothing was left out of (a
 * section's recording is one file, which holds what was said there).
 * Undefined when nothing is left; the track itself when nothing changed.
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
    const kept = block ? view.block(block) : view.place(where, stepAt(t)) !== undefined
    if (kept && !(anchor && dropped.has(anchor[0]))) {
      events.push([t, type, data])
      continue
    }
    for (const name of [block?.slice(0, block.lastIndexOf('/')), where]) if (name) tainted.add(name)
  }
  if (utterances.length === 0 && events.length === 0) return undefined
  const media = <T extends MediaSegment>(segments: T[] | undefined) => segments?.filter(segment => view.section(segment.section) && !tainted.has(segment.section))
  const audio = media(track.audio)
  const video = media(track.video)
  const sections = track.ir.sections && Object.fromEntries(Object.entries(track.ir.sections).filter(([id]) => view.section(id)))
  const blocks = Object.fromEntries(Object.entries(track.blocks).filter(([key]) => view.block(key)))
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
 * The lecture as the audience of a view of `whole` (leaving out `left`) gets
 * it: only what was said and done in the sections the view has, on the steps
 * it has (numbered as it numbers them), and on the blocks it has (a block
 * moved since the recording is found by its content); the audio and video
 * of a section only when nothing of it was left out. What it cannot place
 * (a section or a block the deck no longer has, a moment before the first
 * move) is left out. Undefined when nothing is left.
 */
export function audienceTrack(track: LectureTrack, whole: IRDocument, left: LeftOut): LectureTrack | undefined {
  const sections = new Map(whole.sections.filter(section => !left.sections.has(section.id)).map(section => [section.id, section]))
  const steps = new Map([...sections].map(([id, section]) => {
    const kept = new Set([...irBlocks(section.blocks)].filter(block => !left.blocks.has(blockKey(id, block.id))).map(block => block.id))
    return [id, viewSteps(section, kept)]
  }))
  const drift = blockDrift(track, whole)
  return cut(track, {
    place: (section, step) => (section === undefined ? undefined : steps.get(section)?.(step)),
    block(key) {
      const found = drift.get(key)
      const now = found && found.grade !== 'lost' ? found.to ?? key : undefined
      return now !== undefined && sections.has(now.slice(0, now.lastIndexOf('/'))) && !left.blocks.has(now)
    },
    section: id => sections.has(id),
  })
}

/** The lecture as the audience of `view` (made from `whole`) gets it (`audienceTrack`). */
export function viewTrack(track: LectureTrack, whole: IRDocument, view: IRDocument): LectureTrack | undefined {
  return audienceTrack(track, whole, leftOut(whole, view))
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
  })
}
