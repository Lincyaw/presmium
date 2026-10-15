/**
 * Learner notes (P-63): private notes attached to a section, or to a
 * labelled block of it, by id, so they stay in place when the deck changes
 * around them. They are kept in the browser, so they outlast a classroom;
 * while a classroom is active they also go to the participant's own store of
 * the `session` service.
 */

/** Collection `notes`, by an id the author draws. */
export interface Note {
  section: string
  block?: string
  text: string
  at: number
}

/** The notes of one place, oldest first. */
export function notesAt<T extends { value: Note }>(notes: Iterable<T>, section: string, block?: string): T[] {
  return [...notes]
    .filter(({ value }) => value.section === section && value.block === block)
    .sort((a, b) => a.value.at - b.value.at)
}
