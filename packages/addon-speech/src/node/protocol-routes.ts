import { jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { SynthesisResponseBody, TranscriptionResponseBody } from '../domain/index.ts'
import { toSynthesisRequest } from '../domain/index.ts'
import type { SpeechBackend, SynthesisResult } from './backend.ts'
import { blobOf } from './engines/index.ts'
import { errorResponse } from './errors.ts'

function synthesisResponseBody(result: SynthesisResult): SynthesisResponseBody {
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

export function protocolHandler(backend: SpeechBackend): (request: Request, path: string) => Promise<Response> {
  return async (request, path) => {
    const method = request.method.toUpperCase()
    try {
      if (path === 'engines' && method === 'GET') return jsonResponse(await backend.listEngines(request.headers.get('accept-language') ?? undefined))
      if (path === 'audio/consent' && method === 'GET') {
        const query = new URL(request.url).searchParams
        await backend.consent(query.get('engine') ?? '', query.get('voice') ?? '', query.get('recorded') !== '0', request.signal)
        return jsonResponse({ ok: true })
      }
      if (path === 'audio/voices' && method === 'GET') {
        const query = new URL(request.url).searchParams
        return jsonResponse({ voices: await backend.voices(query.get('engine') || undefined, query.get('lang') || undefined) })
      }
      if ((path === 'audio/speech' || path === 'audio/speech/timestamps') && method === 'POST') {
        const parsed = toSynthesisRequest(await request.json().catch(() => undefined))
        if (typeof parsed === 'string') return problemResponse(400, parsed)
        const result = await backend.synthesize(parsed, request.signal)
        if (path === 'audio/speech/timestamps') return jsonResponse(synthesisResponseBody(result))
        return new Response(blobOf(result.audio, result.mime), { headers: { 'Content-Type': result.mime, 'Cache-Control': 'no-store', 'X-Presmium-Key': result.key } })
      }
      if (path === 'audio/transcriptions' && method === 'POST') {
        const form = await request.formData().catch(() => undefined)
        const file = form?.get('file')
        if (!form || !(file instanceof Blob)) return problemResponse(400, 'multipart form data with the audio as `file`')
        const hints = form.getAll('hints[]').flatMap(hint => text(hint) ?? [])
        const transcript = await backend.transcribe({ audio: file, engine: text(form.get('engine')), lang: text(form.get('language')), ...hints.length ? { hints } : {} }, request.signal)
        const body: TranscriptionResponseBody = { ...transcript, language: transcript.lang, words: transcript.segments.flatMap(segment => segment.words) }
        return jsonResponse(body)
      }
      return problemResponse(404, `no speech route ${method} v1/${path}`)
    } catch (error) {
      return errorResponse(error)
    }
  }
}
