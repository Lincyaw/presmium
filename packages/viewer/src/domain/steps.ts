import type { IRBlock, IRDocument } from '@lincyaw/kernel'

export const FINAL_STEP = Number.POSITIVE_INFINITY

export interface Position {
  section: string
  step: number
}

export function itemVisible(block: IRBlock, item: number, step: number): boolean {
  return step >= block.at + item
}

export function stepAtLine(markers: readonly { step: number, top: number }[], line: number): number {
  return markers.reduce((step, marker) => (marker.top <= line ? Math.max(step, marker.step) : step), 0)
}

export function clampPosition(doc: IRDocument, position: Position): Position {
  const section = doc.sections.find(s => s.id === position.section) ?? doc.sections[0]
  if (!section) return position
  const step = Number.isFinite(position.step) ? Math.min(Math.max(Math.round(position.step), 0), section.steps) : section.steps
  return { section: section.id, step }
}

export function keepPosition(prev: IRDocument, next: IRDocument, position: Position): Position {
  if (next.sections.some(s => s.id === position.section) || next.sections.length === 0) return clampPosition(next, position)
  const at = prev.sections.findIndex(s => s.id === position.section)
  const section = next.sections[Math.min(Math.max(at, 0), next.sections.length - 1)]!
  return clampPosition(next, { section: section.id, step: position.step })
}

export function nextPosition(doc: IRDocument, position: Position): Position | undefined {
  const i = doc.sections.findIndex(s => s.id === position.section)
  const section = doc.sections[i]
  if (section && position.step < section.steps) return { section: section.id, step: position.step + 1 }
  const next = doc.sections[i + 1]
  return next ? { section: next.id, step: 0 } : undefined
}

export function prevPosition(doc: IRDocument, position: Position): Position | undefined {
  const i = doc.sections.findIndex(s => s.id === position.section)
  if (i >= 0 && position.step > 0) return { section: position.section, step: position.step - 1 }
  const prev = doc.sections[i - 1]
  return prev ? { section: prev.id, step: prev.steps } : undefined
}
