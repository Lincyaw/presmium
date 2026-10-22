import type { Place } from './place.ts'
import { latestPerParticipant } from './tally.ts'

export interface SavedPrediction {
  choice?: number
  text?: string
  at: number
}

export interface Prediction extends Place, SavedPrediction {
  predictId: string
  participant: string
  question: string
  choices?: string[]
}

export function predictionId(predictId: string, participant: string): string {
  return `${predictId}:${participant}`
}

export interface PredictionTally {
  counts: number[]
  respondents: number
  texts: string[]
}

export function predictionTally(predictId: string, choices: number, predictions: Iterable<Prediction>): PredictionTally {
  const last = latestPerParticipant([...predictions].filter(p => p.predictId === predictId)).sort((a, b) => a.at - b.at)
  return {
    counts: Array.from({ length: choices }, (_, i) => last.filter(p => p.choice === i).length),
    respondents: last.length,
    texts: last.flatMap(p => (p.text ? [p.text] : [])),
  }
}
