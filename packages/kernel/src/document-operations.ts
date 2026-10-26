import type { DocumentBlock, DocumentEditOperation, TeachingDocument } from './contracts/document.ts'

/** Operations describe author intent; the caller validates the resulting complete document before committing it. */
export function applyDocumentOperations(source: TeachingDocument, operations: readonly DocumentEditOperation[]): TeachingDocument {
  if (!operations.length || operations.length > 1000) throw new Error('document-operation-count')
  const document = structuredClone(source)
  const block = (id: string): DocumentBlock => {
    if (!Object.hasOwn(document.blocks, id)) throw new Error('document-block-missing')
    return document.blocks[id]!
  }
  const section = (id: string) => {
    if (!Object.hasOwn(document.sections, id)) throw new Error('document-section-missing')
    return document.sections[id]!
  }
  const step = (id: string) => {
    if (!Object.hasOwn(document.steps, id)) throw new Error('document-step-missing')
    return document.steps[id]!
  }
  const insert = (items: string[], index: number, id: string) => {
    if (!Number.isInteger(index) || index < 0 || index > items.length || items.includes(id)) throw new Error('document-order-invalid')
    items.splice(index, 0, id)
  }
  const descendants = (id: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(id)) throw new Error('document-tree-cycle')
    seen.add(id)
    const value = block(id)
    if (value.type === 'container' || value.type === 'component') for (const child of value.children ?? []) descendants(child, seen)
    return seen
  }
  const children = (sectionId: string, parentId?: string): string[] => {
    const owner = section(sectionId)
    if (parentId === undefined) return owner.children
    const parent = block(parentId)
    if (parent.type !== 'container' || !owner.children.some(id => descendants(id).has(parentId))) throw new Error('document-parent-invalid')
    return parent.children
  }
  const detach = (id: string) => {
    const parents = [
      ...Object.values(document.sections).map(value => value.children),
      ...Object.values(document.blocks).flatMap(value => value.type === 'container' || value.type === 'component' && value.children ? [value.children!] : []),
    ].filter(items => items.includes(id))
    if (parents.length !== 1) throw new Error('document-parent-invalid')
    parents[0]!.splice(parents[0]!.indexOf(id), 1)
  }
  const put = <T>(into: Record<string, T>, id: string, value: T) => {
    if (!id || ['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error('document-id-invalid')
    Object.defineProperty(into, id, { value: structuredClone(value), enumerable: true, configurable: true, writable: true })
  }
  for (const operation of operations) {
    switch (operation.type) {
      case 'insertBlock': {
        if (Object.hasOwn(document.blocks, operation.block.id)) throw new Error('document-id-repeated')
        const list = children(operation.sectionId, operation.parentId)
        insert(list, operation.index, operation.block.id)
        put(document.blocks, operation.block.id, operation.block)
        // New document content is visible by default. Later author operations
        // may explicitly change its teaching states in this same transaction.
        for (const id of section(operation.sectionId).stepOrder) step(id).visuals.push({ blockId: operation.block.id, visible: true })
        break
      }
      case 'moveBlock': {
        const moved = descendants(operation.blockId)
        if (operation.parentId && moved.has(operation.parentId)) throw new Error('document-tree-cycle')
        const list = children(operation.sectionId, operation.parentId)
        detach(operation.blockId)
        insert(list, operation.index, operation.blockId)
        const targetSteps = new Set(section(operation.sectionId).stepOrder)
        for (const value of Object.values(document.steps)) {
          if (!targetSteps.has(value.id)) value.visuals = value.visuals.filter(visual => !moved.has(visual.blockId))
          else for (const id of moved) if (!value.visuals.some(visual => visual.blockId === id)) value.visuals.push({ blockId: id, visible: true })
        }
        break
      }
      case 'deleteBlock': {
        const removed = descendants(operation.blockId)
        for (const narration of Object.values(document.narrations)) if (narration.content.some(node => node.type === 'cue' && node.target && removed.has(node.target.blockId))) throw new Error('document-block-referenced-by-cue')
        const identities = new Set<string>(removed)
        const visit = (value: unknown): void => {
          if (Array.isArray(value)) { value.forEach(visit); return }
          if (!value || typeof value !== 'object') return
          for (const [key, child] of Object.entries(value)) { if (key === 'id' && typeof child === 'string') identities.add(child); else visit(child) }
        }
        for (const id of removed) visit(block(id))
        // A deleted range becomes an unanchored thread; its discussion survives.
        for (const thread of Object.values(document.comments ?? {})) if (thread.anchor && (identities.has(thread.anchor.from.blockId) || identities.has(thread.anchor.to.blockId))) delete thread.anchor
        detach(operation.blockId)
        for (const id of removed) delete document.blocks[id]
        for (const value of Object.values(document.steps)) value.visuals = value.visuals.filter(visual => !removed.has(visual.blockId))
        break
      }
      case 'updateText': {
        const value = block(operation.blockId)
        if (value.type !== 'text') throw new Error('document-block-type')
        value.content = structuredClone(operation.content)
        break
      }
      case 'updateSection': {
        const value = section(operation.sectionId)
        if (operation.title !== undefined) value.title = operation.title
        if (operation.layout !== undefined) value.layout = structuredClone(operation.layout)
        break
      }
      case 'setStepState': {
        const value = step(operation.stepId)
        value.visuals = structuredClone(operation.visuals)
        if (operation.inherits !== undefined) value.inherits = operation.inherits
        else delete value.inherits
        break
      }
      case 'setNarration': {
        put(document.narrations, operation.narration.id, operation.narration)
        if (operation.stepId) {
          const value = step(operation.stepId)
          if (!value.narrationIds.includes(operation.narration.id)) insert(value.narrationIds, operation.index ?? value.narrationIds.length, operation.narration.id)
        }
        break
      }
      case 'setTiming':
        if (operation.stepId && operation.sectionId) throw new Error('document-timing-scope')
        if (operation.stepId) { step(operation.stepId); put(document.production.stepOverrides, operation.stepId, operation.value) }
        else if (operation.sectionId) { section(operation.sectionId); document.production.sectionOverrides ??= {}; put(document.production.sectionOverrides, operation.sectionId, operation.value) }
        else document.production.defaults = structuredClone(operation.value)
        break
      case 'replaceAsset':
        if (!Object.hasOwn(document.assets, operation.asset.id)) throw new Error('document-asset-missing')
        put(document.assets, operation.asset.id, operation.asset)
        break
      default: throw new Error('document-operation-unsupported')
    }
  }
  return document
}
