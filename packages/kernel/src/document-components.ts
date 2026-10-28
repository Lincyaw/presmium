import { applyPatch, compare } from 'fast-json-patch'
import type { Operation } from 'fast-json-patch'
import { validateDocument } from './document.ts'
import { documentParameterAccess } from './parameters.ts'
import { DOCUMENT_PARAMETER_MAX_CHANGES, DOCUMENT_PARAMETER_MAX_PATH_DEPTH } from './contracts/authoring-actions.ts'
import type { DocumentComponentAction, DocumentComponentEffect, DocumentParameterChange } from './contracts/authoring-actions.ts'
import type { ComponentBlock, Definition, JsonObject, JsonSchema, JsonValue, TeachingDocument, VisualState } from './contracts/document.ts'

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
export function documentComponentSection(document: TeachingDocument, blockId: string): string {
  component(document, blockId)
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
  const sectionId = documentComponentSection(document, blockId), target = stepOf(document, stepId, sectionId), chain: string[] = [], seen = new Set<string>()
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

type ParameterValue = JsonValue | typeof absentParameter
const absentParameter = Symbol('absent-parameter')
/** Annotation checks complement JSON Schema validity; they do not interpret schema branches or references. */
function guardParameterMutation(before: JsonObject, after: JsonObject, beforeSchemas: readonly JsonSchema[], afterSchemas: readonly JsonSchema[], newDefinition = false, changes: readonly DocumentParameterChange[] = [], restoring = false): void {
  let visited = 0
  const location = (path: string[]) => ({ path: path.slice(0, 8).map(part => part.slice(0, 80)), ...path.length > 8 || path.some(part => part.length > 80) ? { pathTruncated: true } : {} })
  const inspect = (schemas: readonly JsonSchema[], value: JsonObject, path: string[], publicRequired: boolean) => {
    let declared = false
    for (const schema of schemas) {
      const access = documentParameterAccess(schema, value, path)
      if (!access.available) return fail(422, 'component-parameter-access-unavailable', { ...location(path), reason: access.reason?.slice(0, 120), next: 'Keep the draft and use an explicitly supported public schema path.' })
      if (access.readOnly) return fail(422, 'component-parameter-read-only', location(path))
      declared ||= access.public
    }
    if (publicRequired && !declared) return fail(422, 'component-parameter-not-public', location(path))
  }
  const check = (left: ParameterValue, right: ParameterValue, path: string[], beforePath = path) => {
    if (left !== absentParameter) inspect(beforeSchemas, before, beforePath, !newDefinition)
    if (right !== absentParameter) inspect(afterSchemas, after, path, true)
    else if (newDefinition) inspect(afterSchemas, after, path, true)
  }
  const itemKeys = (values: JsonValue[]) => values.map(value => JSON.stringify(value))
  const subsequence = (shorter: string[], longer: string[]): number[] | undefined => {
    const matched: number[] = []; let next = 0
    for (let index = 0; index < longer.length && next < shorter.length; index++) if (longer[index] === shorter[next]) { matched.push(index); next++ }
    return next === shorter.length ? matched : undefined
  }
  // Domain set never inserts in the middle: explicit remove/append gives an exact transient index mapping.
  const arrayLineage = (left: JsonValue[], right: JsonValue[], path: string[]) => {
    if (!changes.length || changes.some(change => change.path.length <= path.length && change.path.every((part, index) => path[index] === part))) return
    const relevant = changes.filter(change => path.every((part, index) => change.path[index] === part))
    if (!relevant.length) return
    const mapping = left.map((_, index) => index)
    for (const change of relevant) if (change.path.length === path.length + 1) {
      const index = Number(change.path.at(-1))
      if (!Number.isSafeInteger(index) || index < 0 || index > mapping.length) return
      if (change.op === 'remove') mapping.splice(index, 1)
      else if (index === mapping.length) mapping.push(-1)
    }
    return mapping.length === right.length ? mapping : undefined
  }
  const object = (value: ParameterValue): value is JsonObject | JsonValue[] => value !== absentParameter && value !== null && typeof value === 'object'
  const walk = (left: ParameterValue, right: ParameterValue, path: string[], beforePath = path) => {
    if (left !== absentParameter && right !== absentParameter && same(left, right)) return
    if (++visited > 8192 || path.length > 128) return fail(422, 'component-parameter-access-unavailable', { reason: 'change-complexity-limit', limits: { maxChangedNodes: 8192, maxInspectionDepth: 128 }, next: 'Apply smaller public field changes separately.' })
    check(left, right, path, beforePath)
    if (Array.isArray(left) && Array.isArray(right)) {
      const a = itemKeys(left), b = itemKeys(right)
      // Reordering retains exact complete items, including their unknown and read-only data.
      if (a.length === b.length && same([...a].sort(), [...b].sort())) return
      const retained = subsequence(b, a)
      if (retained) {
        const keep = new Set(retained)
        for (let index = 0; index < left.length; index++) if (!keep.has(index)) inspect(beforeSchemas, before, [...beforePath, String(index)], true)
        return
      }
      const oldItems = subsequence(a, b)
      if (oldItems) {
        const keep = new Set(oldItems)
        for (let index = 0; index < right.length; index++) if (!keep.has(index)) walk(absentParameter, right[index]!, [...path, String(index)], [...beforePath, String(index)])
        return
      }
      const mapping = arrayLineage(left, right, path)
      if (mapping) {
        const retained = new Set(mapping)
        for (let index = 0; index < left.length; index++) if (!retained.has(index)) inspect(beforeSchemas, before, [...beforePath, String(index)], true)
        for (const [index, oldIndex] of mapping.entries()) walk(oldIndex < 0 ? absentParameter : left[oldIndex]!, right[index]!, [...path, String(index)], [...beforePath, String(oldIndex)])
        return
      }
      const oldUnmatched = a.flatMap((value, index) => value === b[index] ? [] : [{ value, index }])
      const newUnmatched = b.flatMap((value, index) => value === a[index] ? [] : [{ value, index }])
      if (!restoring && newUnmatched.some(item => oldUnmatched.some(old => item.value === old.value && item.index !== old.index))) return fail(422, 'component-parameter-array-change-unavailable', { ...location(path), next: 'Apply the exact item reorder and field changes in separate source-bound plans.' })
      for (let index = 0; index < Math.max(left.length, right.length); index++) {
        if (index >= right.length) inspect(beforeSchemas, before, [...beforePath, String(index)], true)
        else walk(index < left.length ? left[index]! : absentParameter, right[index]!, [...path, String(index)], [...beforePath, String(index)])
      }
      return
    }
    if (object(left) || object(right)) {
      for (const key of new Set([...object(left) ? Object.keys(left) : [], ...object(right) ? Object.keys(right) : []])) {
        walk(object(left) && own(left, key) ? (left as JsonObject)[key]! : absentParameter, object(right) && own(right, key) ? (right as JsonObject)[key]! : absentParameter, [...path, key], [...beforePath, key])
      }
    }
  }
  const changed = new Set(compare(before, after).map(operation => unpointer(operation.path)[0]!))
  if (!changed.size) return
  check(before, after, [])
  for (const key of changed) walk(own(before, key) ? before[key]! : absentParameter, own(after, key) ? after[key]! : absentParameter, [key])
}

function componentSchemas(definition: Definition, visual?: VisualState): JsonSchema[] {
  const state = visual?.state ? definition.states.find(state => state.id === visual.state)?.parameterSchema : undefined
  return [definition.parameterSchema, ...state === undefined ? [] : [state]]
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
  const original = component(source, action.blockId), sectionId = documentComponentSection(source, original.id), content = structuredClone(source), block = component(content, original.id)
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
  const beforeDefinition = source.definitions[original.definitionId]!, afterDefinition = content.definitions[block.definitionId]!, newDefinition = original.definitionId !== block.definitionId
  guardParameterMutation(original.parameters, block.parameters, componentSchemas(beforeDefinition), componentSchemas(afterDefinition), newDefinition, 'changes' in action ? action.changes : undefined, action.type === 'component.step-parameters.reset')
  const steps: string[] = [], preserved: string[] = [], materialized: string[] = [], reset: string[] = []
  for (const id of source.sections[sectionId]!.stepOrder) {
    const before = effectiveComponentParameters(source, block.id, id), after = effectiveComponentParameters(content, block.id, id)
    guardParameterMutation(before.parameters, after.parameters, componentSchemas(beforeDefinition, before.visual), componentSchemas(afterDefinition, after.visual), newDefinition, 'changes' in action ? action.changes : undefined, action.type === 'component.step-parameters.reset')
    if (newDefinition || !same(before.parameters, after.parameters)) steps.push(id)
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
