import type { Snippet } from './regions.ts'

/** Step names that highlight no unit in particular. */
const NO_UNIT = new Set(['all', 'none'])

/**
 * The lines (1-based, of the displayed code) highlighted at each step (P-15):
 * one logical unit per step. Throws for a name that is not a unit.
 */
export function highlightSteps(steps: string[], units: Snippet['units']): number[][] {
  return steps.map((step) => {
    const unit = units.get(step)
    if (unit) return Array.from({ length: unit.to - unit.from + 1 }, (_, i) => unit.from + i)
    if (NO_UNIT.has(step)) return []
    const known = [...units.keys()].join(', ') || 'none'
    throw new Error(`step "${step}" is not a #region inside the referenced code (regions: ${known})`)
  })
}

/** The units of a snippet as IR `CodeOrigin.units`. */
export function unitRecord(units: Snippet['units']): Record<string, { startLine: number, endLine: number }> {
  return Object.fromEntries([...units].map(([name, { from, to }]) => [name, { startLine: from, endLine: to }]))
}
