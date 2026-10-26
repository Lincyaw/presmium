import type { ListItemNode, PageDeletePlan, RichTextNode, TableCellNode, TableRowNode, TeachingDocument } from '@lincyaw/kernel'

export function pageContents(document: TeachingDocument, section: string): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => { if (ids.has(id)) return; ids.add(id); const block = document.blocks[id]; if (block?.type === 'container' || block?.type === 'component') block.children?.forEach(visit) }
  document.sections[section]?.children.forEach(visit)
  return ids
}

/** Copy owned entities and explicit document references; plugin payloads and discussions retain their meaning. */
export function duplicateDocumentPage(source: TeachingDocument, section: string, title: string): { document: TeachingDocument, section: string } {
  const page = source.sections[section]
  if (!page || !source.sectionOrder.includes(section)) throw new Error('page-boundary')
  const document = structuredClone(source), identities = new Map<string, string>()
  const copyId = (id: string) => { let next = identities.get(id); if (!next) { next = crypto.randomUUID(); identities.set(id, next) } return next }
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
  return { document, section: id }
}
export function pageDeletion(document: TeachingDocument, directory: string, version: string, section: string): PageDeletePlan {
  const page = document.sections[section]
  if (!page) throw new Error('document-section-missing')
  const ids = pageContents(document, section), steps = new Set(page.stepOrder)
  const narrations = new Set(page.stepOrder.flatMap(id => document.steps[id]!.narrationIds))
  const references = Object.values(document.steps).filter(step => !steps.has(step.id)).flatMap(step => step.narrationIds.flatMap(id => document.narrations[id]!.content.flatMap(node => node.type === 'cue' && node.target && ids.has(node.target.blockId) ? [{ document: directory, section: step.sectionId, block: node.target.blockId }] : [])))
  const inherited = Object.values(document.steps).some(step => !steps.has(step.id) && step.inherits && steps.has(step.inherits))
  return { document: directory, section, revision: version, source: { path: `${directory ? `${directory}/` : ''}lecture.json`, version }, counts: { steps: steps.size, blocks: ids.size, narration: narrations.size }, last: document.sectionOrder.length === 1, allowed: !references.length && !inherited, ...references.length ? { references } : {}, ...references.length || inherited ? { reason: 'page-referenced' } : {} }
}
export function removeDocumentPage(source: TeachingDocument, section: string): TeachingDocument {
  const document = structuredClone(source), page = document.sections[section]
  if (!page) throw new Error('document-section-missing')
  const removed = pageContents(document, section), steps = new Set(page.stepOrder)
  const candidates = new Set(page.stepOrder.flatMap(id => document.steps[id]!.narrationIds))
  const identities = new Set<string>([...(document.sectionOrder.length > 1 ? [`page:${section}`] : []), ...removed])
  const collect = (value: unknown): void => { if (Array.isArray(value)) value.forEach(collect); else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { if (key === 'id' && typeof child === 'string') identities.add(child); else collect(child) } }
  for (const id of removed) { collect(document.blocks[id]); delete document.blocks[id] }
  for (const id of steps) { delete document.steps[id]; delete document.production.stepOverrides[id] }
  const used = new Set(Object.values(document.steps).flatMap(step => step.narrationIds))
  for (const id of candidates) if (!used.has(id)) { for (const node of document.narrations[id]!.content) if (node.type === 'cue' && document.production.cueTimings) delete document.production.cueTimings[node.id]; delete document.narrations[id]; if (document.production.narrationOverrides) delete document.production.narrationOverrides[id] }
  if (document.production.sectionOverrides) delete document.production.sectionOverrides[section]
  document.production.mediaClips = document.production.mediaClips.filter(clip => !steps.has(clip.attachment.stepId))
  for (const thread of Object.values(document.comments ?? {})) if (thread.anchor && (identities.has(thread.anchor.from.blockId) || identities.has(thread.anchor.to.blockId))) delete thread.anchor
  if (document.sectionOrder.length > 1) { document.sectionOrder = document.sectionOrder.filter(id => id !== section); delete document.sections[section] }
  else { const id = crypto.randomUUID(); page.children = []; page.stepOrder = [id]; document.steps[id] = { id, sectionId: section, visuals: [], narrationIds: [] } }
  return document
}
