import type { StepProduction, TeachingDocument, VoiceSource } from './contracts/document.ts'

/** Authoring scopes use stable source IDs, independent of compiled numerical step bindings. */
export type DocumentVoiceScope = { kind: 'document' } | { kind: 'page', sectionId: string } | { kind: 'step', stepId: string } | { kind: 'steps', stepIds: readonly string[] }
export interface DocumentVoiceOptions { replaceOverrides?: boolean }
export interface DocumentStepVoice {
  stepId: string
  sectionId: string
  value?: VoiceSource
  inheritedFrom: 'step' | 'page' | 'document' | 'unset'
}
export interface DocumentVoiceImpact {
  total: number
  /** Steps whose effective value or inheritance source will change. */
  updated: number
  /** Steps protected by an existing local voiceSource, including none and recording. */
  preserved: number
  unchanged: number
  /** Existing configuration slots, not steps: page + step counts equal none + tts + recording. */
  overrides: { pages: number, steps: number, none: number, tts: number, recording: number }
}

function page(document: TeachingDocument, id: string) {
  const section = Object.hasOwn(document.sections, id) && document.sections[id]
  if (!section || !document.sectionOrder.includes(id)) throw new Error(`document-voice-page-missing: ${id}`)
  return section
}

function step(document: TeachingDocument, id: string) {
  const value = Object.hasOwn(document.steps, id) && document.steps[id]
  if (!value || !page(document, value.sectionId).stepOrder.includes(id)) throw new Error(`document-voice-step-missing: ${id}`)
  return value
}

/** Deduplicated in authored page/step order; every requested ID is checked before any change. */
export function documentVoiceStepIds(document: TeachingDocument, scope: DocumentVoiceScope): string[] {
  const ordered = () => [...new Set(document.sectionOrder.flatMap(id => page(document, id).stepOrder))]
  switch (scope.kind) {
    case 'document': return ordered()
    case 'page': return [...page(document, scope.sectionId).stepOrder]
    case 'step': step(document, scope.stepId); return [scope.stepId]
    case 'steps': {
      if (!scope.stepIds.length) throw new Error('document-voice-steps-empty')
      scope.stepIds.forEach(id => step(document, id))
      const selected = new Set(scope.stepIds)
      return ordered().filter(id => selected.has(id))
    }
    default: throw new Error('document-voice-scope-invalid')
  }
}

/** An absent voice remains unset; none and recording retain their canonical identities. */
export function resolveDocumentStepVoice(document: TeachingDocument, stepId: string): DocumentStepVoice {
  const { sectionId } = step(document, stepId), production = document.production
  const layers = [[production.stepOverrides[stepId]?.voiceSource, 'step'], [production.sectionOverrides?.[sectionId]?.voiceSource, 'page'], [production.defaults.voiceSource, 'document']] as const
  for (const [value, inheritedFrom] of layers) if (value !== undefined) return { stepId, sectionId, value, inheritedFrom }
  return { stepId, sectionId, inheritedFrom: 'unset' }
}

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
  const a = Object.keys(left), b = Object.keys(right)
  return a.length === b.length && a.every(key => Object.hasOwn(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}

function checkVoice(document: TeachingDocument, source: VoiceSource | null | undefined): void {
  if (source === null || source === undefined) return
  const keys = (value: object, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))
  if (typeof source !== 'object' || Array.isArray(source)) throw new Error('document-voice-source-invalid')
  if (source.type === 'none' && keys(source, ['type'])) return
  if (source.type === 'tts' && keys(source, ['type', 'voice'])) {
    const voice = source.voice
    if (voice && typeof voice === 'object' && !Array.isArray(voice) && keys(voice, ['voice', 'engine', 'rate', 'style']) && typeof voice.voice === 'string' && voice.voice.length > 0
      && (voice.engine === undefined || typeof voice.engine === 'string') && (voice.style === undefined || typeof voice.style === 'string')
      && (voice.rate === undefined || typeof voice.rate === 'number' && Number.isFinite(voice.rate) && voice.rate > 0)) return
  }
  if (source.type === 'recording' && keys(source, ['type', 'assetId']) && typeof source.assetId === 'string') {
    const asset = Object.hasOwn(document.assets, source.assetId) && document.assets[source.assetId]
    if (!asset) throw new Error(`document-voice-asset-missing: ${source.assetId}`)
    if (asset.kind === 'audio' || asset.kind === 'video') return
    throw new Error(`document-voice-asset-kind: ${source.assetId}`)
  }
  throw new Error('document-voice-source-invalid')
}

