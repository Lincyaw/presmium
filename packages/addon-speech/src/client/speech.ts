import { serverClient } from '@lincyaw/host'
import type { SpeechService, Synthesis, VoiceCatalog } from '@lincyaw/kernel'
import type { EnginesResponseBody, SynthesisResponseBody, TranscriptionResponseBody, VoicesResponseBody } from '../domain/index.ts'
import { deckSpeechConfig, PROTOCOL_PATH, SPEECH_ID, synthesisRequestBody, transcriptOf } from '../domain/index.ts'

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function browserSpeech(config: Record<string, unknown>): SpeechService {
  const defaults = deckSpeechConfig(config).config
  const server = serverClient()
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (!server.available) throw new Error('speech needs presmium dev or presmium serve: a static page has no speech service')
    const response = await server.fetch(SPEECH_ID, `${PROTOCOL_PATH}/${path}`, init)
    const body = await response.json().catch(() => undefined) as (T & { error?: string }) | undefined
    if (!response.ok) throw new Error(body?.error ?? `the speech service answered ${response.status}`)
    return body as T
  }

  return {
    async engines() {
      return (await call<EnginesResponseBody>('engines')).engines.map(({ model: _model, transcribeModel: _transcribe, ...info }) => info)
    },
    async voices(engine, lang) {
      const query = new URLSearchParams({ engine, ...lang ? { lang } : {} })
      return (await call<VoicesResponseBody>(`audio/voices?${query}`)).voices
    },
    async voiceCatalog(engine, lang, signal) {
      const selected = engine ?? defaults.engine
      const query = new URLSearchParams({ ...selected ? { engine: selected } : {}, ...lang ? { lang } : {} })
      return call<VoiceCatalog>(`audio/voice-catalog?${query}`, { signal })
    },
    async synthesize(request, signal): Promise<Synthesis> {
      const body = synthesisRequestBody({ ...request, ...request.engine || defaults.engine ? { engine: request.engine ?? defaults.engine } : {} })
      const synthesized = await call<SynthesisResponseBody>('audio/speech/timestamps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
      return {
        audio: new Blob([bytesOf(synthesized.audio)], { type: synthesized.mime }),
        mime: synthesized.mime,
        duration: synthesized.duration,
        ...synthesized.words ? { words: synthesized.words } : {},
        key: synthesized.key,
        engine: synthesized.engine,
        model: synthesized.model,
        voice: synthesized.voice,
        provider: synthesized.provider,
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
      return transcriptOf(await call<TranscriptionResponseBody>('audio/transcriptions', { method: 'POST', body: form, signal }))
    },
  }
}
