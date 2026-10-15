import type { StepRange } from '@presmium/kernel/contracts'

/** Plugin id of the guidance context. */
export const GUIDE_ID = 'presmium.guide'

/** A CSS selector such as `#run-button`, resolved in the slide or section that holds the cue. */
export type CueTarget = string

export type CursorAction = 'move' | 'hover' | 'click'

/**
 * One point of a cursor path. Steps count from the cue's block: step k is
 * the block's internal state k, shown at the section step `at + k` (docs/ir.md 2.4).
 */
export interface Waypoint {
  to: CueTarget
  /** Defaults to `move`. */
  action?: CursorAction
  /** Step at which the cursor reaches this point; defaults to one after the previous point (the first: 0). */
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
    const previous = planned.at(-1)?.at ?? -1
    const at = Math.max(step(point.at) ?? previous + 1, previous, 0)
    const action = point.action && ACTIONS.includes(point.action) ? point.action : 'move'
    planned.push({ to: point.to, action, at })
  }
  return planned
}

/**
 * The body of a `{cursor}` directive: one waypoint per line, a target
 * selector optionally preceded by its action, e.g. `hover #run`. Blank lines
 * are skipped.
 */
export function parseCursorPath(body: string): Waypoint[] {
  return body.split('\n').map(line => line.trim()).filter(Boolean).map((line) => {
    const [first = '', ...rest] = line.split(/\s+/)
    return rest.length > 0 && ACTIONS.includes(first) ? { to: rest.join(' '), action: first as CursorAction } : { to: line }
  })
}

/** Range of a spotlight or hint: from `at` (default 0) until `until` (exclusive; open-ended when absent). */
export function cueRange(at?: number | string, until?: number | string): StepRange {
  const from = step(at) ?? 0
  const to = step(until)
  return to !== undefined && to > from ? { from, to } : { from }
}

/**
 * Steps a cue registers with the host so that the host has a step there. Step
 * 0 exists anyway; the end of a cue is left to the block that comes next, so
 * a cue adds no step of its own after the last one of its section.
 */
export function cueSteps(range: StepRange): number[] {
  return range.from > 0 ? [range.from] : []
}

/** Shifts the steps of a cue by `offset`: from its block's own steps to the steps of its section. */
export function shiftCue<T extends { at?: number | string, until?: number | string }>(cue: T, offset: number): T {
  const shift = (value: number | string | undefined) => (step(value) === undefined ? value : step(value)! + offset)
  return { ...cue, at: shift(cue.at ?? 0), ...cue.until === undefined ? {} : { until: shift(cue.until) } }
}
