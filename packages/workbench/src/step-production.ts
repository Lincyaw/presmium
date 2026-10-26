import type { StepProduction, TeachingDocument } from '@lincyaw/kernel'

export const STEP_TIMING_KEYS = ['narrationStart', 'minimumHoldMs', 'trailingPauseMs'] as const
export type StepTimingKey = typeof STEP_TIMING_KEYS[number]
export type StepTimingPatch = { [K in StepTimingKey]?: StepProduction[K] | null }
export type ProductionSource = 'step' | 'section' | 'document' | 'unset'
export type StepDurationKey = 'minimumHoldMs' | 'trailingPauseMs'
/** An unaccepted form value; never serialized into Production. */
export interface StepDurationDraft { text: string, error: boolean, review?: boolean }

/** The source is author intent; an absent value is not a fabricated playback default. */
export function stepTimingValue<K extends StepTimingKey>(document: TeachingDocument, stepId: string, key: K): { value: StepProduction[K], source: ProductionSource } {
  const production = document.production, step = document.steps[stepId]
  const layers = [[production.stepOverrides[stepId], 'step'], [step && production.sectionOverrides?.[step.sectionId], 'section'], [production.defaults, 'document']] as const
  for (const [settings, source] of layers) if (settings?.[key] !== undefined) return { value: settings[key], source }
  return { value: undefined, source: 'unset' }
}

/** Migrated narration defaults are inherited until this step explicitly overrides its start. */
export function stepNarrationStarts(document: TeachingDocument, stepId: string) {
  const inherited = stepTimingValue(document, stepId, 'narrationStart')
  return (document.steps[stepId]?.narrationIds ?? []).map(id => ({ id,
    value: inherited.source === 'step' ? inherited.value : document.production.narrationOverrides?.[id]?.narrationStart ?? inherited.value,
    overridden: inherited.source !== 'step' && document.production.narrationOverrides?.[id]?.narrationStart !== undefined,
  }))
}

/** Patches only author-owned timing; voice, cues, media and other steps retain their source values. */
export function changeStepTiming(document: TeachingDocument, stepId: string, patch: StepTimingPatch): TeachingDocument {
  const step = document.steps[stepId]
  if (!step || !document.sections[step.sectionId]?.stepOrder.includes(stepId)) return document
  for (const key of Object.keys(patch)) if (!STEP_TIMING_KEYS.includes(key as StepTimingKey)) throw new Error('document-production-key')
  const previous = document.production.stepOverrides[stepId], next = { ...previous }
  for (const key of STEP_TIMING_KEYS) {
    if (!Object.hasOwn(patch, key)) continue
    const value = patch[key]
    if (value === null || value === undefined) delete next[key]
    else if (key === 'narrationStart') {
      if (value !== 'with-animation' && value !== 'after-animation') throw new Error('document-production-start')
      next.narrationStart = value
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('document-production-duration')
      next[key] = value
    }
  }
  const stepOverrides = { ...document.production.stepOverrides }
  if (Object.keys(next).length) stepOverrides[stepId] = next
  else delete stepOverrides[stepId]
  const production = { ...document.production, stepOverrides }
  return JSON.stringify(document.production) === JSON.stringify(production) ? document : { ...document, production }
}
