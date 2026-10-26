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

function richTextParts(value: unknown, parts: string[] = []): string[] {
  if (!value || typeof value !== 'object') return parts
  if (Array.isArray(value)) { for (const child of value) richTextParts(child, parts); return parts }
  const node = value as { type?: string, text?: string, children?: unknown[], fallback?: unknown }
  if (node.type === 'code') return parts
  if (node.type === 'text' && node.text) parts.push(node.text)
  richTextParts(node.children, parts); richTextParts(node.fallback, parts)
  return parts
}

/** Counts authored titles and rich text; code, components and separate narration are excluded. */
export function countWords(doc: IRDocument | TeachingDocument | undefined): number {
  if (doc && 'schemaVersion' in doc) {
    return doc.sectionOrder.reduce((sum, id) => sum + countText(doc.sections[id]!.title), 0) + Object.values(doc.blocks).reduce((sum, block) => sum + (block.type === 'text' ? richTextParts(block.content).reduce((sum, text) => sum + countText(text), 0) : 0), 0)
  }
  let words = 0
  for (const section of doc?.sections ?? []) {
    words += countText(section.title)
    for (const block of section.blocks) if (block.node.type === 'markdown') words += countNode(block.node.mdast)
  }
  return words
}

/** Display-only counts, bounded to the current document's titles and text blocks. */
export class DocumentWordCounter {
  #identity?: string
  readonly #counts = new Map<string, { signature: string, words: number }>()

  count(doc: TeachingDocument | undefined, identity = doc?.id): number {
    if (identity !== this.#identity || !doc) { this.#counts.clear(); this.#identity = identity }
    if (!doc) return 0
    const unused = new Set(this.#counts.keys())
    const read = (key: string, signature: string, count: () => number): number => {
      unused.delete(key)
      let found = this.#counts.get(key)
      if (found?.signature !== signature) { found = { signature, words: count() }; this.#counts.set(key, found) }
      return found.words
    }
    let words = 0
    for (const id of doc.sectionOrder) {
      const title = doc.sections[id]!.title
      words += read(`title:${id}`, title, () => countText(title))
    }
    for (const block of Object.values(doc.blocks)) if (block.type === 'text') {
      const texts = richTextParts(block.content)
      words += read(`body:${block.id}`, JSON.stringify(texts), () => texts.reduce((sum, text) => sum + countText(text), 0))
    }
    for (const key of unused) this.#counts.delete(key)
    return words
  }
}
