import { deckLocale } from '@lincyaw/kernel'
import type { IRDocument, ProductionAssetInspection, ProductionAudio, ProductionDiagnostic, ProductionPage, ProductionPlan, ProductionRange, ProductionSegment, ProductionTiming } from '@lincyaw/kernel'
import { plannedAnimations, plannedUtterances } from './plan.ts'
import type { LecturePlan } from './plan.ts'
import { trackDuration } from './track.ts'
import type { LectureTrack } from './track.ts'

const messages = {
  'zh-CN': {
    animation: '动画未声明有效时长，不能用于按时播放或导出。',
    recording: '录音来源已保留，但尚未接入当前讲稿播放计划。',
    media: '当前只支持同文稿本地音频；视频和录音采用尚未支持。',
    cue: '无配音讲稿中的文字位置提示没有确认时码；请移到步骤起点或提供音频。',
    next: '含跨步提示的同一段配音尚不能插入步骤结束停顿；请先拆为步骤绑定的讲稿。',
    cache: '当前讲稿与音色缺少精确配音缓存；显示的时长为估算，不能用于确认播放或导出。',
    unset: '此讲稿尚未选择音频来源；请选择无配音或实际音色。',
  },
  en: {
    animation: 'The animation has no valid declared duration; timed playback and export are unavailable.',
    recording: 'The recording source is retained but is not supported by the current narration player.',
    media: 'Only local audio from this document is supported; video and recording adoption are unavailable.',
    cue: 'Text-anchored cues without audio have no confirmed timing; move them to the step start or provide audio.',
    next: 'A narration clip with a next-step cue cannot yet insert trailing step pauses; split it into step-bound narrations.',
    cache: 'Exact voiceover cache is missing for the current script and voice; displayed duration is estimated and cannot confirm playback or export.',
    unset: 'This narration has no audio source; choose silence or an actual voice.',
  },
}
export function productionMessages(doc: IRDocument) { return messages[deckLocale(doc.meta.lang)] }

/** Capability findings shared by the renderer and the read-only production plan. */
export function productionDiagnostics(doc: IRDocument, plan: LecturePlan): ProductionDiagnostic[] {
  const result: ProductionDiagnostic[] = [], text = productionMessages(doc)
  for (const clip of doc.production?.mediaClips ?? []) {
    const section = doc.sections.find(section => section.stepIds?.includes(clip.attachment.stepId))
    if (doc.productionAssets?.[clip.assetId]?.kind !== 'audio') result.push({ code: 'production.media-unsupported', severity: 'error', message: text.media, ...section ? { sectionId: section.id } : {}, stepId: clip.attachment.stepId })
  }
  for (const section of doc.sections) {
    for (const animation of plannedAnimations(section)) if (animation.durationMs === undefined) result.push({ code: 'production.animation-duration-unknown', severity: 'error', message: text.animation, sectionId: section.id, stepId: section.stepIds?.[animation.step], blockId: animation.blockId })
    const own = plan.sections.find(own => own.id === section.id)
    if (!own) continue
    if (own.trailingPauseMs && own.paragraphs.some(paragraph => paragraph.pieces.some(piece => piece.cues.some(cue => cue.name === 'next')))) result.push({ code: 'production.next-pause-unsupported', severity: 'error', message: text.next, sectionId: section.id })
    for (const [index, stepId] of (section.stepIds ?? []).entries()) {
      const source = doc.production?.stepOverrides[stepId]?.voiceSource ?? doc.production?.sectionOverrides?.[section.id]?.voiceSource ?? doc.production?.defaults.voiceSource
      if (source?.type === 'recording') result.push({ code: 'production.recording-unsupported', severity: 'error', message: text.recording, sectionId: section.id, stepId })
      for (const paragraph of own.paragraphs.filter(paragraph => paragraph.step === index)) if (source?.type === 'none' && paragraph.pieces.some(piece => piece.cues.some(cue => cue.name !== 'pause' && cue.offset > 0))) result.push({ code: 'production.silent-cue-unknown', severity: 'error', message: text.cue, sectionId: section.id, stepId, narrationId: paragraph.narrationId })
    }
  }
  return result
}

