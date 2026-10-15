/**
 * Dimmed code lines in high contrast (P-52). A code step dims the lines it
 * does not highlight (Slidev to opacity 0.3), which two colors cannot carry at
 * AA. Which lines are dimmed is read from their opacity, not from the host's
 * class names, which are no public interface: while the mode is on, a line of
 * a code block (Shiki's `.line`) below 0.6 gets `data-pm-dimmed`, which
 * contrast.css raises to 0.6, so the step still shows.
 */
const LINES = ':is(.slidev-layout, .vp-doc) pre .line'
const DIMMED = 'data-pm-dimmed'

let observer: MutationObserver | undefined

function mark(line: Element): void {
  line.removeAttribute(DIMMED)
  if (Number(getComputedStyle(line).opacity) < 0.6) line.setAttribute(DIMMED, '')
}

function markWithin(node: Node): void {
  if (!(node instanceof Element)) return
  if (node.matches(LINES)) mark(node)
  node.querySelectorAll(LINES).forEach(mark)
}

/** Starts (`on`) or stops marking the dimmed lines of the page, now and as steps change them. */
export function raiseDimmedLines(on: boolean): void {
  if (typeof MutationObserver === 'undefined') return
  observer?.disconnect()
  observer = undefined
  document.querySelectorAll(`[${DIMMED}]`).forEach(line => line.removeAttribute(DIMMED))
  if (!on) return
  markWithin(document.body)
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') markWithin(record.target)
      else record.addedNodes.forEach(markWithin)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
}
