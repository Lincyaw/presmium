export interface Note {
  section: string
  block?: string
  text: string
  at: number
}

export function notesAt<T extends { value: Note }>(notes: Iterable<T>, section: string, block?: string): T[] {
  return [...notes]
    .filter(({ value }) => value.section === section && value.block === block)
    .sort((a, b) => a.value.at - b.value.at)
}
