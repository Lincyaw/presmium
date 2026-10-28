import type { Production, TeachingDocument, TimeRange, VoiceSource } from './contracts/document.ts'

/** Resolve only against a real inspected duration; no source bytes or authored text are changed. */
export function recordingSourceRange(source: Extract<VoiceSource, { type: 'recording' }>, durationMs: number): TimeRange | undefined {
  const range = source.sourceRange ?? { startMs: 0, endMs: durationMs }
  return Number.isFinite(durationMs) && durationMs > 0 && Number.isFinite(range.startMs) && Number.isFinite(range.endMs)
    && range.startMs >= 0 && range.endMs > range.startMs && range.endMs <= durationMs ? { ...range } : undefined
}

/** Assets used by surviving steps; inherited recordings are resolved before collecting references. */
export function productionAssetIds(production: Production | undefined, sections: readonly { id: string, stepIds?: readonly string[] }[]): string[] {
  if (!production) return []
  const ids = new Set(production.mediaClips.map(clip => clip.assetId))
  for (const section of sections) for (const stepId of section.stepIds ?? []) {
    const source = production.stepOverrides[stepId]?.voiceSource ?? production.sectionOverrides?.[section.id]?.voiceSource ?? production.defaults.voiceSource
    if (source?.type === 'recording') ids.add(source.assetId)
  }
  return [...ids]
}

/** Whole-step recordings have no inferred word clock. This check does not change authored atoms. */
export function recordingStepIssue(document: TeachingDocument, stepId: string): 'recording-cue-unsupported' | 'recording-start-conflict' | undefined {
  const step = document.steps[stepId]
  if (!step) return undefined
  let text = false, mode: string | undefined
  for (const id of step.narrationIds) {
    const value = { ...document.production.defaults, ...document.production.sectionOverrides?.[step.sectionId], ...document.production.narrationOverrides?.[id], ...document.production.stepOverrides[stepId] }
    const next = value.narrationStart ?? 'with-animation'
    if (mode !== undefined && mode !== next) return 'recording-start-conflict'
    mode = next
    for (const node of document.narrations[id]!.content) {
      if (node.type === 'cue') {
        const action = node.action.trim().split(/\s/)[0]
        if (text || action === 'next' || action === 'pause') return 'recording-cue-unsupported'
      } else if ((node.type === 'text' ? node.text : node.display).trim()) text = true
    }
  }
}
