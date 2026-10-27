import { errorMessage, hasRole, isRecord, jsonResponse } from '../index.ts'
import type { DocumentVoiceTasks, VoicePreviewCheck, VoicePreviewStart, VoiceoverStart } from '../contracts/voiceover-execution.ts'
import type { Route } from '../contracts/server.ts'
import { validateVoiceoverJobQuery, validateVoiceoverStart, validateVoicePreviewCheck, validateVoicePreviewStart, VoiceoverOperationError } from './voiceover.ts'

/** The legacy Web wire shapes adapt to the same author service used by MCP. */
export function createVoiceoverRoutes(service: DocumentVoiceTasks): Record<string, Route> {
  const route = (handle: Route['handle']): Route => ({ role: 'editor', maxBody: 64 << 10, async handle(request, ctx) {
    try {
      if (!hasRole(ctx.member, 'editor')) throw new VoiceoverOperationError(403, 'voice-authoring-permission-denied')
      return await handle(request, ctx)
    } catch (error) {
      const status = isRecord(error) && typeof error.status === 'number' ? error.status : 502
      return jsonResponse({ error: errorMessage(error) }, status)
    }
  } })
  const body = async (request: Request) => await request.json().catch(() => undefined) as unknown
  const confirmed = (value: unknown) => {
    if (!isRecord(value)) throw new VoiceoverOperationError(400, 'voice-generation-invalid')
    if (value.confirmed !== true) throw new VoiceoverOperationError(409, 'voice-confirmation-required')
    const { confirmed: _confirmed, ...request } = value
    return request
  }
  return {
    voiceover: route(async (request, ctx) => {
      if (request.method === 'GET') return jsonResponse(await service.snapshot(ctx.document, {}, ctx.member, request.signal))
      if (request.method !== 'POST') throw new VoiceoverOperationError(405, 'GET or POST')
      const value = confirmed(await body(request))
      if (!validateVoiceoverStart(value)) throw new VoiceoverOperationError(400, 'voice-generation-invalid')
      return jsonResponse(await service.start(ctx.document, value as VoiceoverStart, ctx.member, request.signal), 202)
    }),
    'voiceover/jobs': route(async (request, ctx) => {
      if (request.method !== 'GET') throw new VoiceoverOperationError(405, 'GET')
      return jsonResponse(await service.listJobs(ctx.document, ctx.member))
    }),
    'voiceover/job': route(async (request, ctx) => {
      if (request.method !== 'GET') throw new VoiceoverOperationError(405, 'GET')
      const query = Object.fromEntries([...new URL(request.url).searchParams].filter(([key]) => key !== 'document'))
      if (!validateVoiceoverJobQuery(query)) throw new VoiceoverOperationError(400, 'voice-job-query-invalid')
      return jsonResponse(await service.getJob(ctx.document, query, ctx.member))
    }),
    'voiceover/cancel': route(async (request, ctx) => {
      if (request.method !== 'POST') throw new VoiceoverOperationError(405, 'POST')
      const value = await body(request)
      if (!validateVoiceoverJobQuery(value)) throw new VoiceoverOperationError(400, 'voice-cancel-invalid')
      const answer = await service.cancel(ctx.document, value, ctx.member)
      return jsonResponse('id' in value ? answer.job : answer)
    }),
    'voice-preview': route(async (request, ctx) => {
      if (request.method === 'GET') {
        const params = new URL(request.url).searchParams
        let voice: unknown, target: unknown, source: unknown
        try { voice = JSON.parse(params.get('voice') ?? 'null'); target = JSON.parse(params.get('target') ?? 'null'); source = JSON.parse(params.get('source') ?? 'null') }
        catch { throw new VoiceoverOperationError(400, 'voice-preview-invalid') }
        const query = { revision: params.get('revision'), voice, mode: params.get('mode'), ...target !== null ? { target } : {}, ...source !== null ? { source } : {} }
        if (!validateVoicePreviewCheck(query)) throw new VoiceoverOperationError(400, 'voice-preview-invalid')
        return jsonResponse(await service.quotePreview(ctx.document, query as VoicePreviewCheck, ctx.member, request.signal))
      }
      if (request.method !== 'POST') throw new VoiceoverOperationError(405, 'GET or POST')
      const value = confirmed(await body(request))
      if (!validateVoicePreviewStart(value)) throw new VoiceoverOperationError(400, 'voice-preview-invalid')
      const result = await service.preview(ctx.document, value as VoicePreviewStart, ctx.member, request.signal)
      const { resource, bytes } = await service.readPreview(ctx.document, result.id, ctx.member)
      const { id: _id, byteLength: _length, sha256: _sha, mediaType, ...answer } = resource
      return jsonResponse({ ...answer, audio: `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}` })
    }),
    'voice-preview/media': route(async (request, ctx) => {
      if (request.method !== 'GET') throw new VoiceoverOperationError(405, 'GET')
      const id = new URL(request.url).searchParams.get('id') ?? '', result = await service.readPreview(ctx.document, id, ctx.member)
      return new Response(new Uint8Array(result.bytes), { headers: { 'Content-Type': result.resource.mediaType, 'Content-Length': String(result.bytes.byteLength), 'Cache-Control': 'no-store' } })
    }),
  }
}
