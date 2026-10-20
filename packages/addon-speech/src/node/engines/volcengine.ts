import { randomUUID } from 'node:crypto'
import type { SpeechWord, Transcript, TranscriptSegment, VoiceInfo } from '@lincyaw/kernel'
import { isRecord } from '@lincyaw/kernel'
import type { EngineDefinition } from '../../domain/index.ts'
import { SpeechError } from '../errors.ts'
import type { EngineAdapter, EngineAudio, EngineInput, EngineSynthesis } from './types.ts'
import { speaks } from './types.ts'

const TTS = '/api/v3/tts/unidirectional'
const ASR = '/api/v3/auc/bigmodel/recognize/flash'
const OK = 20000000
const SILENT = '20000003'

const VOICES: VoiceInfo[] = [
  { id: 'zh_female_vv_uranus_bigtts', label: 'Vivi 2.0', lang: ['zh-CN', 'en-US', 'ja-JP'] },
  { id: 'zh_female_xiaohe_uranus_bigtts', label: '小何 2.0', lang: ['zh-CN', 'en-US'] },
  { id: 'zh_male_m191_uranus_bigtts', label: '云舟 2.0', lang: ['zh-CN', 'en-US'] },
  { id: 'zh_male_taocheng_uranus_bigtts', label: '小天 2.0', lang: ['zh-CN', 'en-US'] },
  { id: 'en_male_tim_uranus_bigtts', label: 'Tim', lang: ['en-US'] },
  { id: 'en_female_dacey_uranus_bigtts', label: 'Dacey', lang: ['en-US'] },
]

export function volcengineCloned(voice: string): boolean {
  return voice.startsWith('S_')
}

function secondsOf(value: unknown): number {
  return typeof value === 'number' ? value / 1000 : 0
}

function wordsOf(value: unknown, scale: (v: unknown) => number, key: [string, string]): SpeechWord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((word) => {
    if (!isRecord(word)) return []
    const text = typeof word.word === 'string' ? word.word : typeof word.text === 'string' ? word.text : ''
    return text ? [{ text, start: scale(word[key[0]]), end: scale(word[key[1]]) }] : []
  })
}

export function volcengineEngine(engine: EngineDefinition): EngineAdapter {
  const auth = (appHeader: string): Record<string, string> => (engine.appid
    ? { [appHeader]: engine.appid, 'X-Api-Access-Key': engine.key ?? '' }
    : { 'X-Api-Key': engine.key ?? '' })
  const what = 'Volcengine (火山引擎)'

  return {
    async voices(lang) {
      return VOICES.filter(voice => speaks(voice, lang))
    },

    cloned: volcengineCloned,

    async synthesize(request: EngineSynthesis, signal): Promise<EngineAudio> {
      const additions: Record<string, unknown> = {}
      if (request.lang.toLowerCase().startsWith('en')) additions.explicit_language = 'en'
      if (request.style) additions.context_texts = [request.style]
      const rate = request.rate ? Math.max(-50, Math.min(100, Math.round((request.rate - 1) * 100))) : 0
      const response = await fetch(`${engine.url}${TTS}`, {
        method: 'POST',
        headers: {
          ...auth('X-Api-App-Id'),
          'X-Api-Resource-Id': volcengineCloned(request.voice) ? 'seed-icl-2.0' : engine.model,
          'X-Api-Request-Id': randomUUID(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: { uid: 'presmium' },
          req_params: {
            text: request.text,
            speaker: request.voice,
            audio_params: { format: 'ogg_opus', sample_rate: 24000, enable_subtitle: true, speech_rate: rate },
            additions: JSON.stringify(additions),
          },
        }),
        redirect: 'error',
        signal,
      })
      const text = await response.text()
      if (!response.ok) throw new SpeechError(502, `${what} answered ${response.status}: ${text.slice(0, 300)}`)
      const chunks: Buffer[] = []
      const words: SpeechWord[] = []
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        let event: Record<string, unknown>
        try {
          event = JSON.parse(line) as Record<string, unknown>
        } catch {
          continue
        }
        if (event.code !== 0 && event.code !== OK) throw new SpeechError(502, `${what}: ${String(event.code)} ${String(event.message ?? '')}`)
        if (typeof event.data === 'string' && event.data) chunks.push(Buffer.from(event.data, 'base64'))
        if (isRecord(event.sentence)) words.push(...wordsOf(event.sentence.words, v => (typeof v === 'number' ? v : 0), ['startTime', 'endTime']))
      }
      if (chunks.length === 0) throw new SpeechError(502, `${what} gave no audio`)
      return { audio: new Uint8Array(Buffer.concat(chunks)), contentType: 'audio/ogg', words, ...words.length ? { duration: words.at(-1)!.end } : {} }
    },

    async transcribe(input: EngineInput, signal): Promise<Transcript> {
      const format = input.mime.includes('wav') ? { format: 'wav' } : input.mime.includes('ogg') ? { format: 'ogg', codec: 'opus' } : input.mime.includes('mpeg') || input.mime.includes('mp3') ? { format: 'mp3' } : undefined
      if (!format) throw new SpeechError(400, `Volcengine's recognition takes WAV, MP3 or Ogg/Opus, not ${input.mime}`)
      const language = input.lang && !input.lang.toLowerCase().startsWith('zh') ? { language: input.lang } : {}
      const response = await fetch(`${engine.url}${ASR}`, {
        method: 'POST',
        headers: {
          ...auth('X-Api-App-Key'),
          'X-Api-Resource-Id': engine.transcribeModel,
          'X-Api-Request-Id': randomUUID(),
          'X-Api-Sequence': '-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: { uid: 'presmium' },
          audio: { data: Buffer.from(input.audio).toString('base64'), ...format, ...language },
          request: {
            model_name: 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            show_utterances: true,
            ...input.hints?.length ? { corpus: { context: JSON.stringify({ hotwords: input.hints.map(word => ({ word })) }) } } : {},
          },
        }),
        redirect: 'error',
        signal,
      })
      const status = response.headers.get('x-api-status-code')
      const body = await response.text()
      const lang = input.lang ?? 'zh-CN'
      if (status === SILENT) return { lang, duration: 0, text: '', segments: [] }
      if (!response.ok || (status && Number(status) !== OK)) throw new SpeechError(502, `${what} answered ${response.status} ${status ?? ''} ${response.headers.get('x-api-message') ?? ''}: ${body.slice(0, 300)}`)
      const answer = JSON.parse(body) as { audio_info?: { duration?: number }, result?: { text?: string, utterances?: unknown[] } }
      const segments: TranscriptSegment[] = (answer.result?.utterances ?? []).flatMap(u => (isRecord(u)
        ? [{ start: secondsOf(u.start_time), end: secondsOf(u.end_time), text: typeof u.text === 'string' ? u.text : '', words: wordsOf(u.words, secondsOf, ['start_time', 'end_time']) }]
        : []))
      return { lang, duration: secondsOf(answer.audio_info?.duration) || (segments.at(-1)?.end ?? 0), text: answer.result?.text ?? segments.map(s => s.text).join(''), segments }
    },
  }
}
