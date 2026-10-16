import type { IRBlock, IRDocument, IRSection } from '@presmium/kernel'

/** The step of a view that shows every step at once (the document view): all steps reached. */
export const FINAL_STEP = Number.POSITIVE_INFINITY

/** A place in the document: a section and one of its steps. */
export interface Position {
  section: string
  step: number
}

/** A visual block is on screen from `at` until `until` (docs/ir.md section 3). */
export function blockVisible(block: IRBlock, step: number): boolean {
  return step >= block.at && (block.until === undefined || step < block.until)
}

/** Internal state of a block that spans steps: 0 at `at`, up to `span` (docs/ir.md section 2.4). */
export function blockState(block: IRBlock, step: number): number {
  return Math.min(Math.max(step - block.at, 0), block.span ?? 0)
}

/** Item k of a `reveal: items` list appears at `at + k`. */
export function itemVisible(block: IRBlock, item: number, step: number): boolean {
  return step >= block.at + item
}

/** Narration blocks bound to `step`, in source order. */
export function narrationAt(section: IRSection, step: number): IRBlock[] {
  return section.blocks.filter(block => block.role === 'narration' && block.at === step)
}

/**
 * Scrollytelling: the current step is the highest step whose marker has
 * scrolled above `line` (viewport coordinates), or 0 before the first one.
 * Scrolling back lowers it again, so steps stay reversible.
 */
export function stepAtLine(markers: readonly { step: number, top: number }[], line: number): number {
  return markers.reduce((step, marker) => (marker.top <= line ? Math.max(step, marker.step) : step), 0)
}

/** Clamps a position to the document: an unknown section becomes the first one, the step stays in range. */
export function clampPosition(doc: IRDocument, position: Position): Position {
  const section = doc.sections.find(s => s.id === position.section) ?? doc.sections[0]
  if (!section) return position
  const step = Number.isFinite(position.step) ? Math.min(Math.max(Math.round(position.step), 0), section.steps) : section.steps
  return { section: section.id, step }
}

/**
 * The position after a live update from `prev` to `next`: the same section
 * and step where they still exist; when the section is gone (e.g. its title,
 * which gave its id, was edited), the section at the same place in the order,
 * so a presentation does not jump back to the cover (K-11).
 */
export function keepPosition(prev: IRDocument, next: IRDocument, position: Position): Position {
  if (next.sections.some(s => s.id === position.section) || next.sections.length === 0) return clampPosition(next, position)
  const at = prev.sections.findIndex(s => s.id === position.section)
  const section = next.sections[Math.min(Math.max(at, 0), next.sections.length - 1)]!
  return clampPosition(next, { section: section.id, step: position.step })
}

/** The next step, or the first step of the next section; undefined at the end of the document. */
export function nextPosition(doc: IRDocument, position: Position): Position | undefined {
  const i = doc.sections.findIndex(s => s.id === position.section)
  const section = doc.sections[i]
  if (section && position.step < section.steps) return { section: section.id, step: position.step + 1 }
  const next = doc.sections[i + 1]
  return next ? { section: next.id, step: 0 } : undefined
}

/** The previous step, or the last step of the previous section; undefined at the start. */
export function prevPosition(doc: IRDocument, position: Position): Position | undefined {
  const i = doc.sections.findIndex(s => s.id === position.section)
  if (i >= 0 && position.step > 0) return { section: position.section, step: position.step - 1 }
  const prev = doc.sections[i - 1]
  return prev ? { section: prev.id, step: prev.steps } : undefined
}
