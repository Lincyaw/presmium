import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { docBlocks, isRecord } from '@lincyaw/kernel'
import type { Focus, FocusReport, IRDocument, SourceRange } from '@lincyaw/kernel'
import { findBlock, findSection, relativeToDeck } from './deck.ts'

const EXCERPT_LINES = 20
const QUOTE_CHARS = 2000
const WORKSPACE_EXCERPT_CHARS = 8000
const FROM = new Set<Focus['from']>(['source', 'web', 'slides'])

const str = (value: unknown, max = 200) => (typeof value === 'string' && value !== '' && value.length <= max ? value : undefined)
const line = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined)

export function toFocusReport(value: unknown): FocusReport | string {
  if (!isRecord(value)) return 'a focus is an object'
  const id = str(value.id)
  const from = value.from as Focus['from']
  if (!id) return 'a focus has an id'
  if (!FROM.has(from)) return 'a focus is from source, web or slides'
  if (value.scope !== undefined && value.scope !== 'document' && value.scope !== 'workspace') return 'a focus scope is document or workspace'
  const source = isRecord(value.source) ? value.source : undefined
  const range = source && str(source.file, 1000) && line(source.startLine) ? { file: source.file as string, startLine: source.startLine as number, endLine: line(source.endLine) ?? source.startLine as number } : undefined
  if (source && !range) return 'a focus\'s source is { file, startLine, endLine }'
  const report: FocusReport = { id, from }
  if (value.scope === 'workspace' || value.scope === 'document') report.scope = value.scope
  for (const key of ['section', 'block'] as const) if (str(value[key])) report[key] = value[key] as string
  if (typeof value.step === 'number' && Number.isInteger(value.step) && value.step >= 0) report.step = value.step
  if (typeof value.quote === 'string' && value.quote.trim()) report.quote = value.quote.slice(0, QUOTE_CHARS)
  if (range) report.source = range
  if (!report.section && !report.block && !report.source) return 'a focus names a section, a block or a range of the source'
  if (report.scope === 'workspace' && (report.from !== 'source' || !report.source || report.section || report.block || report.step !== undefined)) return 'a workspace focus is a source range without a section, block or step'
  return report
}

function excerptOf(text: string, start: number, end: number): string {
  const lines = text.split(/\r?\n/).slice(start - 1, end)
  if (lines.length <= EXCERPT_LINES) return lines.join('\n')
  const half = EXCERPT_LINES / 2
  return [...lines.slice(0, half), `[… ${lines.length - EXCERPT_LINES} more lines …]`, ...lines.slice(-half)].join('\n')
}

function blockAt(doc: IRDocument, range: SourceRange): { section: string, block?: string } | undefined {
  let found: { section: string, block: string, span: number } | undefined
  for (const { section, block } of docBlocks(doc)) {
    const at = relativeToDeck(doc, block.source)
    const end = at.endLine ?? at.line
    if (at.file !== range.file || range.startLine < at.line || range.startLine > end) continue
    if (!found || end - at.line < found.span) found = { section: section.id, block: block.id, span: end - at.line }
  }
  if (found) return { section: found.section, block: found.block }
  const sections = doc.sections.filter((s) => {
    const at = relativeToDeck(doc, s.source)
    return at.file === range.file && at.line <= range.startLine
  })
  const section = sections.at(-1)
  return section && { section: section.id }
}

export function resolveFocus(doc: IRDocument | undefined, document: string, report: FocusReport, read: (file: string) => string = file => readFileSync(file, 'utf8'), readWorkspaceFile?: (file: string) => string): Focus {
  if (report.scope === 'workspace') {
    if (!readWorkspaceFile || !report.source) throw new Error('this host does not read workspace source selections')
    const range = report.source
    const source = { ...range, endLine: Math.max(range.startLine, range.endLine) }
    const excerpt = excerptOf(readWorkspaceFile(source.file), source.startLine, source.endLine)
    return { id: report.id, from: report.from, document, scope: 'workspace', source, excerpt: excerpt.length > WORKSPACE_EXCERPT_CHARS ? `${excerpt.slice(0, WORKSPACE_EXCERPT_CHARS)}\n[… excerpt truncated …]` : excerpt, ...report.quote ? { quote: report.quote } : {} }
  }
  if (!doc) throw new Error('a document focus requires the compiled document')
  const deckDir = dirname(doc.meta.entry)
  let source: SourceRange
  let section = report.section
  let block = report.block
  if (report.block || (report.section && !report.source)) {
    const found = findSection(doc, report.section ?? [...docBlocks(doc)].find(b => b.block.id === report.block)?.section.id ?? '')
    section = found.id
    const at = report.block ? relativeToDeck(doc, findBlock(found, report.block).source) : relativeToDeck(doc, found.source)
    source = { file: at.file, startLine: at.line, endLine: at.endLine ?? at.line }
  } else {
    const range = report.source!
    const file = normalize(range.file)
    if (isAbsolute(file) || file === '..' || file.startsWith(`..${sep}`)) throw new Error(`the file ${range.file} is not in the document directory`)
    source = { file, startLine: range.startLine, endLine: Math.max(range.startLine, range.endLine) }
    const at = blockAt(doc, source)
    section ??= at?.section
    block ??= at?.block
  }
  const excerpt = excerptOf(read(join(deckDir, source.file)), source.startLine, source.endLine)
  return {
    id: report.id,
    from: report.from,
    document,
    source,
    excerpt,
    ...section ? { section } : {},
    ...block ? { block } : {},
    ...report.step !== undefined ? { step: report.step } : {},
    ...report.quote ? { quote: report.quote } : {},
  }
}
