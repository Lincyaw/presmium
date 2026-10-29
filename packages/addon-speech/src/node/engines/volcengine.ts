import { randomUUID } from 'node:crypto'
import type { Logger, SpeechWord, Transcript, TranscriptSegment, VoiceCloneState, VoiceInfo } from '@lincyaw/kernel'
import { isRecord } from '@lincyaw/kernel'
import type { EngineDefinition } from '../../domain/index.ts'
import { audioMime } from '../audio/label.ts'
import { SpeechError } from '../errors.ts'
import type { EngineAdapter, EngineCloneRequest, EngineCloneStatus, EngineSynthesisRequest, EngineSynthesisResult, EngineTranscriptionRequest } from './types.ts'
import { speaks } from './types.ts'
import { volcengineConsole } from './volcengine-console.ts'
import { VOLCENGINE_VOICES } from './volcengine-voices.ts'

// Volcengine speech (豆包语音) over its HTTP API with the operator's API key: synthesis with the 2.0 model
// (seed-tts-2.0; cloned voices on seed-icl-2.0), the flash recognizer, and voice cloning 2.0 (voice_clone,
// get_voice). No SDK covers these; the account side (the voice list, the account's cloned voices) goes through the
// official SDK in volcengine-console.ts when the operator also gives an IAM access key pair.

const TTS = '/api/v3/tts/unidirectional'
const ASR = '/api/v3/auc/bigmodel/recognize/flash'
const CLONE = '/api/v3/tts/voice_clone'
const VOICE = '/api/v3/tts/get_voice'
const OK = 20000000
const SILENT = '20000003'
const TTS_MODEL = 'seed-tts-2.0'
const CLONE_RESOURCE = 'seed-icl-2.0'

/**
 * Official voice ids follow the provider's naming (zh_…_uranus_bigtts, ICL_uranus_…_tob, BV…); a prepaid cloned
 * voice is an S_… slot, and a postpaid one has a name of the operator's that Volcengine forbids from looking like
 * either (no xx_, ICL_, MIX_, DiT_ or BV prefix, no _bigtts, _tob or _streaming suffix).
 */
const OFFICIAL = /^(ICL_|MIX_|DiT_|BV)|^[a-z]{2}_|_(bigtts|tob|streaming)$/
export function volcengineCloned(voice: string): boolean {
  return voice.startsWith('S_') || !OFFICIAL.test(voice)
}

/** A postpaid voice's own name, as Volcengine accepts it. */
function customName(voice: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{7,127}$/.test(voice) && !OFFICIAL.test(voice)
}

/**
 * The language to fix, for text that is not Chinese. Chinese narration is left to the model, which reads the
 * English words in it; fixing zh-cn risks dropping them, since text in another language than the fixed one is
 * skipped.
 */
function explicitLanguage(lang: string): string | undefined {
  const [primary = '', region = ''] = lang.toLowerCase().split('-')
  if (!primary || primary === 'zh') return undefined
  if ((primary === 'pt' && region === 'br') || (primary === 'es' && region === 'mx')) return `${primary}-${region}`
  return primary
}

/** voice_clone's language numbers. */
const CLONE_LANGUAGES: Record<string, number> = { zh: 0, en: 1, ja: 2, es: 3, id: 4, pt: 5, de: 6, fr: 7, ko: 8, it: 9, th: 10, vi: 11, ru: 12, fil: 13, ms: 14, ar: 15, pl: 19, tr: 20, sv: 21 }
function cloneLanguage(lang: string | undefined): number {
  const [primary = 'zh', region = ''] = (lang ?? 'zh').toLowerCase().split('-')
  if (primary === 'es' && region === 'mx') return 16
  if (primary === 'pt' && region === 'br') return 17
  return CLONE_LANGUAGES[primary] ?? 0
}

/** get_voice's states: 0 not found, 1 training, 2 trained, 3 failed, 4 activated (trained and in use). */
const STATES: VoiceCloneState[] = ['unknown', 'training', 'ready', 'failed', 'ready']

