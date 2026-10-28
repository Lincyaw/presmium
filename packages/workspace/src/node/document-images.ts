import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { imageSize } from 'image-size'
import { ASSET_TITLE_MAX_LENGTH, DOCUMENT_IMAGE_MAX_BYTES, fnv1a64, hasRole, isRecord, jsonResponse } from '@lincyaw/kernel'
import type { Asset, CanonicalSource, DocumentImageAuthoring, DocumentImageImport, DocumentImageImportAnswer, Member, RequestContext, Route, TeachingDocument, VerifiedDocumentImageImport } from '@lincyaw/kernel'
import { productionAssetFile, validateDocumentWorkspaceImageImport, validateDocumentWorkspaceImageInspect } from '@lincyaw/kernel/node'
import { readAuthoringDocument } from './document-editor.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { Revisions } from './revisions.ts'
import type { SourceEditor, SourceTransactionHistory } from './source-editor.ts'

interface Options { root: string, editor: SourceEditor, revisions?: Revisions, reviewRequired?: boolean }
interface ImageFormat { extension: string, mediaType: string }
interface Receipt { signature: string, assetId: string, version: string, files?: DocumentImageImportAnswer['files'], commit?: DocumentImageImportAnswer['commit'] }
const FORMATS: Record<string, ImageFormat> = {
  png: { extension: 'png', mediaType: 'image/png' }, jpg: { extension: 'jpg', mediaType: 'image/jpeg' },
  gif: { extension: 'gif', mediaType: 'image/gif' }, webp: { extension: 'webp', mediaType: 'image/webp' },
  svg: { extension: 'svg', mediaType: 'image/svg+xml' }, bmp: { extension: 'bmp', mediaType: 'image/bmp' },
}
const MAX_DIMENSION = 16384, MAX_PIXELS = 40_000_000
const header = (value: unknown): value is DocumentImageImport => isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200 && typeof value.baseDocumentVersion === 'string' && /^[\da-f]{20}$/.test(value.baseDocumentVersion) && Object.keys(value).every(key => key === 'id' || key === 'baseDocumentVersion')

/** Only an allowed header and bounded dimensions are inspected; this does not fully decode an image. */
function inspect(bytes: Uint8Array) {
  let found: ReturnType<typeof imageSize>
  try { found = imageSize(bytes) } catch { throw new RequestError(422, 'document-image-format') }
  const format = found.type && Object.hasOwn(FORMATS, found.type) ? FORMATS[found.type] : undefined
  if (!format) throw new RequestError(422, 'document-image-format')
  const { width, height } = found
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw new RequestError(422, 'document-image-dimensions')
  return { ...format, dimensions: { width, height } }
}

