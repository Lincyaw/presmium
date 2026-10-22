import { isRecord } from '@lincyaw/kernel'
import type { Submission } from './exercise.ts'
import type { Note } from './notes.ts'
import type { Prediction, SavedPrediction } from './predict.ts'
import type { PulseVote } from './pulse.ts'
import type { Question } from './questions.ts'
import type { Answer, QuizState } from './quiz.ts'

const isString = (value: unknown): value is string => typeof value === 'string'
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)
const isCounts = (value: unknown): value is number[] => Array.isArray(value) && value.every(isCount)

function isPlace(value: Record<string, unknown>): boolean {
  return isString(value.section) && isString(value.block) && isString(value.title) && isCount(value.index)
}

/**
 * A record with the fields that earlier versions wrote under another name renamed: a classroom
 * whose windows run different versions, or an archive, holds both.
 */
function renamed(value: Record<string, unknown>, before: string, now: string): Record<string, unknown> {
  if (!(before in value)) return value
  const { [before]: old, ...rest } = value
  return now in rest ? rest : { ...rest, [now]: old }
}

export function toAnswer(value: unknown): Answer | undefined {
  if (!isRecord(value)) return undefined
  const answer = renamed(value, 'quiz', 'quizId')
  return isString(answer.quizId) && isString(answer.participant) && isString(answer.name) && isCounts(answer.choice) && isTime(answer.at)
    ? answer as unknown as Answer
    : undefined
}

export function toQuizState(value: unknown): QuizState | undefined {
  if (!isRecord(value)) return undefined
  const state = renamed(value, 'answer', 'correct')
  if (!(isPlace(state) && typeof state.open === 'boolean' && isStrings(state.options) && isCounts(state.correct))) return undefined
  if (state.final === undefined) return state as unknown as QuizState
  const final = Array.isArray(state.final) ? state.final.map(toAnswer) : undefined
  return final?.every(answer => answer !== undefined) ? { ...state, final } as unknown as QuizState : undefined
}

export function toPulseVote(value: unknown): PulseVote | undefined {
  if (!isRecord(value)) return undefined
  const vote = renamed(value, 'pulse', 'pulseId')
  return isPlace(vote) && isString(vote.pulseId) && isString(vote.participant) && isCount(vote.level) && isStrings(vote.levels) && isTime(vote.at)
    ? vote as unknown as PulseVote
    : undefined
}

export function toSubmission(value: unknown): Submission | undefined {
  if (!isRecord(value)) return undefined
  const submission = renamed(value, 'exercise', 'exerciseId')
  return isPlace(submission) && isString(submission.exerciseId) && isString(submission.participant) && isString(submission.name)
    && ['passed', 'failed', 'error'].includes(submission.status as string) && isCount(submission.passed) && isCount(submission.total)
    && isStrings(submission.kinds) && isTime(submission.at)
    ? submission as unknown as Submission
    : undefined
}

export function toQuestion(value: unknown): Question | undefined {
  if (!isRecord(value)) return undefined
  const question = renamed(value, 'author', 'participant')
  const { reply } = question
  return isString(question.section) && (question.block === undefined || isString(question.block)) && isString(question.title)
    && isCount(question.index) && isString(question.text) && isString(question.participant) && isString(question.name) && isTime(question.at)
    && (question.answered === undefined || typeof question.answered === 'boolean')
    && (reply === undefined || (isRecord(reply) && isString(reply.text) && isTime(reply.at) && (reply.provider === undefined || isString(reply.provider))))
    ? question as unknown as Question
    : undefined
}

export function toNote(value: unknown): Note | undefined {
  return isRecord(value) && isString(value.section) && (value.block === undefined || isString(value.block)) && isString(value.text) && isTime(value.at)
    ? value as unknown as Note
    : undefined
}

function isSavedPrediction(value: Record<string, unknown>): boolean {
  return (isCount(value.choice) || isString(value.text)) && isTime(value.at)
}

export function toSavedPrediction(value: unknown): SavedPrediction | undefined {
  return isRecord(value) && isSavedPrediction(value) ? value as unknown as SavedPrediction : undefined
}

export function toPrediction(value: unknown): Prediction | undefined {
  if (!isRecord(value)) return undefined
  const prediction = renamed(value, 'predict', 'predictId')
  return isPlace(prediction) && isString(prediction.predictId) && isString(prediction.participant) && isString(prediction.question)
    && (prediction.choices === undefined || isStrings(prediction.choices)) && isSavedPrediction(prediction)
    ? prediction as unknown as Prediction
    : undefined
}
