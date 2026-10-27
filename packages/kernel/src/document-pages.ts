import type { ListItemNode, RichTextNode, TableCellNode, TableRowNode, TeachingDocument } from './contracts/document.ts'
import type { DocumentPageDeletionImpact, DocumentPageIds } from './contracts/authoring.ts'
import type { PageDeletePlan } from './contracts/workspace.ts'

export const DOCUMENT_PAGE_DEFAULT_TIMING = { minimumHoldMs: 4000, trailingPauseMs: 500 } as const

/** The native insertion and server preflight reserve the same declared page identities. */
export function allocateDocumentPage(document: TeachingDocument, allocate: () => string): DocumentPageIds {
  const used = documentIds(document)
  for (const id of document.sectionOrder) used.add(`page:${id}`)
  const next = () => {
    const id = allocate()
    if (!id || id.length > 200 || used.has(id) || used.has(`page:${id}`)) throw new Error('page-id-collision')
    used.add(id); return id
  }
  const sectionId = next(); used.add(`page:${sectionId}`)
  return { sectionId, blockId: next(), nodeId: next(), stepId: next() }
}

export function documentPageDefaults({ sectionId, blockId, nodeId, stepId }: DocumentPageIds, title: string) {
  return {
    section: { id: sectionId, title, children: [blockId], stepOrder: [stepId], layout: { type: 'stack' as const } },
    block: { id: blockId, type: 'text' as const, content: [{ id: nodeId, type: 'paragraph' as const, children: [] }] },
    step: { id: stepId, sectionId, visuals: [{ blockId, visible: true }], narrationIds: [] },
    timing: { ...DOCUMENT_PAGE_DEFAULT_TIMING },
  }
}

export function createDocumentPage(source: TeachingDocument, after: string | null, title: string, allocate: () => string): { document: TeachingDocument, ids: DocumentPageIds } {
  if (after !== null && (!source.sections[after] || !source.sectionOrder.includes(after))) throw new Error('page-boundary')
  if (!title.trim()) throw new Error('page-title-required')
  const ids = allocateDocumentPage(source, allocate), page = documentPageDefaults(ids, title.trim()), document = structuredClone(source)
  document.sections[ids.sectionId] = page.section; document.blocks[ids.blockId] = page.block; document.steps[ids.stepId] = page.step
  document.production.stepOverrides[ids.stepId] = page.timing
  document.sectionOrder.splice(after === null ? document.sectionOrder.length : document.sectionOrder.indexOf(after) + 1, 0, ids.sectionId)
  return { document, ids }
}

export function renameDocumentPage(source: TeachingDocument, section: string, title: string): TeachingDocument {
  if (!source.sections[section] || !source.sectionOrder.includes(section)) throw new Error('page-boundary')
  if (!title.trim()) throw new Error('page-title-required')
  const document = structuredClone(source)
  document.sections[section]!.title = title.trim()
  return document
}

export function moveDocumentPage(source: TeachingDocument, section: string, before: string | null): TeachingDocument {
  if (!source.sections[section] || !source.sectionOrder.includes(section) || before !== null && (!source.sections[before] || !source.sectionOrder.includes(before))) throw new Error('page-boundary')
  const document = structuredClone(source)
  if (before !== section) {
    document.sectionOrder = document.sectionOrder.filter(id => id !== section)
    document.sectionOrder.splice(before === null ? document.sectionOrder.length : document.sectionOrder.indexOf(before), 0, section)
  }
  return document
}

export function pageContents(document: TeachingDocument, section: string): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => { if (ids.has(id)) return; ids.add(id); const block = document.blocks[id]; if (block?.type === 'container' || block?.type === 'component') block.children?.forEach(visit) }
  document.sections[section]?.children.forEach(visit)
  return ids
}

