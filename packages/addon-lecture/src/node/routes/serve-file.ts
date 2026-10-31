import { closeSync, createReadStream, fstatSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { problemResponse } from '@lincyaw/kernel'
import { openInDeck } from '../store.ts'

const TYPES: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
}

/**
 * Media may change while the author works, so the browser keeps it but asks again each time (`no-cache`): an unchanged
 * file answers 304 by its tag, and a reader who plays the same piece again, or several clips of one file, loads it once.
 */
export const MEDIA_CACHE = 'private, no-cache'

export function notModified(request: Request, etag: string, headers: Record<string, string>): Response | undefined {
  return request.headers.get('if-none-match')?.split(',').some(tag => tag.trim() === etag) ? new Response(null, { status: 304, headers: { ...headers, ETag: etag } }) : undefined
}

export function serveFile(deckDir: string, file: string | undefined, request: Request): Response {
  const fd = file === undefined ? undefined : openInDeck(deckDir, file)
  if (fd === undefined) return problemResponse(404, 'no such file')
  const { size, mtimeMs } = fstatSync(fd)
  const etag = `"${size.toString(36)}-${Math.round(mtimeMs).toString(36)}"`
  const headers = { 'Content-Type': TYPES[extname(file!)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': MEDIA_CACHE, ETag: etag }
  const body = (start: number, end: number) => Readable.toWeb(createReadStream('', { fd, start, end })) as ReadableStream<Uint8Array>
  const empty = (response: Response) => {
    closeSync(fd)
    return response
  }
  const unchanged = notModified(request, etag, headers)
  if (unchanged) return empty(unchanged)
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range || (!range[1] && !range[2])) {
    if (size === 0 || request.method === 'HEAD') return empty(new Response(null, { headers: { ...headers, 'Content-Length': String(size) } }))
    return new Response(body(0, size - 1), { headers: { ...headers, 'Content-Length': String(size) } })
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  if (start >= size || start > end) return empty(new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } }))
  const partial = { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
  if (request.method === 'HEAD') return empty(new Response(null, { status: 206, headers: partial }))
  return new Response(body(start, end), { status: 206, headers: partial })
}
