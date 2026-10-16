/**
 * Reading a compiled document: its chapters, what a block shows at a step,
 * the narration of a step, the text of a block and the words a search index
 * holds. Pure functions over the IR, shared by the IR runtime
 * (`@presmium/viewer`), the web renderer's pages and search, and the agent
 * environment (`@presmium/mcp`), which runs in Node without the browser runtime.
 */
import { irBlocks } from './blocks.ts'
import type { IRBlock, IRDocument, IRSection, MdastNode } from './ir.ts'

/**
 * A chapter: the sections of one source file (the entry or an `{include}`d
 * file), split again at every chapter title, that is a heading above the
 * section depth (`#` where sections open at `##`, docs/ir.md 2.2). The cover
 * opens the first chapter. The web form shows a chapter per page.
 */
export interface Chapter {
  /** The chapter title, else the title of its first section. */
  title: string
  /** Its sections, in order; the first one opens the chapter. */
  sections: IRSection[]
}

/** Depth of the headings that open sections: the deepest heading that opened one. */
function sectionDepth(doc: IRDocument): number {
  return doc.sections.reduce((depth, section) => Math.max(depth, section.depth), 0)
}

function titles(depth: number, section: IRSection): boolean {
  return section.depth === 0 || section.depth < depth
}

/** Whether a section opens under a title above the section depth: the cover (depth 0) or a chapter title. */
export function isChapterTitle(doc: IRDocument, section: IRSection): boolean {
  return titles(sectionDepth(doc), section)
}

/** The chapters of a document, in order. */
export function chapters(doc: IRDocument): Chapter[] {
  const depth = sectionDepth(doc)
  const result: Chapter[] = []
  let previous: IRSection | undefined
  for (const section of doc.sections) {
    const current = result.at(-1)
    if (!current || section.source.file !== previous?.source.file || titles(depth, section)) {
      result.push({ title: section.title, sections: [section] })
    } else {
      current.sections.push(section)
    }
    previous = section
  }
  return result
}

/** A visual block is on screen from `at` until `until` (docs/ir.md section 3). */
export function blockVisible(block: IRBlock, step: number): boolean {
  return step >= block.at && (block.until === undefined || step < block.until)
}

/** Internal state of a block that spans steps: 0 at `at`, up to `span` (docs/ir.md section 2.4). */
export function blockState(block: IRBlock, step: number): number {
  return Math.min(Math.max(step - block.at, 0), block.span ?? 0)
}

/** The section's own narration blocks (its top level) bound to `step`, in source order. */
export function narrationAt(section: IRSection, step: number): IRBlock[] {
  return section.blocks.filter(block => block.role === 'narration' && block.at === step)
}

/**
 * Every narration block of a section in source order, those a compile pass
 * moved into a component included (e.g. the narration of a reveal in
 * `PmPredict`, docs/ir.md 2.13): what the presenter reads.
 */
export function sectionNarration(section: IRSection): IRBlock[] {
  return [...irBlocks(section.blocks)].filter(block => block.role === 'narration')
}

const BREAKS = new Set(['paragraph', 'heading', 'listItem', 'tableRow', 'tableCell', 'code', 'math', 'blockquote', 'break'])

/** The text raw HTML shows: its tags, styles and scripts left out. */
function htmlText(html: string): string {
  return html.replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
}

/** The text of an mdast tree; block-level nodes are separated by line breaks. */
export function mdastText(node: MdastNode): string {
  if (node.type === 'html' && typeof node.value === 'string') return htmlText(node.value)
  if (typeof node.value === 'string' && !node.children) return node.value
  const text = (node.children ?? []).map(mdastText).join('')
  return BREAKS.has(node.type) ? `${text}\n` : text
}

/** String values of component props, e.g. the labels of a stepper. */
function propText(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(propText)
  if (value && typeof value === 'object') return Object.values(value).flatMap(propText)
  return []
}

/** The readable text of a block: prose, code, recorded output, component props and children. */
export function blockText(block: IRBlock): string {
  const { node } = block
  switch (node.type) {
    case 'markdown': return mdastText(node.mdast).trim()
    case 'code': return [node.title, node.value, ...(node.outputs ?? []).map(o => o.stdout)].filter(Boolean).join('\n')
    case 'component': return [...propText(node.props), ...(node.children ?? []).map(blockText)].join('\n')
  }
}

/**
 * The search tokenizer of the web form's index and of MCP's `search`: splits
 * at spaces and punctuation like MiniSearch's default tokenizer (so
 * `console.log` gives `console` and `log`), then into words by
 * `Intl.Segmenter`, so Chinese text without spaces splits into words.
 * VitePress serializes it into the client bundle, so it must not refer to
 * anything outside its own body.
 */
export function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  const words: string[] = []
  for (const piece of text.split(/[\n\r\p{Z}\p{P}]+/u)) {
    for (const part of segmenter.segment(piece)) {
      if (part.isWordLike) words.push(part.segment)
    }
  }
  return words
}
