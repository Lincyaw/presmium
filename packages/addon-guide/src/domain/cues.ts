import type { StepRange } from '@presmium/kernel/contracts'

/** Plugin id of the guidance context. */
export const GUIDE_ID = 'presmium.guide'

/** A CSS selector such as `#run-button`, resolved in the slide that holds the cue. */
export type CueTarget = string

export type CursorAction = 'move' | 'hover' | 'click'

/** One point of a cursor path as written in the deck. */
export interface Waypoint {
  to: CueTarget
  /** Defaults to `move`. */
  action?: CursorAction
  /** Step at which the cursor reaches this point; defaults to one after the previous point (the first: 1). */
  at?: number | string
}

export interface PlannedWaypoint {
  to: CueTarget
  action: CursorAction
  at: number
}

const ACTIONS: readonly string[] = ['move', 'hover', 'click']

/** A step number written as a number or a numeric string; undefined otherwise. */
function step(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined
}

/**
 * Gives every waypoint its step and action. Steps never decrease along the
 * path: an explicit `at` earlier than the previous point is raised to it.
 */
export function planCursorPath(path: readonly Waypoint[]): PlannedWaypoint[] {
  const planned: PlannedWaypoint[] = []
  for (const point of path) {
    const previous = planned.at(-1)?.at ?? 0
    const at = Math.max(step(point.at) ?? previous + 1, previous)
    const action = point.action && ACTIONS.includes(point.action) ? point.action : 'move'
    planned.push({ to: point.to, action, at })
  }
  return planned
}

/** Range of a spotlight or hint: from `at` (default 1) until `until` (exclusive; open-ended when absent). */
export function cueRange(at?: number | string, until?: number | string): StepRange {
  const from = step(at) ?? 1
  const to = step(until)
  return to !== undefined && to > from ? { from, to } : { from }
}

/** Steps a cue registers with the host, so the slide has a click for each of its boundaries. */
export function cueSteps(range: StepRange): number[] {
  return range.to === undefined ? [range.from] : [range.from, range.to]
}
