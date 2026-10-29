import type { Locale } from './messages.ts'
import { WorkspaceServerError } from './workspace-client.ts'

const zh = {
  voice: '音色', settings: '选择音色', generate: '生成配音', generation: '配音生成与更新',
  currentVoice: '当前音色', unset: '尚未选择音色', inherited: { step: '独立设置', page: '继承页面', document: '继承文稿默认', unset: '未设置' },
  loading: '正在加载音色设置…', loadingVoices: '正在加载可用音色…', loadFailed: '无法加载音色设置，请重试。',
  unsupported: '当前工作区服务尚不支持音色设置。请更新并重新启动 Presmium。',
  noService: '未连接语音服务。',
  noServiceOption: '尚未连接', savedEngineUnavailable: '已保存的服务（未连接）', generationUnavailable: '当前文稿尚未启用配音生成，讲稿与音色设置仍然保留。',
  catalogUnsupported: '此服务尚未提供音色目录。已保存的音色设置仍然保留。',
  voiceUnavailable: '所选音色不支持此文稿语言或当前服务，请重新选择。', parametersUnsupported: '当前服务不支持所选参数，请刷新音色目录后重新检查。',
  previewTooLong: '当前步骤讲稿超过试听长度，请生成配音后播放。', sourceUnsupported: '此文稿的来源格式暂不支持安全修改音色。原设置和草稿已保留。',
  bundledCatalog: '音色来自服务的内置目录，合成时检查连接。',
  search: '查找音色', searchPlaceholder: '名称、语言或声音来源', available: '可用音色', empty: '没有符合条件的音色',
  results: (count: number) => `${count} 个音色`, language: '语言', allLanguages: '全部语言', provider: '语音服务',
  details: '音色详情', languageMismatch: '不支持文稿的语言', standard: '试听标准示例', currentScript: '试听当前讲稿',
  stop: '停止试听', auditioning: '正在试听', auditionLoading: '正在准备试听…',
  auditionFailed: '无法试听，请重试。音色设置未更改。',
  pauseUnavailable: '预览尚不支持暂停播放，暂时无法试听。请重新加载文稿。',
  pauseTimeout: '无法确认播放已暂停，请重试。',
  changed: '文稿或音色设置已更新。草稿已保留，请按当前步骤重新检查应用范围。',
  draftRecovered: '已恢复尚未应用的音色设置草稿，请检查范围后应用。', recoveryFailed: '无法在此浏览器保留音色草稿，请在关闭前应用或复制设置。',
  recheck: '按当前步骤重新检查', scope: '应用范围', scopes: { step: '当前步骤', steps: '所选步骤', page: '当前页', document: '整份文稿' },
  selectedSteps: '选择步骤', step: (page: number, step: number) => `第 ${page} 页，步骤 ${step}`,
  selected: (count: number) => `已选择 ${count} 个步骤`, inherit: '使用继承的音色', inheritHint: '改用最近的页面或文稿默认音色。',
  pageScript: (page: number) => `第 ${page} 页，关联讲稿（按页生成）`,
  replace: '已有覆盖', preserve: '保留独立设置', replaceAll: '替换独立设置',
  counts: (updated: number, preserved: number) => `将更新 ${updated} 个步骤，保留 ${preserved} 个独立设置。`,
  check: '检查应用范围', checking: '正在检查应用范围…', apply: '应用设置', saved: '音色设置已保存。', cachedPreview: '本次使用已有配音缓存。', clearDefault: '清除文稿默认音色',
  rate: '语速', rateInvalid: (min: number, max: number) => `请输入 ${min}–${max} 之间的数值。`, style: '朗读风格', styleDefault: '服务默认',
  cueStep: '此讲稿包含跨步骤提示，暂不支持单独覆盖音色。可设置页面或文稿默认音色。',
  disclosure: (provider: string, local: boolean) => local ? `本次在本机通过 ${provider} 合成。` : `本次将所示讲稿发送至 ${provider} 合成配音。`,
  confirmPreview: '确认并试听', sampleText: '标准示例文本', source: '声音来源', previewHint: '确认后播放已有缓存或请求合成；选择音色本身不会生成配音。',
  refreshing: '正在加载配音状态…', refresh: '刷新状态', missingOnly: '只生成缺失与需要更新的片段',
  confirmGenerate: '确认并生成', cancelJob: '取消生成', oldVersion: '较早文稿版本', noScript: '当前范围没有可生成的讲稿。',
  statuses: { ready: '可播放', missing: '需要生成', blocked: '暂不可生成', empty: '没有讲稿' },
  jobs: { queued: '等待生成', running: '正在生成', cancelling: '正在取消', cancelled: '已取消', done: '已完成', failed: '生成失败', stale: '文稿已更新' },
  progress: (done: number, total: number, failed: number) => `已完成 ${done} / ${total}${failed ? `，失败 ${failed}` : ''}`,
  generationSummary: (missing: number, blocked: number) => [missing ? `待生成 ${missing} 段` : '', blocked ? `${blocked} 段不可用` : ''].filter(Boolean).join(' · '),
  generationScript: '本次范围的讲稿',
  generationBusy: '此文稿已有生成操作，请等待完成或取消后重试。', cacheReady: '配音已就绪。',
  unboundScript: '此页有关联到跨步骤提示的讲稿，请选择页面或文稿范围生成。',
  recordingUnavailable: '本步使用原音频，无需生成语音。',
  silentScope: (count: number) => `${count} 个步骤已明确设置为静音，设置保持不变。`,
  requestFailed: '无法完成操作。设置和草稿已保留，请重试。', cancel: '取消', close: '关闭', cancelAndClose: '取消并关闭', retry: '重试',
}
type VoiceMessages = typeof zh
const en: VoiceMessages = {
  voice: 'Voice', settings: 'Choose Voice', generate: 'Generate Voiceover', generation: 'Voiceover Generation and Updates',
  currentVoice: 'Current voice', unset: 'No voice selected', inherited: { step: 'Independent setting', page: 'Inherited from page', document: 'Inherited from document', unset: 'Not set' },
  loading: 'Loading voice settings…', loadingVoices: 'Loading available voices…', loadFailed: 'Couldn’t load voice settings. Try again.',
  unsupported: 'This workspace service does not support voice settings yet. Update and restart Presmium.',
  noService: 'No voice service is connected.',
  noServiceOption: 'Not connected', savedEngineUnavailable: 'Saved service (not connected)', generationUnavailable: 'Voiceover generation is not enabled for this document. Script and voice settings are kept.',
  catalogUnsupported: 'This service does not provide a list of voices. Your saved voice settings are kept.',
  voiceUnavailable: 'The selected voice does not support the document language or service. Choose another voice.', parametersUnsupported: 'This service does not support the selected parameters. Refresh the list of voices and check again.',
  previewTooLong: 'This step’s script exceeds the preview limit. Generate voiceover to play it.', sourceUnsupported: 'The document’s source format cannot safely update voice settings yet. Settings and drafts are kept.',
  bundledCatalog: 'Voices come from the service’s built-in list. The connection is checked when voiceover is generated.',
  search: 'Find a voice', searchPlaceholder: 'Name, language, or voice source', available: 'Available voices', empty: 'No matching voices',
  results: count => `${count} voices`, language: 'Language', allLanguages: 'All languages', provider: 'Voice service',
  details: 'Voice details', languageMismatch: 'Does not support the document language', standard: 'Listen to Standard Sample', currentScript: 'Listen to Current Script',
  stop: 'Stop Listening', auditioning: 'Playing', auditionLoading: 'Preparing to play…',
  auditionFailed: 'Couldn’t play the sample. Try again; your voice settings haven’t changed.',
  pauseUnavailable: 'The preview can’t pause playback yet, so listening is unavailable. Reload the document.',
  pauseTimeout: 'Couldn’t confirm that playback paused. Try again.',
  changed: 'The document or voice settings changed. Your draft is kept; check the scope again for the current step.',
  draftRecovered: 'Your draft voice settings were recovered. Check the scope before applying them.', recoveryFailed: 'Voice drafts can’t be kept in this browser. Apply or copy your settings before closing.',
  recheck: 'Check Again for Current Step', scope: 'Apply to', scopes: { step: 'Current step', steps: 'Selected steps', page: 'Current page', document: 'Entire document' },
  selectedSteps: 'Select Steps', step: (page, step) => `Page ${page}, step ${step}`, selected: count => `${count} steps selected`,
  pageScript: page => `Page ${page}, linked script (generate by page)`,
  inherit: 'Use Inherited Voice', inheritHint: 'Use the nearest page or document default voice.',
  replace: 'Existing overrides', preserve: 'Keep independent settings', replaceAll: 'Replace independent settings',
  counts: (updated, preserved) => `${updated} steps will update; ${preserved} independent settings will be kept.`,
  check: 'Check Scope', checking: 'Checking scope…', apply: 'Apply Settings', saved: 'Voice settings saved.', cachedPreview: 'This preview uses an existing voiceover cache.', clearDefault: 'Clear Document Default Voice',
  rate: 'Speaking rate', rateInvalid: (min, max) => `Enter a number between ${min} and ${max}.`, style: 'Reading style', styleDefault: 'Service default',
  cueStep: 'This script has cues across steps. A step voice override is not supported yet; set a page or document default instead.',
  disclosure: (provider, local) => local ? `The voiceover is generated on this device with ${provider}.` : `The script shown is sent to ${provider} to generate the voiceover.`,
  confirmPreview: 'Confirm and Listen', sampleText: 'Standard sample text', source: 'Voice source', previewHint: 'After you confirm, a saved voiceover plays or a new one is generated. Choosing a voice doesn’t generate voiceover.',
  refreshing: 'Loading voiceover status…', refresh: 'Refresh Status', missingOnly: 'Generate only missing clips and clips that need updating',
  confirmGenerate: 'Confirm and Generate', cancelJob: 'Cancel Generating', oldVersion: 'Earlier document version', noScript: 'There is no script to generate in this scope.',
  statuses: { ready: 'Playable', missing: 'Needs generation', blocked: 'Unavailable', empty: 'No script' },
  jobs: { queued: 'Queued', running: 'Generating', cancelling: 'Canceling', cancelled: 'Canceled', done: 'Completed', failed: 'Generation failed', stale: 'Document changed' },
  progress: (done, total, failed) => `${done} / ${total} completed${failed ? `; ${failed} failed` : ''}`,
  generationSummary: (missing, blocked) => [missing ? `${missing} ${missing === 1 ? 'clip' : 'clips'} to generate` : '', blocked ? `${blocked} ${blocked === 1 ? 'clip' : 'clips'} unavailable` : ''].filter(Boolean).join(' · '),
  generationScript: 'Script in this scope',
  generationBusy: 'Voiceover is already being generated for this document. Wait for it or cancel it, then try again.', cacheReady: 'Voiceover is ready.',
  unboundScript: 'This page has script with cues across steps. Choose a page or document scope to generate it.',
  recordingUnavailable: 'This step uses original audio, so no voiceover needs to be generated.',
  silentScope: count => `${count} steps are explicitly silent. Their settings are kept.`,
  requestFailed: 'Couldn’t finish the operation. Settings and drafts are kept; try again.', cancel: 'Cancel', close: 'Close', cancelAndClose: 'Cancel and Close', retry: 'Retry',
}
export const VOICE_MESSAGES: Record<Locale, VoiceMessages> = { 'zh-CN': zh, en }

