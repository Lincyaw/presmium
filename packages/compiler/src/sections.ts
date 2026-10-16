/**
 * Pass 2 (docs/ir.md section 2.2): a heading at the section depth opens a
 * section. Of the shallower headings, the first one before any section is the
 * document title and titles the cover; every other one is a chapter title and
 * opens a section of its own, before or after the first section alike.
 * Content before the first section is the cover. Section ids come from the
 * MyST label before the heading, or from the title.
 */
import type { Finding, MdastNode, SourcePos } from '@presmium/kernel'
import { fileOf, lineOf, sourceOf } from './source.ts'

export interface RawSection {
  id: string
  title: string
  depth: number
  source: SourcePos
  /** Content nodes, without the opening heading and its label. */
  nodes: MdastNode[]
}

export interface SplitOptions {
  entry: string
  /** Cover title when the cover has no heading. */
  title: string
  sectionDepth: number
}

interface Draft extends Omit<RawSection, 'id'> {
  label?: string
  /** The cover took its title from a heading. */
  titled?: boolean
}

export function splitSections(nodes: MdastNode[], options: SplitOptions, report: (finding: Finding) => void): RawSection[] {
  const drafts: Draft[] = []
  let opened = false

  for (const node of nodes) {
    const current = drafts.at(-1)
    const depth = node.type === 'heading' && typeof node.depth === 'number' ? node.depth : undefined
    if (depth !== undefined && depth <= options.sectionDepth && (depth === options.sectionDepth || opened || drafts[0]?.titled)) {
      opened = true
      const label = current ? takeLabel(current.nodes) : undefined
      drafts.push({ label, title: plainText(node), depth, source: sourceOf(node, options.entry), nodes: [] })
      continue
    }
    if (opened && current) {
      current.nodes.push(node)
      continue
    }
    const cover = current ?? { title: options.title, depth: 0, source: sourceOf(node, options.entry), nodes: [] }
    if (!current) drafts.push(cover)
    if (depth !== undefined && depth < options.sectionDepth && !cover.titled) {
      cover.titled = true
      cover.label = takeLabel(cover.nodes)
      cover.title = plainText(node)
      cover.source = sourceOf(node, options.entry)
      continue
    }
    cover.nodes.push(node)
  }

  // A cover left empty (e.g. it only held the label of the first heading) is no section.
  const cover = drafts[0]
  if (cover?.depth === 0 && !cover.titled && cover.nodes.length === 0) drafts.shift()

  // Labels give stable ids, so they are taken first; a title's slug gets what is left (R-37).
  const used = new Set<string>()
  const labelled = new Set<Draft>()
  for (const draft of drafts) {
    if (!draft.label) continue
    if (used.has(draft.label)) {
      report({ checkId: 'presmium.sections', severity: 'error', message: `duplicate section label (${draft.label})=`, source: draft.source })
      continue
    }
    used.add(draft.label)
    labelled.add(draft)
  }
  return drafts.map((draft): RawSection => {
    const { title, depth, source, nodes } = draft
    const ends = nodes.filter(n => fileOf(n, options.entry) === source.file).map(n => lineOf(n)?.endLine ?? 0)
    const id = labelled.has(draft) ? draft.label! : unique(draft.label ?? slugify(title), used)
    return { id, title, depth, source: { ...source, endLine: Math.max(source.line, ...ends) }, nodes }
  })
}

/** Removes and returns a trailing `(label)=` target, which labels the heading after it. */
function takeLabel(nodes: MdastNode[]): string | undefined {
  const last = nodes.at(-1)
  if (last?.type !== 'mystTarget' || typeof last.label !== 'string') return undefined
  nodes.pop()
  return last.label
}

/** Concatenated text of a node's descendants. */
export function plainText(node: MdastNode): string {
  if (typeof node.value === 'string' && !node.children) return node.value
  return (node.children ?? []).map(plainText).join('')
}

/** Lowercase, keeps letters and digits of any script, joins words with '-'. */
export function slugify(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/[\s_-]+/g, '-') || 'section'
}

/** `id`, or `id-2`, `id-3`, ... when taken; records the result in `used`. */
export function unique(id: string, used: Set<string>): string {
  let result = id
  for (let n = 2; used.has(result); n++) result = `${id}-${n}`
  used.add(result)
  return result
}
