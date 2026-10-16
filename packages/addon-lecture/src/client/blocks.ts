/**
 * Blocks on the page, by the marks of the IR runtime (`[data-section]`,
 * `.pm-block[data-block]`): what the pointer is over, in coordinates
 * relative to the block (0 to 1), so a recording plays back in a window of
 * any size.
 */

/** The block keys of the IR runtime: `<section id>/<block id>`. */
export function splitKey(key: string): [section: string, block: string] | undefined {
  const cut = key.lastIndexOf('/')
  return cut > 0 ? [key.slice(0, cut), key.slice(cut + 1)] : undefined
}

/** The element of a block that the audience sees: not under a modal view, laid out. */
export function blockElement(key: string): HTMLElement | undefined {
  const parts = splitKey(key)
  if (!parts) return undefined
  const found = document.querySelectorAll<HTMLElement>(`[data-section="${CSS.escape(parts[0])}"] .pm-block[data-block="${CSS.escape(parts[1])}"]`)
  for (const el of found) {
    if (!el.closest('[inert], .pm-hidden') && el.getClientRects().length > 0) return el
  }
  return undefined
}

export interface BlockPoint {
  key: string
  element: HTMLElement
  x: number
  y: number
  /** For code: the line (1-based) under the point. */
  line?: number
}

/** Code lines of a block element, in order. */
export function codeLines(block: HTMLElement): HTMLElement[] {
  return [...block.querySelectorAll<HTMLElement>('.pm-code .line')]
}

/** The block of the present view under a point of the window; undefined elsewhere. `skip` is an element in front (e.g. a drawing surface). */
export function blockAt(x: number, y: number, skip?: Element): BlockPoint | undefined {
  const hit = document.elementsFromPoint(x, y).find(el => el !== skip && !skip?.contains(el))
  const element = hit?.closest<HTMLElement>('.pm-present .pm-block[data-block]')
  const section = element?.closest<HTMLElement>('[data-section]')?.dataset.section
  if (!element || !section) return undefined
  const box = element.getBoundingClientRect()
  if (!box.width || !box.height) return undefined
  const lines = codeLines(element)
  const index = lines.findIndex((line) => {
    const r = line.getBoundingClientRect()
    return y >= r.top && y < r.bottom
  })
  return {
    key: `${section}/${element.dataset.block}`,
    element,
    x: (x - box.left) / box.width,
    y: (y - box.top) / box.height,
    ...index >= 0 ? { line: index + 1 } : {},
  }
}

/** The numbers a `lines` value such as `3-5` or `2,4` names. */
export function lineNumbers(lines: string): number[] {
  return lines.split(/[\s,]+/).flatMap((part) => {
    const [from, to = from] = part.split('-').map(Number)
    return Number.isInteger(from) && Number.isInteger(to) && from! > 0 ? Array.from({ length: Math.max(0, to! - from! + 1) }, (_, k) => from! + k) : []
  })
}

/** `3-5` for the lines 3, 4 and 5; `2,4` for lines apart. */
export function linesText(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const runs: string[] = []
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    runs.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`)
    i = j + 1
  }
  return runs.join(',')
}
