import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, IRSection } from '@lincyaw/kernel'

interface Line { text: string, start: number, end: number }

function sourceLines(source: string): Line[] {
  const lines: Line[] = []
  let start = 0
  for (const match of source.matchAll(/\r\n|\n|\r/g)) {
    lines.push({ text: source.slice(start, match.index), start, end: match.index + match[0].length })
    start = match.index + match[0].length
  }
  lines.push({ text: source.slice(start), start, end: source.length })
  if (lines[0]) lines[0].text = lines[0].text.replace(/^\uFEFF/, '')
  return lines
}

/** Fence state is only a safety check; the compiler's ranges determine placement. */
function rootLines(lines: Line[]): boolean[] {
  const stack: { char: string, count: number, literal: boolean }[] = []
  let comment = false
  const roots = lines.map(({ text }) => {
    const root = stack.length === 0 && !comment
    if (comment) { if (text.includes('-->')) comment = false; return false }
    const last = stack.at(-1)
    if (last?.literal) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text)
      if (close && close[1]![0] === last.char && close[1]!.length >= last.count) stack.pop()
      return false
    }
    const fence = /^ {0,3}(`{3,}|~{3,}|:{3,})(.*)$/.exec(text)
    if (fence) {
      const run = fence[1]!, tail = fence[2]!.trim()
      if (!tail && last && run[0] === last.char && run.length >= last.count) stack.pop()
      else if (run[0] !== ':' || /^\{[^}]+\}/.test(tail)) stack.push({ char: run[0]!, count: run.length, literal: !/^\{[^}]+\}/.test(tail) })
      return root
    }
    if (text.includes('<!--') && !text.slice(text.indexOf('<!--') + 4).includes('-->')) comment = true
    return root
  })
  roots.push(stack.length === 0 && !comment)
  return roots
}

function heading(lines: Line[], roots: boolean[], at: number): { depth: number, end: number } | undefined {
  if (!roots[at]) return undefined
  const hash = /^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(lines[at]?.text ?? '')
  if (hash) return { depth: hash[1]!.length, end: at }
  if (lines[at]?.text.trim() && roots[at + 1]) {
    const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[at + 1]?.text ?? '')
    if (underline) return { depth: underline[1]![0] === '=' ? 1 : 2, end: at + 1 }
  }
  return undefined
}

function sectionDepth(lines: Line[]): number {
  if (!/^---[ \t]*$/.test(lines[0]?.text ?? '')) return 2
  for (let at = 1; at < lines.length; at++) {
    const text = lines[at]!.text
    if (/^---[ \t]*$/.test(text)) return 2
    if (!/^sectionDepth\s*:/.test(text)) continue
    const value = /^sectionDepth\s*:\s*(\d+)\s*(?:#.*)?$/.exec(text)
    if (!value) throw new Error('source-changed')
    const depth = Number(value[1])
    return depth >= 1 && Number.isSafeInteger(depth) ? depth : 2
  }
  throw new Error('source-changed')
}

function labelStart(lines: Line[], at: number, expected: string): number {
  let before = at - 1
  while (before >= 0 && !lines[before]!.text.trim()) before--
  const label = /^\(([^)]+)\)=[ \t]*$/.exec(lines[before]?.text.trim() ?? '')
  if (!label) return at
  if (label[1] !== expected) throw new Error('source-changed')
  return before
}

/** Adds one explicitly labelled page without rewriting any existing prose, cues or newlines. */
export function writePage(doc: IRDocument, after: IRSection, source: string, id: string, title: string): string {
  const index = doc.sections.findIndex(section => section.id === after.id)
  if (index < 0 || doc.sections[index] !== after) throw new Error('source-changed')
  if (!/^[\p{L}\p{N}_.-]{1,200}$/u.test(id) || doc.sections.some(section => section.id === id || [...irBlocks(section.blocks)].some(block => block.id === id))) throw new Error('page-id')
  if (!title.trim() || /[\r\n\0]/.test(title)) throw new Error('page-title')
  // An include may have been sliced, or may end inside a parent scope. Its insertion boundary is not in IR.
  const file = after.source.file
  if (file !== doc.meta.entry || doc.sections.some(section => section.source.file !== file || [...irBlocks(section.blocks)].some(block => block.source.file !== file))) throw new Error('page-multiple-files')
  const lines = sourceLines(source), roots = rootLines(lines), threshold = sectionDepth(lines)
  const start = after.source.line - 1
  const actual = heading(lines, roots, start)
  if (after.depth > 0 && actual?.depth !== after.depth) throw new Error('source-changed')
  if (after.depth === 0 && actual && actual.depth >= threshold) throw new Error('source-changed')
  labelStart(lines, start, after.id)
  const end = Math.max((after.source.endLine ?? after.source.line) - 1, actual?.end ?? start)
  if (start < 0 || end < start || end >= lines.length || !roots[end + 1]) throw new Error('source-changed')
  const next = doc.sections[index + 1]
  const nextLine = next ? next.source.line - 1 : lines.length
  if (next && heading(lines, roots, nextLine)?.depth !== next.depth) throw new Error('source-changed')
  const boundary = next ? labelStart(lines, nextLine, next.id) : lines.length
  if (boundary <= end || lines.slice(end + 1, boundary).some(line => line.text.trim())) throw new Error('source-changed')
  // A newly inserted heading inside the old range also makes those offsets stale.
  for (let at = (actual?.end ?? start) + 1; at <= end; at++) {
    const found = heading(lines, roots, at)
    if (found && found.depth <= threshold) throw new Error('source-changed')
    if (found) at = found.end
  }
  const depth = after.depth || (actual ? Math.min(2, threshold) : threshold)
  if (depth > threshold || depth > 6) throw new Error('source-changed')
  const newline = /\r\n|\n|\r/.exec(source)?.[0] ?? '\n'
  const offset = lines[end]!.end
  const before = source.slice(0, offset), following = source.slice(offset)
  const gap = before.endsWith(newline) ? newline : `${newline}${newline}`
  const escaped = title.trim().replace(/[\\`*_[\]<>#]/g, char => `\\${char}`)
  return `${before}${gap}(${id})=${newline}${'#'.repeat(depth)} ${escaped}${newline}${newline}${following}`
}
