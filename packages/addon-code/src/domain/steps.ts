import { CodeRefError } from './messages.ts'
import type { Snippet } from './regions.ts'

const NO_REGION = new Set(['all', 'none'])

/** The lines to highlight at each step: the lines of the #region the step names, none for `all` and `none`. */
export function highlightSteps(steps: string[], regions: Snippet['regions']): number[][] {
  return steps.map((step) => {
    const region = regions.get(step)
    if (region) return Array.from({ length: region.to - region.from + 1 }, (_, i) => region.from + i)
    if (NO_REGION.has(step)) return []
    throw new CodeRefError({ code: 'step-region', step, regions: [...regions.keys()] })
  })
}

/** The regions of a snippet as the IR's `CodeOrigin.units`. */
export function originUnits(regions: Snippet['regions']): Record<string, { startLine: number, endLine: number }> {
  return Object.fromEntries([...regions].map(([name, { from, to }]) => [name, { startLine: from, endLine: to }]))
}
