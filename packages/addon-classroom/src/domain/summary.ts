import type { Participant, SessionStatus } from '@lincyaw/kernel'
import type { SectionNumbers } from './config.ts'
import { exerciseTally } from './exercise.ts'
import type { ExerciseTally, Submission } from './exercise.ts'
import { placeIndex, placeKey } from './place.ts'
import type { Place } from './place.ts'
import { predictionTally } from './predict.ts'
import type { Prediction, PredictionTally } from './predict.ts'
import { pulseTally } from './pulse.ts'
import type { PulseVote } from './pulse.ts'
import type { Question } from './questions.ts'
import { countedAnswers, quizTally } from './quiz.ts'
import type { Answer, QuizState, QuizTally } from './quiz.ts'
import { latestPerParticipant } from './tally.ts'

/** A component's place, numbered in this window's version, and its id (the place's key). */
type Where = Place & { id: string }

export interface ClassroomRecords {
  quizzes: (QuizState & { id: string })[]
  answers: Answer[]
  predictions: Prediction[]
  votes: PulseVote[]
  submissions: Submission[]
  numbers?: SectionNumbers
}

/** The tallies of each component of the classroom, in the order of their places. */
export interface ClassroomRows {
  quizzes: (Where & { open: boolean, options: string[], tally: QuizTally })[]
  predictions: (Where & { question: string, choices?: string[], tally: PredictionTally })[]
  pulse: (Where & { levels: string[], counts: number[] })[]
  exercises: (Where & { tally: ExerciseTally })[]
}

export function classroomRows(records: ClassroomRecords): ClassroomRows {
  const where = (place: Place): Where => ({ id: placeKey(place), section: place.section, block: place.block, title: place.title, index: placeIndex(place, records.numbers) })
  const latestByPlace = <T extends Place>(items: T[], id: (item: T) => string): T[] =>
    [...new Map(items.map(item => [id(item), item])).values()].sort((a, b) => placeIndex(a, records.numbers) - placeIndex(b, records.numbers))
  return {
    quizzes: latestByPlace(records.quizzes, q => q.id).map(quiz => ({
      ...where(quiz),
      open: quiz.open,
      options: quiz.options,
      tally: quizTally(quiz.options.length, quiz.correct, countedAnswers(quiz.id, quiz, records.answers)),
    })),
    predictions: latestByPlace(records.predictions, p => p.predictId).map(prediction => ({
      ...where(prediction),
      question: prediction.question,
      ...prediction.choices ? { choices: prediction.choices } : {},
      tally: predictionTally(prediction.predictId, prediction.choices?.length ?? 0, records.predictions),
    })),
    pulse: latestByPlace(records.votes, v => v.pulseId).map(vote => ({
      ...where(vote),
      levels: vote.levels,
      counts: pulseTally(vote.pulseId, vote.levels.length, records.votes),
    })),
    exercises: latestByPlace(records.submissions, s => s.exerciseId).map(submission => ({
      ...where(submission),
      tally: exerciseTally(latestPerParticipant(records.submissions.filter(s => s.exerciseId === submission.exerciseId))),
    })),
  }
}

export function unansweredCount(questions: readonly Question[]): number {
  return questions.filter(q => !q.answered).length
}

export interface ClassroomSummary {
  status: SessionStatus
  learners: number
  questions: { asked: number, unanswered: number }
  quizzes: (Where & { open: boolean, options: string[], counts: number[], respondents: number, correct: number })[]
  predictions: (Where & { question: string, choices?: string[], counts?: number[], respondents: number })[]
  pulse: (Where & { levels: string[], counts: number[] })[]
  exercises: (Where & { submitted: number, passed: number })[]
}

export interface SummaryInput extends ClassroomRecords {
  status: SessionStatus
  participants: Participant[]
  questions: Question[]
}

export function classroomSummary(input: SummaryInput): ClassroomSummary {
  const rows = classroomRows(input)
  return {
    status: input.status,
    learners: input.participants.filter(p => p.role === 'learner').length,
    questions: { asked: input.questions.length, unanswered: unansweredCount(input.questions) },
    quizzes: rows.quizzes.map(({ tally, ...quiz }) => ({ ...quiz, ...tally })),
    predictions: rows.predictions.map(({ tally, choices, question, ...place }) => ({ ...place, question, ...choices ? { choices, counts: tally.counts } : {}, respondents: tally.respondents })),
    pulse: rows.pulse,
    exercises: rows.exercises.map(({ tally, ...place }) => ({ ...place, submitted: tally.submitted, passed: tally.passed })),
  }
}
