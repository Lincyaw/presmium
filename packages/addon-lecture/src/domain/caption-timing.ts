import { captionTimingProblem, deckLocale, fnv1a64 } from '@lincyaw/kernel'
import type { CaptionTimingSource, IRDocument, ProductionDiagnostic, ProductionPage } from '@lincyaw/kernel'
import type { LectureTrack } from './track.ts'

const STALE = {
  'zh-CN': '手动字幕时间与当前讲稿、音频或步骤时间不符。请重新核对。',
  'en': 'Manual caption times no longer match this script, audio, or step timing. Review them before using them again.',
}

/** Actual per-step playback evidence. All positions are relative; no source version or mutable plan ID enters this basis. */
export function captionTimingSources(doc: IRDocument, track: LectureTrack, pages: readonly ProductionPage[]): Map<string, CaptionTimingSource> {
  const sources = new Map<string, CaptionTimingSource>()
  for (const page of pages) for (const step of page.steps) {
    const section = doc.sections.find(section => section.id === page.sectionId), narrationIds = section?.stepNarrations?.[step.stepId]?.map(item => item.id) ?? []
    const sourceFingerprint = section?.captionSources?.[step.stepId] ?? ''
    const fail = (reason: string) => { sources.set(step.stepId, { available: false, reason, sourceFingerprint, narrationIds }) }
    if (!sourceFingerprint || !narrationIds.length) { fail('caption-script-unavailable'); continue }
    if (step.timing !== 'confirmed' || step.startMs === undefined || step.endMs === undefined || step.endMs <= step.startMs) { fail('caption-duration-unconfirmed'); continue }
    const start = step.startMs, durationMs = Math.round(step.endMs - start), until = step.endMs
    const utterances = track.utterances.filter(u => u.section === section?.id && u.step === step.index)
    if (!utterances.length || utterances.some(u => u.unsaid || u.t < start || u.t + u.d > until)
      || track.utterances.some(u => u.t < start && u.t + u.d > start || u.t < until && u.t + u.d > until)) { fail('caption-cross-step-unsupported'); continue }
    const recordings = (track.audio ?? []).filter(a => a.role === 'recording' && a.stepId === step.stepId)
    if (utterances.some(u => !u.recording && (!u.audioSha256 || !u.clip)) || recordings.some(a => !a.sha256) || !recordings.length && !utterances.some(u => u.audioSha256)) { fail('caption-audio-unavailable'); continue }
    const idMap = new Map(utterances.map((u, index) => [u.id, index]))
    const events = track.events.filter(([at, type]) => at >= start && at < until && type !== 'go').map(([at, type, data]) => {
      const { at: anchor, ...rest } = data
      return [Math.round(at - start), type, rest, Array.isArray(anchor) ? [idMap.get(String(anchor[0])) ?? 'foreign', anchor[1]] : null]
    })
    const playbackFingerprint = fnv1a64(JSON.stringify({ durationMs, events,
      utterances: utterances.map(u => ({ t: Math.round(u.t - start), d: u.d, sha256: u.audioSha256, voice: u.voice, narrationIds: u.narrationIds, recording: u.recording })),
      recordings: recordings.map(a => ({ t: Math.round(a.start * 1000 - start), d: Math.round(a.duration * 1000), assetId: a.assetId, sha256: a.sha256, sourceStartMs: a.sourceStartMs ?? 0 })),
    }))
    sources.set(step.stepId, { available: true, sourceFingerprint, playbackFingerprint, durationMs, narrationIds })
  }
  return sources
}

/** Typed canonical text is projected only after both content and real media/time evidence still match. */
export function applyCaptionTimings(doc: IRDocument, track: LectureTrack, pages: readonly ProductionPage[]): ProductionDiagnostic[] {
  const sources = captionTimingSources(doc, track, pages), diagnostics: ProductionDiagnostic[] = []
  const overrides: NonNullable<LectureTrack['captionOverrides']> = []
  for (const [stepId, value] of Object.entries(doc.production?.captionTimings ?? {})) {
    const page = pages.find(page => page.steps.some(step => step.stepId === stepId)), step = page?.steps.find(step => step.stepId === stepId)
    const section = doc.sections.find(section => section.id === page?.sectionId), source = sources.get(stepId)
    const text = (section?.stepNarrations?.[stepId] ?? []).map(narration => narration.text).join('\n')
    const stale = !source?.available || value.sourceFingerprint !== source.sourceFingerprint || value.playbackFingerprint !== source.playbackFingerprint
      || value.durationMs !== source.durationMs || JSON.stringify(value.narrationIds) !== JSON.stringify(source.narrationIds) || captionTimingProblem(value, text)
    if (stale || !step || step.startMs === undefined || step.endMs === undefined || !section) {
      diagnostics.push({ code: 'production.caption-timing-stale', severity: 'warning', stepId, ...page ? { sectionId: page.sectionId } : {},
        message: STALE[deckLocale(doc.meta.lang)] })
      continue
    }
    overrides.push({ section: section.id, step: step.index, stepId, startMs: step.startMs, endMs: step.endMs,
      groups: value.segments.map(segment => ({ id: `manual:${stepId}:${segment.id}`, text: text.slice(segment.from, segment.to), t: step.startMs! + segment.startMs, d: segment.endMs - segment.startMs, alignment: 'manual' })) })
  }
  track.captionOverrides = overrides
  return diagnostics
}
