/** Step of a document-layout section: every step has been reached. */
export const FINAL_STEP = Number.POSITIVE_INFINITY

/** Share of the viewport height, from the top, that a step block must pass to become current. */
export const STEP_LINE = 0.6

/**
 * Scrollytelling: the current step is the highest step whose notes block has
 * scrolled above `line` (viewport coordinates), or 0 before the first one.
 * Scrolling back lowers it again, so steps stay reversible.
 */
export function stepAtLine(blocks: readonly { step: number, top: number }[], line: number): number {
  return blocks.reduce((step, block) => (block.top <= line ? Math.max(step, block.step) : step), 0)
}
