import type { SessionStatus } from '@lincyaw/kernel'
import { latestPerParticipant } from './place.ts'
import type { Place } from './place.ts'

export interface QuizState extends Place {
  open: boolean
  options: string[]
  answer: number[]
  openedAt?: number
  closedAt?: number
  final?: Answer[]
}

export interface Answer {
  quiz: string
  participant: string
  name: string
  choice: number[]
  at: number
}

export interface Tally {
  counts: number[]
  respondents: number
  correct: number
}

export function answerId(quiz: string, participant: string): string {
  return `${quiz}:${participant}`
}

export function isCorrect(choice: readonly number[], answer: readonly number[]): boolean {
  const chosen = new Set(choice)
  return chosen.size === answer.length && answer.every(i => chosen.has(i))
}

export function countedAnswers(quiz: string, state: QuizState | undefined, answers: Iterable<Answer>): Answer[] {
  if (state?.open === false && state.final) return state.final
  return latestPerParticipant([...answers].filter(a => a.quiz === quiz))
}

export function lateAnswers(quiz: string, state: QuizState | undefined, answers: Iterable<Answer>): Answer[] {
  if (state?.open !== false || !state.final) return []
  const counted = new Map(state.final.map(a => [a.participant, a.at]))
  return latestPerParticipant([...answers].filter(a => a.quiz === quiz)).filter(a => counted.get(a.participant) !== a.at)
}

export function tally(options: number, answer: readonly number[], counted: readonly Answer[]): Tally {
  const counts = Array.from({ length: options }, (_, i) => counted.filter(a => a.choice.includes(i)).length)
  return { counts, respondents: counted.length, correct: counted.filter(a => isCorrect(a.choice, answer)).length }
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
