import type { SectionNumbers } from './config.ts'
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

export function placeIndex(place: { section: string, index: number }, numbers: SectionNumbers = {}): number {
  return numbers[place.section] ?? place.index
}

export function placeText(place: { section: string, index: number, title: string, block?: string }, t: ClassroomMessages, numbers?: SectionNumbers): string {
  return t.place(placeIndex(place, numbers), place.title, place.block && isAuthorLabel(place.block) ? place.block : undefined)
}

export function isAuthorLabel(blockId: string): boolean {
  return !/-\d+$/.test(blockId)
}