/** Deletion only owns declared entities. Opaque plugin data is never interpreted as identity. */
export function pageDeletionImpact(document: TeachingDocument, section: string): DocumentPageDeletionImpact {
  const page = document.sections[section]
  if (!page || !document.sectionOrder.includes(section)) throw new Error('page-boundary')
  const blocks = pageContents(document, section), steps = new Set(page.stepOrder)
  const candidates = new Set(page.stepOrder.flatMap(id => document.steps[id]!.narrationIds))
  const outsideSteps = Object.values(document.steps).filter(step => !steps.has(step.id)), uses = new Map<string, string[]>()
  for (const step of outsideSteps) for (const id of step.narrationIds) { const list = uses.get(id) ?? []; list.push(step.id); uses.set(id, list) }
  const usedElsewhere = new Set(uses.keys())
  const removed = new Set([...candidates].filter(id => !usedElsewhere.has(id))), cues: string[] = []
  const references: DocumentPageDeletionImpact['references'] = []
  for (const [id, narration] of Object.entries(document.narrations)) for (const node of narration.content) if (node.type === 'cue') {
    if (removed.has(id)) cues.push(node.id)
    else if (node.target && blocks.has(node.target.blockId)) references.push({ type: 'cue', narrationId: id, cueId: node.id, blockId: node.target.blockId, stepIds: uses.get(id) ?? [] })
  }
  for (const step of outsideSteps) if (step.inherits && steps.has(step.inherits)) references.push({ type: 'inheritance', stepId: step.id, inheritedStepId: step.inherits })
  const targets = new Set<string>(blocks)
  if (document.sectionOrder.length > 1) targets.add(`page:${section}`)
  const rich = (node: RichTextNode | ListItemNode | TableRowNode | TableCellNode): void => {
    targets.add(node.id)
    switch (node.type) {
      case 'list': case 'listItem': case 'blockquote': case 'table': case 'tableRow': node.children.forEach(rich); break
      case 'extension': node.fallback.forEach(rich); break
    }
  }
  for (const id of blocks) { const block = document.blocks[id]; if (block?.type === 'text') block.content.forEach(rich) }
  return { sectionId: section, retainedEmpty: document.sectionOrder.length === 1, blocks: [...blocks], steps: [...steps], narrations: [...removed], retainedNarrations: [...candidates].filter(id => !removed.has(id)), cues,
    clips: document.production.mediaClips.filter(clip => steps.has(clip.attachment.stepId)).map(clip => clip.id),
    detachedComments: Object.values(document.comments ?? {}).filter(thread => thread.anchor && (targets.has(thread.anchor.from.blockId) || targets.has(thread.anchor.to.blockId))).map(thread => thread.id), references }
}

export function pageDeletion(document: TeachingDocument, directory: string, version: string, section: string): PageDeletePlan {
  const impact = pageDeletionImpact(document, section)
  return { document: directory, section, revision: version, source: { path: `${directory ? `${directory}/` : ''}lecture.json`, version },
    counts: { steps: impact.steps.length, blocks: impact.blocks.length, narration: impact.narrations.length + impact.retainedNarrations.length }, last: impact.retainedEmpty, allowed: !impact.references.length,
    ...impact.references.length ? { reason: 'page-referenced', references: impact.references.map(reference => ({ document: directory, section: reference.type === 'inheritance' ? document.steps[reference.stepId]!.sectionId : reference.stepIds[0] ? document.steps[reference.stepIds[0]]!.sectionId : section, ...reference.type === 'cue' ? { block: reference.blockId } : {} })) } : {} }
}

export function removeDocumentPage(source: TeachingDocument, section: string, allocate: () => string): TeachingDocument {
  const impact = pageDeletionImpact(source, section)
  if (impact.references.length) throw new Error('page-referenced')
  const document = structuredClone(source), page = document.sections[section]!
  for (const id of impact.blocks) delete document.blocks[id]
  for (const id of impact.steps) { delete document.steps[id]; delete document.production.stepOverrides[id] }
  for (const id of impact.narrations) { delete document.narrations[id]; if (document.production.narrationOverrides) delete document.production.narrationOverrides[id] }
  for (const id of impact.cues) if (document.production.cueTimings) delete document.production.cueTimings[id]
  if (document.production.sectionOverrides) delete document.production.sectionOverrides[section]
  const clips = new Set(impact.clips)
  document.production.mediaClips = document.production.mediaClips.filter(clip => !clips.has(clip.id))
  for (const id of impact.detachedComments) delete document.comments![id]!.anchor
  if (!impact.retainedEmpty) { document.sectionOrder = document.sectionOrder.filter(id => id !== section); delete document.sections[section] }
  else {
    const id = allocate()
    if (!id || id.length > 200 || documentIds(source).has(id)) throw new Error('page-id-collision')
    page.children = []; page.stepOrder = [id]; document.steps[id] = { id, sectionId: section, visuals: [], narrationIds: [] }
    document.production.stepOverrides[id] = { ...DOCUMENT_PAGE_DEFAULT_TIMING }
  }
  return document
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
