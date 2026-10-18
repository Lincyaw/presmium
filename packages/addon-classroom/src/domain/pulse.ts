import { latestPerParticipant } from './place.ts'
import type { Place } from './place.ts'

export interface PulseVote extends Place {
  pulse: string
  participant: string
  level: number
  levels: string[]
  at: number
}

export function voteId(pulse: string, participant: string): string {
  return `${pulse}:${participant}`
}

export function distribution(pulse: string, levels: number, votes: Iterable<PulseVote>): number[] {
  const last = latestPerParticipant([...votes].filter(v => v.pulse === pulse))
  return Array.from({ length: levels }, (_, i) => last.filter(v => v.level === i).length)
}
