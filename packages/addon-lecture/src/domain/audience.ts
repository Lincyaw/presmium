/**
 * A recorded lecture as an audience sees the deck (P-55 × P-131): a view of
 * the deck for an audience (the students') leaves out sections and blocks,
 * so its lecture leaves out what was said and done with them, and plays on
 * the steps the view numbers.
 */
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, IRSection, TrackEvent } from '@presmium/kernel'
import { blockKey, blockOf } from './drift.ts'
import { anchorOf, timedEvents } from './timing.ts'
import type { LectureTrack, MediaSegment, Utterance } from './track.ts'

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

/**
 * The lecture as the audience of `view` (made from `whole`) gets it: without
 * the utterances and events of a section the view leaves out or of a step it
 * no longer has, nor the events on a block it leaves out, nor the audio and
 * video of the sections where any of these were (a section's recording is
 * one file, which holds what was said there); the steps renumbered as the
 * view numbers them. Sections and blocks the whole document does not know
 * (the deck changed since) stay. Undefined when nothing is left.
 */
export function viewTrack(track: LectureTrack, whole: IRDocument, view: IRDocument): LectureTrack | undefined {
  if (whole === view) return track
  const shown = new Map(view.sections.map(section => [section.id, section]))
  const gone = new Set<string>()
  const left = new Set<string>()
  const steps = new Map<string, (step: number) => number | undefined>()
  for (const section of whole.sections) {
    const own = shown.get(section.id)
    if (!own) gone.add(section.id)
    const kept = new Set(own ? [...irBlocks(own.blocks)].map(block => block.id) : [])
    for (const block of irBlocks(section.blocks)) if (!kept.has(block.id)) left.add(blockKey(section.id, block.id))
    if (own) steps.set(section.id, viewSteps(section, kept))
  }
  /** Where the lecture is at a time: the last move at or before it. */
  const moves = timedEvents(track).filter(event => event.type === 'go' && typeof event.data.section === 'string')
  const at = (t: number) => moves.filter(move => move.t <= t).at(-1)?.data
  /** The step a place has in the view: undefined when the view does not have it, the step itself where the deck does not know the section. */
  const place = (section: string | undefined, step: number): { step: number } | undefined => {
    if (section === undefined || !steps.has(section)) return gone.has(section ?? '') ? undefined : { step }
    const now = steps.get(section)!(step)
    return now === undefined ? undefined : { step: now }
  }

  /** Sections something was left out of: their recordings are left out too. */
  const tainted = new Set<string>(gone)
  const dropped = new Set<string>()
  const utterances: Utterance[] = []
  for (const u of track.utterances) {
    const where = at(u.t)
    const section = u.section ?? (typeof where?.section === 'string' ? where.section : undefined)
    const kept = place(section, u.step ?? Number(where?.step ?? 0))
    if (!kept) {
      dropped.add(u.id)
      if (section) tainted.add(section)
      continue
    }
    utterances.push(u.step === undefined ? u : { ...u, step: kept.step })
  }
  const events: TrackEvent[] = []
  for (const [t, type, data] of track.events) {
    const anchor = anchorOf(data)
    const block = blockOf(data)
    const section = type === 'go' ? data.section as string | undefined : block?.slice(0, block.lastIndexOf('/'))
    if (type === 'go') {
      const kept = place(section, Number(data.step ?? 0))
      if (kept) {
        events.push([t, type, data.step === undefined ? data : { ...data, step: kept.step }])
        continue
      }
    } else if (!(anchor && dropped.has(anchor[0])) && !(block && (left.has(block) || gone.has(section!)))) {
      events.push([t, type, data])
      continue
    }
    const where = at(t)?.section
    for (const name of [section, typeof where === 'string' ? where : undefined]) if (name) tainted.add(name)
  }
  if (utterances.length === 0 && events.length === 0) return undefined
  const media = <T extends MediaSegment>(segments: T[] | undefined) => segments?.filter(segment => !tainted.has(segment.section))
  const audio = media(track.audio)
  const video = media(track.video)
  const sections = track.ir.sections && Object.fromEntries(Object.entries(track.ir.sections).filter(([id]) => !gone.has(id)))
  return {
    ...track,
    ir: { ...track.ir, ...sections ? { sections } : {} },
    ...audio ? { audio } : {},
    ...video ? { video } : {},
    blocks: Object.fromEntries(Object.entries(track.blocks).filter(([key]) => !left.has(key))),
    utterances,
    events,
  }
}
