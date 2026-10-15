import type { Snippet } from './regions.ts'

/**
 * Props of `<PmCodeRef>`, the bar the slides show above a code reference:
 * where the code comes from, its link and whether the pinned code drifted.
 * The web and notebook renderers show the code node's `origin` instead.
 */
export interface CodeRefView {
  anchor: string
  /** Workspace-relative path. */
  file?: string
  /** Line range in the file, e.g. `12-20`. */
  lines?: string
  /** Full hash of the commit the code was read from. */
  commit?: string
  pinned?: boolean
  /** Permalink; absent when no remote repository is known. */
  href?: string
  /** For pinned code: whether the working tree still has the same code. */
  drift?: 'synced' | 'drifted'
  error?: string
  /** Versions shown one per step. */
  variants?: VariantView[]
  /** Step of the section at which the code appears; version k shows at `at + k`. */
  at?: number
}

export interface VariantView {
  commit: string
  lines: string
  href?: string
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

export function lineRange(start: number, end: number): string {
  return end > start ? `${start}-${end}` : `${start}`
}
