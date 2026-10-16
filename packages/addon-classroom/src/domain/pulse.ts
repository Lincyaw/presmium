/**
 * Understanding pulse (P-67): learners say how well they follow a section;
 * the presenter view shows the distribution of everyone's last vote.
 */
import { latestPerParticipant } from './place.ts'
import type { Place } from './place.ts'

/** One learner's vote (collection `pulse`, by `voteId`), with what the presenter view shows. */
export interface PulseVote extends Place {
  pulse: string
  participant: string
  /** Index into `levels`. */
  level: number
  levels: string[]
  at: number
}

export function voteId(pulse: string, participant: string): string {
  return `${pulse}:${participant}`
}

/** Votes per level, each participant's last vote counted. */
export function distribution(pulse: string, levels: number, votes: Iterable<PulseVote>): number[] {
  const last = latestPerParticipant([...votes].filter(v => v.pulse === pulse))
  return Array.from({ length: levels }, (_, i) => last.filter(v => v.level === i).length)
}
