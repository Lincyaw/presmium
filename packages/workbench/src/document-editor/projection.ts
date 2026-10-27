import type { DocumentBlock, NarrationNode, RichTextNode, Section, TeachingDocument, TextBlock } from '@lincyaw/kernel'
import { productInlineToNative } from './inline.ts'
import { captureRichBaseline, createRichProjection, nativeRichTextToProduct, productRichTextToNative } from './rich-text.ts'
import type { RichProjection } from './rich-text.ts'
import type { DocumentEditorBlock, DocumentEditorInput } from './schema.tsx'

export interface DocumentProjection extends RichProjection {
  owners: Map<string, string>
  pages: Map<string, string>
  blockSections: Map<string, string>
  document: TeachingDocument
  content: DocumentEditorInput[]
  structure?: string
  structures: Map<string, Pick<DocumentProjection, 'document' | 'rich' | 'owners' | 'pages' | 'baseline'>>
}
const newId = () => crypto.randomUUID()
const pageId = (sectionId: string) => `page:${sectionId}`
function plain(nodes: readonly { type: string, text?: string, children?: readonly unknown[] }[]): string {
  return nodes.map(node => node.type === 'text' ? node.text ?? '' : node.type === 'break' ? '\n' : node.children ? plain(node.children as Parameters<typeof plain>[0]) : '').join('')
}
function register(blocks: readonly DocumentEditorInput[], owner: string, context: DocumentProjection): void {
  for (const block of blocks) { if (block.id) context.owners.set(block.id, owner); if (block.children) register(block.children, owner, context) }
}
function productBlock(blockId: string, context: DocumentProjection, sectionId: string): DocumentEditorInput[] {
  const document = context.document, block = document.blocks[blockId]
  if (!block) throw new Error('document-block-reference')
  context.blockSections.set(blockId, sectionId)
  if (block.type === 'text') {
    const native = productRichTextToNative(block.content, context)
    if (!native.length) native.push({ id: newId(), type: 'paragraph', content: [] })
    register(native, blockId, context)
    return native
  }
  context.owners.set(block.id, block.id)
  if (block.type === 'container') return [{ id: block.id, type: 'presmiumContainer', props: { entityId: block.id, layout: block.layout, title: block.properties.title ?? '' }, children: block.children.flatMap(child => productBlock(child, context, sectionId)) }]
  if (block.type === 'image') return [{ id: block.id, type: 'image', props: { url: block.assetId ? document.assets[block.assetId]?.location ?? '' : '', caption: plain(block.caption ?? []), name: block.alt, textAlignment: block.alignment ?? 'left', ...block.width !== undefined ? { previewWidth: block.width } : {} } }]
  if (block.type === 'code' && block.value !== undefined) return [{ id: block.id, type: 'codeBlock', props: { language: block.language }, content: block.value }]
  return [{ id: block.id, type: 'presmiumAtom', props: { entityId: block.id, kind: block.type, label: block.type === 'code' ? block.title ?? block.origin?.anchor ?? block.language : document.definitions[block.definitionId]?.kind ?? block.definitionId }, ...block.type === 'component' && block.children ? { children: block.children.flatMap(child => productBlock(child, context, sectionId)) } : {} }]
}

export function createDocumentProjection(document: TeachingDocument): DocumentProjection {
  const context: DocumentProjection = { ...createRichProjection(), owners: new Map(), pages: new Map(), blockSections: new Map(), structures: new Map(), document: structuredClone(document), content: [] }
  context.content = document.sectionOrder.flatMap(sectionId => {
    const section = document.sections[sectionId]!
    context.pages.set(pageId(sectionId), sectionId)
    return [{ id: pageId(sectionId), type: 'presmiumPage' as const, props: { sectionId, level: section.level ?? 1 }, content: [{ type: 'text' as const, text: section.title, styles: {} }] }, ...section.children.flatMap(blockId => productBlock(blockId, context, sectionId))]
  })
  return context
}

function structureOf(blocks: readonly DocumentEditorBlock[], context: DocumentProjection): string {
  const tree = (blocks: readonly DocumentEditorBlock[]): unknown[] => blocks.map(block => [block.id, block.type,
    block.type === 'presmiumPage' ? block.props.sectionId : block.type === 'presmiumAtom' ? [block.props.entityId, block.props.kind] : undefined, tree(block.children)])
  return JSON.stringify([tree(blocks), [...context.tables]])
}

