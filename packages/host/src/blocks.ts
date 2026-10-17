/**
 * Blocks on the page, by the marks of the IR runtime (`[data-section]`,
 * `.pm-block[data-block]`, docs/architecture.md 9.2), for the plugins that
 * point at a block (guide, lecture, edit mode): a block's key
 * `<section id>/<block id>`, the element the audience sees, the block under
 * a point, and code lines named as `3-5,7`. One rule of what is seen: not
 * under a modal view (`[inert]`), not hidden by its step (`.pm-hidden`), laid out.
 */
import type { NavigationPosition } from './types.ts'

/** What is not seen: under a modal view, or hidden at the current step. */
const UNSEEN = '[inert], .pm-hidden'

/** The key of a block: `<section id>/<block id>`. */
export function blockKey(section: string, block: string): string {
  return `${section}/${block}`
}

/** A block key's section and block, split at its last `/` (a section id may hold one). */
export function splitBlockKey(key: string): [section: string, block: string] | undefined {
  const cut = key.lastIndexOf('/')
  return cut > 0 && cut < key.length - 1 ? [key.slice(0, cut), key.slice(cut + 1)] : undefined
}

function seen(element: Element): boolean {
  return !element.closest(UNSEEN) && element.getClientRects().length > 0
}

/** The element of a block that the audience sees: the present view's, else a page view's. Browser only. */
export function blockElement(key: string): HTMLElement | undefined {
  const parts = splitBlockKey(key)
  if (!parts || typeof document === 'undefined') return undefined
  const found = document.querySelectorAll<HTMLElement>(`[data-section="${CSS.escape(parts[0])}"] .pm-block[data-block="${CSS.escape(parts[1])}"]`)
  for (const element of found) if (seen(element)) return element
  return undefined
}

/** A point over a block: its key and element, where in it (0 to 1 of its box), and for code the line under it. */
export interface BlockPoint {
  key: string
  element: HTMLElement
  x: number
  y: number
  /** For code: the line (1-based) under the point. */
  line?: number
}

/** The code lines of a block element, in order. */
export function codeLines(block: Element): HTMLElement[] {
  return [...block.querySelectorAll<HTMLElement>('.pm-code .line')]
}

/**
 * The block seen under a point of the window; undefined elsewhere. `skip` is
 * an element in front of the page (e.g. a drawing surface), `within` a
 * selector the block must lie in (e.g. `.pm-present`, the present view). Browser only.
 */
export function blockAt(x: number, y: number, options: { skip?: Element, within?: string } = {}): BlockPoint | undefined {
  if (typeof document === 'undefined') return undefined
  const { skip, within } = options
  const hit = document.elementsFromPoint(x, y).find(el => el !== skip && !skip?.contains(el))
  const element = hit?.closest<HTMLElement>(`${within ? `${within} ` : ''}.pm-block[data-block]`)
  const section = element?.closest<HTMLElement>('[data-section]')?.dataset.section
  if (!element || !section || !seen(element)) return undefined
  const box = element.getBoundingClientRect()
  if (!box.width || !box.height) return undefined
  const index = codeLines(element).findIndex((line) => {
    const r = line.getBoundingClientRect()
    return y >= r.top && y < r.bottom
  })
  return {
    key: blockKey(section, element.dataset.block!),
    element,
    x: (x - box.left) / box.width,
    y: (y - box.top) / box.height,
    ...index >= 0 ? { line: index + 1 } : {},
  }
}

/** The line numbers a `lines` value such as `3-5` or `2,4` names. */
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

/**
 * The section number (`slide`) a position names in a deck whose sections are
 * `sections`: that of its section id where the deck has the section (D-4: the
 * full and the student build number their sections apart), else its own
 * number. A form's `navigation.go` moves there.
 */
export function positionSlide(position: NavigationPosition, sections: readonly { id: string, index: number }[]): number {
  const named = position.section === undefined ? undefined : sections.find(s => s.id === position.section)
  return named?.index ?? position.slide
}
