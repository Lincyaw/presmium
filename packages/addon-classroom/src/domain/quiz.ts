import type { SessionStatus } from '@lincyaw/kernel'
import type { Place } from './place.ts'
import { latestPerParticipant } from './tally.ts'

export interface QuizState extends Place {
  open: boolean
  options: string[]
  correct: number[]
  openedAt?: number
  closedAt?: number
  final?: Answer[]
}

export interface Answer {
  quizId: string
  participant: string
  name: string
  choice: number[]
  at: number
}

export interface QuizTally {
  counts: number[]
  respondents: number
  correct: number
}

export function answerId(quizId: string, participant: string): string {
  return `${quizId}:${participant}`
}

export function isCorrect(choice: readonly number[], correct: readonly number[]): boolean {
  const chosen = new Set(choice)
  return chosen.size === correct.length && correct.every(i => chosen.has(i))
}

export function countedAnswers(quizId: string, state: QuizState | undefined, answers: Iterable<Answer>): Answer[] {
  if (state?.open === false && state.final) return state.final
  return latestPerParticipant([...answers].filter(a => a.quizId === quizId))
}

export function lateAnswers(quizId: string, state: QuizState | undefined, answers: Iterable<Answer>): Answer[] {
  if (state?.open !== false || !state.final) return []
  const counted = new Map(state.final.map(a => [a.participant, a.at]))
  return latestPerParticipant([...answers].filter(a => a.quizId === quizId)).filter(a => counted.get(a.participant) !== a.at)
}

export function quizTally(options: number, correct: readonly number[], counted: readonly Answer[]): QuizTally {
  const counts = Array.from({ length: options }, (_, i) => counted.filter(a => a.choice.includes(i)).length)
  return { counts, respondents: counted.length, correct: counted.filter(a => isCorrect(a.choice, correct)).length }
}

export function quizSwitched(quiz: Omit<QuizState, 'open' | 'closedAt' | 'final'>, open: boolean, counted: readonly Answer[], now: number): QuizState {
  return open ? { ...quiz, open, openedAt: now } : { ...quiz, open, closedAt: now, final: [...counted] }
}

export function acceptsAnswers(status: SessionStatus | undefined, state: QuizState | undefined): boolean {
  return status === 'active' && state?.open === true
}

export function optionLetter(i: number): string {
  return String.fromCharCode(65 + i)
}
