import { randomUUID } from './random-uuid.ts'
import { documentBlockSection } from './document-places.ts'
import type { BlockId, Definition, DocumentBlock, DocumentId, InlineNode, PresmiumDocument, ReferenceNode, ReferenceTarget, RichTextNode, SectionId, VisualState } from './contracts/document.ts'

/** The longest excerpt shown for a citation, a search hit or a preview. */
export const EXCERPT_LENGTH = 120

const clip = (text: string): string => {
  const plain = text.replace(/\s+/g, ' ').trim()
  return [...plain].length > EXCERPT_LENGTH ? `${[...plain].slice(0, EXCERPT_LENGTH - 1).join('')}…` : plain
}

/** Inline content as plain text; a reference reads as its label, its target's current title (`titleOf`) or its fallback. */
export function inlinePlainText(nodes: readonly InlineNode[], titleOf?: (node: ReferenceNode) => string | undefined): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return node.text
      case 'link': return inlinePlainText(node.children, titleOf)
      case 'math': return node.value
      case 'break': return ' '
      case 'reference': return node.label ?? titleOf?.(node) ?? node.fallback
      default: return node.fallback
    }
  }).join('')
}

function richInlines(node: RichTextNode): InlineNode[][] {
  switch (node.type) {
    case 'paragraph': case 'heading': return [node.children]
    case 'list': return node.children.flatMap(item => item.children.flatMap(richInlines))
    case 'blockquote': return node.children.flatMap(richInlines)
    case 'table': return node.children.flatMap(row => row.children.map(cell => cell.children))
    case 'code': case 'math': return [[{ type: 'text', text: node.value }]]
    default: return []
  }
}

/** Every run of inline content a block holds directly (paragraphs, headings, cells, a caption), in reading order. */
function blockInlines(block: DocumentBlock): InlineNode[][] {
  if (block.type === 'text') return block.content.flatMap(richInlines)
  if (block.type === 'image') return block.caption ? [block.caption] : []
  return []
}

/** The block's own first text: its first paragraph, a caption or alt text, a code title, a component's or container's title. */
export function blockFirstText(doc: PresmiumDocument, id: BlockId, titleOf?: (node: ReferenceNode) => string | undefined, seen = new Set<BlockId>()): string {
  const block = doc.blocks[id]
  if (!block || seen.has(id)) return ''
  seen.add(id)
  for (const run of blockInlines(block)) {
    const text = clip(inlinePlainText(run, titleOf))
    if (text) return text
  }
  if (block.type === 'image') return clip(block.alt)
  if (block.type === 'code') return clip(block.title ?? block.value?.split('\n').find(line => line.trim()) ?? '')
  if (block.type === 'component') {
    const definition = doc.definitions[block.definitionId]
    const named = [block.parameters.title, definition?.data?.title, block.parameters.alt].find((value): value is string => typeof value === 'string' && value.trim() !== '')
    const title = named ?? definition?.kind
    if (title) return clip(title)
  }
  if (block.type === 'container' && block.properties.title) return clip(block.properties.title)
  for (const child of block.type === 'container' || block.type === 'component' ? block.children ?? [] : []) {
    const text = blockFirstText(doc, child, titleOf, seen)
    if (text) return text
  }
  return ''
}

/** The current title of a reference's target in `doc` (the target document), or undefined when the page or block is gone. */
export function referenceTargetTitle(doc: PresmiumDocument, target: ReferenceTarget): string | undefined {
  if (target.block !== undefined) return Object.hasOwn(doc.blocks, target.block) ? blockFirstText(doc, target.block) || doc.metadata.title : undefined
  if (target.section !== undefined) return Object.hasOwn(doc.sections, target.section) ? doc.sections[target.section]!.title : undefined
  return doc.metadata.title
}

