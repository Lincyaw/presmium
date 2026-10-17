/**
 * The classroom at a glance, as the plugin reports it to the host's `STATUS`
 * (docs/architecture.md 4.7), from where an agent reads it with the MCP tool
 * `get_classroom`: how many learners take part, how they answered,
 * predicted, voted and fared in the exercises, and how many questions wait
 * for an answer. It names no learner and quotes nothing a learner wrote.
 */
import type { Participant, SessionStatus } from '@presmium/kernel'
import type { Submission } from './exercise.ts'
import { latestPerParticipant, placeIndex, placeKey } from './place.ts'
import type { Place, SectionNumbers } from './place.ts'
import type { Prediction } from './predict.ts'
import { predictionTally } from './predict.ts'
import type { PulseVote } from './pulse.ts'
import { distribution } from './pulse.ts'
import type { Question } from './questions.ts'
import type { Answer, QuizState } from './quiz.ts'
import { countedAnswers, tally } from './quiz.ts'

/** Where an item is: its id (`<section>/<block>`), section, block, section title and number. */
type Where = Place & { id: string }

export interface ClassroomSummary {
  status: SessionStatus
  /** Learners connected to the classroom; the presenter is not counted. */
  learners: number
  questions: { asked: number, unanswered: number }
  quizzes: (Where & { open: boolean, options: string[], counts: number[], respondents: number, correct: number })[]
  /** `counts` per choice; a written prediction has no choices and counts only its respondents. */
  predictions: (Where & { question: string, choices?: string[], counts?: number[], respondents: number })[]
  pulse: (Where & { levels: string[], counts: number[] })[]
  exercises: (Where & { submitted: number, passed: number })[]
}

export interface SummaryInput {
  status: SessionStatus
  participants: Participant[]
  questions: Question[]
  quizzes: (QuizState & { id: string })[]
  answers: Answer[]
  predictions: Prediction[]
  votes: PulseVote[]
  submissions: Submission[]
  /** The section numbers of the reporting window's build, by id: places are numbered by them. */
  numbers?: SectionNumbers
}

export function classroomSummary(input: SummaryInput): ClassroomSummary {
  const where = (place: Place): Where => ({ id: placeKey(place), section: place.section, block: place.block, title: place.title, index: placeIndex(place, input.numbers) })
  /** The last item of each id in `items`, in deck order. */
  const byPlace = <T extends Place>(items: T[], id: (item: T) => string): T[] =>
    [...new Map(items.map(item => [id(item), item])).values()].sort((a, b) => placeIndex(a, input.numbers) - placeIndex(b, input.numbers))
  return {
    status: input.status,
    learners: input.participants.filter(p => p.role === 'learner').length,
    questions: { asked: input.questions.length, unanswered: input.questions.filter(q => !q.answered).length },
    quizzes: byPlace(input.quizzes, q => q.id).map((quiz) => {
      const result = tally(quiz.options.length, quiz.answer, countedAnswers(quiz.id, quiz, input.answers))
      return { ...where(quiz), open: quiz.open, options: quiz.options, ...result }
    }),
    predictions: byPlace(input.predictions, p => p.predict).map((prediction) => {
      const { counts, respondents } = predictionTally(prediction.predict, prediction.choices?.length ?? 0, input.predictions)
      return { ...where(prediction), question: prediction.question, ...prediction.choices ? { choices: prediction.choices, counts } : {}, respondents }
    }),
    pulse: byPlace(input.votes, v => v.pulse).map(vote => ({
      ...where(vote),
      levels: vote.levels,
      counts: distribution(vote.pulse, vote.levels.length, input.votes),
    })),
    exercises: byPlace(input.submissions, s => s.exercise).map((submission) => {
      const last = latestPerParticipant(input.submissions.filter(s => s.exercise === submission.exercise))
      return { ...where(submission), submitted: last.length, passed: last.filter(s => s.status === 'passed').length }
    }),
  }
}
