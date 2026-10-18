import type { ClassroomMessages } from './messages.ts'

export interface Place {
  section: string
  block: string
  title: string
  index: number
}

export function placeKey(place: Pick<Place, 'section' | 'block'>): string {
  return `${place.section}/${place.block}`
}

export type SectionNumbers = Readonly<Record<string, number>>

export const READERS = 'student'

export function readersHave(section: { audience?: readonly string[] }): boolean {
  return !section.audience?.length || section.audience.includes(READERS)
}

export function sectionNumbers(config: Record<string, unknown> | undefined): SectionNumbers {
  const sections = config?.sections
  if (typeof sections !== 'object' || sections === null || Array.isArray(sections)) return {}
  return Object.fromEntries(Object.entries(sections).filter((entry): entry is [string, number] => Number.isInteger(entry[1])))
}

export function placeIndex(place: { section: string, index: number }, numbers: SectionNumbers = {}): number {
  return numbers[place.section] ?? place.index
}

export function placeText(place: { section: string, index: number, title: string, block?: string }, t: ClassroomMessages, numbers?: SectionNumbers): string {
  return t.place(placeIndex(place, numbers), place.title, place.block && isLabel(place.block) ? place.block : undefined)
}

export function isLabel(blockId: string): boolean {
  return !/-\d+$/.test(blockId)
}

export function latestPerParticipant<T extends { participant: string, at: number }>(items: Iterable<T>): T[] {
  const latest = new Map<string, T>()
  for (const item of items) {
    const before = latest.get(item.participant)
    if (!before || item.at >= before.at) latest.set(item.participant, item)
  }
  return [...latest.values()]
}
