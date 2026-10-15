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

/** `第 3 节 · 标题`, with the block when it has a label (a generated id means nothing to a reader). */
export function placeText(place: { index: number, title: string, block?: string }, t: ClassroomMessages): string {
  return t.place(place.index, place.title, place.block && isLabel(place.block) ? place.block : undefined)
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
