/**
 * Predict, then reveal (P-68): a reader writes down a prediction, one of the
 * choices or a few words, before the content of the step after `{predict}`
 * shows. The prediction is kept in the browser; in a classroom a learner's
 * also goes to the `predictions` collection, and the presenter sees how the
 * class predicted.
 */
import { latestPerParticipant } from './place.ts'
import type { Place } from './place.ts'

/** A reader's prediction as this browser keeps it (collection `predictions` of the browser store, by the predict's id). */
export interface SavedPrediction {
  /** Index into the choices. */
  choice?: number
  /** The prediction written out, when the predict has no choices. */
  text?: string
  at: number
}

/** A learner's prediction in a classroom (collection `predictions`, by `predictionId`), with what the presenter's overview shows. */
export interface Prediction extends Place, SavedPrediction {
  /** The predict's id (`placeKey`). */
  predict: string
  participant: string
  question: string
  /** The predict's choices; absent for a written prediction. */
  choices?: string[]
}

/** One entry per participant and predict. */
export function predictionId(predict: string, participant: string): string {
  return `${predict}:${participant}`
}

export interface PredictionTally {
  /** Participants who chose each choice; empty for a written prediction. */
  counts: number[]
  /** Participants who predicted. */
  respondents: number
  /** The written predictions, oldest first, without their authors. */
  texts: string[]
}

/** How the class predicted: each participant's last prediction counted. */
export function predictionTally(predict: string, choices: number, predictions: Iterable<Prediction>): PredictionTally {
  const last = latestPerParticipant([...predictions].filter(p => p.predict === predict)).sort((a, b) => a.at - b.at)
  return {
    counts: Array.from({ length: choices }, (_, i) => last.filter(p => p.choice === i).length),
    respondents: last.length,
    texts: last.flatMap(p => (p.text ? [p.text] : [])),
  }
}
