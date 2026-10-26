import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_JSON_SCHEMA } from './document-schema.ts'
import { isRecord } from './errors.ts'
import type { DocumentIssue, DocumentValidation, RichTextNode, TeachingDocument } from './contracts/document.ts'

export { DOCUMENT_JSON_SCHEMA } from './document-schema.ts'
export { DOCUMENT_ENTRY, DOCUMENT_SCHEMA_VERSION } from './contracts/document.ts'

const structural = new Validator(DOCUMENT_JSON_SCHEMA, '2020-12', false)
const escape = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1')
const at = (path: string, key: string | number) => `${path}/${escape(String(key))}`
const own = (table: object, key: string) => Object.hasOwn(table, key)

/** The same structural and semantic checks serve agent changes, native editing and compilation. */
export function validateDocument(value: unknown): DocumentValidation {
  const issues: DocumentIssue[] = []
  const issue = (path: string, code: string, message: string, severity: DocumentIssue['severity'] = 'error') => { issues.push({ path, code, message, severity }) }
  const active = new WeakSet<object>()
  let nodes = 0
  const json = (item: unknown, path: string, depth = 0): boolean => {
    if (++nodes > 1_000_000 || depth > 128) { issue(path, 'json.limit', 'The document exceeds the supported JSON size or nesting limit.'); return false }
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return true
    if (typeof item === 'number') { if (Number.isFinite(item)) return true; issue(path, 'json.number', 'JSON numbers must be finite.'); return false }
    if (typeof item !== 'object') { issue(path, 'json.value', 'A document contains only JSON values.'); return false }
    if (active.has(item)) { issue(path, 'json.cycle', 'A JSON value cannot contain an object cycle.'); return false }
    if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) { issue(path, 'json.object', 'A JSON object cannot have a custom object prototype.'); return false }
    active.add(item)
    const valid = Object.entries(item).every(([key, child]) => json(child, at(path, key), depth + 1))
    active.delete(item)
    return valid
  }
  if (!json(value, '')) return { issues }
  let checked
  try { checked = structural.validate(value) }
  catch (error) { issue('', 'schema.invalid', error instanceof Error ? error.message : 'Document schema validation failed.'); return { issues } }
  if (!checked.valid) {
    for (const error of checked.errors.slice(0, 100)) issue(error.instanceLocation.replace(/^#/, ''), `schema.${error.keyword}`, error.error)
    return { issues }
  }
  const doc = value as TeachingDocument
  const ids = new Map<string, string>()
  const identify = (id: string, path: string) => {
    const prior = ids.get(id)
    if (prior !== undefined) issue(path, 'id.duplicate', `ID ${id} is already used at ${prior}.`)
    else ids.set(id, path)
  }
  identify(doc.id, '/id')
  for (const name of ['sections', 'blocks', 'steps', 'narrations', 'assets', 'definitions'] as const) {
    for (const [key, entity] of Object.entries(doc[name])) {
      const path = at(`/${name}`, key)
      if (entity.id !== key) issue(`${path}/id`, 'id.key', 'An entity ID must match its map key.')
      identify(entity.id, `${path}/id`)
    }
  }
  const reference = (table: object, id: string, path: string, kind: string): boolean => {
    if (own(table, id)) return true
    issue(path, 'reference.missing', `Unknown ${kind} ${id}.`)
    return false
  }
  for (const [index, id] of doc.sectionOrder.entries()) reference(doc.sections, id, `/sectionOrder/${index}`, 'section')
  for (const id of Object.keys(doc.sections)) if (!doc.sectionOrder.includes(id)) issue(at('/sections', id), 'section.order', 'Every section must appear once in sectionOrder.')
  const parents = new Map<string, string>()
  const sectionOf = new Map<string, string>()
  const visiting = new Set<string>()
  const visit = (id: string, path: string, section: string) => {
    if (!reference(doc.blocks, id, path, 'block')) return
    if (visiting.has(id)) { issue(path, 'block.cycle', 'Block ownership cannot contain a cycle.'); return }
    if (parents.has(id)) { issue(path, 'block.parent', `Block ${id} already belongs to ${parents.get(id)}.`); return }
    parents.set(id, path); sectionOf.set(id, section); visiting.add(id)
    const block = doc.blocks[id]!
    if (block.type === 'container' || block.type === 'component') for (const [index, child] of (block.children ?? []).entries()) visit(child, at(at('/blocks', id), `children`) + `/${index}`, section)
    visiting.delete(id)
  }
  for (const [id, section] of Object.entries(doc.sections)) for (const [index, child] of section.children.entries()) visit(child, at('/sections', id) + `/children/${index}`, id)
  for (const id of Object.keys(doc.blocks)) if (!parents.has(id)) issue(at('/blocks', id), 'block.orphan', 'Every content block must have one section or container parent.')
  const richIds = new Map<string, Set<string>>()
  const rich = (node: RichTextNode | { id: string, type: string, children?: unknown[] }, path: string, collected: Set<string>) => {
    identify(node.id, `${path}/id`); collected.add(node.id)
    if (node.type === 'table') {
      const table = node as Extract<RichTextNode, { type: 'table' }>
      if ((table.headerRows ?? 0) > table.children.length) issue(`${path}/headerRows`, 'table.header', 'Header rows cannot exceed table rows.')
      const widths = table.children.map(row => row.children.reduce((sum, cell) => sum + (cell.colspan ?? 1), 0))
      if (table.headerColumns !== undefined && widths.some(width => table.headerColumns! > width)) issue(`${path}/headerColumns`, 'table.header', 'Header columns cannot exceed table columns.')
      if (table.columnWidths && widths.some(width => width !== table.columnWidths!.length)) issue(`${path}/columnWidths`, 'table.widths', 'Column widths must match the logical table columns.')
    }
    if ('children' in node && Array.isArray(node.children)) for (const [index, child] of node.children.entries()) if (isRecord(child) && typeof child.id === 'string') rich(child as unknown as RichTextNode, `${path}/children/${index}`, collected)
    if (node.type === 'extension' && 'fallback' in node && Array.isArray(node.fallback)) node.fallback.forEach((child, index) => rich(child as RichTextNode, `${path}/fallback/${index}`, collected))
  }
  const schema = (value: JsonSchemaLike, parameters: unknown, path: string) => {
    try {
      const result = new Validator(value as Schema, '2020-12', false).validate(parameters)
      if (!result.valid) for (const error of result.errors.slice(0, 10)) issue(path + error.instanceLocation.replace(/^#/, ''), 'parameters.schema', error.error)
    } catch (error) { issue(path, 'parameters.schema-unavailable', error instanceof Error ? error.message : 'This parameter schema cannot be validated.') }
  }
  for (const [id, block] of Object.entries(doc.blocks)) {
    const path = at('/blocks', id)
    if (block.type === 'text') {
      const collected = new Set<string>(); richIds.set(id, collected)
      block.content.forEach((node, index) => rich(node, `${path}/content/${index}`, collected))
      for (const [index, item] of (block.reveal?.order ?? []).entries()) if (!collected.has(item)) issue(`${path}/reveal/order/${index}`, 'reveal.target', 'Reveal items must name rich-text nodes of this block.')
    } else if (block.type === 'image') {
      if (reference(doc.assets, block.assetId, `${path}/assetId`, 'asset') && doc.assets[block.assetId]!.kind !== 'image') issue(`${path}/assetId`, 'asset.kind', 'An image block requires an image asset.')
    } else if (block.type === 'component') {
      if (reference(doc.definitions, block.definitionId, `${path}/definitionId`, 'definition')) schema(doc.definitions[block.definitionId]!.parameterSchema, block.parameters, `${path}/parameters`)
    } else if (block.type === 'code') {
      for (const step of Object.keys(block.highlight ?? {})) reference(doc.steps, step, at(`${path}/highlight`, step), 'step')
      for (const [index, variant] of (block.variants ?? []).entries()) identify(variant.id, `${path}/variants/${index}/id`)
    } else if (block.type === 'container') {
      if (block.properties.columnWidths && block.properties.columnWidths.length !== block.children.length) issue(`${path}/properties/columnWidths`, 'container.columns', 'Column widths must match the child count.')
      if (block.layout === 'tabs' && block.properties.tabTitles && block.properties.tabTitles.length !== block.children.length) issue(`${path}/properties/tabTitles`, 'container.tabs', 'Tab titles must match the child count.')
    }
  }
  for (const [id, definition] of Object.entries(doc.definitions)) {
    const states = new Set<string>()
    for (const [index, state] of definition.states.entries()) {
      if (states.has(state.id)) issue(at('/definitions', id) + `/states/${index}/id`, 'state.duplicate', 'Definition state IDs must be unique within the definition.')
      states.add(state.id)
    }
  }
  const effectiveVisuals = (id: string, visiting = new Set<string>()): Map<string, TeachingDocument['steps'][string]['visuals'][number]> => {
    if (visiting.has(id) || !own(doc.steps, id)) return new Map()
    visiting.add(id)
    const step = doc.steps[id]!
    const result = step.inherits ? effectiveVisuals(step.inherits, visiting) : new Map<string, TeachingDocument['steps'][string]['visuals'][number]>()
    for (const visual of step.visuals) result.set(visual.blockId, { ...result.get(visual.blockId), ...visual, parameters: { ...result.get(visual.blockId)?.parameters, ...visual.parameters } })
    return result
  }
  const orderedSteps = new Set<string>()
  for (const [id, section] of Object.entries(doc.sections)) for (const [index, stepId] of section.stepOrder.entries()) {
    const path = at('/sections', id) + `/stepOrder/${index}`
    if (orderedSteps.has(stepId)) issue(path, 'step.owner', 'A step belongs to one section order.')
    orderedSteps.add(stepId)
    if (reference(doc.steps, stepId, path, 'step') && doc.steps[stepId]!.sectionId !== id) issue(path, 'step.section', 'A step must belong to the section that orders it.')
  }
  for (const [id, step] of Object.entries(doc.steps)) {
    const path = at('/steps', id)
    if (!orderedSteps.has(id)) issue(path, 'step.orphan', 'Every step must appear in its section stepOrder.')
    reference(doc.sections, step.sectionId, `${path}/sectionId`, 'section')
    const visuals = new Set<string>()
    for (const [index, visual] of step.visuals.entries()) {
      const location = `${path}/visuals/${index}`
      if (visuals.has(visual.blockId)) issue(`${location}/blockId`, 'visual.duplicate', 'A step has one override per block.')
      visuals.add(visual.blockId)
      if (!reference(doc.blocks, visual.blockId, `${location}/blockId`, 'block')) continue
      if (sectionOf.get(visual.blockId) !== step.sectionId) issue(`${location}/blockId`, 'visual.section', 'Visual state must target a block owned by the same section.')
      const actual = effectiveVisuals(id).get(visual.blockId)!
      const block = doc.blocks[visual.blockId]!
      if (block.type === 'component') {
        const definition = doc.definitions[block.definitionId]
        if (definition) {
          if (actual.parameters) schema(definition.parameterSchema, { ...block.parameters, ...actual.parameters }, `${location}/parameters`)
          const state = actual.state === undefined ? undefined : definition.states.find(state => state.id === actual.state)
          if (actual.state !== undefined && !state) issue(`${location}/state`, 'state.missing', 'The component definition does not declare this state.')
          if (state?.parameterSchema) schema(state.parameterSchema, { ...block.parameters, ...actual.parameters }, `${location}/parameters`)
        }
      } else if (visual.state !== undefined) issue(`${location}/state`, 'state.unsupported', 'Named animation states require a component definition.')
    }
    for (const [index, narration] of step.narrationIds.entries()) reference(doc.narrations, narration, `${path}/narrationIds/${index}`, 'narration')
    const seen = new Set<string>([id]); let inherited = step.inherits
    while (inherited !== undefined) {
      if (seen.has(inherited)) { issue(`${path}/inherits`, 'step.cycle', 'Step inheritance cannot contain a cycle.'); break }
      seen.add(inherited)
      if (!reference(doc.steps, inherited, `${path}/inherits`, 'step')) break
      if (doc.steps[inherited]!.sectionId !== step.sectionId) { issue(`${path}/inherits`, 'step.section', 'Inherited steps must belong to the same section.'); break }
      inherited = doc.steps[inherited]!.inherits
    }
  }
  const cues = new Set<string>()
  for (const [id, narration] of Object.entries(doc.narrations)) for (const [index, node] of narration.content.entries()) if (node.type === 'cue') {
    const path = at('/narrations', id) + `/content/${index}`
    identify(node.id, `${path}/id`); cues.add(node.id)
    if (node.target) reference(doc.blocks, node.target.blockId, `${path}/target/blockId`, 'block')
    if (node.parameters && ['pauseMs', 'durationMs', 'delayMs'].some(key => own(node.parameters!, key))) issue(`${path}/parameters`, 'production.owner', 'Cue timing belongs to production.cueTimings.')
  }
  const voice = (production: TeachingDocument['production']['defaults'], path: string) => {
    const source = production.voiceSource
    if (source?.type === 'recording' && reference(doc.assets, source.assetId, `${path}/voiceSource/assetId`, 'asset') && !['audio', 'video'].includes(doc.assets[source.assetId]!.kind)) issue(`${path}/voiceSource/assetId`, 'asset.kind', 'Recorded speech requires audio or video.')
  }
  voice(doc.production.defaults, '/production/defaults')
  for (const [id, override] of Object.entries(doc.production.sectionOverrides ?? {})) { reference(doc.sections, id, at('/production/sectionOverrides', id), 'section'); voice(override, at('/production/sectionOverrides', id)) }
  for (const [id, override] of Object.entries(doc.production.stepOverrides)) { reference(doc.steps, id, at('/production/stepOverrides', id), 'step'); voice(override, at('/production/stepOverrides', id)) }
  for (const id of Object.keys(doc.production.narrationOverrides ?? {})) reference(doc.narrations, id, at('/production/narrationOverrides', id), 'narration')
  for (const id of Object.keys(doc.production.cueTimings ?? {})) if (!cues.has(id)) issue(at('/production/cueTimings', id), 'cue.missing', 'Cue timing must reference an authored narration cue.')
  for (const [index, clip] of doc.production.mediaClips.entries()) {
    const path = `/production/mediaClips/${index}`
    identify(clip.id, `${path}/id`)
    if (reference(doc.assets, clip.assetId, `${path}/assetId`, 'asset') && !['audio', 'video'].includes(doc.assets[clip.assetId]!.kind)) issue(`${path}/assetId`, 'asset.kind', 'A media clip requires audio or video.')
    reference(doc.steps, clip.attachment.stepId, `${path}/attachment/stepId`, 'step')
    if (clip.sourceRange.endMs <= clip.sourceRange.startMs) issue(`${path}/sourceRange`, 'media.range', 'A media range must end after it starts.')
  }
  const lecture = doc.metadata.renderers?.lecture
  if (lecture && ['voice', 'gap', 'script'].some(key => own(lecture, key))) issue('/metadata/renderers/lecture', 'production.owner', 'Voice, narration sources and playback timing belong only to production and narration entities.')
  const textTargets = new Set([...richIds.values()].flatMap(values => [...values]))
  for (const id of doc.sectionOrder) textTargets.add(`page:${id}`)
  for (const [id, thread] of Object.entries(doc.comments ?? {})) {
    const path = at('/comments', id)
    if (id !== thread.id) issue(`${path}/id`, 'id.key', 'A thread ID must match its map key.')
    identify(thread.id, `${path}/id`)
    for (const edge of ['from', 'to'] as const) if (thread.anchor && !textTargets.has(thread.anchor[edge].blockId)) issue(`${path}/anchor/${edge}/blockId`, 'comment.target', 'A comment anchor must name a stable rich-text node or section title.')
    for (const [index, comment] of thread.comments.entries()) {
      identify(comment.id, `${path}/comments/${index}/id`)
      comment.content?.forEach((node, child) => rich(node, `${path}/comments/${index}/content/${child}`, new Set()))
    }
  }
  return issues.some(issue => issue.severity === 'error') ? { issues } : { document: doc, issues }
}

type JsonSchemaLike = TeachingDocument['definitions'][string]['parameterSchema']