const FORMATS: Record<string, string> = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' }
const MAX_SAMPLE = 10 * 1024 * 1024

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

/** Volcengine answers too many concurrent requests (the default is 10 per model) with 45000000 and a quota message. */
function failure(what: string, status: number, body: string): SpeechError {
  if (/quota exceeded/i.test(body) && /concurrency/i.test(body)) return new SpeechError(429, `${what} is busy: more requests at once than the account's concurrency quota; try again shortly`)
  return new SpeechError(502, `${what} answered ${status}: ${body.slice(0, 300)}`)
}

export function volcengineEngine(engine: EngineDefinition, log?: Logger): EngineAdapter {
  const auth = (appHeader: string): Record<string, string> => (engine.appid
    ? { [appHeader]: engine.appid, 'X-Api-Access-Key': engine.key ?? '' }
    : { 'X-Api-Key': engine.key ?? '' })
  const what = 'Volcengine (火山引擎)'
  const account = engine.console ? volcengineConsole(engine.console) : undefined

  const catalog = async (signal?: AbortSignal): Promise<{ source: 'provider' | 'bundled', voices: VoiceInfo[] }> => {
    if (!account) return { source: 'bundled', voices: VOLCENGINE_VOICES }
    try {
      const [speakers, cloned] = await Promise.all([account.speakers(TTS_MODEL, signal), account.cloned(signal)])
      const official = new Set(speakers.map(voice => voice.id))
      return { source: 'provider', voices: [...speakers, ...cloned.filter(voice => !official.has(voice.id))] }
    } catch (error) {
      signal?.throwIfAborted()
      // The account's list is a convenience: synthesis does not depend on it, so the bundled list stands in.
      log?.warn(`${what}: the account's voice list is unavailable, so the bundled one is shown: ${error instanceof Error ? error.message : String(error)}`)
      return { source: 'bundled', voices: VOLCENGINE_VOICES }
    }
  }

  const cloneStatusOf = (answer: Record<string, unknown>): EngineCloneStatus => {
    const state = typeof answer.status === 'number' ? STATES[answer.status] ?? 'unknown' : 'unknown'
    return { state, ...typeof answer.available_training_times === 'number' ? { trainingsLeft: answer.available_training_times } : {} }
  }
  const cloneCall = async (path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    const response = await fetch(`${engine.url}${path}`, {
      method: 'POST',
      headers: { ...auth('X-Api-App-Key'), 'X-Api-Request-Id': randomUUID(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal,
    })
    const text = await response.text()
    if (!response.ok) throw failure(what, response.status, text)
    let answer: unknown
    try { answer = JSON.parse(text) } catch { throw new SpeechError(502, `${what} answered with no JSON: ${text.slice(0, 200)}`) }
    if (!isRecord(answer)) throw new SpeechError(502, `${what} answered with no object`)
    const code = typeof answer.code === 'number' ? answer.code : 0
    if (code !== 0 && code !== OK) throw new SpeechError(502, `${what}: ${code} ${String(answer.message ?? '')}`)
    return answer
  }
  const speaker = (voice: string) => (voice.startsWith('S_') ? { speaker_id: voice } : { speaker_id: 'custom_speaker_id', custom_speaker_id: voice })

  return {
    async voices(lang, signal) {
      return (await catalog(signal)).voices.filter(voice => speaks(voice, lang))
    },
    async voiceCatalog(lang, signal) {
      const { source, voices } = await catalog(signal)
      return { status: 'available', source, voices: voices.filter(voice => speaks(voice, lang)) }
    },

    cloned: volcengineCloned,

    async synthesize(request: EngineSynthesisRequest, signal): Promise<EngineSynthesisResult> {
      const cloned = volcengineCloned(request.voice)
      const additions: Record<string, unknown> = {}
      const language = explicitLanguage(request.lang)
      if (language) additions.explicit_language = language
      // A style is an instruction to the model (context_texts); cloned voices take the expressive model instead.
      if (request.style && !cloned) additions.context_texts = [request.style]
      const rate = request.rate ? Math.max(-50, Math.min(100, Math.round((request.rate - 1) * 100))) : 0
      const response = await fetch(`${engine.url}${TTS}`, {
        method: 'POST',
        headers: {
          ...auth('X-Api-App-Id'),
          'X-Api-Resource-Id': cloned ? CLONE_RESOURCE : engine.model,
          'X-Api-Request-Id': randomUUID(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: { uid: 'presmium' },
          req_params: {
            text: request.text,
            speaker: request.voice,
            ...cloned ? { model: request.style ? 'seed-tts-2.0-expressive' : 'seed-tts-2.0-standard' } : {},
            // Ogg/Opus only at 48 kHz in the 2.0 API.
            audio_params: { format: 'ogg_opus', sample_rate: 48000, enable_subtitle: true, speech_rate: rate },
            additions: JSON.stringify(additions),
          },
        }),
        redirect: 'error',
        signal,
      })
      const text = await response.text()
      if (!response.ok) throw failure(what, response.status, text)
      const chunks: Buffer[] = []
      const words: SpeechWord[] = []
      // Word times arrive in their own lines, possibly after later audio: read every line before finishing.
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        let event: Record<string, unknown>
        try {
          event = JSON.parse(line) as Record<string, unknown>
        } catch {
          continue
        }
        if (event.code !== 0 && event.code !== OK) throw failure(what, response.status, `${String(event.code)} ${String(event.message ?? '')}`)
        if (typeof event.data === 'string' && event.data) chunks.push(Buffer.from(event.data, 'base64'))
        if (isRecord(event.sentence)) words.push(...wordsOf(event.sentence.words, v => (typeof v === 'number' ? v : 0), ['startTime', 'endTime']))
      }
      if (chunks.length === 0) throw new SpeechError(502, `${what} gave no audio`)
      return { audio: new Uint8Array(Buffer.concat(chunks)), contentType: 'audio/ogg', words, ...words.length ? { duration: words.at(-1)!.end } : {} }
    },

    async transcribe(input: EngineTranscriptionRequest, signal): Promise<Transcript> {
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

    async clone(request: EngineCloneRequest, signal): Promise<EngineCloneStatus> {
      if (!request.voice.startsWith('S_') && !customName(request.voice)) {
        throw new SpeechError(400, `"${request.voice}" is neither a voice slot of the account (S_…) nor a name Volcengine accepts for a pay-as-you-go cloned voice: 8–128 letters, digits, "_" or "-", starting with a letter, not shaped like an official voice id`)
      }
      if (request.audio.byteLength > MAX_SAMPLE) throw new SpeechError(413, `the sample is ${Math.round(request.audio.byteLength / 1024 / 1024)} MB; Volcengine takes at most 10 MB`)
      const format = FORMATS[audioMime(request.audio, request.mime).split(';')[0]!.trim()]
      if (!format) throw new SpeechError(415, `Volcengine trains from WAV, MP3, Ogg, M4A or AAC, not ${request.mime || 'this file'}`)
      const answer = await cloneCall(CLONE, {
        ...speaker(request.voice),
        audio: { data: Buffer.from(request.audio).toString('base64'), format },
        ...request.text ? { text: request.text } : {},
        language: cloneLanguage(request.lang),
        extra_params: { enable_audio_denoise: true },
      }, signal)
      // The training answer may not carry a status yet: it has started.
      const status = cloneStatusOf(answer)
      return status.state === 'unknown' ? { ...status, state: 'training' } : status
    },

    async cloneStatus(voice, signal): Promise<EngineCloneStatus> {
      return cloneStatusOf(await cloneCall(VOICE, speaker(voice), signal))
    },
  }
}
