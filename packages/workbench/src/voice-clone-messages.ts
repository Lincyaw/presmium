import type { VoiceCloneStatus } from '@lincyaw/kernel'
import type { Locale } from './messages.ts'
import { WorkspaceServerError } from './workspace-client.ts'

const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

const zh = {
  open: '克隆音色…', title: '克隆音色', cloned: '克隆音色', close: '关闭', cancel: '取消',
  description: '用一个人的录音训练出一个合成音色。需要本人同意，并亲口读一遍同意声明。',
  voice: '音色名称', voiceHint: (volcengine: boolean): string => (volcengine
    ? '在火山引擎控制台购买的音色槽位（以 S_ 开头），或者给按量付费的音色起一个名字（字母开头，至少 8 个字母或数字）。'
    : '给这个音色起一个名字，只用字母、数字、“.”、“-”和“_”。'),
  voiceInvalid: '名称只能包含字母、数字、“.”、“-”和“_”，并以字母或数字开头。',
  speaker: '说话人', speakerHint: '录音里是谁的声音。', scope: '用途', scopeHint: '这个音色可以用在哪里，会写进同意记录。', defaultScope: '本工作区讲义的配音',
  statement: '同意声明录音', statementHint: '请说话人本人读出上面的同意声明。', statementText: (speaker: string, scope: string) => `我是${speaker}。我同意用我的声音训练一个合成音色，只用于${scope}。`,
  someone: '（说话人的名字）', statementLabel: '同意声明',
  passageLabel: '可以朗读的段落', passage: '今天我们从一个简单的问题开始：一张图片是怎样一步一步生成出来的？先看最基本的想法，再看它为什么有效，最后用几个例子把它们连起来。请用平时讲课的语气，自然地读下去。',
  sample: '声音样本', sampleHint: '10 到 30 秒，只有说话人一个人，环境安静。可以读上面这段。',
  sampleLength: (seconds: number) => `样本长 ${seconds.toFixed(0)} 秒。10 到 30 秒的录音效果最好。`,
  record: '录音', stop: '停止录音', choose: '选择音频文件', listen: '试听', stopListening: '停止试听', clear: '清除',
  empty: '尚未录制或选择', preparing: '正在处理录音…', seconds: (seconds: number) => `${seconds.toFixed(1)} 秒`,
  decodeFailed: '无法读取这段音频。请换一个文件，或重新录制。',
  train: '开始训练', use: '使用这个音色',
  confirmTitle: '确认训练这个音色？', confirmHint: '同意记录会先保存在本机的运营者目录中，然后把样本发送给语音服务训练。',
  costs: (provider: string, volcengine: boolean) => (volcengine
    ? `训练和之后的合成都按${provider}的价格计费。按量付费的音色在第一次合成（包括试听）时扣费，之后就不能再训练。`
    : `训练和之后的合成按${provider}的价格计费。`),
  confirm: '确认训练',
  state: (status: VoiceCloneStatus, waited: number) => status.state === 'ready'
    ? `训练完成${status.trainingsLeft === undefined ? '' : `，这个音色还可以再训练 ${status.trainingsLeft} 次`}。选择“使用这个音色”回到音色设置。`
    : status.state === 'failed' ? '训练没有成功。请换一段更清楚的样本再试。'
      : status.state === 'training' ? `正在训练… 已等待 ${clock(waited)}` : '语音服务暂时查不到这次训练，请稍后再看。',
  failures: {
    notAllowed: '运营者尚未允许使用克隆音色，请让运营者在工作区设置中开启。',
    busy: '语音服务正忙，请稍后重试。', tooLarge: '录音太大，请缩短到 30 秒左右。', format: '语音服务不接受这种音频格式，请重新录制。',
    failed: (message: string) => `训练没有开始：${message}`,
  },
}

type VoiceCloneMessages = typeof zh

const en: VoiceCloneMessages = {
  open: 'Clone a voice…', title: 'Clone a voice', cloned: 'cloned voice', close: 'Close', cancel: 'Cancel',
  description: 'Train a synthetic voice from recordings of one person. They must agree, and read the consent statement aloud themselves.',
  voice: 'Voice name', voiceHint: (volcengine: boolean) => (volcengine
    ? 'A voice slot bought in the Volcengine console (it starts with S_), or a name for a pay-as-you-go voice (a letter first, at least 8 letters or digits).'
    : 'A name for the voice: letters, digits, ".", "-" and "_" only.'),
  voiceInvalid: 'Use letters, digits, ".", "-" and "_", starting with a letter or digit.',
  speaker: 'Speaker', speakerHint: 'Whose voice this is.', scope: 'Use', scopeHint: 'Where this voice may be used; it goes into the consent record.', defaultScope: 'the narration of this workspace\'s lectures',
  statement: 'Consent statement recording', statementHint: 'The speaker reads the consent statement above.', statementText: (speaker: string, scope: string) => `I am ${speaker}. I agree that my voice is used to train a synthetic voice, only for ${scope}.`,
  someone: '(the speaker\'s name)', statementLabel: 'Consent statement',
  passageLabel: 'A passage to read', passage: 'Today we start from a simple question: how is a picture made, one step after another? First the basic idea, then why it works, and finally a few examples that tie it together. Read it the way you would speak in class, at an easy pace.',
  sample: 'Voice sample', sampleHint: '10 to 30 seconds of the speaker alone, somewhere quiet. Reading the passage above works well.',
  sampleLength: (seconds: number) => `The sample is ${seconds.toFixed(0)} seconds long. Recordings of 10 to 30 seconds work best.`,
  record: 'Record', stop: 'Stop recording', choose: 'Choose an audio file', listen: 'Play', stopListening: 'Stop', clear: 'Clear',
  empty: 'Nothing recorded or chosen yet', preparing: 'Preparing the recording…', seconds: (seconds: number) => `${seconds.toFixed(1)} s`,
  decodeFailed: 'This audio cannot be read. Choose another file, or record again.',
  train: 'Start training', use: 'Use this voice',
  confirmTitle: 'Train this voice?', confirmHint: 'The consent record is saved first, in the operator directory on this machine; then the sample is sent to the speech service.',
  costs: (provider: string, volcengine: boolean) => (volcengine
    ? `Training and every later synthesis are charged at ${provider}'s prices. A pay-as-you-go voice is charged at its first synthesis, previews included, and cannot be trained again after that.`
    : `Training and later synthesis are charged at ${provider}'s prices.`),
  confirm: 'Train',
  state: (status: VoiceCloneStatus, waited: number) => status.state === 'ready'
    ? `Trained${status.trainingsLeft === undefined ? '' : `; it can be trained ${status.trainingsLeft} more times`}. Choose "Use this voice" to return to the voice settings.`
    : status.state === 'failed' ? 'Training did not succeed. Try again with a clearer sample.'
      : status.state === 'training' ? `Training… ${clock(waited)} so far` : 'The speech service cannot find this training yet. Check again later.',
  failures: {
    notAllowed: 'The operator has not allowed cloned voices yet. Ask them to turn cloned voices on in the workspace settings.',
    busy: 'The speech service is busy. Try again shortly.', tooLarge: 'The recording is too large. Keep it to about 30 seconds.', format: 'The speech service does not take this audio format. Record again.',
    failed: (message: string) => `Training did not start: ${message}`,
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
  return t.failed(message)
}
