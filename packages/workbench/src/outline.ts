import type { IRDocument, MdastNode } from '@lincyaw/kernel'

/** A section as the navigation pane lists it: in the slides each section is one slide, numbered from 1. */
export interface OutlineItem {
  id: string
  title: string
  depth: number
  number: number
}

export function documentOutline(doc: IRDocument | undefined): OutlineItem[] {
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
export function countWords(doc: IRDocument | undefined): number {
  let words = 0
  for (const section of doc?.sections ?? []) {
    words += countText(section.title)
    for (const block of section.blocks) if (block.node.type === 'markdown') words += countNode(block.node.mdast)
  }
  return words
}
