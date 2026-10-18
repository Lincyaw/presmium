import { latestPerParticipant } from './place.ts'
import type { Place } from './place.ts'

export interface SavedPrediction {
  choice?: number
  text?: string
  at: number
}

export interface Prediction extends Place, SavedPrediction {
  predict: string
  participant: string
  question: string
  choices?: string[]
}

export function predictionId(predict: string, participant: string): string {
  return `${predict}:${participant}`
}

export interface PredictionTally {
  counts: number[]
  respondents: number
  texts: string[]
}

export function predictionTally(predict: string, choices: number, predictions: Iterable<Prediction>): PredictionTally {
  const last = latestPerParticipant([...predictions].filter(p => p.predict === predict)).sort((a, b) => a.at - b.at)
  return {
    counts: Array.from({ length: choices }, (_, i) => last.filter(p => p.choice === i).length),
    respondents: last.length,
    texts: last.flatMap(p => (p.text ? [p.text] : [])),
  }
}
