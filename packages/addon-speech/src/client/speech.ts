import { useServer } from '@presmium/host'
import type { SpeechService, Synthesis } from '@presmium/kernel'
import type { EngineListing, TimedSpeech, TranscriptionAnswer, VoiceListing } from '../domain/index.ts'
import { deckSpeechConfig, PROTOCOL_PATH, SPEECH_ID, speechBody, transcriptOf } from '../domain/index.ts'

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function browserSpeech(config: Record<string, unknown>): SpeechService {
  const defaults = deckSpeechConfig(config).config
  const server = useServer()
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (!server.available) throw new Error('speech needs presmium dev or presmium serve: a static page has no speech service')
    const response = await server.fetch(SPEECH_ID, `${PROTOCOL_PATH}/${path}`, init)
    const body = await response.json().catch(() => undefined) as (T & { error?: string }) | undefined
    if (!response.ok) throw new Error(body?.error ?? `the speech service answered ${response.status}`)
    return body as T
  }

  return {
    async engines() {
      return (await call<EngineListing>('engines')).engines.map(({ model: _model, transcribeModel: _transcribe, ...info }) => info)
    },
    async voices(engine, lang) {
      const query = new URLSearchParams({ engine, ...lang ? { lang } : {} })
      return (await call<VoiceListing>(`audio/voices?${query}`)).voices
    },
    async synthesize(request, signal): Promise<Synthesis> {
      const body = speechBody({ ...request, ...request.engine || defaults.engine ? { engine: request.engine ?? defaults.engine } : {} })
      const timed = await call<TimedSpeech>('audio/speech/timestamps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
      return {
        audio: new Blob([bytesOf(timed.audio)], { type: timed.mime }),
        mime: timed.mime,
        duration: timed.duration,
        ...timed.words ? { words: timed.words } : {},
        key: timed.key,
        engine: timed.engine,
        model: timed.model,
        voice: timed.voice,
        synthetic: true,
      }
    },
    async transcribe(request, signal) {
      const form = new FormData()
      form.set('file', request.audio, 'audio')
      const engine = request.engine ?? defaults.transcribe ?? defaults.engine
      if (engine) form.set('engine', engine)
      if (request.lang) form.set('language', request.lang)
      for (const hint of request.hints ?? []) form.append('hints[]', hint)
      return transcriptOf(await call<TranscriptionAnswer>('audio/transcriptions', { method: 'POST', body: form, signal }))
    },
  }
}
