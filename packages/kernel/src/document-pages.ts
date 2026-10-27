import type { ListItemNode, RichTextNode, TableCellNode, TableRowNode, TeachingDocument } from './contracts/document.ts'

export function pageContents(document: TeachingDocument, section: string): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => { if (ids.has(id)) return; ids.add(id); const block = document.blocks[id]; if (block?.type === 'container' || block?.type === 'component') block.children?.forEach(visit) }
  document.sections[section]?.children.forEach(visit)
  return ids
}

/** Copy owned entities and explicit document references; plugin payloads and discussions retain their meaning. */
export function duplicateDocumentPage(source: TeachingDocument, section: string, title: string, allocate: (oldId: string) => string): { document: TeachingDocument, section: string, mapping: Record<string, string> } {
  const page = source.sections[section]
  if (!page || !source.sectionOrder.includes(section)) throw new Error('page-boundary')
  const document = structuredClone(source), identities = new Map<string, string>(), used = documentIds(source)
  const copyId = (id: string) => { let next = identities.get(id); if (!next) { next = allocate(id); if (!next || next.length > 200 || used.has(next)) throw new Error('page-copy-id-collision'); used.add(next); identities.set(id, next) } return next }
  const reference = (id: string) => identities.get(id) ?? id
  const blocks = pageContents(source, section), narrations = new Set(page.stepOrder.flatMap(id => source.steps[id]!.narrationIds))
  type RichEntity = RichTextNode | ListItemNode | TableRowNode | TableCellNode
  const rich = (node: RichEntity): void => {
    node.id = copyId(node.id)
    switch (node.type) {
      case 'list': case 'listItem': case 'blockquote': case 'table': case 'tableRow': node.children.forEach(rich); break
      case 'extension': node.fallback.forEach(rich); break
    }
  }
  const id = copyId(section)
  for (const step of page.stepOrder) copyId(step)
  for (const block of blocks) copyId(block)
  for (const narration of narrations) copyId(narration)
  for (const blockId of blocks) {
    const block = structuredClone(source.blocks[blockId]!)
    block.id = reference(blockId)
    if (block.type === 'text') {
      block.content.forEach(rich)
      if (block.reveal) block.reveal.order = block.reveal.order.map(reference)
    } else if (block.type === 'container' || block.type === 'component') {
      if (block.children) block.children = block.children.map(reference)
    } else if (block.type === 'code') {
      if (block.highlight) block.highlight = Object.fromEntries(Object.entries(block.highlight).map(([step, value]) => [reference(step), value]))
      if (block.origin?.highlightRegions) block.origin.highlightRegions = Object.fromEntries(Object.entries(block.origin.highlightRegions).map(([step, value]) => [reference(step), value]))
      block.variants?.forEach(variant => { variant.id = copyId(variant.id) })
    }
    document.blocks[block.id] = block
  }
  for (const narrationId of narrations) {
    const narration = structuredClone(source.narrations[narrationId]!)
    narration.id = reference(narrationId)
    for (const node of narration.content) if (node.type === 'cue') {
      const old = node.id
      node.id = copyId(old)
      if (node.target) node.target.blockId = reference(node.target.blockId)
      if (document.production.cueTimings?.[old]) document.production.cueTimings[node.id] = structuredClone(document.production.cueTimings[old]!)
    }
    document.narrations[narration.id] = narration
    if (document.production.narrationOverrides?.[narrationId]) document.production.narrationOverrides[narration.id] = structuredClone(document.production.narrationOverrides[narrationId]!)
  }
  for (const stepId of page.stepOrder) {
    const step = structuredClone(source.steps[stepId]!)
    step.id = reference(stepId); step.sectionId = id
    step.visuals.forEach(visual => { visual.blockId = reference(visual.blockId) })
    step.narrationIds = step.narrationIds.map(reference)
    if (step.inherits) step.inherits = reference(step.inherits)
    document.steps[step.id] = step
    if (document.production.stepOverrides[stepId]) document.production.stepOverrides[step.id] = structuredClone(document.production.stepOverrides[stepId]!)
  }
  if (document.production.sectionOverrides?.[section]) document.production.sectionOverrides[id] = structuredClone(document.production.sectionOverrides[section]!)
  for (const clip of source.production.mediaClips) if (page.stepOrder.includes(clip.attachment.stepId)) {
    const copied = structuredClone(clip)
    copied.id = copyId(clip.id); copied.attachment.stepId = reference(clip.attachment.stepId)
    document.production.mediaClips.push(copied)
  }
  document.sections[id] = { ...structuredClone(page), id, title, children: page.children.map(reference), stepOrder: page.stepOrder.map(reference) }
  document.sectionOrder.splice(document.sectionOrder.indexOf(section) + 1, 0, id)
  return { document, section: id, mapping: Object.fromEntries(identities) }
}

/** Collect declared identities only; arbitrary plugin data and discussion metadata are opaque. */
function documentIds(document: TeachingDocument): Set<string> {
  const ids = new Set([document.id, ...Object.keys(document.sections), ...Object.keys(document.blocks), ...Object.keys(document.steps), ...Object.keys(document.narrations), ...Object.keys(document.assets), ...Object.keys(document.definitions)])
  const rich = (node: RichTextNode | ListItemNode | TableRowNode | TableCellNode): void => {
    ids.add(node.id)
    switch (node.type) {
      case 'list': case 'listItem': case 'blockquote': case 'table': case 'tableRow': node.children.forEach(rich); break
      case 'extension': node.fallback.forEach(rich); break
    }
  }
  for (const block of Object.values(document.blocks)) {
    if (block.type === 'text') block.content.forEach(rich)
    else if (block.type === 'code') block.variants?.forEach(variant => ids.add(variant.id))
  }
  for (const narration of Object.values(document.narrations)) for (const node of narration.content) if (node.type === 'cue') ids.add(node.id)
  for (const clip of document.production.mediaClips) ids.add(clip.id)
  for (const thread of Object.values(document.comments ?? {})) { ids.add(thread.id); for (const comment of thread.comments) { ids.add(comment.id); comment.content?.forEach(rich) } }
  return ids
}
