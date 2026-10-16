/**
 * Questions (P-66): a learner asks from a question box; the question is
 * attached to the box's section, or to the block the box names, and the
 * presenter view lists the questions by place, in the order of the deck.
 */
import type { ClassroomMessages } from './messages.ts'
import { placeText } from './place.ts'

/** Collection `questions`, by an id the asker draws. */
export interface Question {
  section: string
  /** The block the question is about, when the box names one. */
  block?: string
  title: string
  index: number
  text: string
  /** Participant id and name of the asker. */
  author: string
  name: string
  at: number
  answered?: boolean
  /** An answer the presenter confirmed and sent to the classroom (P-112): an AI answer names the model's provider. */
  reply?: QuestionReply
}

export interface QuestionReply {
  text: string
  /** The model's provider of an AI answer (N-08). */
  provider?: string
  at: number
}

export interface QuestionGroup<T extends Question> {
  /** `第 3 节 · 标题 · 块`. */
  place: string
  section: string
  block?: string
  questions: T[]
}

/** Questions grouped by place: sections in deck order, a section before its blocks, oldest question first. */
export function questionsByPlace<T extends Question>(questions: Iterable<T>, t: ClassroomMessages): QuestionGroup<T>[] {
  const groups = new Map<string, QuestionGroup<T> & { index: number }>()
  for (const q of [...questions].sort((a, b) => a.at - b.at)) {
    const key = `${q.section}\n${q.block ?? ''}`
    let group = groups.get(key)
    if (!group) groups.set(key, group = { place: placeText(q, t), section: q.section, block: q.block, index: q.index, questions: [] })
    group.questions.push(q)
  }
  return [...groups.values()]
    .sort((a, b) => a.index - b.index || (a.block ?? '').localeCompare(b.block ?? ''))
    .map(({ index: _index, ...group }) => group)
}