/** Original bytes and the canonical asset bank are committed or rolled back together. */
export function createDocumentImageAuthoring({ root, editor, revisions, reviewRequired = false }: Options): { service: DocumentImageAuthoring, routes: Record<string, Route> } {
  const receipts = new Map<string, Receipt>(), pending = new Map<string, { signature: string, done: Promise<DocumentImageImportAnswer> }>()
  const binding = (current: ReturnType<typeof readAuthoringDocument>): CanonicalSource => ({ documentId: current.content.id, version: current.source.version, fingerprint: fnv1a64(current.source.content) })
  const opened = (ctx: RequestContext, version?: string, source?: CanonicalSource) => {
    const current = readAuthoringDocument(editor, ctx)
    if (version !== undefined && current.source.version !== version || source && (current.content.id !== source.documentId || fnv1a64(current.source.content) !== source.fingerprint)) throw new RequestError(409, 'document-version-changed', { version: current.source.version })
    return current
  }
  const matches = async (ctx: RequestContext, asset: Asset, bytes: Uint8Array, format: ImageFormat, signal: AbortSignal): Promise<boolean> => {
    if (asset.kind !== 'image' || asset.mediaType !== undefined && asset.mediaType !== format.mediaType) return false
    const file = productionAssetFile(join(root, ctx.document), asset.location)
    if (!file || ![`.${format.extension}`, ...(format.extension === 'jpg' ? ['.jpeg'] : [])].includes(extname(file).toLowerCase())) return false
    const path = relative(root, file).split('\\').join('/')
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      editor.readableFile({ document: ctx.document, home: false }, path, ctx.member)
      signal.throwIfAborted()
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
      const before = await handle.stat()
      if (!before.isFile() || before.size !== bytes.byteLength) return false
      const actual = Buffer.alloc(bytes.byteLength)
      let offset = 0
      while (offset < actual.length) {
        signal.throwIfAborted()
        const next = await handle.read(actual, offset, actual.length - offset, offset)
        if (!next.bytesRead) return false
        offset += next.bytesRead
      }
      const after = await handle.stat(), pathNow = await stat(editor.readableFile({ document: ctx.document, home: false }, path, ctx.member))
      return before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === pathNow.ino && before.dev === pathNow.dev && actual.equals(bytes)
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof RequestError || error && typeof error === 'object' && 'code' in error && ['ENOENT', 'ELOOP', 'EACCES'].includes(String(error.code))) return false
      throw error
    } finally { await handle?.close() }
  }
  const answer = (ctx: RequestContext, change: DocumentImageImport, current: ReturnType<typeof readAuthoringDocument>, assetId: string, dimensions: { width: number, height: number }): DocumentImageImportAnswer => ({
    changeId: change.id, document: ctx.document, version: current.source.version, fingerprint: fnv1a64(current.source.content), content: current.content, issues: current.issues, files: [], assetId, dimensions,
  })
  const remember = (key: string, receipt: Receipt) => {
    receipts.set(key, receipt)
    while (receipts.size > 64) receipts.delete(receipts.keys().next().value!)
  }
  const history = (ctx: RequestContext, document: TeachingDocument, signal: AbortSignal, origin: 'editor' | 'agent'): SourceTransactionHistory => ({
    run: work => {
      const guarded = () => { signal.throwIfAborted(); return work() }
      return revisions ? revisions.transaction(guarded) : guarded()
    },
    commit: async paths => {
      if (!revisions) return undefined
      const ignored = (await Promise.all(paths.map(async path => await revisions.ignores(path) ? path : undefined))).filter((path): path is string => Boolean(path))
      if (ignored.length) throw new RequestError(409, 'document-files-ignored', { ignored })
      return revisions.commitWhileLocked({ paths, summary: document.metadata.lang.startsWith('en') ? 'Import image' : '导入图片', body: '', origin: { kind: origin, member: ctx.member } })
    },
  })
  const apply = async (ctx: RequestContext, change: DocumentImageImport, title: string, bytes: Uint8Array, image: ReturnType<typeof inspect>, hash: string, signal: AbortSignal, origin: 'editor' | 'agent', source?: CanonicalSource, inputPath?: string): Promise<DocumentImageImportAnswer> => {
    const signature = createHash('sha256').update(JSON.stringify([change.id, change.baseDocumentVersion, source?.documentId ?? null, source?.fingerprint ?? null, origin, inputPath ?? null, title, hash])).digest('hex'), key = JSON.stringify([ctx.document, ctx.member.id, change.id])
    const replay = async () => {
      const previous = receipts.get(key)
      if (!previous) return undefined
      if (previous.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
      const current = opened(ctx, previous.version), asset = current.content.assets[previous.assetId]
      if (!asset || !await matches(ctx, asset, bytes, image, signal)) throw new RequestError(409, 'document-image-asset-changed')
      return { ...answer(ctx, change, opened(ctx, previous.version), previous.assetId, image.dimensions), ...origin === 'agent' && previous.files ? { files: previous.files } : {}, ...origin === 'agent' && previous.commit ? { commit: previous.commit } : {} }
    }
    const previous = await replay()
    if (previous) return previous
    const active = pending.get(key)
    if (active) {
      if (active.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
      await active.done
      const repeated = await replay()
      if (!repeated) throw new RequestError(409, 'document-image-receipt-expired')
      return repeated
    }
    const work = async (): Promise<DocumentImageImportAnswer> => {
      const current = opened(ctx, change.baseDocumentVersion, source)
      const candidates = Object.values(current.content.assets).filter(asset => asset.kind === 'image' && (asset.fingerprint === undefined || asset.fingerprint === `sha256:${hash}`)).sort((a, b) => Number(b.fingerprint !== undefined) - Number(a.fingerprint !== undefined))
      for (const asset of candidates) if (await matches(ctx, asset, bytes, image, signal)) {
        const fresh = opened(ctx, change.baseDocumentVersion, source)
        remember(key, { signature, assetId: asset.id, version: fresh.source.version })
        return answer(ctx, change, fresh, asset.id, image.dimensions)
      }
      const assetId = `image_${randomUUID().replaceAll('-', '')}`, location = `assets/images/${assetId}.${image.extension}`, path = ctx.document ? `${ctx.document}/${location}` : location
      const candidate = structuredClone(current.content)
      candidate.assets[assetId] = { id: assetId, kind: 'image', location, ...title ? { title } : {}, fingerprint: `sha256:${hash}`, mediaType: image.mediaType }
      const content = `${JSON.stringify(candidate, null, 2)}\n`
      signal.throwIfAborted()
      const saved = await editor.transactionWithBinary({ document: ctx.document, home: false }, { path: current.source.path, content, base: current.source.version }, { path, content: bytes }, ctx.member, history(ctx, candidate, signal, origin))
      const version = saved.versions.find(file => file.path === current.source.path)!.version
      remember(key, { signature, assetId, version, files: saved.versions, ...saved.revision ? { commit: saved.revision } : {} })
      return { changeId: change.id, document: ctx.document, version, fingerprint: fnv1a64(content), content: candidate, issues: current.issues, files: saved.versions, assetId, dimensions: image.dimensions, ...saved.revision ? { commit: saved.revision } : {} }
    }
    const done = Promise.resolve().then(work)
    pending.set(key, { signature, done })
    try { return await done }
    finally { if (pending.get(key)?.done === done) pending.delete(key) }
  }
  const ctxOf = (document: string, member: Member): RequestContext => ({ document, member, rest: '' })
  const authorize = (member: Member) => { if (!hasRole(member, 'editor')) throw new RequestError(403, 'image-authoring-permission-denied') }
  const workspacePath = (ctx: RequestContext, path: string) => {
    editor.assertEditable({ document: ctx.document, home: false }, path, ctx.member)
    if (path.split('/').some(part => part.startsWith('.'))) throw new RequestError(403, 'image-file-path')
  }
  const reader = async (ctx: RequestContext, path: string, signal?: AbortSignal) => {
    workspacePath(ctx, path); signal?.throwIfAborted()
    const file = editor.readableFile({ document: ctx.document, home: false }, path, ctx.member)
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
      if (error.code === 'ELOOP') throw new RequestError(403, 'image-file-path')
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new RequestError(404, 'image-file-missing')
      throw error
    })
    try {
      const before = await handle.stat(), named = await lstat(editor.readableFile({ document: ctx.document, home: false }, path, ctx.member))
      if (!before.isFile() || before.dev !== named.dev || before.ino !== named.ino) throw new RequestError(403, 'image-file-path')
      if (!before.size || before.size > DOCUMENT_IMAGE_MAX_BYTES) throw new RequestError(413, 'document-image-size')
      const bytes = new Uint8Array(before.size + 1); let length = 0
      while (length < bytes.length) { signal?.throwIfAborted(); const read = await handle.read(bytes, length, bytes.length - length, length); if (!read.bytesRead) break; length += read.bytesRead }
      const after = await handle.stat(), current = await lstat(editor.readableFile({ document: ctx.document, home: false }, path, ctx.member))
      const stamp = (value: typeof before) => [value.dev, value.ino, value.size, value.mtimeMs, value.ctimeMs].join(':')
      if (length !== before.size || stamp(before) !== stamp(after) || after.dev !== current.dev || after.ino !== current.ino) throw new RequestError(409, 'image-file-changed')
      signal?.throwIfAborted(); return bytes.slice(0, length)
    } finally { await handle.close() }
  }
  let active = 0
  const limited = async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= 4) throw new RequestError(503, 'image-authoring-busy')
    active++
    try { return await work() } finally { active-- }
  }
  const service: DocumentImageAuthoring = {
    async capabilities(document, member) {
      authorize(member)
      const source = binding(opened(ctxOf(document, member)))
      return { source, available: true, verification: 'configuration-only', actions: { inspectWorkspace: true, importWorkspace: !reviewRequired }, ...reviewRequired ? { importUnavailableReason: 'review-required' as const } : {}, limits: { imageBytes: DOCUMENT_IMAGE_MAX_BYTES, receipts: 64, concurrent: 4 }, workspaceFileScope: 'same-document', idempotency: 'process-current-source', review: reviewRequired ? 'required-unsupported' : revisions ? 'locks-and-history' : 'locks-only' }
    },
    async inspectWorkspace(document, request, member, signal) {
      authorize(member)
      if (!validateDocumentWorkspaceImageInspect(request)) throw new RequestError(400, 'document-image-query-invalid')
      return limited(async () => {
      const ctx = ctxOf(document, member); opened(ctx, request.source.version, request.source)
      const bytes = await reader(ctx, request.path, signal), image = inspect(bytes), sha256 = createHash('sha256').update(bytes).digest('hex')
      signal?.throwIfAborted(); opened(ctx, request.source.version, request.source)
      return { document, source: request.source, file: { path: request.path, sha256, byteLength: bytes.length }, image: { mediaType: image.mediaType, dimensions: image.dimensions } }
      })
    },
    async importWorkspace(document, request, member, signal) {
      authorize(member)
      if (reviewRequired) throw new RequestError(409, 'authoring-review-required')
      if (!validateDocumentWorkspaceImageImport(request)) throw new RequestError(400, 'document-image-import-invalid')
      return limited(async () => {
      const ctx = ctxOf(document, member), bytes = await reader(ctx, request.file.path, signal), sha256 = createHash('sha256').update(bytes).digest('hex')
      if (bytes.length !== request.file.byteLength || sha256 !== request.file.sha256) throw new RequestError(409, 'image-file-changed')
      const image = inspect(bytes), title = [...basename(request.file.path).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, ASSET_TITLE_MAX_LENGTH).join('')
      const result = await apply(ctx, { id: request.id, baseDocumentVersion: request.source.version }, title, bytes, image, sha256, signal ?? new AbortController().signal, 'agent', request.source, request.file.path)
      try {
        const current = opened(ctx, result.version), asset = current.content.assets[result.assetId], file = asset && productionAssetFile(join(root, document), asset.location)
        if (!asset || !file || !await matches(ctx, asset, bytes, image, new AbortController().signal)) throw new Error('asset-changed')
        const verified = opened(ctx, result.version)
        return { ...result, content: verified.content, fingerprint: fnv1a64(verified.source.content), verification: { saved: true, source: binding(verified), asset: { assetId: result.assetId, path: relative(root, file).split('\\').join('/'), sha256, byteLength: bytes.length }, compiled: 'not-requested', runtime: 'not-requested' } } satisfies VerifiedDocumentImageImport
      } catch (error) {
        throw new RequestError(409, 'image-readback-changed', { committed: result.files.length > 0, changeId: request.id, version: result.version, assetId: result.assetId, reason: error instanceof Error ? error.message : 'readback-failed' })
      }
      })
    },
  }
  const routes: Record<string, Route> = {
    'document/image': { role: 'editor', maxBody: DOCUMENT_IMAGE_MAX_BYTES + (64 << 10), handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method !== 'POST') throw new RequestError(405, 'POST')
      const form = await request.formData().catch(() => undefined)
      if (!form || [...form.keys()].some(key => key !== 'change' && key !== 'file') || form.getAll('change').length !== 1 || form.getAll('file').length !== 1) throw new RequestError(400, 'document-image-form-invalid')
      const text = form.get('change'), file = form.get('file')
      if (typeof text !== 'string' || text.length > 4096 || !(file instanceof File)) throw new RequestError(400, 'document-image-form-invalid')
      let change: unknown
      try { change = JSON.parse(text) } catch { throw new RequestError(400, 'document-image-change-invalid') }
      if (!header(change)) throw new RequestError(400, 'document-image-change-invalid')
      if (!file.size || file.size > DOCUMENT_IMAGE_MAX_BYTES) throw new RequestError(413, 'document-image-size')
      const bytes = new Uint8Array(await file.arrayBuffer()), image = inspect(bytes), hash = createHash('sha256').update(bytes).digest('hex')
      const title = [...(file.name.replaceAll('\\', '/').split('/').at(-1) ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, ASSET_TITLE_MAX_LENGTH).join('')
      return jsonResponse(await apply(ctx, change, title, bytes, image, hash, request.signal, 'editor'))
    }) },
  }
  return { service, routes }
}
