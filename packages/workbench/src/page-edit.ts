import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, IRSection, SourceCapabilities } from '@lincyaw/kernel'

interface Line { text: string, start: number, end: number }

export type PageEditReason = 'page-multiple-files' | 'page-boundary' | 'page-hierarchy' | 'page-implicit-title' | 'page-formatted-title'
export interface PageEditCapability { rename: boolean, move: boolean, reason?: PageEditReason }

/** Coarse IR-level availability; every write also validates the current source snapshot. */
export function pageEditCapability(doc: IRDocument | undefined, id: string): PageEditCapability {
  const section = doc?.sections.find(section => section.id === id)
  if (!doc || !section) return { rename: false, move: false, reason: 'page-boundary' }
  if (doc.sections.some(page => page.source.file !== doc.meta.entry || [...irBlocks(page.blocks)].some(block => block.source.file !== doc.meta.entry)))
    return { rename: false, move: false, reason: 'page-multiple-files' }
  const index = doc.sections.indexOf(section)
  const move = section.depth > 0 && [doc.sections[index - 1], doc.sections[index + 1]].some(other => other?.depth === section.depth)
  return { rename: true, move, ...move ? {} : { reason: 'page-hierarchy' } }
}

function sourceLines(source: string): Line[] {
  const lines: Line[] = []
  let start = 0
  for (const match of source.matchAll(/\r\n|\n|\r/g)) {
    lines.push({ text: source.slice(start, match.index), start, end: match.index + match[0].length })
    start = match.index + match[0].length
  }
  lines.push({ text: source.slice(start), start, end: source.length })
  if (lines[0]?.text.startsWith('\uFEFF')) { lines[0].text = lines[0].text.slice(1); lines[0].start = 1 }
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

interface PageSpan {
  section: IRSection
  start: number
  end: number
  heading: number
  headingEnd: number
  depth: number
  labelled: boolean
}

/** Range checks are shared with insertion; source is sliced verbatim rather than rendered back to Markdown. */
function pageSpans(doc: IRDocument, source: string): { spans: PageSpan[], lines: Line[], newline: string } {
  if (!doc.sections.length) throw new Error('page-boundary')
  if (doc.sections.some(section => section.source.file !== doc.meta.entry || [...irBlocks(section.blocks)].some(block => block.source.file !== doc.meta.entry))) throw new Error('page-multiple-files')
  const lines = sourceLines(source), roots = rootLines(lines), threshold = sectionDepth(lines)
  // MyST cells carry boundaries and metadata beyond the section source ranges.
  if (lines.some((line, index) => roots[index] && /^ {0,3}\+{3,}/.test(line.text))) throw new Error('page-boundary')
  const starts = doc.sections.map(section => {
    const at = section.source.line - 1
    if (at < 0 || at >= lines.length || !roots[at]) throw new Error('page-boundary')
    return labelStart(lines, at, section.id)
  })
  const spans = doc.sections.map((section, index): PageSpan => {
    const at = section.source.line - 1
    const actual = heading(lines, roots, at)
    const last = (section.source.endLine ?? section.source.line) - 1
    const boundary = starts[index + 1] ?? lines.length
    if (last < at || last >= boundary || !roots[last + 1] || lines.slice(last + 1, boundary).some(line => line.text.trim())) throw new Error('page-boundary')
    if (actual && (actual.depth > threshold || section.depth > 0 && actual.depth !== section.depth)) throw new Error('page-boundary')
    if (!actual && section.depth > 0) throw new Error('page-boundary')
    // Unexpected page headings mean the IR ranges no longer describe this source snapshot.
    for (let line = (actual?.end ?? at) + 1; line <= last; line++) {
      const nested = heading(lines, roots, line)
      if (nested && nested.depth <= threshold) throw new Error('page-boundary')
      if (nested) line = nested.end
    }
    const start = lines[starts[index]!]!.start
    const end = index + 1 < starts.length ? lines[starts[index + 1]!]!.start : source.length
    return { section, start, end, heading: at, headingEnd: actual?.end ?? at, depth: actual?.depth ?? 0, labelled: starts[index] !== at }
  })
  return { spans, lines, newline: /\r\n|\n|\r/.exec(source)?.[0] ?? '\n' }
}

function pageLabel(span: PageSpan, newline: string, capabilities: SourceCapabilities): string {
  if (span.labelled) return ''
  if (!/^[\p{L}\p{N}_.-]{1,200}$/u.test(span.section.id)) throw new Error('page-boundary')
  if (/[^\x00-\x7f]/.test(span.section.id) && !capabilities.unicodePageTargets) throw new Error('page-compiler')
  return `(${span.section.id})=${newline}${newline}`
}

function escapedTitle(title: string): string {
  // MyST's table tokenizer still sees an escaped pipe before a Setext underline.
  return title.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{}~]/g, char => `\\${char}`).replace(/\|/g, '&#124;')
}