/** The sentence of `text` around `at` (a character offset), as plain text of at most `EXCERPT_LENGTH` characters. */
function sentenceAround(text: string, at: number): string {
  const ends = /[.!?。！？；;\n]/
  let start = at, end = at
  while (start > 0 && !ends.test(text[start - 1]!)) start--
  while (end < text.length && !ends.test(text[end]!)) end++
  const sentence = text.slice(start, Math.min(text.length, end + 1)).trim()
  if ([...sentence].length <= EXCERPT_LENGTH) return sentence
  const chars = [...text.slice(start, end + 1)], offset = [...text.slice(start, at)].length
  const from = Math.max(0, Math.min(offset - EXCERPT_LENGTH / 2, chars.length - EXCERPT_LENGTH))
  return `${from > 0 ? '…' : ''}${chars.slice(from, from + EXCERPT_LENGTH - 2).join('').trim()}…`
}

/** One place a document points at another (or itself): an inline reference or a synced block. */
export interface DocumentCitationSite {
  kind: 'reference' | 'embed'
  target: ReferenceTarget
  block: BlockId
  section?: SectionId
  excerpt: string
  /** The reference node itself, for references. */
  node?: ReferenceNode
}

/** Every reference and synced block in the document, in block order; `titleOf` gives references their current text. */
export function documentCitationSites(doc: PresmiumDocument, titleOf?: (node: ReferenceNode) => string | undefined): DocumentCitationSite[] {
  const sites: DocumentCitationSite[] = []
  for (const block of Object.values(doc.blocks)) {
    const section = documentBlockSection(doc, block.id)
    if (block.type === 'embed') {
      sites.push({ kind: 'embed', target: { document: block.source.document, block: block.source.block }, block: block.id, ...section !== undefined ? { section } : {}, excerpt: '' })
      continue
    }
    for (const run of blockInlines(block)) {
      let text = ''
      const found: { node: ReferenceNode, at: number }[] = []
      const walk = (nodes: readonly InlineNode[]) => {
        for (const node of nodes) {
          if (node.type === 'link') { walk(node.children); continue }
          if (node.type === 'reference') found.push({ node, at: text.length })
          text += inlinePlainText([node], titleOf)
        }
      }
      walk(run)
      for (const { node, at } of found) sites.push({ kind: 'reference', target: node.target, block: block.id, ...section !== undefined ? { section } : {}, excerpt: sentenceAround(text, at), node })
    }
  }
  return sites
}

/** The searchable text of a document: its page titles and each block's text with the page it is on. */
export function documentSearchText(doc: PresmiumDocument): { pages: { id: SectionId, title: string }[], blocks: { id: BlockId, section?: SectionId, text: string }[] } {
  const pages = doc.sectionOrder.flatMap(id => doc.sections[id] ? [{ id, title: doc.sections[id]!.title }] : [])
  const blocks = Object.values(doc.blocks).flatMap((block) => {
    const text = blockInlines(block).map(run => inlinePlainText(run)).join('\n').trim() || (block.type === 'image' ? block.alt : block.type === 'code' ? block.title ?? '' : '')
    if (!text) return []
    const section = documentBlockSection(doc, block.id)
    return [{ id: block.id, ...section !== undefined ? { section } : {}, text }]
  })
  return { pages, blocks }
}

/** The sentence of `text` that holds the first match of `query` (lowercase). */
export function matchingSentence(text: string, query: string): string | undefined {
  const at = text.toLowerCase().indexOf(query)
  return at < 0 ? undefined : sentenceAround(text, at)
}

/** The first paragraph of the target as plain text: a block's text, a page's first text block, or the document's first page. */
export function targetExcerpt(doc: PresmiumDocument, target: Omit<ReferenceTarget, 'document'>): string {
  if (target.block !== undefined) return blockFirstText(doc, target.block)
  const sections = target.section !== undefined ? [target.section] : doc.sectionOrder
  for (const id of sections) {
    for (const child of doc.sections[id]?.children ?? []) {
      const text = blockFirstText(doc, child)
      if (text) return text
    }
  }
  return ''
}

/** The block and every block below it (container and component children), keyed by ID, or undefined when it is not there. */
export function blockSubtree(doc: PresmiumDocument, id: BlockId): Record<BlockId, DocumentBlock> | undefined {
  if (!Object.hasOwn(doc.blocks, id)) return undefined
  const out: Record<BlockId, DocumentBlock> = {}
  const pending = [id]
  while (pending.length) {
    const next = pending.shift()!
    const block = doc.blocks[next]
    if (!block || Object.hasOwn(out, next)) continue
    out[next] = block
    if (block.type === 'container' || block.type === 'component') pending.push(...block.children ?? [])
  }
  return out
}