/** Canonical structural snapshots accompany native history; no editor envelope is persisted. */
export function rememberDocumentStructure(blocks: readonly DocumentEditorBlock[], context: DocumentProjection): void {
  const structure = structureOf(blocks, context)
  context.structure = structure
  if (!context.structures.has(structure)) context.structures.set(structure, {
    document: context.document, rich: new Map(context.rich), owners: new Map(context.owners), pages: new Map(context.pages), baseline: new Map(context.baseline),
  })
}

/** Share unchanged JSON branches across the editor's in-memory structural history. */
function share(before: unknown, after: unknown): unknown {
  if (before === after || !before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) !== Array.isArray(after)) return after
  if (Array.isArray(after)) {
    const prior = before as unknown[]
    let same = prior.length === after.length
    after.forEach((value, index) => { after[index] = share(prior[index], value); same &&= after[index] === prior[index] })
    return same ? before : after
  }
  const prior = before as Record<string, unknown>, next = after as Record<string, unknown>, keys = Object.keys(next)
  let same = Object.keys(prior).length === keys.length
  for (const key of keys) { next[key] = share(prior[key], next[key]); same &&= Object.hasOwn(prior, key) && next[key] === prior[key] }
  return same ? before : after
}

function rememberRich(nodes: readonly RichTextNode[], context: DocumentProjection): void {
  for (const node of nodes) {
    context.rich.set(node.id, { ...context.rich.get(node.id), original: node })
    if (node.type === 'list') for (const item of node.children) rememberRich(item.children, context)
    else if (node.type === 'blockquote') rememberRich(node.children, context)
    else if (node.type === 'extension') rememberRich(node.fallback, context)
  }
}

function nativePlain(block: DocumentEditorBlock): string {
  if (!Array.isArray(block.content)) return ''
  return plain(block.content as Parameters<typeof plain>[0])
}
function isEntity(block: DocumentEditorBlock, context: DocumentProjection): boolean {
  if (block.type === 'presmiumAtom') return !block.props.kind.startsWith('rich:')
  if (block.type === 'presmiumContainer' || block.type === 'image') return true
  return block.type === 'codeBlock' && context.document.blocks[context.owners.get(block.id) ?? block.id]?.type !== 'text' && !context.rich.has(block.id)
}
function nativeChildren(native: readonly DocumentEditorBlock[], context: DocumentProjection, next: TeachingDocument, usedListIds: Set<string>): string[] {
  const children: string[] = []
  let buffer: DocumentEditorBlock[] = [], owner: string | undefined
  const flush = () => {
    if (!buffer.length) return
    const blockId = owner && !next.blocks[owner] ? owner : newId()
    const original = context.document.blocks[owner ?? '']
    const block: TextBlock = { ...original?.type === 'text' ? structuredClone(original) : {}, id: blockId, type: 'text', content: nativeRichTextToProduct(buffer, context, usedListIds) }
    if (block.reveal) { const ids = richNodeIds(block.content); block.reveal.order = block.reveal.order.filter(id => ids.has(id)) }
    next.blocks[blockId] = block
    children.push(blockId)
    register(buffer, blockId, context)
    buffer = []; owner = undefined
  }
  for (const block of native) {
    if (block.type === 'presmiumPage') throw new Error('document-page-nesting')
    if (!isEntity(block, context)) {
      const knownOwner = context.owners.get(block.id)
      if (buffer.length && knownOwner && owner && knownOwner !== owner) flush()
      owner ??= knownOwner
      buffer.push(block)
      continue
    }
    flush()
    const original = context.document.blocks[block.id] ?? (block.type === 'presmiumAtom' || block.type === 'presmiumContainer' ? context.document.blocks[block.props.entityId] : undefined)
    let product: DocumentBlock
    if (block.type === 'presmiumContainer') {
      const children = nativeChildren(block.children, context, next, usedListIds)
      const properties = { ...original?.type === 'container' ? original.properties : {}, ...block.props.title ? { title: block.props.title } : {} }
      if (original?.type === 'container') {
        if (properties.columnWidths) properties.columnWidths = children.map(child => original.properties.columnWidths?.[original.children.indexOf(child)] ?? 1)
        if (properties.tabTitles) properties.tabTitles = children.map(child => original.properties.tabTitles?.[original.children.indexOf(child)] ?? '')
      }
      product = { ...original?.type === 'container' ? structuredClone(original) : {}, id: block.id, type: 'container', layout: block.props.layout, properties, children }
    }
    else if (block.type === 'image') {
      if (original?.type === 'image' && context.baseline.get(block.id) === JSON.stringify(block)) { next.blocks[block.id] = structuredClone(original); children.push(block.id); continue }
      // Native pickers create an empty image first. Persist that intent without
      // inventing an invalid asset. Replacements change this instance's binding.
      const prior = original?.type === 'image' ? original.assetId : undefined
      const assetId = !block.props.url ? undefined : prior && next.assets[prior]?.location === block.props.url ? prior
        : Object.values(next.assets).find(asset => asset.kind === 'image' && asset.location === block.props.url)?.id ?? newId()
      if (assetId && !next.assets[assetId]) next.assets[assetId] = { id: assetId, kind: 'image', location: block.props.url }
      const previousCaption = original?.type === 'image' ? original.caption : undefined
      const caption = plain(previousCaption ?? []) === block.props.caption ? previousCaption : block.props.caption ? [{ type: 'text' as const, text: block.props.caption }] : undefined
      product = { ...original?.type === 'image' ? structuredClone(original) : {}, id: block.id, type: 'image', ...assetId ? { assetId } : {}, alt: block.props.name, ...caption ? { caption } : {}, width: block.props.previewWidth, alignment: block.props.textAlignment }
      if (!assetId) delete product.assetId
      if (!caption) delete product.caption
    } else if (block.type === 'codeBlock') product = { ...original?.type === 'code' ? structuredClone(original) : {}, id: block.id, type: 'code', language: block.props.language, value: nativePlain(block) }
    else {
      if (!original) throw new Error('document-opaque-reference')
      product = structuredClone(original)
      product.id = block.id
      if (product.type === 'component' && (product.children || block.children.length)) product.children = nativeChildren(block.children, context, next, usedListIds)
    }
    next.blocks[product.id] = product
    context.owners.set(block.id, product.id)
    children.push(product.id)
  }
  flush()
  return children
}

