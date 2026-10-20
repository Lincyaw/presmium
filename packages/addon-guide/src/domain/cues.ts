import type { StepRange } from '@lincyaw/kernel/contracts'

export const GUIDE_ID = 'presmium.guide'

export type CueTarget = string

export type CursorAction = 'move' | 'hover' | 'click'

export interface Waypoint {
  to: CueTarget
  action?: CursorAction
  at?: number | string
}

export interface PlannedWaypoint {
  to: CueTarget
  action: CursorAction
  at: number
}

const ACTIONS: readonly string[] = ['move', 'hover', 'click']

function step(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined
}

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

export function parseCursorPath(body: string): Waypoint[] {
  return body.split('\n').map(line => line.trim()).filter(Boolean).map((line) => {
    const [first = '', ...rest] = line.split(/\s+/)
    return rest.length > 0 && ACTIONS.includes(first) ? { to: rest.join(' '), action: first as CursorAction } : { to: line }
  })
}

export function cueRange(at?: number | string, until?: number | string): StepRange {
  const from = step(at) ?? 0
  const to = step(until)
  return to !== undefined && to > from ? { from, to } : { from }
}

export function cueSteps(range: StepRange): number[] {
  return range.from > 0 ? [range.from] : []
}
