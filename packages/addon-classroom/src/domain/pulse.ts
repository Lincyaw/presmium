import type { Place } from './place.ts'
import { latestPerParticipant } from './tally.ts'

export interface PulseVote extends Place {
  pulseId: string
  participant: string
  level: number
  levels: string[]
  at: number
}

export function voteId(pulseId: string, participant: string): string {
  return `${pulseId}:${participant}`
}

export function pulseTally(pulseId: string, levels: number, votes: Iterable<PulseVote>): number[] {
  const last = latestPerParticipant([...votes].filter(v => v.pulseId === pulseId))
  return Array.from({ length: levels }, (_, i) => last.filter(v => v.level === i).length)
}