export function projectProductionPlan(doc: IRDocument, plan: LecturePlan, track: LectureTrack, audio: ReadonlyMap<string, ProductionAudio>, failures: readonly { id: string, section: string, text: string, reason: string }[], mediaDiagnostics: readonly ProductionDiagnostic[] = [], assets: ReadonlyMap<string, ProductionAssetInspection> = new Map()): Omit<ProductionPlan, 'binding'> {
  const duration = trackDuration(track), units = plannedUtterances(plan), byId = new Map(units.map(unit => [unit.id, unit]))
  const diagnostics: ProductionDiagnostic[] = [...productionDiagnostics(doc, plan), ...mediaDiagnostics]
  const messages = productionMessages(doc)
  for (const failure of failures) {
    const unit = byId.get(failure.id), section = doc.sections.find(section => section.id === failure.section)
    diagnostics.push({ code: unit?.sourceKind === 'unset' ? 'production.voice-unset' : 'production.cache-missing', severity: 'warning', message: unit?.sourceKind === 'unset' ? messages.unset : messages.cache, sectionId: failure.section, ...unit ? { stepId: section?.stepIds?.[unit.step], narrationId: unit.narrationId } : {} })
  }
  for (const finding of plan.problems) diagnostics.push({ code: 'production.cue-invalid', severity: 'warning', message: finding.message })
  const starts = track.events.flatMap(([at, type, data]) => type === 'go' && typeof data.section === 'string' && typeof data.step === 'number' ? [{ at, section: data.section, step: data.step }] : [])
  const startFor = (section: string, step: number) => starts.find(at => at.section === section && at.step === step)?.at ?? 0
  const unknown = diagnostics.filter(issue => issue.severity === 'error')
  const unknownAt = unknown.length ? Math.min(...unknown.map(issue => {
    const section = doc.sections.find(section => section.id === issue.sectionId)
    return section ? startFor(section.id, issue.stepId ? section.stepIds?.indexOf(issue.stepId) ?? 0 : 0) : 0
  })) : Infinity
  const estimatedAt = Math.min(Infinity, ...track.utterances.filter(utterance => utterance.unsaid).map(utterance => utterance.t))
  const range = (start: number, end: number): ProductionRange => {
    if (start >= unknownAt || end > unknownAt) return { ...start < unknownAt ? { startMs: start } : {}, timing: 'unknown' }
    return { startMs: start, endMs: end, timing: end > estimatedAt || start >= estimatedAt ? 'estimated' : 'confirmed' }
  }
  const pages: ProductionPage[] = doc.sections.map(section => {
    const planned = plan.sections.find(planned => planned.id === section.id), animations = plannedAnimations(section)
    const steps = (section.stepIds ?? []).map((stepId, index) => {
      const start = startFor(section.id, index), at = starts.findIndex(at => at.section === section.id && at.step === index)
      const end = at < 0 ? start : starts[at + 1]?.at ?? duration
      const own = animations.filter(animation => animation.step === index)
      return { stepId, index, ...range(start, end), holdMs: planned?.holds[index] ?? 0, ...own.every(animation => animation.durationMs !== undefined) ? { animationMs: Math.max(0, ...own.map(animation => animation.durationMs!)) } : {} }
    })
    const start = startFor(section.id, 0), last = steps.at(-1)
    return { sectionId: section.id, title: section.title, ...range(start, last?.endMs ?? duration), ...last?.endMs === undefined && last?.timing === 'unknown' ? { endMs: undefined, timing: 'unknown' as const } : {}, steps }
  })
  const visual: ProductionSegment[] = pages.flatMap(page => page.steps.map(step => ({ id: `visual:${step.stepId}`, sectionId: page.sectionId, stepId: step.stepId, label: deckLocale(doc.meta.lang) === 'en' ? `Step ${step.index + 1}` : `第 ${step.index + 1} 步`, startMs: step.startMs, endMs: step.endMs, timing: step.timing })))
  const voice: ProductionSegment[] = [], caption: ProductionSegment[] = []
  for (const utterance of track.utterances) {
    const section = doc.sections.find(section => section.id === utterance.section), stepId = section?.stepIds?.[utterance.step ?? 0]
    if (!section || !stepId) continue
    const unit = byId.get(utterance.id), file = utterance.clipId ? audio.get(utterance.clipId) : undefined
    const covered = pages.find(page => page.sectionId === section.id)?.steps.filter(step => step.startMs !== undefined && step.endMs !== undefined && step.startMs < utterance.t + utterance.d && step.endMs > utterance.t).map(step => step.stepId) ?? []
    const segment: ProductionSegment = {
      id: utterance.id, sectionId: section.id, stepId, stepIds: [...new Set([stepId, ...covered])], ...unit ? { sourceStepId: section.stepIds?.[unit.step] } : {},
      ...utterance.narrationIds ? { narrationIds: [...utterance.narrationIds] } : {}, utteranceId: utterance.id, label: utterance.text,
      ...range(utterance.t, utterance.t + utterance.d), status: file ? 'cached' : utterance.silent ? 'silent' : unit?.sourceKind === 'recording' || unit?.sourceKind === 'unset' ? 'blocked' : 'missing',
      alignment: utterance.silent ? 'none' : utterance.words?.length ? 'words' : 'proportional',
    }
    voice.push({ ...segment, id: `voice:${utterance.id}`, ...file ? { audio: file } : {} })
    caption.push({ ...segment, id: `caption:${utterance.id}` })
  }
  for (const segment of track.audio ?? []) {
    if (!segment.assetId || !segment.mediaClipId) continue
    const clip = doc.production?.mediaClips.find(clip => clip.id === segment.mediaClipId), media = assets.get(segment.assetId)
    if (!clip || !media) continue
    voice.push({ id: `media:${clip.id}`, sectionId: segment.section, stepId: clip.attachment.stepId, stepIds: [clip.attachment.stepId], mediaClipId: clip.id, assetId: clip.assetId, label: clip.assetId, media, sourceRange: { ...clip.sourceRange }, volume: clip.volume, muted: clip.muted ?? false, alignment: 'none', ...range(segment.start * 1000, (segment.start + segment.duration) * 1000) })
  }
  const timing: ProductionTiming = unknown.length ? 'unknown' : Number.isFinite(estimatedAt) ? 'estimated' : 'confirmed'
  const ready = timing === 'confirmed' && failures.length === 0 && duration > 0
  return { ...timing !== 'unknown' ? { durationMs: duration } : {}, timing, pages, tracks: [{ kind: 'visual', segments: visual }, { kind: 'voice', segments: voice }, { kind: 'caption', segments: caption }], events: timing === 'unknown' ? [] : track.events, diagnostics, canPreview: ready, canExport: ready }
}
