/**
 * The shapes of what participants write to the classroom store. The
 * classroom server checks only whose an entry is (`ClassroomStore`), so an
 * entry from a client of another version, or written by hand, can lack what
 * the components read; they leave such entries out.
 */
import { isRecord } from '@presmium/kernel'
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

function isPlace(value: Record<string, unknown>): boolean {
  return isString(value.section) && isString(value.block) && isString(value.title) && isCount(value.index)
}

export function isAnswer(value: unknown): value is Answer {
  return isRecord(value) && isString(value.quiz) && isString(value.participant) && isString(value.name)
    && Array.isArray(value.choice) && value.choice.every(isCount) && isTime(value.at)
}

export function isQuizState(value: unknown): value is QuizState {
  return isRecord(value) && isPlace(value) && typeof value.open === 'boolean' && isStrings(value.options)
    && Array.isArray(value.answer) && value.answer.every(isCount) && (value.final === undefined || (Array.isArray(value.final) && value.final.every(isAnswer)))
}

export function isPulseVote(value: unknown): value is PulseVote {
  return isRecord(value) && isPlace(value) && isString(value.pulse) && isString(value.participant)
    && isCount(value.level) && isStrings(value.levels) && isTime(value.at)
}

export function isSubmission(value: unknown): value is Submission {
  return isRecord(value) && isPlace(value) && isString(value.exercise) && isString(value.participant) && isString(value.name)
    && ['passed', 'failed', 'error'].includes(value.status as string) && isCount(value.passed) && isCount(value.total)
    && isStrings(value.kinds) && isTime(value.at)
}

export function isQuestion(value: unknown): value is Question {
  return isRecord(value) && isString(value.section) && (value.block === undefined || isString(value.block)) && isString(value.title)
    && isCount(value.index) && isString(value.text) && isString(value.author) && isString(value.name) && isTime(value.at)
    && (value.answered === undefined || typeof value.answered === 'boolean')
    && (value.reply === undefined || (isRecord(value.reply) && isString(value.reply.text) && isTime(value.reply.at) && (value.reply.provider === undefined || isString(value.reply.provider))))
}

export function isNote(value: unknown): value is Note {
  return isRecord(value) && isString(value.section) && (value.block === undefined || isString(value.block)) && isString(value.text) && isTime(value.at)
}

/** A prediction as the browser keeps it: a choice or a text. */
export function isSavedPrediction(value: unknown): value is SavedPrediction {
  return isRecord(value) && (isCount(value.choice) || isString(value.text)) && isTime(value.at)
}

export function isPrediction(value: unknown): value is Prediction {
  return isRecord(value) && isPlace(value) && isString(value.predict) && isString(value.participant) && isString(value.question)
    && (value.choices === undefined || isStrings(value.choices)) && isSavedPrediction(value)
}
