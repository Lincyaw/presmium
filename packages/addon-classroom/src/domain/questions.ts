import type { SectionNumbers } from './config.ts'
import type { ClassroomMessages } from './messages.ts'
import { placeIndex, placeText } from './place.ts'

export interface Question {
  section: string
  block?: string
  title: string
  index: number
  text: string
  participant: string
  name: string
  at: number
  answered?: boolean
  reply?: QuestionReply
}

export interface QuestionReply {
  text: string
  provider?: string
  at: number
}

export interface QuestionGroup<T extends Question> {
  label: string
  section: string
  block?: string
  questions: T[]
}

export function questionsByPlace<T extends Question>(questions: Iterable<T>, t: ClassroomMessages, numbers?: SectionNumbers): QuestionGroup<T>[] {
  const groups = new Map<string, QuestionGroup<T> & { index: number }>()
  for (const q of [...questions].sort((a, b) => a.at - b.at)) {
    const key = `${q.section}\n${q.block ?? ''}`
    let group = groups.get(key)
    if (!group) groups.set(key, group = { label: placeText(q, t, numbers), section: q.section, block: q.block, index: placeIndex(q, numbers), questions: [] })
    group.questions.push(q)
  }
  return [...groups.values()]
    .sort((a, b) => a.index - b.index || (a.block ?? '').localeCompare(b.block ?? ''))
    .map(({ index: _index, ...group }) => group)
}
