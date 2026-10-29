import type { Locale } from './messages.ts'

export const MEDIA_MESSAGES = {
  'zh-CN': {
    title: '音频片段', import: '导入音频', retryImport: '重试导入', asset: '音频素材', chooseAsset: '选择音频素材', clip: '当前步骤片段', newClip: '新片段',
    in: '入点', out: '出点', timeFormat: 'mm:ss.mmm', offset: '步骤内延后（秒）', volume: '音量', mute: '静音', unmute: '取消静音',
    add: '采用到本步', apply: '应用', restore: '使用完整音频', remove: '删除片段', check: '核对当前版本', retry: '重新加载',
    loading: '正在加载音频…', pending: '尚未采用', saved: '片段已应用到当前步骤', imported: '音频已导入',
    original: (duration: string, used?: string) => `原始 00:00.000 – ${duration}${used ? ` · 使用 ${used}` : ''}`,
    clipLabel: (index: number, name: string) => `片段 ${index + 1} · ${name}`,
    invalidTime: '请输入 mm:ss.mmm 格式的时间。', invalidRange: '出点须晚于入点，且不超出原始时长。', invalidOffset: '请输入不小于 0 的秒数。',
    exceedsStep: '片段超出本步。请裁剪片段、减少延后，或另行调整本步的停留。',
    unavailable: '先准备当前版本并确认本步时段，再采用片段。',
    review: '文稿已变化，输入仍保留；请核对当前版本后采用。', removed: '原片段已移除，输入仍保留；请选择新片段。',
    storageFailed: '无法在本机保留草稿，请保持页面打开。', failed: '无法完成音频操作。输入已保留，请重试。',
    sourceChanged: '文稿已变化，输入仍保留。请准备当前版本后重试。',
    size: '请选择非空且不超过 16 MiB 的音频。', format: '此文件不是受支持的单音轨音频，或数据已损坏。',
    duration: '无法确认音频时长，或时长超过 10 分钟。', missing: '找不到音频素材或原始文件，请检查或重新导入。',
    changed: '原始音频已变化，请重新加载并准备当前版本。', serviceUnavailable: '当前工作区未提供音频导入服务。',
  },
  en: {
    title: 'Audio Clip', import: 'Import Audio', retryImport: 'Retry Import', asset: 'Audio asset', chooseAsset: 'Choose Audio', clip: 'Clips in this step', newClip: 'New Clip',
    in: 'In', out: 'Out', timeFormat: 'mm:ss.mmm', offset: 'Step offset (seconds)', volume: 'Volume', mute: 'Mute', unmute: 'Unmute',
    add: 'Add to Step', apply: 'Apply', restore: 'Use Full Audio', remove: 'Delete Clip', check: 'Review Current Version', retry: 'Reload',
    loading: 'Loading audio…', pending: 'Not applied', saved: 'Clip applied to this step', imported: 'Audio imported',
    original: (duration: string, used?: string) => `Original 00:00.000 – ${duration}${used ? ` · Used ${used}` : ''}`,
    clipLabel: (index: number, name: string) => `Clip ${index + 1} · ${name}`,
    invalidTime: 'Enter a time in mm:ss.mmm format.', invalidRange: 'The out point must follow the in point and stay within the original duration.', invalidOffset: 'Enter an offset of 0 seconds or more.',
    exceedsStep: 'The clip exceeds this step. Trim it, reduce its offset, or change the step hold separately.',
    unavailable: 'Prepare the current version and confirm this step’s timing before applying.',
    review: 'The document changed. Your input is kept; review the current version before applying.', removed: 'The original clip was removed. Your input is kept; choose New Clip.',
    storageFailed: 'Couldn’t keep the draft on this device. Keep this page open.', failed: 'Couldn’t finish the audio operation. Your input is kept; try again.',
    sourceChanged: 'The document changed. Your input is kept; prepare the current version and retry.',
    size: 'Choose nonempty audio of at most 16 MiB.', format: 'The file is not supported single-track audio, or its data is damaged.',
    duration: 'The audio duration is unconfirmed or exceeds ten minutes.', missing: 'The audio asset or original file is missing. Check it or import again.',
    changed: 'The original audio changed. Reload it and prepare the current version.', serviceUnavailable: 'This workspace does not provide audio import.',
  },
}

export function mediaFailure(error: unknown, locale: Locale): string {
  const code = error instanceof Error ? error.message : String(error), t = MEDIA_MESSAGES[locale]
  if (['document-version-changed', 'production-revision-changed', 'production-binding-changed', 'production-plan-changed', 'production-source-changed', 'document-context-changed'].includes(code)) return t.sourceChanged
  if (code === 'production.asset-size') return t.size
  if (code === 'production.asset-duration') return t.duration
  if (code === 'production.asset-changed' || code === 'production.asset-fingerprint') return t.changed
  if (['production.asset-missing', 'production.asset-path', 'production.asset-file', 'workspace-file-missing'].includes(code)) return t.missing
  if (code === 'production.asset-format' || code === 'production.asset-kind') return t.format
  if (code === 'production.media-range') return t.invalidRange
  if (code === 'production.media-step-range') return t.exceedsStep
  if (code === 'production.media-step-unknown') return t.unavailable
  if (code === 'production-audio-unavailable') return t.serviceUnavailable
  return t.failed
}
