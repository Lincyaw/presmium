/**
 * The gateway seen from serve and agent-host (SHARED mode, D13): their
 * environments hold no speech credentials, so the Node `SPEECH` service and
 * serve's `v1/` routes speak the speech gateway's protocol to the speech
 * plugin's contribution in `presmium gateway`
 * (`<gateway>/presmium.speech/v1/…`) with the gateway token they were given;
 * the engines, their providers and the consent gate are the gateway's, the
 * synthesis cache is the deck's (./deck.ts).
 */
import { gatewayFetch } from '@presmium/kernel'
import type { GatewayAccess, TranscriptionRequest } from '@presmium/kernel'
import type { EngineListing, TimedSpeech, TranscriptionAnswer, VoiceListing } from '../domain/index.ts'
import { PROTOCOL_PATH, SPEECH_ID, speechBody, transcriptOf } from '../domain/index.ts'
import type { SpeechBackend } from './backend.ts'
import { answerError, SpeechError } from './errors.ts'

export function gatewayBackend(access: GatewayAccess): SpeechBackend {
  const call = async <T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> => {
    const response = await gatewayFetch(access, SPEECH_ID, `${PROTOCOL_PATH}/${path}`, { ...init, signal })
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
    async consent(engine, voice, recorded, signal) {
      try {
        await call(`audio/consent?${new URLSearchParams({ engine, voice, recorded: recorded ? '1' : '0' })}`, {}, signal)
      } catch (error) {
        // A voice its record does not call cloned is refused only by the gateway's answer, not when it cannot give one.
        if (recorded || (error instanceof SpeechError && error.status === 403)) throw error
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
