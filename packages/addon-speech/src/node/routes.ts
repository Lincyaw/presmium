/**
 * The speech gateway's protocol (../domain/protocol.ts) over a backend: the
 * routes `v1/*` of `presmium dev` and LOCAL `presmium serve` (the engines of
 * the process, with the deck's cache) and of `presmium gateway` (its
 * engines). Answers carry no credential: engines are called by the backend,
 * never with the caller's headers.
 */
import type { TimedSpeech, TranscriptionAnswer } from '../domain/index.ts'
import { synthesisRequestOf } from '../domain/index.ts'
import type { SpeechBackend, SynthesisResult } from './backend.ts'
import { blobOf } from './engines/index.ts'
import { failure, json } from './errors.ts'

function timedSpeech(result: SynthesisResult): TimedSpeech {
  return {
    audio: Buffer.from(result.audio).toString('base64'),
    format: result.ext,
    mime: result.mime,
    duration: result.duration,
    ...result.words ? { words: result.words } : {},
    engine: result.engine,
    model: result.model,
    voice: result.voice,
    provider: result.provider,
    cloned: result.cloned,
    key: result.key,
    synthetic: true,
    AIGC: result.AIGC,
  }
}

const text = (value: FormDataEntryValue | null | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/** Answers a request to `<path>` under `v1/`. */
export function protocolHandler(backend: SpeechBackend): (request: Request, path: string) => Promise<Response> {
  return async (request, path) => {
    const method = request.method.toUpperCase()
    try {
      if (path === 'engines' && method === 'GET') return json(await backend.listing(request.headers.get('accept-language') ?? undefined))
      if (path === 'audio/voices' && method === 'GET') {
        const query = new URL(request.url).searchParams
        return json({ voices: await backend.voices(query.get('engine') || undefined, query.get('lang') || undefined) })
      }
      if ((path === 'audio/speech' || path === 'audio/speech/timestamps') && method === 'POST') {
        const parsed = synthesisRequestOf(await request.json().catch(() => undefined))
        if (typeof parsed === 'string') return json({ error: parsed }, 400)
        const result = await backend.synthesize(parsed, request.signal)
        if (path === 'audio/speech/timestamps') return json(timedSpeech(result))
        return new Response(blobOf(result.audio, result.mime), { headers: { 'Content-Type': result.mime, 'Cache-Control': 'no-store', 'X-Presmium-Key': result.key } })
      }
      if (path === 'audio/transcriptions' && method === 'POST') {
        const form = await request.formData().catch(() => undefined)
        const file = form?.get('file')
        if (!form || !(file instanceof Blob)) return json({ error: 'multipart form data with the audio as `file`' }, 400)
        const hints = form.getAll('hints[]').flatMap(hint => text(hint) ?? [])
        const transcript = await backend.transcribe({ audio: file, engine: text(form.get('engine')), lang: text(form.get('language')), ...hints.length ? { hints } : {} }, request.signal)
        const answer: TranscriptionAnswer = { ...transcript, language: transcript.lang, words: transcript.segments.flatMap(segment => segment.words) }
        return json(answer)
      }
      return json({ error: `no speech route ${method} v1/${path}` }, 404)
    } catch (error) {
      return failure(error)
    }
  }
}
