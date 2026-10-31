import { createHash } from 'node:crypto'
import { errorMessage, jsonResponse } from '@lincyaw/kernel'
import type { ProductionMediaQuery, ProductionPlanQuery, Route } from '@lincyaw/kernel'
import { productionAsset, productionMedia, productionSnapshot } from '../production.ts'
import { ProductionAssetRefusal } from '../production-assets.ts'
import { canonicalSource, VoiceSourceRefusal } from '../voice-source.ts'
import { MEDIA_CACHE, notModified, serveFile } from './serve-file.ts'
import { RouteRefusal } from './served-deck.ts'
import type { ServedDeck } from './served-deck.ts'

function audioBytes(bytes: Uint8Array<ArrayBuffer>, mediaType: string, request: Request): Response {
  const etag = `"${createHash('sha256').update(bytes).digest('base64url').slice(0, 22)}"`
  const size = bytes.byteLength, headers = { 'Content-Type': mediaType, 'Cache-Control': MEDIA_CACHE, 'Accept-Ranges': 'bytes', ETag: etag }
  const unchanged = notModified(request, etag, headers)
  if (unchanged) return unchanged
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range || !range[1] && !range[2]) return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...headers, 'Content-Length': String(size) } })
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
  return new Response(request.method === 'HEAD' ? null : bytes.subarray(start, end + 1), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` } })
}

function query(request: Request, media = false): ProductionPlanQuery | ProductionMediaQuery {
  const params = new URL(request.url).searchParams
  let source: unknown
  try { source = JSON.parse(params.get('source') ?? 'null') } catch { throw new RouteRefusal(400, 'production-query-invalid') }
  const irRevision = params.get('irRevision')
  if (!canonicalSource(source) || !irRevision || !/^[\da-f]{16}$/.test(irRevision)) throw new RouteRefusal(400, 'production-query-invalid')
  if (!media) return { source, irRevision }
  const planId = params.get('planId'), clipId = params.get('clipId')
  if (!planId || !/^[\da-f]{32}$/.test(planId) || !clipId || !/^[\da-f]{32}$/.test(clipId)) throw new RouteRefusal(400, 'production-query-invalid')
  return { source, irRevision, planId, clipId }
}

export function productionRoutes(served: ServedDeck): Record<string, Route> {
  const read = (handle: (request: Request) => Promise<Response>): Route => ({ role: 'reader', async handle(request) {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new RouteRefusal(405, 'GET or HEAD')
      return await handle(request)
    } catch (error) { return jsonResponse({ error: errorMessage(error) }, error instanceof RouteRefusal ? error.status : error instanceof VoiceSourceRefusal ? 409 : error instanceof ProductionAssetRefusal ? error.code === 'production.asset-changed' ? 409 : 422 : 502) }
  } })
  return {
    'production-plan': read(async request => jsonResponse((await productionSnapshot(served, query(request), request.signal)).plan)),
    'production-asset': read(async request => {
      const assetId = new URL(request.url).searchParams.get('assetId')
      if (!assetId || assetId.length > 200) throw new RouteRefusal(400, 'production-query-invalid')
      return jsonResponse(await productionAsset(served, { ...query(request), assetId }, request.signal))
    }),
    'production-media': read(async request => {
      const media = await productionMedia(served, query(request, true) as ProductionMediaQuery, request.signal)
      return typeof media === 'string' ? serveFile(served.deckDir, media, request) : audioBytes(media.bytes, media.mediaType, request)
    }),
  }
}
