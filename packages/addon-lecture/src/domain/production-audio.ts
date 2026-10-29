import type { IRDocument, ProductionAssetInspection, ProductionAudioClip, ProductionPage } from '@lincyaw/kernel'
import { deckLocale } from '@lincyaw/kernel'

export interface ProductionAudioIssue { code: string, sectionId?: string, stepId: string, assetId: string, mediaClipId: string }

const messages: Record<string, { 'zh-CN': string, en: string }> = {
  'production.asset-missing': { 'zh-CN': '找不到此音频资产声明。', en: 'This audio asset is not declared in the document.' },
  'production.asset-kind': { 'zh-CN': '当前只支持本地音频；视频尚未支持。', en: 'Only local audio is supported; video is unavailable.' },
  'production.asset-path': { 'zh-CN': '音频须为同文稿的非隐藏本地文件；远程或跨文稿素材尚未支持。', en: 'Audio must be a non-hidden local file in this document; remote and shared assets are unsupported.' },
  'production.asset-file': { 'zh-CN': '音频文件不存在、不可读取或不是本地常规文件。', en: 'The audio is missing, unreadable, or not a local regular file.' },
  'production.asset-size': { 'zh-CN': '音频文件须非空且不超过 16 MiB。', en: 'The audio file must be nonempty and at most 16 MiB.' },
  'production.asset-count': { 'zh-CN': '本次制作最多引用 32 份音频资产。', en: 'A production can reference at most 32 audio assets.' },
  'production.asset-decoded-size': { 'zh-CN': '引用音频的解码总量超过 256 MiB，请减少或拆分素材。', en: 'The referenced audio exceeds the 256 MiB decoded-data limit; reduce or split the assets.' },
  'production.asset-format': { 'zh-CN': '此文件不是受支持的单音轨音频，或媒体数据已损坏。', en: 'The file is not supported single-track audio, or its media data is damaged.' },
  'production.asset-duration': { 'zh-CN': '无法确认音频时长，或时长超过 10 分钟。', en: 'The audio duration is unconfirmed or exceeds ten minutes.' },
  'production.asset-fingerprint': { 'zh-CN': '音频字节与声明的 SHA-256 不符，请检查或重新采用素材。', en: 'The audio bytes do not match the declared SHA-256; review or adopt the asset again.' },
  'production.asset-changed': { 'zh-CN': '音频文件已变化，请重新准备当前编排。', en: 'The audio file changed; prepare the current sequence again.' },
  'production.media-range': { 'zh-CN': '裁切出点须晚于入点且不超过实际音频时长。', en: 'The out point must follow the in point and stay within the actual audio duration.' },
  'production.media-step-unknown': { 'zh-CN': '音频只能附着到时段已确认的步骤，请先修正配音或时序。', en: 'Audio requires a confirmed step range; resolve voiceover or timing first.' },
  'production.media-step-range': { 'zh-CN': '音频片段超出本步时段；请调整裁切、偏移或本步停留，不会自动跨步。', en: 'The audio exceeds this step; adjust its range, offset, or step hold. It will not cross steps automatically.' },
}
export function productionAudioMessage(doc: IRDocument, code: string): string { return (messages[code] ?? messages['production.asset-format']!)[deckLocale(doc.meta.lang)] }

/** Media never retimes the lecture. Every use must fit an existing confirmed step range. */
export function placeProductionAudio(doc: IRDocument, pages: readonly ProductionPage[], assets: ReadonlyMap<string, ProductionAssetInspection>, errors: ReadonlyMap<string, string>): { clips: ProductionAudioClip[], issues: ProductionAudioIssue[] } {
  const clips: ProductionAudioClip[] = [], issues: ProductionAudioIssue[] = []
  for (const clip of doc.production?.mediaClips ?? []) {
    const page = pages.find(page => page.steps.some(step => step.stepId === clip.attachment.stepId))
    const step = page?.steps.find(step => step.stepId === clip.attachment.stepId), asset = assets.get(clip.assetId)
    const issue = (code: string) => issues.push({ code, ...page ? { sectionId: page.sectionId } : {}, stepId: clip.attachment.stepId, assetId: clip.assetId, mediaClipId: clip.id })
    if (!asset) { issue(errors.get(clip.assetId) ?? 'production.asset-missing'); continue }
    if (clip.sourceRange.startMs < 0 || clip.sourceRange.endMs <= clip.sourceRange.startMs || clip.sourceRange.endMs > asset.durationMs) { issue('production.media-range'); continue }
    if (!step || step.timing !== 'confirmed' || step.startMs === undefined || step.endMs === undefined) { issue('production.media-step-unknown'); continue }
    const duration = clip.sourceRange.endMs - clip.sourceRange.startMs
    if (clip.attachment.offsetMs < 0 || clip.attachment.offsetMs + duration > step.endMs - step.startMs) { issue('production.media-step-range'); continue }
    clips.push({ id: clip.id, assetId: clip.assetId, mediaId: asset.mediaId, sectionId: page!.sectionId, stepId: step.stepId, startMs: step.startMs + clip.attachment.offsetMs, endMs: step.startMs + clip.attachment.offsetMs + duration, sourceRange: { ...clip.sourceRange }, volume: clip.volume, muted: clip.muted ?? false })
  }
  return { clips, issues }
}
