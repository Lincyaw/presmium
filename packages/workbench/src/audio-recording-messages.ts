import type { Locale } from './messages.ts'

const zh = {
  trim: '录音区间', captionReview: '字幕尚未按裁剪后的录音对齐，请核对。',
  title: '原音频', source: '本步原音', choose: '选择已保存音频', removedAudio: '原音频已移除', adopt: '采用为本步配音', adopted: '已采用', retryAdoption: '重试采用', cancelAdoption: '取消采用', adoptionSourceChanged: '文稿已更新，请重试。', adoptionFailed: '无法采用这段音频，请重试。', start: '开始录音', stop: '停止录音', cancel: '取消', cancelTake: '放弃本次录音', rerecord: '重新录音',
  audition: '试听', stopAudition: '停止试听', save: '保存为音频素材', saving: '正在保存原音…', retry: '重试', discard: '放弃候选',
  ready: '原音候选 · 尚未保存', imported: '已保存为音频素材', requesting: '正在等待麦克风许可', recording: '正在录音', stopping: '正在完成录音…',
  cancelSave: '取消保存', currentSource: '文稿尚未保存，请先完成当前输入。', saveFailed: '无法保存原音。录音已保留，请重试。',
  discardTitle: '放弃这份原音？', discardHint: '未保存的录音将被删除，已保存的音频素材不受影响。', keep: '保留原音',
  failures: {
    'recording-context': '当前环境无法访问麦克风。请使用安全连接，或继续导入音频。',
    'recording-unsupported': '此浏览器无法录制受支持的音频格式。仍可导入音频。',
    'recording-permission': '麦克风未获许可。请检查浏览器权限后重试。',
    'recording-device': '没有可用的麦克风。', 'recording-device-busy': '麦克风当前无法使用，请检查设备后重试。',
    'recording-device-unsupported': '当前浏览器或设备不支持此录音请求。仍可导入音频。',
    'recording-device-ended': '麦克风连接已结束，已保留录到的原音。',
    'recording-failed': '无法完成本次录音。已有原音仍保留。', 'recording-empty': '本次没有录到音频，请重试。',
    'recording-size': '录音超过 16 MiB。请缩短录音后重试，已有候选仍保留。',
    'recording-duration': '已达到十分钟录制上限，录音已停止。',
    'audition-audio': '原音无法播放。请检查音频或重新录制。', 'audition-request': '无法开始试听，请重试。',
  } as Record<string, string>,
}
type Messages = typeof zh
const en: Messages = {
  trim: 'Recording range', captionReview: 'Captions are not aligned to the trimmed recording. Review them.',
  title: 'Original audio', source: 'Original audio for this step', choose: 'Choose Saved Audio', removedAudio: 'Original audio was removed', adopt: 'Use as Step Voiceover', adopted: 'Applied', retryAdoption: 'Retry', cancelAdoption: 'Cancel', adoptionSourceChanged: 'The document changed. Retry.', adoptionFailed: 'Couldn’t use this audio. Try again.', start: 'Start Recording', stop: 'Stop Recording', cancel: 'Cancel', cancelTake: 'Discard This Recording', rerecord: 'Record Again',
  audition: 'Play Sample', stopAudition: 'Stop Sample', save: 'Save as Audio Asset', saving: 'Saving original audio…', retry: 'Retry', discard: 'Discard Candidate',
  ready: 'Original audio candidate · Not saved', imported: 'Saved as an audio asset', requesting: 'Waiting for microphone permission', recording: 'Recording', stopping: 'Finishing recording…',
  cancelSave: 'Cancel', currentSource: 'Finish and save the current document input first.', saveFailed: 'Couldn’t save the original audio. The recording is kept; try again.',
  discardTitle: 'Discard this original audio?', discardHint: 'The recording that is not saved will be deleted. Saved audio assets are kept.', keep: 'Keep Original Audio',
  failures: {
    'recording-context': 'Microphone access is unavailable here. Use a secure connection or import an audio file.',
    'recording-unsupported': 'This browser cannot record a supported audio format. Audio file import is still available.',
    'recording-permission': 'Microphone permission was not granted. Check browser permissions and retry.',
    'recording-device': 'No microphone is available.', 'recording-device-busy': 'The microphone is unavailable. Check the device and retry.',
    'recording-device-unsupported': 'This browser or device does not support the recording request. Audio file import is still available.',
    'recording-device-ended': 'The microphone disconnected. Recorded audio is retained.',
    'recording-failed': 'Couldn’t finish this recording. Any previous original audio is kept.', 'recording-empty': 'No audio was recorded. Retry.',
    'recording-size': 'The recording exceeds 16 MiB. Record a shorter take; any previous candidate is retained.',
    'recording-duration': 'The ten-minute recording limit was reached. Recording stopped.',
    'audition-audio': 'This audio could not be played. Check it or record again.', 'audition-request': 'Couldn’t start listening. Try again.',
  },
}
export const AUDIO_RECORDING_MESSAGES: Record<Locale, Messages> = { 'zh-CN': zh, en }
