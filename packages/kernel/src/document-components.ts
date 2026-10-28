import { applyPatch, compare } from 'fast-json-patch'
import type { Operation } from 'fast-json-patch'
import { validateDocument } from './document.ts'
import { DOCUMENT_PARAMETER_MAX_CHANGES, DOCUMENT_PARAMETER_MAX_PATH_DEPTH } from './contracts/authoring-actions.ts'
import type { DocumentComponentAction, DocumentComponentEffect, DocumentParameterChange } from './contracts/authoring-actions.ts'
import type { ComponentBlock, JsonObject, JsonValue, TeachingDocument, VisualState } from './contracts/document.ts'

export class DocumentComponentError extends Error {
  readonly status: number
  readonly detail?: Record<string, unknown>
  constructor(status: number, code: string, detail?: Record<string, unknown>) { super(code); this.status = status; this.detail = detail }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const own = (value: object, key: string) => Object.hasOwn(value, key)
const fail = (status: number, code: string, detail?: Record<string, unknown>): never => { throw new DocumentComponentError(status, code, detail) }
const pointer = (path: readonly string[]) => '/' + path.map(key => key.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')
const unpointer = (path: string) => path.slice(1).split('/').map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'))
function component(document: TeachingDocument, id: string): ComponentBlock {
  const block = own(document.blocks, id) ? document.blocks[id] : undefined
  if (!block) return fail(404, 'component-block-missing', { blockId: id })
  if (block.type !== 'component') return fail(422, 'component-block-type', { blockId: id })
  return block
}
function sectionOf(document: TeachingDocument, blockId: string): string {
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
  return fail(422, 'component-block-owner-missing', { blockId })
}
function stepOf(document: TeachingDocument, stepId: string, sectionId: string) {
  const step = own(document.steps, stepId) ? document.steps[stepId] : undefined
  if (!step) return fail(404, 'component-step-missing', { stepId })
  if (step.sectionId !== sectionId) return fail(422, 'component-step-owner', { stepId, sectionId })
  return step
}

/** Resolve the canonical shallow overlays, including all stable-step ancestors; no runtime snapshot is read. */
export function effectiveComponentParameters(document: TeachingDocument, blockId: string, stepId?: string): { parameters: JsonObject, visual?: VisualState, ownParameters?: JsonObject } {
  const block = component(document, blockId)
  if (stepId === undefined) return { parameters: structuredClone(block.parameters) }
  const sectionId = sectionOf(document, blockId), target = stepOf(document, stepId, sectionId), chain: string[] = [], seen = new Set<string>()
  let id: string | undefined = stepId
  while (id !== undefined) {
    if (seen.has(id)) return fail(422, 'component-step-cycle', { stepId })
    seen.add(id); chain.unshift(id); id = stepOf(document, id, sectionId).inherits
  }
  let visual: VisualState | undefined
  for (const id of chain) {
    const value = document.steps[id]!.visuals.find(value => value.blockId === blockId)
    if (value) visual = { ...visual, ...structuredClone(value), parameters: { ...visual?.parameters, ...value.parameters } }
  }
  const ownParameters = target.visuals.find(value => value.blockId === blockId)?.parameters
  return { parameters: { ...structuredClone(block.parameters), ...structuredClone(visual?.parameters ?? {}) }, ...visual ? { visual } : {}, ...ownParameters !== undefined ? { ownParameters: structuredClone(ownParameters) } : {} }
}

/** Validate domain parameter paths, then delegate actual object/array mutation to the public RFC6902 library. */
function patchParameters(source: JsonObject, changes: readonly DocumentParameterChange[]): JsonObject {
  if (!changes.length || changes.length > DOCUMENT_PARAMETER_MAX_CHANGES) return fail(422, 'component-parameter-change-limit', { limits: { maxChanges: DOCUMENT_PARAMETER_MAX_CHANGES } })
  const value = structuredClone(source)
  for (const [index, change] of changes.entries()) {
    const path = change.path
    if (!path.length || path.length > DOCUMENT_PARAMETER_MAX_PATH_DEPTH || path.some(key => typeof key !== 'string' || key.length > 200 || key === '__proto__')) return fail(422, 'component-parameter-path-invalid', { index, limits: { maxPathDepth: DOCUMENT_PARAMETER_MAX_PATH_DEPTH, maxSegmentChars: 200 } })
    let parent: JsonValue = value
    for (const key of path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !own(parent, key) || Array.isArray(parent) && !/^(0|[1-9][0-9]*)$/.test(key)) return fail(404, 'component-parameter-path-missing', { index, path })
      parent = (parent as JsonObject)[key]!
    }
    const key = path.at(-1)!
    if (!parent || typeof parent !== 'object') return fail(422, 'component-parameter-parent-type', { index, path })
    if (Array.isArray(parent) && (!/^(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) > parent.length)) return fail(422, 'component-parameter-array-index', { index, path })
    if (change.op === 'remove' && !own(parent, key)) return fail(404, 'component-parameter-path-missing', { index, path })
    const operation: Operation = change.op === 'remove' ? { op: 'remove', path: pointer(path) }
      : { op: Array.isArray(parent) && own(parent, key) ? 'replace' : 'add', path: pointer(path), value: structuredClone(change.value) }
    try { applyPatch(value, [operation], true, true, true) }
    catch (error) { return fail(422, 'component-parameter-path-invalid', { index, path, reason: error instanceof Error ? error.name.slice(0, 80) : 'invalid-patch' }) }
  }
  return value
}

/** Diff only changed parameter values; unchanged opaque or large fields never become request arguments. */
export function createDocumentParameterChanges(before: JsonObject, after: JsonObject): DocumentParameterChange[] {
  const changes: DocumentParameterChange[] = compare(before, after).map(operation => {
    if (operation.op === 'remove') return { op: 'remove', path: unpointer(operation.path) }
    if (operation.op === 'add' || operation.op === 'replace') return { op: 'set', path: unpointer(operation.path), value: structuredClone(operation.value) as JsonValue }
    return fail(422, 'component-parameter-diff-unavailable')
  })
  if (!changes.length) return []
  if (changes.length <= DOCUMENT_PARAMETER_MAX_CHANGES && same(patchParameters(before, changes), after)) return changes
  // A compare implementation may express array insertion differently from this domain's set semantics.
  // Replacing only the affected top-level fields remains exact and is still subject to the request budget.
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => !same(before[key], after[key])).map(key => own(after, key)
    ? { op: 'set' as const, path: [key], value: structuredClone(after[key]!) } : { op: 'remove' as const, path: [key] })
  if (fields.length > DOCUMENT_PARAMETER_MAX_CHANGES) return fail(422, 'component-parameter-change-limit', { limits: { maxChanges: DOCUMENT_PARAMETER_MAX_CHANGES } })
  return fields
}

