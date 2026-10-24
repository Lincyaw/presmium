const LINES = ':is(.slidev-layout, .pm-document) pre .line'
const DIMMED = 'data-pm-dimmed'

function mark(line: Element): void {
  line.removeAttribute(DIMMED)
  if (Number(getComputedStyle(line).opacity) < 0.6) line.setAttribute(DIMMED, '')
}

export function markDimmed(node: Node): void {
  if (!(node instanceof Element)) return
  if (node.matches(LINES)) mark(node)
  node.querySelectorAll(LINES).forEach(mark)
}

export function raiseDimmedLines(on: boolean): void {
  document.querySelectorAll(`[${DIMMED}]`).forEach(line => line.removeAttribute(DIMMED))
  if (on) markDimmed(document.body)
}