/**
 * Each block's state at the last step of its page where it is visible, in the source document: what a synced block
 * shows when the host gives no state of its own.
 */
export function finalVisuals(doc: PresmiumDocument, section: SectionId | undefined): Map<BlockId, VisualState> {
  const out = new Map<BlockId, VisualState>()
  const order = section !== undefined ? doc.sections[section]?.stepOrder ?? [] : []
  const cache = new Map<string, Map<BlockId, VisualState>>()
  const at = (stepId: string, guard = 0): Map<BlockId, VisualState> => {
    const known = cache.get(stepId)
    if (known) return known
    const step = doc.steps[stepId]
    const result = step?.inherits && guard < 64 ? new Map(at(step.inherits, guard + 1)) : new Map<BlockId, VisualState>()
    for (const visual of step?.visuals ?? []) result.set(visual.blockId, { ...result.get(visual.blockId), ...visual, parameters: { ...result.get(visual.blockId)?.parameters, ...visual.parameters } })
    cache.set(stepId, result)
    return result
  }
  for (const stepId of order) for (const [id, visual] of at(stepId)) if (visual.visible) out.set(id, visual)
  return out
}

/** Reference fallbacks set to the targets' current titles; the same document when none changed. */
export function withReferenceFallbacks(doc: PresmiumDocument, titleOf: (target: ReferenceTarget) => string | undefined): PresmiumDocument {
  let changed = false
  const inlines = (nodes: InlineNode[]): InlineNode[] => nodes.map((node) => {
    if (node.type === 'link') { const children = inlines(node.children); return children === node.children ? node : { ...node, children } }
    if (node.type !== 'reference') return node
    const title = titleOf(node.target)
    if (title === undefined || title === node.fallback) return node
    changed = true
    return { ...node, fallback: title }
  })
  const rich = (node: RichTextNode): RichTextNode => {
    switch (node.type) {
      case 'paragraph': case 'heading': return { ...node, children: inlines(node.children) }
      case 'list': return { ...node, children: node.children.map(item => ({ ...item, children: item.children.map(rich) })) }
      case 'blockquote': return { ...node, children: node.children.map(rich) }
      case 'table': return { ...node, children: node.children.map(row => ({ ...row, children: row.children.map(cell => ({ ...cell, children: inlines(cell.children) })) })) }
      default: return node
    }
  }
  const blocks = Object.fromEntries(Object.entries(doc.blocks).map(([id, block]) => [id,
    block.type === 'text' ? { ...block, content: block.content.map(rich) } : block.type === 'image' && block.caption ? { ...block, caption: inlines(block.caption) } : block]))
  return changed ? { ...doc, blocks } : doc
}

/** A file the copy of a synced block needs in the host document's folder: `from` in the source folder, `to` in the host's. */
export interface CopiedAssetFile { from: string, to: string }

/**
 * The host document with its synced block `embedId` replaced by a deep copy of the source subtree: new block IDs,
 * the definitions it uses copied (or reused when the host has an identical one), the assets it uses added under new
 * IDs at `assetLocation(location)` (the caller copies `files`). The host's states for the synced block apply to the copy;
 * the copied blocks below it are visible wherever the copy is, in their final state in the source.
 */
