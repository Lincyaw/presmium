/**
 * The gateway seen from serve and agent-host (SHARED mode, D13): their
 * environments hold no speech credentials, so the Node `SPEECH` service
 * speaks the speech gateway's protocol to the speech plugin's contribution in
 * `presmium gateway` (`<gateway>/presmium.speech/v1/…`) with the gateway
 * token it was given; the engines, their providers and the consent gate are
 * the gateway's.
 */
import type { GatewayAccess, TranscriptionRequest } from '@presmium/kernel'
import type { EngineListing, TimedSpeech, TranscriptionAnswer, VoiceListing } from '../domain/index.ts'
import { PROTOCOL_PATH, SPEECH_ID, speechBody, transcriptOf } from '../domain/index.ts'
import type { SpeechBackend } from './backend.ts'
import { answerError } from './errors.ts'

export function gatewayBackend(access: GatewayAccess): SpeechBackend {
  const base = `${access.url.replace(/\/+$/, '')}/${SPEECH_ID}/${PROTOCOL_PATH}`
  const call = async <T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(`${base}/${path}`, { ...init, headers: { ...init.headers as Record<string, string>, Authorization: `Bearer ${access.token}` }, redirect: 'error', signal })
    if (!response.ok) throw await answerError(response, 'the gateway', true)
    return await response.json() as T
  }
  const listing = (lang?: string) => call<EngineListing>('engines', lang ? { headers: { 'Accept-Language': lang } } : {})

  return {
    listing,
    async defaultEngine() {
      return (await listing()).engines[0]?.id
    },
    async voices(engine, lang, signal) {
      const query = new URLSearchParams({ ...engine ? { engine } : {}, ...lang ? { lang } : {} })
      return (await call<VoiceListing>(`audio/voices?${query}`, {}, signal)).voices
    },
    async synthesize(request, signal) {
      const timed = await call<TimedSpeech>('audio/speech/timestamps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(speechBody(request)) }, signal)
      return {
        audio: new Uint8Array(Buffer.from(timed.audio, 'base64')),
        mime: timed.mime,
        ext: timed.format,
        duration: timed.duration,
        ...timed.words ? { words: timed.words } : {},
        engine: timed.engine,
        model: timed.model,
        voice: timed.voice,
        provider: timed.provider,
        cloned: timed.cloned,
        key: timed.key,
        AIGC: timed.AIGC,
      }
    },
    async transcribe(request: TranscriptionRequest, signal) {
      const form = new FormData()
      form.set('file', request.audio, 'audio')
      if (request.engine) form.set('engine', request.engine)
      if (request.lang) form.set('language', request.lang)
      for (const hint of request.hints ?? []) form.append('hints[]', hint)
      return transcriptOf(await call<TranscriptionAnswer>('audio/transcriptions', { method: 'POST', body: form }, signal))
    },
  }
}