/** A plain text transaction keeps the teaching graph and untouched rich nodes by identity. */
function projectTextEdits(blocks: readonly DocumentEditorBlock[], context: DocumentProjection, latest: TeachingDocument): TeachingDocument | undefined {
  const changed: { native: DocumentEditorBlock, serialized: string, owner: TextBlock }[] = []
  const visit = (blocks: readonly DocumentEditorBlock[]): boolean => blocks.every(block => {
    const serialized = JSON.stringify(block)
    if (context.baseline.get(block.id) === serialized) return true
    const owner = latest.blocks[context.owners.get(block.id) ?? '']
    if (block.children.length || (block.type !== 'paragraph' && block.type !== 'heading') || owner?.type !== 'text'
      || !owner.content.some(node => node.id === block.id && (node.type === 'paragraph' || node.type === 'heading'))) return false
    changed.push({ native: block, serialized, owner })
    return true
  })
  if (!visit(blocks)) return undefined
  const next = { ...latest, ...changed.length ? { blocks: { ...latest.blocks } } : {} }
  for (const { native, serialized, owner } of changed) {
    const content = nativeRichTextToProduct([native], context)[0]!
    const current = next.blocks[owner.id] as TextBlock
    next.blocks[owner.id] = { ...current, content: current.content.map(node => node.id === native.id ? content : node) }
    context.rich.set(native.id, { ...context.rich.get(native.id), original: content })
    context.baseline.set(native.id, serialized)
  }
  context.document = next
  return next
}

