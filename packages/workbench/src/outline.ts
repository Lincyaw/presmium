import type { IRDocument, MdastNode, TeachingDocument } from '@lincyaw/kernel'

/** A section as the navigation pane lists it: in the slides each section is one slide, numbered from 1. */
export interface OutlineItem {
  id: string
  title: string
  depth: number
  number: number
}

export function documentOutline(doc: IRDocument | TeachingDocument | undefined): OutlineItem[] {
  if (doc && 'schemaVersion' in doc) return doc.sectionOrder.map((id, index) => ({ id, title: doc.sections[id]!.title, depth: doc.sections[id]!.level ?? 1, number: index + 1 }))
  return (doc?.sections ?? []).map((section, i) => ({ id: section.id, title: section.title, depth: section.depth, number: i + 1 }))
}

// As a word processor counts: each CJK character is a word, and so is each run of Latin letters or digits.
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/g
const WORD = /[A-Za-z0-9À-ɏ]+(?:['’.-][A-Za-z0-9À-ɏ]+)*/g

function countText(text: string): number {
  return (text.match(CJK)?.length ?? 0) + (text.replace(CJK, ' ').match(WORD)?.length ?? 0)
}

function countNode(node: MdastNode): number {
  const own = (node.type === 'text' || node.type === 'inlineCode') && typeof node.value === 'string' ? countText(node.value) : 0
  return own + (node.children ?? []).reduce((sum, child) => sum + countNode(child), 0)
}

/** The words of the document's text: its titles and Markdown (the narration too), not its code or components. */
export function countWords(doc: IRDocument | TeachingDocument | undefined): number {
  if (doc && 'schemaVersion' in doc) {
    const visit = (value: unknown): number => {
      if (!value || typeof value !== 'object') return 0
      if (Array.isArray(value)) return value.reduce((sum, child) => sum + visit(child), 0)
      const node = value as { type?: string, text?: string, children?: unknown[], fallback?: unknown }
      if (node.type === 'code') return 0
      return (node.type === 'text' && node.text ? countText(node.text) : 0) + visit(node.children) + visit(node.fallback)
    }
    return doc.sectionOrder.reduce((sum, id) => sum + countText(doc.sections[id]!.title), 0) + Object.values(doc.blocks).reduce((sum, block) => sum + (block.type === 'text' ? visit(block.content) : 0), 0)
  }
  let words = 0
  for (const section of doc?.sections ?? []) {
    words += countText(section.title)
    for (const block of section.blocks) if (block.node.type === 'markdown') words += countNode(block.node.mdast)
  }
  return words
}
