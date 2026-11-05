import { randomBytes } from 'node:crypto'
import { ASSET_TITLE_MAX_LENGTH, DOCUMENT_AUDIO_MAX_BYTES, DOCUMENT_IMAGE_MAX_BYTES, MEDIA_UPLOAD_KINDS, MEDIA_UPLOAD_PATH, hasRole } from '@lincyaw/kernel'
import type { DocumentMediaUploads, MediaUpload, MediaUploadKind, Member } from '@lincyaw/kernel'
import { readAuthoringDocument } from './document-editor.ts'
import type { SourceEditor } from './source-editor.ts'
import { RequestError } from './errors.ts'
import { mediaUploadPage } from './media-upload-page.ts'

interface Entry { value: MediaUpload, document: string, documentId: string, member: string, locale?: 'zh-CN' | 'en', title: string, bytes?: Uint8Array, reserved: number, controller: AbortController, timer: ReturnType<typeof setTimeout> }
export interface MediaUploadsOwner extends DocumentMediaUploads {
  read(document: string, documentId: string, member: Member, upload: string, kind: MediaUploadKind): { bytes: Uint8Array, name: string }
  handle(request: Request): Promise<Response>
  close(): void
}
const MAX_SLOTS = 64, MAX_BYTES = 64 << 20, LIFETIME_MS = 10 * 60_000

