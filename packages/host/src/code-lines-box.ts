import { codeLines, lineNumbers } from './blocks.ts'

export function codeLinesBox(block: HTMLElement, lines: string): DOMRect | undefined {
  const rows = codeLines(block)
  const named = lineNumbers(lines).map(n => rows[n - 1]).filter((row): row is HTMLElement => Boolean(row))
  if (named.length === 0) return undefined
  const code = block.querySelector('.pm-code')?.getBoundingClientRect() ?? block.getBoundingClientRect()
  const top = Math.min(...named.map(row => row.getBoundingClientRect().top))
  const bottom = Math.max(...named.map(row => row.getBoundingClientRect().bottom))
  return new DOMRect(code.left, top, code.width, bottom - top)
}
