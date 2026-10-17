/**
 * Where a classroom item is in the deck. The plugin's compile pass gives each
 * of its components the section and block it stands in; items made there
 * (answers, questions, votes, notes) keep that place, so the presenter view
 * lists them by place in both forms.
 */
import type { ClassroomMessages } from './messages.ts'

/** The place of a component, set by the `classroom-places` pass as the prop `place`. */
export interface Place {
  /** Section id. */
  section: string
  /** Block id within the section. */
  block: string
  /** Section title and 1-based number, for lists in the presenter view. */
  title: string
  index: number
}

/** The id of a component's quiz, exercise, question box or pulse: unique in the deck, stable while its labels are. */
export function placeKey(place: Pick<Place, 'section' | 'block'>): string {
  return `${place.section}/${place.block}`
}

/**
 * The numbers of the sections in this window's own build, by section id
 * (D-4, F-85): `classroom-places` writes them to the plugin's configuration
 * as `sections`. A learner writes a place as the learner's build numbers it,
 * and the student build numbers its sections apart from the full one, so the
 * overview numbers places by their section's id. Sections that the readers'
 * build (`READERS`) leaves out are not listed, so no build names a section
 * a reader's build lacks.
 */
export type SectionNumbers = Readonly<Record<string, number>>

/**
 * The audience of the readers' build: the student view of `presmium serve`
 * and `presmium build --audience student` (docs/ir.md 2.11).
 */
export const READERS = 'student'

/** Whether the readers' build has a section: one for every audience, or for theirs among others. */
export function readersHave(section: { audience?: readonly string[] }): boolean {
  return !section.audience?.length || section.audience.includes(READERS)
}

/** The section numbers of the plugin's configuration; none in a deck compiled without them. */
export function sectionNumbers(config: Record<string, unknown> | undefined): SectionNumbers {
  const sections = config?.sections
  if (typeof sections !== 'object' || sections === null || Array.isArray(sections)) return {}
  return Object.fromEntries(Object.entries(sections).filter((entry): entry is [string, number] => Number.isInteger(entry[1])))
}

/** The number of a place's section in this window's build, else as its writer's build numbered it. */
export function placeIndex(place: { section: string, index: number }, numbers: SectionNumbers = {}): number {
  return numbers[place.section] ?? place.index
}

/** `第 3 节 · 标题`, with the block when it has a label (a generated id means nothing to a reader). */
export function placeText(place: { section: string, index: number, title: string, block?: string }, t: ClassroomMessages, numbers?: SectionNumbers): string {
  return t.place(placeIndex(place, numbers), place.title, place.block && isLabel(place.block) ? place.block : undefined)
}

/**
 * Whether a block id is a label the author wrote (`(name)=` or `:label:`):
 * the compiler numbers other blocks `<kind>-<n>` (packages/kernel/src/ir.ts).
 * Only labelled blocks keep their id when the section is edited, so only
 * they take notes. A label written in the generated form counts as generated.
 */
export function isLabel(blockId: string): boolean {
  return !/-\d+$/.test(blockId)
}

/** A participant's latest item of each kind: later `at` wins, per `participant`. */
export function latestPerParticipant<T extends { participant: string, at: number }>(items: Iterable<T>): T[] {
  const latest = new Map<string, T>()
  for (const item of items) {
    const before = latest.get(item.participant)
    if (!before || item.at >= before.at) latest.set(item.participant, item)
  }
  return [...latest.values()]
}
