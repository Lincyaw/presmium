import type { VoiceCloneStatus } from '@lincyaw/kernel'
import type { Locale } from './messages.ts'
import { WorkspaceServerError } from './workspace-client.ts'

// A Latin name or number inside Chinese text takes a space on each side that does not meet full-width punctuation.
const spaced = (text: string, after = true) => `${/^[A-Za-z0-9]/.test(text) ? ' ' : ''}${text}${after && /[A-Za-z0-9]$/.test(text) ? ' ' : ''}`
const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

const zh = {
  open: '复刻音色…', title: '复刻音色', cloned: '复刻音色', close: '关闭', cancel: '取消',
  description: '用一个人的录音训练出一个合成音色。需要本人授权，并亲口读一遍授权声明。',
  voice: '音色名称', voiceHint: (volcengine: boolean): string => (volcengine
    ? '在火山引擎控制台购买的音色槽位（以 S_ 开头），或者给按量付费的音色起一个名字（字母开头，至少 8 个字母或数字）。'
    : '给这个音色起一个名字，只用字母、数字、“.”、“-”和“_”。'),
  voiceInvalid: '名称只能包含字母、数字、“.”、“-”和“_”，并以字母或数字开头。',
  speaker: '说话人', speakerHint: '录音里是谁的声音。', scope: '用途', scopeHint: '这个音色可以用在哪里，会写进授权记录。', defaultScope: '本工作区讲义的配音',
  statement: '授权声明录音', statementHint: '请说话人本人读出上面的授权声明。', statementText: (speaker: string, scope: string) => `我是${spaced(speaker, false)}。我授权用我的声音训练一个合成音色，只用于${spaced(scope, false)}。`,
  someone: '（说话人的名字）', statementLabel: '授权声明',
  passageLabel: '可以朗读的段落', passage: '今天我们从一个简单的问题开始：一张图片是怎样一步一步生成出来的？先看最基本的想法，再看它为什么有效，最后用几个例子把它们连起来。请用平时讲课的语气，自然地读下去。',
  sample: '声音样本', sampleHint: '10 到 30 秒，只有说话人一个人，环境安静。可以读上面这段。',
  sampleLength: (seconds: number) => `样本长 ${seconds.toFixed(0)} 秒。10 到 30 秒的录音效果最好。`,
  record: '录音', stop: '停止录音', choose: '选择音频文件', listen: '试听', stopListening: '停止试听', clear: '清除',
  empty: '尚未录制或选择', preparing: '正在处理录音…', seconds: (seconds: number) => `${seconds.toFixed(1)} 秒`,
  decodeFailed: '无法读取这段音频。请换一个文件，或重新录制。',
  train: '开始训练', use: '使用这个音色',
  confirmTitle: '确认训练这个音色？', confirmHint: '授权记录会先保存在本机的运营者目录中，然后把样本发送给语音服务训练。',
  costs: (provider: string, volcengine: boolean) => (volcengine
    ? `训练和之后的合成都按${spaced(provider)}的价格计费。按量付费的音色在第一次合成（包括试听）时扣费，之后就不能再训练。`
    : `训练和之后的合成按${spaced(provider)}的价格计费。`),
  confirm: '确认训练',
  state: (status: VoiceCloneStatus, waited: number) => status.state === 'ready'
    ? `训练完成${status.trainingsLeft === undefined ? '' : `，这个音色还可以再训练 ${status.trainingsLeft} 次`}。选择“使用这个音色”回到音色设置。`
    : status.state === 'failed' ? '训练失败。请换一段更清楚的样本后重试。'
      : status.state === 'training' ? `正在训练… 已等待 ${clock(waited)}` : '语音服务暂时找不到这次训练，请稍后查看。',
  failures: {
    notAllowed: '运营者尚未允许使用复刻音色，请让运营者在工作区设置中开启。',
    busy: '语音服务正忙，请稍后重试。', tooLarge: '录音太大，请缩短到 30 秒左右。', format: '语音服务不接受这种音频格式，请重新录制。',
    unsupported: '当前语音服务不支持复刻音色。请在“设置 → 语音服务”中选择支持它的服务。',
    failed: '无法开始训练。录音已保留，请稍后重试。',
  },
}

type VoiceCloneMessages = typeof zh

