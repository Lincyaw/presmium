import type { Locale } from '@lincyaw/kernel'

export const TRANSCRIPTION_MESSAGES = {
  'zh-CN': {
    import: '导入音频', retry: '重试', records: '转写记录', partial: '部分转写记录无法读取。', other: '另有转写正在进行。', show: '查看', audioUnavailable: '暂时无法检查音频。', loading: '正在加载…',
    title: '转写', audio: '音频', service: '转写服务', none: '请选择音频', noAudio: '先录音或导入音频。', unavailable: '尚未配置转写服务。', unresolved: '暂时无法确认转写服务。', refresh: '刷新转写状态', start: '转写', cancel: '取消转写', cancelTitle: '取消转写？', cancelKeep: '继续转写', cancelConfirm: '取消', close: '关闭',
    sending: '等待服务确认', queued: '等待转写', running: '正在转写', cancelling: '正在取消', cancelled: '已取消', done: '转写完成', failed: '转写失败', stale: '来源已更新', requestFailed: '无法确认转写结果，请刷新或取消。', readFailed: '无法读取转写结果，请重试。', storage: '本地恢复不可用，请保留此页面。',
    text: '转写文本', review: '对照并采用为讲稿', before: '现有讲稿', after: '采用后', apply: '采用讲稿', applying: '正在保存…', adopted: '讲稿已保存', narration: '讲稿', newNarration: '新建讲稿', segments: '采用段落', allSegments: '全部段落', segment: (index: number) => `第 ${index + 1} 段`, empty: '没有可采用的文字。',
    atoms: '发音与提示', keepAtom: '保留到光标处', removeAtom: '移除', pronunciation: '发音', cue: '提示', resolveAtoms: '请核对发音与提示的位置。', unknownAtom: '发音或提示已变化，请重新核对。', removed: '确认移除', removeTiming: '同时移除对应停顿', shared: '共享讲稿', fork: '仅当前步骤', editShared: '修改所有引用步骤', affected: (count: number) => `将修改 ${count} 个步骤`, conflicts: '还有未核对的修改。', sourceChanged: '文稿已更新，请重新对照。', confirm: '对照修改', edit: '继续校对', previewFailed: '暂时无法对照，请重试。', applyFailed: '无法确认已保存，校对内容已保留。', draftStorage: '校对内容暂时无法恢复，请保留此页面。', stepChanged: '目标步骤已变化，请重新选择。',
  },
  en: {
    import: 'Import Audio', retry: 'Retry', records: 'Transcription history', partial: 'Some transcription records could not be read.', other: 'Another transcription is running.', show: 'View', audioUnavailable: 'Couldn’t check the audio right now.', loading: 'Loading…',
    title: 'Transcription', audio: 'Audio', service: 'Transcription service', none: 'Select audio', noAudio: 'Record or import audio first.', unavailable: 'No transcription service configured.', unresolved: 'Couldn’t confirm the transcription service.', refresh: 'Refresh Transcription', start: 'Transcribe', cancel: 'Cancel Transcription', cancelTitle: 'Cancel transcription?', cancelKeep: 'Keep Transcribing', cancelConfirm: 'Cancel', close: 'Close',
    sending: 'Waiting for the service', queued: 'Queued', running: 'Transcribing', cancelling: 'Canceling', cancelled: 'Canceled', done: 'Transcription completed', failed: 'Transcription failed', stale: 'Source changed', requestFailed: 'Couldn’t confirm the result. Refresh or cancel.', readFailed: 'Couldn’t read the transcript. Try again.', storage: 'Local recovery is unavailable. Keep this page open.',
    text: 'Transcript', review: 'Compare and Use as Script', before: 'Current script', after: 'Proposed script', apply: 'Use Script', applying: 'Saving…', adopted: 'Script saved', narration: 'Script', newNarration: 'New Script', segments: 'Transcript segments', allSegments: 'All segments', segment: (index: number) => `Segment ${index + 1}`, empty: 'No text to adopt.',
    atoms: 'Pronunciations and cues', keepAtom: 'Keep at Cursor', removeAtom: 'Remove', pronunciation: 'Pronunciation', cue: 'Cue', resolveAtoms: 'Review pronunciation and cue positions.', unknownAtom: 'Pronunciations or cues changed. Review them again.', removed: 'Confirm Removal', removeTiming: 'Also remove its pause', shared: 'Shared script', fork: 'This step only', editShared: 'All referencing steps', affected: (count: number) => `${count} steps will change`, conflicts: 'Some changes still need review.', sourceChanged: 'The document changed. Compare again.', confirm: 'Compare Changes', edit: 'Keep Editing', previewFailed: 'Couldn’t prepare the comparison. Try again.', applyFailed: 'Couldn’t confirm the save. Your edits are kept.', draftStorage: 'Draft recovery is unavailable. Keep this page open.', stepChanged: 'The target step changed. Select it again.',
  },
} satisfies Record<Locale, object>

export function transcriptionFailure(error: unknown, locale: Locale): string {
  const t = TRANSCRIPTION_MESSAGES[locale], code = error instanceof Error ? error.message : ''
  if (code.includes('version-changed') || code.includes('source-changed') || code.includes('plan-changed') || code.includes('plan-expired')) return t.sourceChanged
  if (code.includes('engine-unavailable') || code.includes('engine-unsupported') || code.includes('engine-unknown') || code.includes('speech-unavailable')) return t.unavailable
  if (code.includes('services-unavailable')) return t.unresolved
  return t.requestFailed
}
