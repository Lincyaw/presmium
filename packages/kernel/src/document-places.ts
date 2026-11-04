import { isDocumentPlaceAnchor, isDocumentTextAnchor } from './contracts/document.ts'
import type { DocumentThreadAnchor, InlineNode, RichTextNode, TeachingDocument } from './contracts/document.ts'

/** The stable places a discussion can point at, in document order. */
export interface DocumentPlacesVisitor {
  /** A page title or a block. */
  place(id: string): void
  /** An addressable text identity: a rich-text node, a code block or a page title. */
  text(id: string, text: string): void
}

/** Canonical anchor v1 expands only nonempty styled-text links; other inline values are atoms. */
export function isDocumentTextLink(node: InlineNode): node is Extract<InlineNode, { type: 'link' }> & { children: Extract<InlineNode, { type: 'text' | 'break' }>[] } {
  return node.type === 'link' && node.children.length > 0 && node.children.every(child => child.type === 'text' || child.type === 'break')
}
function inlineText(nodes: readonly InlineNode[]): string {
  return nodes.map(node => node.type === 'text' ? node.text : node.type === 'break' ? '\n' : isDocumentTextLink(node) ? inlineText(node.children) : '\uFFFC').join('')
}

/**
 * One walk over the document's stable places. Only addressable canonical identities are visited; opaque plugin
 * data is never traversed. A caller that only needs text targets can ignore `place`.
 */
export function walkDocumentPlaces(document: TeachingDocument, visit: DocumentPlacesVisitor): void {
  const rich = (node: RichTextNode): void => {
    if (node.type === 'paragraph' || node.type === 'heading') visit.text(node.id, inlineText(node.children))
    else if (node.type === 'code') visit.text(node.id, node.value)
    else if (node.type === 'list') for (const item of node.children) {
      const [first, ...rest] = item.children
      visit.text(item.id, first?.type === 'paragraph' ? inlineText(first.children) : '')
      ;(first?.type === 'paragraph' ? rest : item.children).forEach(rich)
    }
    else if (node.type === 'blockquote') {
      const [first, ...rest] = node.children
      if (first?.type === 'paragraph') { visit.text(node.id, inlineText(first.children)); rest.forEach(rich) }
      else node.children.forEach(rich)
    } else if (node.type === 'table') for (const row of node.children) for (const cell of row.children) visit.text(cell.id, inlineText(cell.children))
  }
  const block = (id: string): void => {
    visit.place(id)
    const value = document.blocks[id]
    if (value?.type === 'text') value.content.forEach(rich)
    else if (value?.type === 'code' && value.value !== undefined) visit.text(id, value.value)
    else if (value?.type === 'container' || value?.type === 'component') value.children?.forEach(block)
  }
  for (const id of document.sectionOrder) {
    const page = document.sections[id]
    if (!page) continue
    visit.place(`page:${id}`)
    visit.text(`page:${id}`, page.title)
    page.children.forEach(block)
  }
}

/** Only addressable canonical text identities, in native document order; opaque data is never traversed. */
export function documentCommentTargets(document: TeachingDocument): Map<string, { order: number, text: string }> {
  const targets = new Map<string, { order: number, text: string }>()
  walkDocumentPlaces(document, { place() {}, text: (id, text) => { targets.set(id, { order: targets.size, text }) } })
  return targets
}

/** Every anchorable place in document order: page titles, blocks and text identities on one scale. */
export function documentAnchorOrder(document: TeachingDocument): Map<string, number> {
  const places = new Map<string, number>()
  const add = (id: string) => { if (!places.has(id)) places.set(id, places.size) }
  walkDocumentPlaces(document, { place: add, text: add })
  return places
}

/** The section that owns a block, following container and component children. */
export function documentBlockSection(document: TeachingDocument, blockId: string): string | undefined {
  for (const sectionId of document.sectionOrder) {
    const pending = [...document.sections[sectionId]!.children], seen = new Set<string>()
    while (pending.length) {
      const id = pending.pop()!
      if (id === blockId) return sectionId
      if (seen.has(id)) continue
      seen.add(id)
      const block = document.blocks[id]
      if (block?.type === 'container' || block?.type === 'component') pending.push(...block.children ?? [])
    }
  }
  return undefined
}

/** A key-order independent identity for comparing a thread anchor with a draft target. */
export function documentAnchorKey(anchor: DocumentThreadAnchor | undefined): string | undefined {
  if (!anchor) return undefined
  if (isDocumentPlaceAnchor(anchor)) return JSON.stringify(['place', anchor.blockId, anchor.stepId ?? null])
  if (!isDocumentTextAnchor(anchor)) return undefined
  return JSON.stringify(['text', anchor.from.blockId, anchor.from.offset, anchor.to.blockId, anchor.to.offset])
}
