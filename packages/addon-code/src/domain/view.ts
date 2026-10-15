import type { CodeOrigin, CodeVariant } from '@presmium/kernel'
import type { Snippet } from './regions.ts'

/**
 * What a code reference records in its code node besides the IR's own
 * fields: whether pinned code still matches the working tree, and the
 * permalink of each version. The renderers show them with the origin.
 */
export interface CodeRefOrigin extends CodeOrigin {
  /** For pinned code: `drifted` when the working tree has other code (P-14). */
  drift?: 'synced' | 'drifted'
}

export interface CodeRefVariant extends CodeVariant {
  /** Link to the version's lines at its commit (P-13). */
  permalink?: string
}

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
