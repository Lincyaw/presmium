/**
 * A recorded lecture as an audience sees the deck (P-55 × P-131): a view of
 * the deck for an audience (the students') leaves out sections and blocks,
 * so its lecture leaves out what was said and done with them, and plays on
 * the steps the view numbers. It fails closed: a section's audio and video
 * go when the view leaves anything of the section out (the camera and the
 * screen saw it, the voice may have said it); what was said and done at a
 * step where something left out is shown or said goes too; and so does what
 * the view cannot place (a section or a block the deck no longer has, as
 * after a teachers' section was relabeled since the recording).
 */
import { irBlocks, isRecord } from '@presmium/kernel'
import type { IRBlock, IRDocument, IRSection, TrackEvent } from '@presmium/kernel'
import { blockDrift, blockKey, blockOf, irHash, sectionHashes } from './drift.ts'
import { anchorOf, timedEvents } from './timing.ts'
import type { LectureTrack, MediaSegment, Utterance } from './track.ts'

/** What a view of a document leaves out of it: section ids, and blocks by key (`blockKey`). */
export interface LeftOut {
  sections: ReadonlySet<string>
  blocks: ReadonlySet<string>
  /** The blocks it keeps with something inside left out: a node for other audiences, or the text of a reference to what it leaves out. */
  inside: ReadonlySet<string>
}

/** What of a block's own content a view may leave out of it: its nodes marked for audiences, and its references that say their target's text. */
function withheldParts(block: IRBlock): number {
  let count = 0
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!isRecord(value)) return
    if (isRecord(value.data) && Array.isArray(value.data.audience)) count++
    if (value.type === 'crossReference' && Array.isArray(value.children) && value.children.length > 0) count++
    for (const [key, item] of Object.entries(value)) if (key !== 'position') visit(item)
  }
  const { node } = block
  if (node.type === 'markdown') visit(node.mdast)
  else if (node.type === 'component') visit([node.props, node.fallback])
  return count
}

const lefts = new WeakMap<IRDocument, { view: IRDocument, left: LeftOut }>()

/** What `view` leaves out of `whole`: the sections and blocks of `whole` it does not have, and those it has with less inside. */
export function leftOut(whole: IRDocument, view: IRDocument): LeftOut {
  const known = lefts.get(whole)
  if (known?.view === view) return known.left
  const shown = new Map(view.sections.map(section => [section.id, new Map([...irBlocks(section.blocks)].map(block => [block.id, block]))]))
  const sections = new Set<string>()
  const blocks = new Set<string>()
  const inside = new Set<string>()
  for (const section of whole.sections) {
    const kept = shown.get(section.id)
    if (!kept) sections.add(section.id)
    for (const block of irBlocks(section.blocks)) {
      const own = kept?.get(block.id)
      if (!own) blocks.add(blockKey(section.id, block.id))
      else if (own !== block && withheldParts(own) < withheldParts(block)) inside.add(blockKey(section.id, block.id))
    }
  }
  const left = { sections, blocks, inside }
  lefts.set(whole, { view, left })
  return left
}

/** Whether a view leaves nothing out. */
export function leavesNothing(left: LeftOut): boolean {
  return left.sections.size === 0 && left.blocks.size === 0 && left.inside.size === 0
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

/** The steps a block is seen or heard at: a visual block from its step until it goes (the section's end when it stays), narration at its step. */
function shownAt(block: IRBlock, last: number): number[] {
  const from = Math.min(block.at, last)
  const to = block.role === 'visual' ? Math.min(block.until === undefined ? last : block.until - 1, last) : from
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
}

/** Where the places of a document are in a view of it. */
export interface ViewPlaces {
  /**
   * The view's number of step `step` of section `section` of the whole
   * document (steps past the last are the last); undefined when the view
   * does not have that section or step, or leaves out something seen or
   * heard at that step.
   */
  step(section: string, step: number): number | undefined
  /** Whether the view has the section. */
  has(section: string): boolean
  /** Whether the view has the section and leaves nothing of it out. */
  whole(section: string): boolean
}

/** The places of `whole` in its view that leaves out `left`. */
export function viewPlaces(whole: IRDocument, left: LeftOut): ViewPlaces {
  const steps = new Map<string, (step: number) => number | undefined>()
  const touched = new Set<string>()
  for (const section of whole.sections) {
    if (left.sections.has(section.id)) continue
    const blocks = [...irBlocks(section.blocks)]
    const gone = (block: IRBlock) => left.blocks.has(blockKey(section.id, block.id))
    const hidden = new Set<number>()
    for (const block of blocks) {
      if (!gone(block) && !left.inside.has(blockKey(section.id, block.id))) continue
      touched.add(section.id)
      for (const step of shownAt(block, section.steps)) hidden.add(step)
    }
    const number = viewSteps(section, new Set(blocks.filter(block => !gone(block)).map(block => block.id)))
    steps.set(section.id, step => (hidden.has(Math.min(step, section.steps)) ? undefined : number(step)))
  }
  return {
    step: (section, step) => steps.get(section)?.(step),
    has: section => steps.has(section),
    whole: section => steps.has(section) && !touched.has(section),
  }
}

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
 * The lecture as the audience of a view of `whole` (leaving out `left`) gets
 * it, `whole` numbering its steps as the lecture was recorded (the web
 * form's): only what was said and done in the sections the view has, at the
 * steps it has where it leaves out nothing seen or heard (numbered as it
 * numbers them), and on the blocks it has (a block moved since the
 * recording is found by its content); the audio and video of a section only
 * when nothing of it was left out. What it cannot place (a section or a
 * block the deck no longer has, a moment before the first move) is left
 * out. Undefined when nothing is left.
 */
export function audienceTrack(track: LectureTrack, whole: IRDocument, left: LeftOut): LectureTrack | undefined {
  const places = viewPlaces(whole, left)
  const drift = blockDrift(track, whole)
  return cut(track, {
    place: (section, step) => (section === undefined ? undefined : places.step(section, step)),
    block(key, placed) {
      const found = drift.get(key)
      const now = found && found.grade !== 'lost' ? found.to ?? key : undefined
      return placed && now !== undefined && places.has(now.slice(0, now.lastIndexOf('/'))) && !left.blocks.has(now)
    },
    section: id => places.has(id),
    media: id => places.whole(id),
  })
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