export function voiceFailure(error: unknown, locale: Locale): string {
  const t = VOICE_MESSAGES[locale]
  const message = error instanceof Error ? error.message : ''
  if (message === 'not-configured' || message === 'voice-not-configured') return t.noService
  if (message === 'voice-unavailable' || message === 'voice-engine-unsupported' || message === 'voice-engine-unknown') return t.voiceUnavailable
  if (message === 'voice-catalog-unavailable' || message === 'catalog-unavailable') return t.catalogUnsupported
  if (message === 'voice-cue-step') return t.cueStep
  if (message === 'voice-script-empty') return t.noScript
  if (message === 'voice-preview-too-long' || message === 'voice-preview-too-large') return t.previewTooLong
  if (message === 'voice-rate-unsupported' || message === 'voice-style-unsupported') return t.parametersUnsupported
  if (message === 'voice-source-format' || message === 'voice-source-ignored') return t.sourceUnsupported
  if (message === 'voiceover-unavailable') return t.generationUnavailable
  if (message === 'voice-job-busy') return t.generationBusy
  if (message === 'voice-unset') return t.unset
  if (message === 'recording-unavailable' || message === 'voice-recording-unavailable') return t.recordingUnavailable
  if (message === 'speech-unavailable' || message.startsWith('no speech service:')) return t.noService
  if (['voice-source-changed', 'voice-source-unavailable', 'voice-source-pending', 'voice-revision-changed', 'voice-preview-changed', 'voice-step-binding-stale', 'voice-target-changed'].includes(message)) return t.changed
  if (error instanceof WorkspaceServerError) {
    if (error.status === 404) return t.unsupported
    if (error.status === 409) return t.changed
  }
  if (message === 'voice-context-changed') return t.changed
  if (message === 'preview-playback-timeout') return t.pauseTimeout
  if (message.startsWith('preview-playback-')) return t.pauseUnavailable
  if (message.startsWith('audition-')) return t.auditionFailed
  return t.requestFailed
}
