/**
 * Dimmed code lines in high contrast (P-52). A code step dims the lines it
 * does not highlight (Slidev to opacity 0.3), which two colors cannot carry at
 * AA. Which lines are dimmed is read from their opacity, not from the host's
 * class names, which are no public interface: while the mode is on, a line of
 * a code block (Shiki's `.line`) below 0.6 gets `data-pm-dimmed`, which
 * contrast.css raises to 0.6, so the step still shows. contrast.ts marks the
 * lines that steps change while the mode is on (`markDimmed`).
 */
const LINES = ':is(.slidev-layout, .vp-doc) pre .line'
const DIMMED = 'data-pm-dimmed'

function mark(line: Element): void {
  line.removeAttribute(DIMMED)
  if (Number(getComputedStyle(line).opacity) < 0.6) line.setAttribute(DIMMED, '')
}

/** Marks the dimmed lines in or at `node`. */
export function markDimmed(node: Node): void {
  if (!(node instanceof Element)) return
  if (node.matches(LINES)) mark(node)
  node.querySelectorAll(LINES).forEach(mark)
}

/** Marks the dimmed lines of the page (`on`), or removes the marks. */
export function raiseDimmedLines(on: boolean): void {
  document.querySelectorAll(`[${DIMMED}]`).forEach(line => line.removeAttribute(DIMMED))
  if (on) markDimmed(document.body)
}