/** One source-bound component edit. Definition implementations and every unrelated authored field stay shared. */
export function applyDocumentComponentAction(source: TeachingDocument, action: DocumentComponentAction): { content: TeachingDocument, effect: DocumentComponentEffect } {
  const original = component(source, action.blockId), sectionId = sectionOf(source, original.id), content = structuredClone(source), block = component(content, original.id)
  const stepId = action.type === 'component.step-parameters.patch' || action.type === 'component.step-parameters.reset' ? action.stepId : undefined
  if (action.type === 'component.parameters.patch') block.parameters = patchParameters(block.parameters, action.changes)
  else if (action.type === 'component.definition.use') {
    if (!own(content.definitions, action.definitionId)) return fail(404, 'component-definition-missing', { definitionId: action.definitionId })
    block.definitionId = action.definitionId
    if (action.changes?.length) block.parameters = patchParameters(block.parameters, action.changes)
  } else {
    const step = stepOf(content, action.stepId, sectionId), ownVisual = step.visuals.find(value => value.blockId === block.id)
    if (action.type === 'component.step-parameters.reset') {
      if (ownVisual) delete ownVisual.parameters
    } else {
      const effective = effectiveComponentParameters(source, block.id, action.stepId), patched = patchParameters(effective.parameters, action.changes)
      const local = structuredClone(ownVisual?.parameters ?? {}), keys = new Set(action.changes.map(change => change.path[0]!))
      const inherited = structuredClone(source), inheritedVisual = inherited.steps[action.stepId]!.visuals.find(value => value.blockId === block.id)
      if (inheritedVisual) delete inheritedVisual.parameters
      const lower = effectiveComponentParameters(inherited, block.id, action.stepId).parameters
      for (const key of keys) {
        if (!own(patched, key)) {
          if (own(lower, key)) return fail(422, 'component-parameter-inherited-removal-unavailable', { path: [key], next: 'Reset the current parameter override to restore inheritance, or set a schema-valid value.' })
          delete local[key]
        } else Object.defineProperty(local, key, { value: structuredClone(patched[key]), configurable: true, enumerable: true, writable: true })
      }
      if (ownVisual) ownVisual.parameters = local
      else step.visuals.push({ blockId: block.id, visible: effective.visual?.visible ?? false, parameters: local })
    }
  }
  const checked = validateDocument(content)
  if (!checked.document) return fail(422, 'component-parameters-invalid', { issueCount: checked.issues.length, issues: checked.issues.slice(0, 3).map(issue => ({ code: issue.code.slice(0, 64), path: issue.path.slice(0, 160), message: issue.message.slice(0, 160), severity: issue.severity })) })
  const steps: string[] = [], preserved: string[] = [], materialized: string[] = [], reset: string[] = []
  for (const id of source.sections[sectionId]!.stepOrder) {
    const before = effectiveComponentParameters(source, block.id, id), after = effectiveComponentParameters(content, block.id, id)
    if (block.definitionId !== original.definitionId || !same(before.parameters, after.parameters)) steps.push(id)
    if (before.ownParameters !== undefined && same(before.ownParameters, after.ownParameters)) preserved.push(id)
    else if (after.ownParameters !== undefined) materialized.push(id)
    else if (before.ownParameters !== undefined) reset.push(id)
  }
  const changed = !same(source, content)
  const references = (definitionId: string) => Object.values(source.blocks).filter(value => value.type === 'component' && value.definitionId === definitionId).map(value => value.id)
  return { content, effect: { blockId: block.id, sectionId, layer: action.type === 'component.definition.use' ? 'definition' : stepId ? 'step' : 'base', ...stepId ? { stepId } : {}, definitionId: block.definitionId, ...block.definitionId !== original.definitionId ? { previousDefinitionId: original.definitionId } : {}, changed,
    paths: 'changes' in action ? (action.changes ?? []).map(change => [...change.path]) : [], affected: { blocks: changed ? [block.id] : [], steps, pages: changed ? [sectionId] : [] }, overrides: { preserved, materialized, reset },
    references: { before: references(original.definitionId), after: Object.values(content.blocks).filter(value => value.type === 'component' && value.definitionId === block.definitionId).map(value => value.id) } } }
}