/** Reconstruct the normalized product tree without visiting or reparsing Markdown. */
export function nativeDocumentToProduct(blocks: readonly DocumentEditorBlock[], context: DocumentProjection, latest = context.document): TeachingDocument {
  const targetStructure = structureOf(blocks, context)
  if (targetStructure === context.structure) {
    const edited = projectTextEdits(blocks, context, latest)
    if (edited) return edited
  }
  if (context.structure && targetStructure !== context.structure) context.structures.set(context.structure, {
    document: structuredClone(latest), rich: new Map(context.rich), owners: new Map(context.owners), pages: new Map(context.pages), baseline: new Map(context.baseline),
  })
  const restored = targetStructure === context.structure ? undefined : context.structures.get(targetStructure)
  if (restored) {
    context.rich = new Map(restored.rich); context.owners = new Map(restored.owners); context.pages = new Map(restored.pages); context.baseline = new Map(restored.baseline)
  }
  const snapshot = restored?.document
  // Source fields are current; a body history snapshot only supplies missing structural entities.
  context.document = snapshot ? structuredClone({ ...latest,
    blocks: { ...snapshot.blocks, ...latest.blocks }, sections: { ...snapshot.sections, ...latest.sections },
  }) : structuredClone(latest)
  if (snapshot) for (const id of snapshot.sectionOrder) {
    if (latest.sections[id]) continue
    const returned = context.document.sections[id]!
    for (const other of Object.values(context.document.sections)) if (other.id !== id) other.stepOrder = other.stepOrder.filter(step => !returned.stepOrder.includes(step))
    for (const step of returned.stepOrder) if (context.document.steps[step]) context.document.steps[step]!.sectionId = id
  }
  const next = structuredClone(context.document)
  next.blocks = {}; next.sections = {}; next.sectionOrder = []
  const usedListIds = new Set<string>()
  let section: Section | undefined, content: DocumentEditorBlock[] = []
  const flush = () => { if (section) { section.children = nativeChildren(content, context, next, usedListIds); next.sections[section.id] = section; next.sectionOrder.push(section.id) }; content = [] }
  for (const block of blocks) {
    if (block.type === 'presmiumPage') {
      flush()
      let sectionId = context.pages.get(block.id) ?? block.props.sectionId
      if (!sectionId || next.sections[sectionId]) sectionId = newId()
      context.pages.set(block.id, sectionId)
      const original = context.document.sections[sectionId]
      section = { ...original ? structuredClone(original) : {}, id: sectionId, title: nativePlain(block), children: [], stepOrder: [...(original?.stepOrder ?? [])], layout: original?.layout ?? { type: 'stack' } }
    } else {
      if (!section) {
        const original = context.document.sections[context.document.sectionOrder[0] ?? '']
        section = original ? structuredClone(original) : { id: newId(), title: next.metadata.title, children: [], stepOrder: [], layout: { type: 'stack' } }
      }
      content.push(block)
    }
  }
  flush()
  if (!next.sectionOrder.length) throw new Error('document-empty')
  // Removing a page boundary merges its teaching sequence into the preceding page.
  let destination = next.sectionOrder[0]!
  for (const sectionId of context.document.sectionOrder) {
    if (next.sections[sectionId]) { destination = sectionId; continue }
    const removed = context.document.sections[sectionId]!
    for (const stepId of removed.stepOrder) {
      if (!next.steps[stepId]) continue
      next.steps[stepId]!.sectionId = destination
      if (!next.sections[destination]!.stepOrder.includes(stepId)) next.sections[destination]!.stepOrder.push(stepId)
    }
    if (next.production.sectionOverrides) delete next.production.sectionOverrides[sectionId]
  }
  const sectionOf = new Map<string, string>()
  const previousSectionOf = new Map<string, string>(), newSteps = new Set<string>()
  const previous = (blockId: string, sectionId: string) => {
    previousSectionOf.set(blockId, sectionId)
    const block = latest.blocks[blockId]
    if (block?.type === 'container' || block?.type === 'component') for (const child of block.children ?? []) previous(child, sectionId)
  }
  for (const section of Object.values(latest.sections)) section.children.forEach(blockId => previous(blockId, section.id))
  const assign = (blockId: string, sectionId: string) => {
    sectionOf.set(blockId, sectionId)
    const block = next.blocks[blockId]
    if (block?.type === 'container' || block?.type === 'component') for (const child of block.children ?? []) assign(child, sectionId)
  }
  for (const section of Object.values(next.sections)) {
    section.children.forEach(blockId => assign(blockId, section.id))
    if (!section.stepOrder.length) {
      const stepId = newId(); section.stepOrder.push(stepId)
      newSteps.add(stepId)
      next.steps[stepId] = { id: stepId, sectionId: section.id, visuals: [], narrationIds: [] }
    }
  }
  for (const step of Object.values(next.steps)) {
    step.visuals = step.visuals.filter(visual => sectionOf.get(visual.blockId) === step.sectionId)
    for (const [blockId, sectionId] of sectionOf) if (sectionId === step.sectionId && (previousSectionOf.get(blockId) !== sectionId || newSteps.has(step.id)) && !step.visuals.some(visual => visual.blockId === blockId)) step.visuals.push({ blockId, visible: true })
  }
  if (snapshot) {
    const returned = new Set(Object.keys(next.blocks).filter(id => !latest.blocks[id]))
    for (const step of Object.values(next.steps)) for (const visual of snapshot.steps[step.id]?.visuals ?? []) {
      if (sectionOf.get(visual.blockId) !== step.sectionId || previousSectionOf.get(visual.blockId) === step.sectionId) continue
      const index = step.visuals.findIndex(value => value.blockId === visual.blockId)
      if (index < 0) step.visuals.push(structuredClone(visual)); else step.visuals[index] = structuredClone(visual)
    }
    for (const id of next.sectionOrder) if (!latest.sections[id] && snapshot.production.sectionOverrides?.[id]) {
      next.production.sectionOverrides ??= {}; next.production.sectionOverrides[id] ??= structuredClone(snapshot.production.sectionOverrides[id]!)
    }
    const cueIds = new Set(Object.values(next.narrations).flatMap(value => value.content.flatMap(node => node.type === 'cue' ? [node.id] : [])))
    for (const narration of Object.values(snapshot.narrations)) {
      const current = next.narrations[narration.id]
      if (!current) continue
      let offset = 0
      for (const node of narration.content) {
        if (node.type === 'text') offset += node.text.length
        else if (node.type === 'pronunciation') offset += node.display.length
        else if (node.target && returned.has(node.target.blockId) && !cueIds.has(node.id)) {
          current.content = insertCue(current.content, structuredClone(node), offset); cueIds.add(node.id)
          if (snapshot.production.cueTimings?.[node.id]) { next.production.cueTimings ??= {}; next.production.cueTimings[node.id] ??= structuredClone(snapshot.production.cueTimings[node.id]!) }
        }
      }
    }
  }
  for (const narration of Object.values(next.narrations)) narration.content = narration.content.filter(node => {
    if (node.type !== 'cue' || !node.target || next.blocks[node.target.blockId]) return true
    if (next.production.cueTimings) delete next.production.cueTimings[node.id]
    return false
  })
  context.document = share(context.document, structuredClone(next)) as TeachingDocument
  context.blockSections = sectionOf
  for (const block of Object.values(context.document.blocks)) if (block.type === 'text') rememberRich(block.content, context)
  context.baseline.clear(); captureRichBaseline(blocks, context)
  rememberDocumentStructure(blocks, context)
  return next
}