/** Bounded temporary input. Only the original media owners may commit these bytes to a document. */
export function createMediaUploads({ editor, url, lifetimeMs = LIFETIME_MS }: { editor: SourceEditor, url(): string, lifetimeMs?: number }): MediaUploadsOwner {
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > LIFETIME_MS) throw new Error('media-upload-invalid')
  const entries = new Map<string, Entry>()
  let reserved = 0, closed = false
  const fail = (status: number, code: string): never => { throw new RequestError(status, code) }
  const current = (document: string, member: Member) => {
    if (closed) return fail(503, 'media-upload-unavailable')
    if (!hasRole(member, 'editor')) return fail(403, 'media-upload-permission-denied')
    return readAuthoringDocument(editor, { document, member }).content
  }
  const release = (entry: Entry) => { reserved -= entry.reserved; entry.reserved = 0; delete entry.bytes }
  const retire = (upload: string, entry: Entry) => {
    if (entries.get(upload) !== entry) return
    entries.delete(upload); clearTimeout(entry.timer); entry.controller.abort(); release(entry)
  }
  const lookup = (upload: string): Entry => {
    const entry = entries.get(upload)
    if (!entry || closed || Date.now() >= Date.parse(entry.value.expiresAt)) { if (entry) retire(upload, entry); return fail(410, 'media-upload-unavailable') }
    return entry
  }
  const authorized = (document: string, member: Member, upload: string, documentId = current(document, member).id) => {
    const entry = lookup(upload)
    if (entry.document !== document || entry.documentId !== documentId || entry.member !== member.id) return fail(403, 'media-upload-permission-denied')
    return entry
  }
  return {
    async prepare(document, kind, member) {
      const content = current(document, member)
      if (!MEDIA_UPLOAD_KINDS.includes(kind)) return fail(400, 'media-upload-invalid')
      if (entries.size >= MAX_SLOTS) return fail(503, 'media-upload-busy')
      const upload = randomBytes(32).toString('hex'), expiresAt = new Date(Date.now() + lifetimeMs).toISOString()
      const value: MediaUpload = { upload, kind, url: `${url().replace(/\/$/, '')}${MEDIA_UPLOAD_PATH}/${upload}`, expiresAt, maxBytes: kind === 'audio' ? DOCUMENT_AUDIO_MAX_BYTES : DOCUMENT_IMAGE_MAX_BYTES, state: 'empty' }
      const entry: Entry = { value, document, documentId: content.id, member: member.id, locale: content.metadata.lang?.startsWith('en') ? 'en' : !content.metadata.lang || content.metadata.lang.startsWith('zh') ? 'zh-CN' : undefined, title: content.metadata.title, reserved: 0, controller: new AbortController(), timer: setTimeout(() => retire(upload, entry), lifetimeMs) }
      entry.timer.unref(); entries.set(upload, entry)
      return { ...value }
    },
    async status(document, upload, member) { return { ...authorized(document, member, upload).value } },
    read(document, documentId, member, upload, kind) {
      if (!hasRole(member, 'editor')) return fail(403, 'media-upload-permission-denied')
      if (current(document, member).id !== documentId) return fail(403, 'media-upload-permission-denied')
      const entry = authorized(document, member, upload, documentId)
      if (entry.value.kind !== kind) return fail(400, 'media-upload-kind')
      if (!entry.bytes || entry.value.state !== 'ready' || !entry.value.name) return fail(409, 'media-upload-not-ready')
      return { bytes: new Uint8Array(entry.bytes), name: entry.value.name }
    },
    async handle(request) {
      const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, X-Presmium-Upload-Name', 'x-content-type-options': 'nosniff' }
      let entry: Entry | undefined
      try {
        const upload = new URL(request.url).pathname.split('/').at(-1) ?? ''
        if (!/^[a-f0-9]{64}$/.test(upload)) return fail(410, 'media-upload-unavailable')
        entry = lookup(upload)
        if (request.method === 'GET') return mediaUploadPage(entry.value, entry.locale ?? (request.headers.get('accept-language')?.startsWith('en') ? 'en' : 'zh-CN'), entry.title)
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
        if (request.method !== 'POST') return new Response(null, { status: 405, headers })
        if (entry.value.state !== 'empty') return fail(409, 'media-upload-already-written')
        const declared = request.headers.get('content-length')
        if (declared !== null && !/^\d+$/.test(declared)) return fail(400, 'media-upload-invalid')
        const allocation = declared === null ? entry.value.maxBytes : Number(declared)
        if (!Number.isSafeInteger(allocation) || allocation < 1 || allocation > entry.value.maxBytes) return fail(413, 'media-upload-size')
        if (reserved + allocation > MAX_BYTES) return fail(503, 'media-upload-busy')
        const encoded = request.headers.get('x-presmium-upload-name') ?? entry.value.kind
        if (encoded.length > 4096) return fail(400, 'media-upload-invalid')
        let name: string
        try { name = decodeURIComponent(encoded).replaceAll('\\', '/').split('/').at(-1)!.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim() } catch { return fail(400, 'media-upload-invalid') }
        name = [...name].slice(0, ASSET_TITLE_MAX_LENGTH).join('') || entry.value.kind
        const reader = request.body?.getReader()
        if (!reader) return fail(400, 'media-upload-invalid')
        const signal = AbortSignal.any([request.signal, entry.controller.signal]), bytes = new Uint8Array(allocation)
        entry.reserved = allocation; reserved += allocation; entry.value.state = 'uploading'
        const abort = () => { void reader.cancel().catch(() => {}) }
        signal.addEventListener('abort', abort, { once: true })
        let length = 0
        try {
          signal.throwIfAborted()
          for (;;) {
            const next = await reader.read(); signal.throwIfAborted()
            if (next.done) break
            if (length + next.value.byteLength > allocation) return fail(413, 'media-upload-size')
            bytes.set(next.value, length); length += next.value.byteLength
          }
          if (!length || declared !== null && length !== allocation) return fail(400, 'media-upload-invalid')
          lookup(upload); signal.throwIfAborted()
          entry.bytes = bytes.subarray(0, length); entry.value = { ...entry.value, state: 'ready', name, byteLength: length }
          return new Response(JSON.stringify({ uploaded: true }), { headers: { ...headers, 'content-type': 'application/json' } })
        } finally {
          signal.removeEventListener('abort', abort)
          if (entry.value.state !== 'ready') { release(entry); if (entries.get(upload) === entry) entry.value.state = 'empty'; await reader.cancel().catch(() => {}) }
          reader.releaseLock()
        }
      } catch (error) {
        if (request.method === 'GET') return mediaUploadPage(undefined, entry?.locale ?? (request.headers.get('accept-language')?.startsWith('en') ? 'en' : 'zh-CN'))
        const status = error instanceof RequestError ? error.status : 400
        return new Response(JSON.stringify({ error: { code: error instanceof RequestError ? error.message : 'media-upload-invalid' } }), { status, headers: { ...headers, 'content-type': 'application/json' } })
      }
    },
    close() { closed = true; for (const [upload, entry] of entries) retire(upload, entry) },
  }
}
