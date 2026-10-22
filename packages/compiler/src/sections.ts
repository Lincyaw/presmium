import type { Finding, MdastNode, SourcePos } from '@lincyaw/kernel'
import { fileOf, nodeLines, sourceOf } from './parser.ts'

export interface RawSection {
  id: string
  title: string
  depth: number
  source: SourcePos
  nodes: MdastNode[]
}

export interface SplitOptions {
  entry: string
  title: string
  sectionDepth: number
}

interface Draft extends Omit<RawSection, 'id'> {
  label?: string
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

  const cover = drafts[0]
  if (cover?.depth === 0 && !cover.titled && cover.nodes.length === 0) drafts.shift()

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
    const ends = nodes.filter(n => fileOf(n, options.entry) === source.file).map(n => nodeLines(n)?.endLine ?? 0)
    const id = labelled.has(draft) ? draft.label! : unique(draft.label ?? sectionSlug(title), used)
    return { id, title, depth, source: { ...source, endLine: Math.max(source.line, ...ends) }, nodes }
  })
}

function takeLabel(nodes: MdastNode[]): string | undefined {
  const last = nodes.at(-1)
  if (last?.type !== 'mystTarget' || typeof last.label !== 'string') return undefined
  nodes.pop()
  return last.label
}

export function plainText(node: MdastNode): string {
  if (typeof node.value === 'string' && !node.children) return node.value
  return (node.children ?? []).map(plainText).join('')
}

/**
 * The section ID a heading's text gives. Unlike the kernel's urlSlug, other characters are dropped rather than
 * replaced, and only spaces, `_` and `-` become `-`; the IDs of existing documents depend on this rule.
 */
export function sectionSlug(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/[\s_-]+/g, '-') || 'section'
}

export function unique(id: string, used: Set<string>): string {
  let result = id
  for (let n = 2; used.has(result); n++) result = `${id}-${n}`
  used.add(result)
  return result
}