function protectedStep(document: TeachingDocument, scope: DocumentVoiceScope, id: string): boolean {
  if (scope.kind === 'step') return false
  if (document.production.stepOverrides[id]?.voiceSource !== undefined) return true
  return scope.kind === 'document' && document.production.sectionOverrides?.[document.steps[id]!.sectionId]?.voiceSource !== undefined
}

function settings(previous: StepProduction | undefined, source: VoiceSource | null | undefined): StepProduction | undefined {
  if (same(previous?.voiceSource, source ?? undefined)) return previous
  const next = { ...previous }
  if (source === null || source === undefined) delete next.voiceSource
  else next.voiceSource = structuredClone(source)
  return Object.keys(next).length ? next : undefined
}

/**
 * Page/document writes preserve descendant voice slots unless replaceOverrides is explicit.
 * A single step always edits its own slot; a steps batch preserves existing step slots by default.
 * null/undefined removes only voiceSource under the same scope/protection rules. Timing and opaque
 * sibling fields survive, including when the last voice setting is removed. A no-op retains identity.
 */
export function changeDocumentVoice(document: TeachingDocument, scope: DocumentVoiceScope, source: VoiceSource | null | undefined, options: DocumentVoiceOptions = {}): TeachingDocument {
  const ids = documentVoiceStepIds(document, scope)
  checkVoice(document, source)
  const previous = document.production
  let defaults = previous.defaults, sectionOverrides = previous.sectionOverrides, stepOverrides = previous.stepOverrides
  const writeStep = (id: string, value: VoiceSource | null | undefined) => {
    const next = settings(stepOverrides[id], value)
    if (next === stepOverrides[id]) return
    if (stepOverrides === previous.stepOverrides) stepOverrides = { ...stepOverrides }
    if (next) stepOverrides[id] = next
    else delete stepOverrides[id]
  }
  const writePage = (id: string, value: VoiceSource | null | undefined) => {
    const next = settings(sectionOverrides?.[id], value)
    if (next === sectionOverrides?.[id]) return
    if (sectionOverrides === previous.sectionOverrides) sectionOverrides = { ...sectionOverrides }
    if (next) sectionOverrides![id] = next
    else delete sectionOverrides![id]
  }
  if (scope.kind === 'document') {
    defaults = settings(defaults, source) ?? {}
    if (options.replaceOverrides) {
      document.sectionOrder.forEach(id => writePage(id, undefined))
      ids.forEach(id => writeStep(id, undefined))
    }
  } else if (scope.kind === 'page') {
    writePage(scope.sectionId, source)
    if (options.replaceOverrides) ids.forEach(id => writeStep(id, undefined))
  } else for (const id of ids) if (options.replaceOverrides || !protectedStep(document, scope, id)) writeStep(id, source)
  if (defaults === previous.defaults && sectionOverrides === previous.sectionOverrides && stepOverrides === previous.stepOverrides) return document
  return { ...document, production: { ...previous, defaults, ...sectionOverrides !== undefined ? { sectionOverrides } : {}, stepOverrides } }
}

/** Override counts include every existing local slot, even a page slot shadowed by a step slot. */
export function previewDocumentVoiceChange(document: TeachingDocument, scope: DocumentVoiceScope, source: VoiceSource | null | undefined, options: DocumentVoiceOptions = {}): DocumentVoiceImpact {
  const ids = documentVoiceStepIds(document, scope), next = changeDocumentVoice(document, scope, source, options)
  const impact: DocumentVoiceImpact = { total: ids.length, updated: 0, preserved: 0, unchanged: 0, overrides: { pages: 0, steps: 0, none: 0, tts: 0, recording: 0 } }
  const count = (value: VoiceSource | undefined, kind: 'pages' | 'steps') => { if (value) { impact.overrides[kind]++; impact.overrides[value.type]++ } }
  if (scope.kind === 'document') document.sectionOrder.forEach(id => count(document.production.sectionOverrides?.[id]?.voiceSource, 'pages'))
  for (const id of ids) {
    count(document.production.stepOverrides[id]?.voiceSource, 'steps')
    if (!options.replaceOverrides && protectedStep(document, scope, id)) impact.preserved++
    else if (!same(resolveDocumentStepVoice(document, id), resolveDocumentStepVoice(next, id))) impact.updated++
    else impact.unchanged++
  }
  return impact
}