const en: VoiceCloneMessages = {
  open: 'Voice Cloning…', title: 'Voice Cloning', cloned: 'cloned voice', close: 'Close', cancel: 'Cancel',
  description: 'Train a synthetic voice from recordings of one person. They must agree, and read the consent statement aloud themselves.',
  voice: 'Voice name', voiceHint: (volcengine: boolean) => (volcengine
    ? 'A voice slot bought in the Volcengine console (it starts with S_), or a name for a pay-as-you-go voice (a letter first, at least 8 letters or digits).'
    : 'A name for the voice: letters, digits, “.”, “-”, and “_” only.'),
  voiceInvalid: 'Use letters, digits, “.”, “-”, and “_”, starting with a letter or digit.',
  speaker: 'Speaker', speakerHint: 'Whose voice this is.', scope: 'Use', scopeHint: 'Where this voice may be used; it goes into the consent record.', defaultScope: 'the voiceover of this workspace’s documents',
  statement: 'Consent statement recording', statementHint: 'The speaker reads the consent statement above aloud.', statementText: (speaker: string, scope: string) => `I am ${speaker}. I agree that my voice is used to train a synthetic voice, only for ${scope}.`,
  someone: '(the speaker’s name)', statementLabel: 'Consent statement',
  passageLabel: 'A passage to read', passage: 'Today we start from a simple question: how is a picture made, one step after another? First the basic idea, then why it works, and finally a few examples that tie it together. Read it the way you would speak in class, at an easy pace.',
  sample: 'Voice sample', sampleHint: '10 to 30 seconds of the speaker alone, somewhere quiet. Reading the passage above works well.',
  sampleLength: (seconds: number) => `The sample is ${seconds.toFixed(0)} seconds long. Recordings of 10 to 30 seconds work best.`,
  record: 'Record', stop: 'Stop Recording', choose: 'Choose Audio File', listen: 'Play Sample', stopListening: 'Stop Sample', clear: 'Clear',
  empty: 'Nothing recorded or chosen yet', preparing: 'Preparing the recording…', seconds: (seconds: number) => `${seconds.toFixed(1)} s`,
  decodeFailed: 'Couldn’t read this audio. Choose another file, or record again.',
  train: 'Start Training', use: 'Use This Voice',
  confirmTitle: 'Train this voice?', confirmHint: 'The consent record is saved first, in the operator directory on this machine; then the sample is sent to the voice service for training.',
  costs: (provider: string, volcengine: boolean) => (volcengine
    ? `Training and every later voiceover are charged at ${provider}’s prices. A pay-as-you-go voice is charged when it first generates voiceover, listening included, and can’t be trained again after that.`
    : `Training and later voiceover are charged at ${provider}’s prices.`),
  confirm: 'Train',
  state: (status: VoiceCloneStatus, waited: number) => status.state === 'ready'
    ? `Trained${status.trainingsLeft === undefined ? '' : `; it can be trained ${status.trainingsLeft} more times`}. Choose Use This Voice to return to the voice settings.`
    : status.state === 'failed' ? 'Training failed. Try again with a clearer sample.'
      : status.state === 'training' ? `Training… ${clock(waited)} so far` : 'The voice service can’t find this training yet. Check again later.',
  failures: {
    notAllowed: 'The operator has not allowed cloned voices yet. Ask them to turn cloned voices on in the workspace settings.',
    busy: 'The voice service is busy. Try again shortly.', tooLarge: 'The recording is too large. Keep it to about 30 seconds.', format: 'The voice service doesn’t accept this audio format. Record again.',
    unsupported: 'The current voice service doesn’t support Voice Cloning. Choose one that does in Settings → Voice Service.',
    failed: 'Couldn’t start training. The recordings are kept; try again shortly.',
  },
}

export const VOICE_CLONE_MESSAGES: Record<Locale, VoiceCloneMessages> = { 'zh-CN': zh, en }

export function cloneFailure(error: unknown, locale: Locale): string {
  const t = VOICE_CLONE_MESSAGES[locale].failures
  const status = error instanceof WorkspaceServerError ? error.status : 0
  const message = error instanceof Error ? error.message : String(error)
  if (status === 403 && /cloned voices are off|not allowed/.test(message)) return t.notAllowed
  if (status === 429) return t.busy
  if (status === 413) return t.tooLarge
  if (status === 415) return t.format
  if (status === 400 && /cannot (?:clone|train cloned) voices/.test(message)) return t.unsupported
  console.warn(`presmium: voice cloning failed: ${message}`)
  return t.failed
}
