import { stepStateAt } from '@presmium/kernel/contracts'

/**
 * Click positions of the `v-click` compatibility layer, following Slidev's rules:
 * numbers (or numeric strings) are absolute; `'+n'`/`'-n'` are relative to the
 * previous relative click; no value means `'+1'`; `v-after` means `'+0'`;
 * `[enter, leave]` limits the range, `leave` being relative to `enter`.
 */
export interface ClickSpec {
  kind: 'click' | 'after'
  at?: unknown
  /** `.hide`: hidden inside the range instead of shown. */
  hide?: boolean
}

export interface ClickRange {
  from: number
  to?: number
  hide: boolean
}

function isRelative(at: unknown): at is string {
  return typeof at === 'string' && /^[+-]\d+$/.test(at.trim())
}

/** Resolves the specs, given in document order, to step ranges. */
export function resolveClicks(specs: readonly ClickSpec[]): ClickRange[] {
  let last = 0
  const position = (at: unknown, base: number): number => {
    if (isRelative(at)) return base + Number(at.trim())
    const value = Number(at)
    return Number.isFinite(value) ? value : base + 1
  }
  return specs.map((spec) => {
    const at = spec.kind === 'after' ? '+0' : spec.at ?? '+1'
    const [enter, leave] = Array.isArray(at) ? at : [at]
    const from = position(enter, last)
    if (isRelative(enter) || !Number.isFinite(Number(enter))) last = from
    const to = leave === undefined ? undefined : position(leave, from)
    return { from, to, hide: spec.hide ?? false }
  })
}

/** Whether an element with this range is visible at `step`. */
export function clickVisible(range: ClickRange, step: number): boolean {
  return stepStateAt(range, step).active !== range.hide
}
