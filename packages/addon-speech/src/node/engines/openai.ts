import type { SpeechWord, Transcript, VoiceInfo } from '@presmium/kernel'
import { isRecord } from '@presmium/kernel'
import type { EngineDefinition } from '../../domain/index.ts'
import { oneSegment, wordsIntoSegments } from '../../domain/index.ts'
import { answerError, SpeechError } from '../errors.ts'
import type { EngineAdapter, EngineAudio, EngineInput, EngineSynthesis } from './types.ts'
import { speaks } from './types.ts'

export function blobOf(bytes: Uint8Array, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

function timedWords(value: unknown): SpeechWord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((word) => {
    if (!isRecord(word) || typeof word.start !== 'number' || typeof word.end !== 'number') return []
    const text = typeof word.text === 'string' ? word.text : typeof word.word === 'string' ? word.word : ''
    return text.trim() ? [{ text: text.trim(), start: word.start, end: word.end }] : []
  })
}

function voiceOf(value: unknown): VoiceInfo | undefined {
  if (typeof value === 'string') return { id: value, label: value, lang: [] }
  if (!isRecord(value)) return undefined
  const id = [value.id, value.voice_id, value.name].find((v): v is string => typeof v === 'string' && v.length > 0)
  if (!id) return undefined
  const langs = [value.lang, value.language, value.languages].flat().filter((v): v is string => typeof v === 'string')
  return { id, label: typeof value.label === 'string' ? value.label : typeof value.name === 'string' ? value.name : id, lang: langs, ...value.cloned === true ? { cloned: true } : {} }
}

export function openaiEngine(engine: EngineDefinition): EngineAdapter {
  let timestamps = true
  const call = (path: string, init: RequestInit, signal?: AbortSignal) => fetch(`${engine.url}/${path}`, {
    ...init,
    headers: { ...engine.key ? { Authorization: `Bearer ${engine.key}` } : {}, ...init.headers as Record<string, string> },
    redirect: 'error',
    signal,
  })
  const what = `speech engine "${engine.id}" (${engine.provider})`

  return {
    async voices(lang, signal) {
      const response = await call('audio/voices', { method: 'GET' }, signal)
      if (response.status === 404 || response.status === 405) return []
      if (!response.ok) throw await answerError(response, what)
      const body: unknown = await response.json().catch(() => undefined)
      const list = isRecord(body) ? body.voices ?? body.data : body
      if (!Array.isArray(list)) throw new SpeechError(502, `${what} answered audio/voices without a list of voices`)
      return list.flatMap(item => voiceOf(item) ?? []).filter(voice => speaks(voice, lang))
    },

    async synthesize(request: EngineSynthesis, signal): Promise<EngineAudio> {
      const body = JSON.stringify({
        model: engine.model,
        voice: request.voice,
        input: request.text,
        response_format: 'opus',
        language: request.lang,
        ...request.rate ? { speed: request.rate } : {},
        ...request.style ? { instructions: request.style } : {},
      })
      const headers = { 'Content-Type': 'application/json' }
      if (timestamps) {
        const response = await call('audio/speech/timestamps', { method: 'POST', headers, body }, signal)
        if (response.ok) {
          const answer = await response.json() as { audio?: unknown, duration?: unknown, words?: unknown }
          if (typeof answer.audio !== 'string') throw new SpeechError(502, `${what} gave no audio`)
          return { audio: new Uint8Array(Buffer.from(answer.audio, 'base64')), words: timedWords(answer.words), ...typeof answer.duration === 'number' ? { duration: answer.duration } : {} }
        }
        if (response.status !== 404 && response.status !== 405) throw await answerError(response, what)
        timestamps = false
      }
      const response = await call('audio/speech', { method: 'POST', headers, body }, signal)
      if (!response.ok) throw await answerError(response, what)
      return { audio: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? undefined }
    },

    async transcribe(input: EngineInput, signal): Promise<Transcript> {
      const form = new FormData()
      form.set('file', blobOf(input.audio, input.mime), `audio.${input.mime.includes('ogg') ? 'ogg' : input.mime.includes('wav') ? 'wav' : 'bin'}`)
      form.set('model', engine.transcribeModel)
      form.set('response_format', 'verbose_json')
      form.append('timestamp_granularities[]', 'word')
      form.append('timestamp_granularities[]', 'segment')
      if (input.lang) form.set('language', input.lang.split('-')[0]!.toLowerCase())
      if (input.hints?.length) form.set('prompt', input.hints.join(', '))
      const response = await call('audio/transcriptions', { method: 'POST', body: form }, signal)
      if (!response.ok) throw await answerError(response, what)
      const answer = await response.json() as Record<string, unknown>
      const text = typeof answer.text === 'string' ? answer.text.trim() : ''
      const words = timedWords(answer.words)
      const duration = typeof answer.duration === 'number' ? answer.duration : words.at(-1)?.end ?? 0
      const lang = input.lang ?? (typeof answer.language === 'string' ? answer.language : 'und')
      const segments = Array.isArray(answer.segments)
        ? answer.segments.flatMap(s => (isRecord(s) && typeof s.start === 'number' && typeof s.end === 'number' ? [{ start: s.start, end: s.end, text: typeof s.text === 'string' ? s.text : '', words: timedWords(s.words) }] : []))
        : []
      if (segments.length === 0) return oneSegment(text, words, lang, duration)
      const placed = segments.some(s => s.words.length) ? segments : wordsIntoSegments(segments, words)
      return { lang, duration, text, segments: placed }
    },
  }
}