/** Renaming pins the original page ID and changes only its visible title line. */
export function renamePageSource(doc: IRDocument, id: string, source: string, title: string, capabilities: SourceCapabilities = {}): string {
  if (!title.trim() || /[\r\n\0]/.test(title)) throw new Error('page-title')
  const { spans, lines, newline } = pageSpans(doc, source)
  const span = spans.find(span => span.section.id === id)
  if (!span) throw new Error('page-boundary')
  if (!span.depth) throw new Error('page-implicit-title')
  const first = lines[span.heading]!
  const hash = /^( {0,3})(#{1,6})[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?$/.exec(first.text)
  const shown = hash ? hash[3]!.trim() : first.text.trim()
  // Complex heading syntax needs a source-aware text lens. Refuse it rather than flattening formatting.
  if (shown !== span.section.title && shown !== escapedTitle(span.section.title)) throw new Error('page-formatted-title')
  if (title.trim() === span.section.title) return source
  const line = hash ? `${hash[1]}${hash[2]} ${escapedTitle(title.trim())}` : escapedTitle(title.trim())
  const label = pageLabel(span, newline, capabilities)
  return `${source.slice(0, first.start)}${label}${line}${source.slice(first.start + first.text.length)}`
}

/** Moves a complete peer page; labels in the affected interval keep duplicate-title identities stable. */
export function movePageSource(doc: IRDocument, id: string, before: string | null, source: string, capabilities: SourceCapabilities = {}): string {
  const { spans, lines, newline } = pageSpans(doc, source)
  const from = spans.findIndex(span => span.section.id === id)
  const to = before === null ? spans.length : spans.findIndex(span => span.section.id === before)
  if (from < 0 || to < 0) throw new Error('page-boundary')
  if (from === to || from + 1 === to) return source
  const first = Math.min(from, to), last = Math.max(from, to - 1)
  const peers = spans.slice(first, last + 1)
  const depth = spans[from]!.section.depth
  if (!depth || peers.some(span => span.section.depth !== depth || span.depth !== depth)) throw new Error('page-hierarchy')
  const pieces = peers.map(span => {
    const offset = lines[span.heading]!.start - span.start
    const raw = source.slice(span.start, span.end)
    return { id: span.section.id, raw: `${raw.slice(0, offset)}${pageLabel(span, newline, capabilities)}${raw.slice(offset)}` }
  })
  const moved = pieces.splice(from - first, 1)[0]!
  pieces.splice((to > from ? to - 1 : to) - first, 0, moved)
  const separated = pieces.map(piece => /(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)[ \t]*$/.test(piece.raw) ? piece.raw : `${piece.raw}${piece.raw.endsWith(newline) ? newline : `${newline}${newline}`}`).join('')
  return `${source.slice(0, peers[0]!.start)}${separated}${source.slice(peers.at(-1)!.end)}`
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
