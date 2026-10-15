/**
 * Classroom quizzes (P-64). The presenter opens and closes a quiz; while it is
 * open each participant answers, and answering again replaces their answer,
 * so the tally counts every participant's last answer only. Closing freezes
 * the result: the closed quiz keeps the answers that counted at that moment,
 * so an answer that reaches the room later (from a learner whose view still
 * showed the quiz open) changes nothing.
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
  /** Set by closing: each participant's last answer as the presenter's window had it then. */
  final?: Answer[]
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

/** The answers that count: each participant's last one, or once the quiz is closed, those it was closed with. */
export function countedAnswers(quiz: string, state: QuizState | undefined, answers: Iterable<Answer>): Answer[] {
  if (state?.open === false && state.final) return state.final
  return latestPerParticipant([...answers].filter(a => a.quiz === quiz))
}

/** Each participant's last answer when it is not the one a closed quiz counts: it reached the room after closing. */
export function lateAnswers(quiz: string, state: QuizState | undefined, answers: Iterable<Answer>): Answer[] {
  if (state?.open !== false || !state.final) return []
  const counted = new Map(state.final.map(a => [a.participant, a.at]))
  return latestPerParticipant([...answers].filter(a => a.quiz === quiz)).filter(a => counted.get(a.participant) !== a.at)
}

/** The quiz's statistics over the answers that count (`countedAnswers`). */
export function tally(options: number, answer: readonly number[], counted: readonly Answer[]): Tally {
  const counts = Array.from({ length: options }, (_, i) => counted.filter(a => a.choice.includes(i)).length)
  return { counts, respondents: counted.length, correct: counted.filter(a => isCorrect(a.choice, answer)).length }
}

/** The quiz `quiz` opened (`open`) or closed at `now`; closing freezes the answers that count then. */
export function quizSwitched(quiz: Omit<QuizState, 'open' | 'closedAt' | 'final'>, open: boolean, counted: readonly Answer[], now: number): QuizState {
  return open ? { ...quiz, open, openedAt: now } : { ...quiz, open, closedAt: now, final: [...counted] }
}

/** Answers are taken while the classroom is active and the presenter has the quiz open. */
export function acceptsAnswers(status: SessionStatus | undefined, state: QuizState | undefined): boolean {
  return status === 'active' && state?.open === true
}

/** `A`, `B`, ... for option i. */
export function optionLetter(i: number): string {
  return String.fromCharCode(65 + i)
}