export function copyEmbeddedBlock(host: PresmiumDocument, embedId: BlockId, source: PresmiumDocument, assetLocation: (location: string) => string): { document: PresmiumDocument, root: BlockId, files: CopiedAssetFile[] } {
  const embed = host.blocks[embedId]
  if (embed?.type !== 'embed') throw new Error('embed-not-found')
  const subtree = blockSubtree(source, embed.source.block)
  if (!subtree) throw new Error('embed-source-missing')
  const document: PresmiumDocument = structuredClone(host)
  // Every ID of a document is unique across its entities and rich-text nodes.
  const taken = new Set<string>()
  const collect = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(collect); return }
    if (!value || typeof value !== 'object') return
    if (typeof (value as { id?: unknown }).id === 'string') taken.add((value as { id: string }).id)
    Object.values(value).forEach(collect)
  }
  collect(document)
  const fresh = (base: string) => {
    for (;;) { const id = `${base}-${randomUUID().slice(0, 8)}`; if (!taken.has(id)) { taken.add(id); return id } }
  }
  const ids = new Map<BlockId, BlockId>()
  for (const id of Object.keys(subtree)) ids.set(id, id === embed.source.block ? embedId : fresh(id))
  const definitions = new Map<string, string>()
  const definitionOf = (id: string): string => {
    const known = definitions.get(id)
    if (known) return known
    const definition = source.definitions[id]!
    const same = Object.values(document.definitions).find(other => JSON.stringify({ ...other, id: '' }) === JSON.stringify({ ...definition, id: '' }))
    const target = same?.id ?? (taken.has(id) ? fresh(id) : (taken.add(id), id))
    if (!same) document.definitions[target] = { ...structuredClone(definition) as Definition, id: target }
    definitions.set(id, target)
    return target
  }
  const files: CopiedAssetFile[] = []
  const assets = new Map<string, string>()
  const assetOf = (id: string): string => {
    const known = assets.get(id)
    if (known) return known
    const asset = source.assets[id]!
    const location = assetLocation(asset.location)
    const same = Object.values(document.assets).find(other => other.location === location && other.kind === asset.kind)
    const target = same?.id ?? (taken.has(id) ? fresh(id) : (taken.add(id), id))
    if (!same) { document.assets[target] = { ...structuredClone(asset), id: target, location }; if (!/^[a-z][a-z0-9+.-]*:/i.test(asset.location)) files.push({ from: asset.location, to: location }) }
    assets.set(id, target)
    return target
  }
  for (const [id, block] of Object.entries(subtree)) {
    const copy = structuredClone(block) as DocumentBlock
    copy.id = ids.get(id)!
    if (copy.type === 'container' || copy.type === 'component') copy.children = copy.children?.map(child => ids.get(child) ?? child)
    if (copy.type === 'component') copy.definitionId = definitionOf(copy.definitionId)
    if (copy.type === 'image' && copy.assetId) copy.assetId = assetOf(copy.assetId)
    // Highlights are keyed by the source's steps, which the host does not have.
    if (copy.type === 'code') { delete copy.highlight; if (copy.origin) delete copy.origin.highlightRegions }
    if (copy.type === 'text') {
      const renamed = new Map<string, string>()
      const rename = (value: unknown) => {
        if (Array.isArray(value)) { value.forEach(rename); return }
        if (!value || typeof value !== 'object') return
        const node = value as { id?: unknown, type?: unknown }
        if (typeof node.id === 'string' && typeof node.type === 'string') { const next = fresh(node.id); renamed.set(node.id, next); node.id = next }
        Object.values(value).forEach(rename)
      }
      rename(copy.content)
      if (copy.reveal) copy.reveal = { ...copy.reveal, order: copy.reveal.order.map(id => renamed.get(id) ?? id) }
    }
    // The copy takes the synced block's own scope (where it shows and to whom) when it has one.
    if (copy.id === embedId) { if (embed.only) copy.only = embed.only; if (embed.audience) copy.audience = embed.audience }
    document.blocks[copy.id] = copy
  }
  const final = finalVisuals(source, documentBlockSection(source, embed.source.block))
  const below = [...ids].filter(([from]) => from !== embed.source.block)
  for (const step of Object.values(document.steps)) {
    const own = step.visuals.find(visual => visual.blockId === embedId)
    if (!own) continue
    const root = final.get(embed.source.block)
    if (own.state === undefined && root?.state !== undefined) own.state = root.state
    if (root?.parameters && Object.keys(root.parameters).length) own.parameters = { ...root.parameters, ...own.parameters }
    for (const [from, to] of below) {
      const was = final.get(from)
      if (!was) continue
      step.visuals.push({ blockId: to, visible: own.visible, ...was.state !== undefined ? { state: was.state } : {}, ...was.parameters && Object.keys(was.parameters).length ? { parameters: was.parameters } : {} })
    }
  }
  return { document, root: embedId, files }
}

/** A document ID that is not yet taken. */
export function freshDocumentId(taken: ReadonlySet<DocumentId>): DocumentId {
  for (;;) { const id = randomUUID(); if (!taken.has(id)) return id }
}
