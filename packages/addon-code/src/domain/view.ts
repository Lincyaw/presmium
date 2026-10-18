import type { Snippet } from './regions.ts'

const NO_UNIT = new Set(['all', 'none'])

export function highlightSteps(steps: string[], units: Snippet['units']): number[][] {
  return steps.map((step) => {
    const unit = units.get(step)
    if (unit) return Array.from({ length: unit.to - unit.from + 1 }, (_, i) => unit.from + i)
    if (NO_UNIT.has(step)) return []
    const known = [...units.keys()].join(', ') || 'none'
    throw new Error(`step "${step}" is not a #region inside the referenced code (regions: ${known})`)
  })
}

export function unitRecord(units: Snippet['units']): Record<string, { startLine: number, endLine: number }> {
  return Object.fromEntries([...units].map(([name, { from, to }]) => [name, { startLine: from, endLine: to }]))
}
