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

/** Levels from the directive: `a, b, c`, or a list; undefined (the default levels) when fewer than two are given. */
export function pulseLevels(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[,，]/) : []
  const levels = items.map(item => item.trim()).filter(Boolean)
  return levels.length >= 2 ? levels : undefined
}
