import { pageContents } from '@lincyaw/kernel'
import type { PageDeletePlan, TeachingDocument } from '@lincyaw/kernel'

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
  else {
    const id = crypto.randomUUID(); page.children = []; page.stepOrder = [id]; document.steps[id] = { id, sectionId: section, visuals: [], narrationIds: [] }
    document.production.stepOverrides[id] = { minimumHoldMs: 4000, trailingPauseMs: 500 }
  }
  return document
}
