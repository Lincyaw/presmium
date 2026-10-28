import { fnv1a64 } from './fingerprint.ts'
import type { CaptionTiming, NarrationNode, TeachingDocument } from './contracts/document.ts'

export const CAPTION_TIMING_MAX_SEGMENTS = 32
export type DocumentCaptionTimingAction = { type: 'caption.timing.set', stepId: string, value: CaptionTiming } | { type: 'caption.timing.reset', stepId: string }
export class DocumentCaptionTimingError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export function narrationCaptionText(content: readonly NarrationNode[]): string {
  return content.map(node => node.type === 'text' ? node.text : node.type === 'pronunciation' ? node.display : '').join('')
}
/** No second editable caption text. Separators are part of this exact display projection. */
export function stepCaptionText(document: TeachingDocument, stepId: string): string {
  return (document.steps[stepId]?.narrationIds ?? []).map(id => narrationCaptionText(document.narrations[id]?.content ?? [])).join('\n')
}
export function captionSourceFingerprint(document: TeachingDocument, stepId: string): string {
  const step = document.steps[stepId]
  if (!step) throw new DocumentCaptionTimingError(404, 'caption-step-missing')
  const timing = { ...document.production.defaults, ...document.production.sectionOverrides?.[step.sectionId], ...document.production.stepOverrides[stepId] }
  return fnv1a64(JSON.stringify({ document: document.id, stepId, sectionId: step.sectionId, lang: document.metadata.lang, timing,
    narrations: step.narrationIds.map(id => ({ id, content: document.narrations[id]?.content,
      start: document.production.stepOverrides[stepId]?.narrationStart ?? document.production.narrationOverrides?.[id]?.narrationStart ?? timing.narrationStart })),
    pauses: step.narrationIds.flatMap(id => document.narrations[id]?.content.flatMap(node => node.type === 'cue' ? [[node.id, document.production.cueTimings?.[node.id]]] : []) ?? []),
  }))
}

/** Unicode grapheme partitions, complete original text and monotonic author times; no interpolation. */
export function captionTimingProblem(value: CaptionTiming, text: string): string | undefined {
  if (!text.trim() || !Number.isSafeInteger(value.durationMs) || value.durationMs <= 0) return 'caption-timing-unavailable'
  if (!value.segments.length || value.segments.length > CAPTION_TIMING_MAX_SEGMENTS) return 'caption-segment-limit'
  const boundaries = new Set([0, text.length, ...Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.index)])
  const ids = new Set<string>()
  let offset = 0, end = 0
  for (const segment of value.segments) {
    if (!segment.id || ids.has(segment.id)) return 'caption-segment-id-invalid'
    ids.add(segment.id)
    if (!Number.isSafeInteger(segment.from) || !Number.isSafeInteger(segment.to) || segment.from !== offset || segment.to <= segment.from
      || !boundaries.has(segment.from) || !boundaries.has(segment.to) || !text.slice(segment.from, segment.to).trim()) return 'caption-text-range-invalid'
    if (!Number.isSafeInteger(segment.startMs) || !Number.isSafeInteger(segment.endMs) || segment.startMs < end || segment.endMs <= segment.startMs || segment.endMs > value.durationMs) return 'caption-time-range-invalid'
    offset = segment.to; end = segment.endMs
  }
  return offset === text.length ? undefined : 'caption-text-incomplete'
}

/** The shared semantic mutation uses the existing document transaction and its complete source CAS. */
export function applyDocumentCaptionTiming(document: TeachingDocument, action: DocumentCaptionTimingAction) {
  const step = document.steps[action.stepId]
  if (!step) throw new DocumentCaptionTimingError(404, 'caption-step-missing')
  const content = structuredClone(document)
  if (action.type === 'caption.timing.reset') {
    if (content.production.captionTimings) delete content.production.captionTimings[action.stepId]
  } else {
    const value = action.value
    if (JSON.stringify(value.narrationIds) !== JSON.stringify(step.narrationIds) || value.sourceFingerprint !== captionSourceFingerprint(document, step.id)) throw new DocumentCaptionTimingError(409, 'caption-source-changed')
    const issue = captionTimingProblem(value, stepCaptionText(document, step.id))
    if (issue) throw new DocumentCaptionTimingError(422, issue)
    if (step.narrationIds.some(id => document.narrations[id]?.content.some(node => node.type === 'cue' && node.action === 'next'))) throw new DocumentCaptionTimingError(422, 'caption-cross-step-unsupported')
    content.production.captionTimings ??= {}
    Object.defineProperty(content.production.captionTimings, step.id, { value: structuredClone(value), configurable: true, enumerable: true, writable: true })
  }
  return { content, effect: { stepId: step.id, segments: action.type === 'caption.timing.set' ? action.value.segments.length : 0,
    changed: JSON.stringify(content.production.captionTimings) !== JSON.stringify(document.production.captionTimings), mode: action.type === 'caption.timing.set' ? 'manual' as const : 'automatic' as const } }
}
