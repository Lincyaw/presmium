const UNSEEN = '[inert], .pm-hidden'

export function blockKey(section: string, block: string): string {
  return `${section}/${block}`
}

export function splitBlockKey(key: string): [section: string, block: string] | undefined {
  const cut = key.lastIndexOf('/')
  return cut > 0 && cut < key.length - 1 ? [key.slice(0, cut), key.slice(cut + 1)] : undefined
}

function seen(element: Element): boolean {
  return !element.closest(UNSEEN) && element.getClientRects().length > 0
}

export function blockElement(key: string): HTMLElement | undefined {
  const parts = splitBlockKey(key)
  if (!parts || typeof document === 'undefined') return undefined
  const found = document.querySelectorAll<HTMLElement>(`[data-section="${CSS.escape(parts[0])}"] .pm-block[data-block="${CSS.escape(parts[1])}"]`)
  for (const element of found) if (seen(element)) return element
  return undefined
}

export interface BlockPoint {
  key: string
  element: HTMLElement
  x: number
  y: number
  line?: number
}

export function codeLines(block: Element): HTMLElement[] {
  return [...block.querySelectorAll<HTMLElement>('.pm-code .line')]
}

/** The `<section>/<block>` key of a block's element (`.pm-block[data-block]`). */
export function blockKeyOf(block: HTMLElement): string | undefined {
  const section = block.closest<HTMLElement>('[data-section]')?.dataset.section
  return section ? blockKey(section, block.dataset.block!) : undefined
}

export function blockAt(x: number, y: number, options: { skip?: Element, within?: string } = {}): BlockPoint | undefined {
  if (typeof document === 'undefined') return undefined
  const { skip, within } = options
  const hit = document.elementsFromPoint(x, y).find(el => el !== skip && !skip?.contains(el))
  const element = hit?.closest<HTMLElement>(`${within ? `${within} ` : ''}.pm-block[data-block]`)
  const key = element && blockKeyOf(element)
  if (!element || !key || !seen(element)) return undefined
  const box = element.getBoundingClientRect()
  if (!box.width || !box.height) return undefined
  const index = codeLines(element).findIndex((line) => {
    const r = line.getBoundingClientRect()
    return y >= r.top && y < r.bottom
  })
  return {
    key,
    element,
    x: (x - box.left) / box.width,
    y: (y - box.top) / box.height,
    ...index >= 0 ? { line: index + 1 } : {},
  }
}

export function lineNumbers(lines: string): number[] {
  return lines.split(/[\s,]+/).flatMap((part) => {
    const [from, to = from] = part.split('-').map(Number)
    return Number.isInteger(from) && Number.isInteger(to) && from! > 0 ? Array.from({ length: Math.max(0, to! - from! + 1) }, (_, k) => from! + k) : []
  })
}

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