/** A restored cue keeps its written offset without replacing later narration text. */
function insertCue(content: NarrationNode[], cue: Extract<NarrationNode, { type: 'cue' }>, offset: number): NarrationNode[] {
  const next = structuredClone(content)
  for (let index = 0; index < next.length; index++) {
    const node = next[index]!
    if (node.type === 'cue') continue
    const length = node.type === 'text' ? node.text.length : node.display.length
    if (offset <= length) {
      if (node.type === 'text') next.splice(index, 1, ...offset ? [{ type: 'text' as const, text: node.text.slice(0, offset) }] : [], cue, ...offset < length ? [{ type: 'text' as const, text: node.text.slice(offset) }] : [])
      else next.splice(index + (offset ? 1 : 0), 0, cue)
      return next
    }
    offset -= length
  }
  next.push(cue); return next
}

export function nativePage(sectionId: string, title: string): DocumentEditorInput {
  return { id: pageId(sectionId), type: 'presmiumPage', props: { sectionId }, content: productInlineToNative([{ type: 'text', text: title }], createRichProjection()) }
}

export function richNodeIds(nodes: readonly RichTextNode[]): Set<string> {
  const ids = new Set<string>()
  const visit = (node: RichTextNode | { id: string, type: string, children?: unknown[] }) => { ids.add(node.id); if ('children' in node) for (const child of node.children ?? []) if (typeof child === 'object' && child && 'id' in child) visit(child as RichTextNode) }
  nodes.forEach(visit)
  return ids
}
