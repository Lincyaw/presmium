/**
 * Classroom quizzes (P-64). The presenter opens and closes a quiz; while it is
 * open each participant answers, and answering again replaces their answer,
 * so the tally counts every participant's last answer only.
 */
import type { SessionStatus } from '@presmium/kernel'
import { latestPerParticipant } from './place.ts'
import type { Place } from './place.ts'

/** A quiz as the presenter opened or closed it (collection `quizzes`, by quiz id), with what the presenter view lists. */
export interface QuizState extends Place {
  open: boolean
  options: string[]
  /** Indexes of the right options. */
  answer: number[]
  openedAt?: number
  closedAt?: number
}

/** One participant's answer to a quiz (collection `answers`, by `answerId`). */
export interface Answer {
  quiz: string
  participant: string
  name: string
  /** Indexes of the chosen options. */
  choice: number[]
  at: number
}

export interface Tally {
  /** Participants who chose each option. */
  counts: number[]
  respondents: number
  /** Participants whose answer is right. */
  correct: number
}

/** One entry per participant and quiz: a new answer replaces the earlier one. */
export function answerId(quiz: string, participant: string): string {
  return `${quiz}:${participant}`
}

/** The same options as the right ones, no more, no fewer. */
export function isCorrect(choice: readonly number[], answer: readonly number[]): boolean {
  const chosen = new Set(choice)
  return chosen.size === answer.length && answer.every(i => chosen.has(i))
}

/** The quiz's statistics: each participant's last answer counts. */
export function tally(quiz: string, options: number, answer: readonly number[], answers: Iterable<Answer>): Tally {
  const last = latestPerParticipant([...answers].filter(a => a.quiz === quiz))
  const counts = Array.from({ length: options }, (_, i) => last.filter(a => a.choice.includes(i)).length)
  return { counts, respondents: last.length, correct: last.filter(a => isCorrect(a.choice, answer)).length }
}

/** Answers are taken while the classroom is active and the presenter has the quiz open. */
export function acceptsAnswers(status: SessionStatus | undefined, state: QuizState | undefined): boolean {
  return status === 'active' && state?.open === true
}

/** `A`, `B`, ... for option i. */
export function optionLetter(i: number): string {
  return String.fromCharCode(65 + i)
}
