import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { ASSET_TITLE_MAX_LENGTH, DOCUMENT_AUDIO_MAX_BYTES, DOCUMENT_AUDIO_REQUEST_MAX_BYTES, fnv1a64, hasRole, isRecord, jsonResponse, ProductionAudioRefusal, validateDocument } from '@lincyaw/kernel'
import type { Asset, CanonicalSource, DocumentAudioAuthoring, DocumentAudioCapabilities, DocumentAudioImport, DocumentAudioInspectionAnswer, DocumentChangeAnswer, DocumentMediaClipEdit, DocumentMediaClipValidation, DocumentMediaClipValidationAnswer, Finding, Member, ProductionAudioAuthoring, RequestContext, Route, TeachingDocument, VerifiedDocumentAudioImport, VerifiedDocumentMediaClipChange, WorkspaceAudioInspectionAnswer } from '@lincyaw/kernel'
import { productionAssetFile, validateDocumentAudioInspect, validateDocumentWorkspaceAudioImport, validateDocumentWorkspaceAudioInspect, validateDocumentMediaClipValidation, validateDocumentMediaClipEdit, validateDocumentProductionPlanQuery } from '@lincyaw/kernel/node'
import { readAuthoringDocument } from './document-editor.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { Revisions } from './revisions.ts'
import type { SourceEditor, SourceTransactionHistory } from './source-editor.ts'

export interface DocumentAudioServices { audio?: ProductionAudioAuthoring, findings?: Finding[] }
export interface DocumentAudioAuthoringOptions extends DocumentAudioServices {
  root: string
  editor: SourceEditor
  revisions?: Revisions
  reviewRequired?: boolean
  services?(document: string, source: CanonicalSource): Promise<DocumentAudioServices>
}
interface Receipt { signature: string, source?: CanonicalSource, version: string, files: DocumentChangeAnswer['files'], commit?: DocumentChangeAnswer['commit'], assetId?: string, inspection?: VerifiedDocumentAudioImport['inspection'], clip?: Pick<VerifiedDocumentMediaClipChange['verification'], 'production' | 'binding'> }
interface Operation { controller: AbortController, finished: Promise<unknown> }
const MAX_RECEIPTS = 64, MAX_CONCURRENT = 4
const header = (value: unknown): value is DocumentAudioImport => isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200 && typeof value.baseDocumentVersion === 'string' && /^[\da-f]{20}$/.test(value.baseDocumentVersion)
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const sameSource = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
const scopeOf = (document: string) => ({ document, home: false })
const binding = (current: ReturnType<typeof readAuthoringDocument>): CanonicalSource => ({ documentId: current.content.id, version: current.source.version, fingerprint: fnv1a64(current.source.content) })
const titleOf = (name: string) => [...(name.replaceAll('\\', '/').split('/').at(-1) ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, ASSET_TITLE_MAX_LENGTH).join('')
const stamp = (stat: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['stat']>>) => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')

/** Owns the canonical transaction and receipts; plugin services only inspect actual media. */
export function createDocumentAudioAuthoring({ root, editor, revisions, audio, services, reviewRequired = false }: DocumentAudioAuthoringOptions): { service: DocumentAudioAuthoring, routes: Record<string, Route>, close(): Promise<void> } {
  const receipts = new Map<string, Receipt>(), imports = new Map<string, { signature: string, source: CanonicalSource, promise: Promise<VerifiedDocumentAudioImport> }>(), operations = new Set<Operation>()
  const clipChanges = new Map<string, { signature: string, promise: Promise<VerifiedDocumentMediaClipChange> }>()
  let closed = false
  const authorize = (member: Member) => { if (!hasRole(member, 'editor')) throw new RequestError(403, 'audio-authoring-permission-denied') }
  const available = () => { if (closed) throw new RequestError(503, 'audio-authoring-closed') }
  const check = (signal?: AbortSignal) => { available(); signal?.throwIfAborted() }
  const work = <T>(member: Member, signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    authorize(member); check(signal)
    if (operations.size >= MAX_CONCURRENT) throw new RequestError(503, 'audio-authoring-busy')
    const controller = new AbortController(), combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    const operation: Operation = { controller, finished: Promise.resolve() }
    operations.add(operation)
    const finished = Promise.resolve().then(() => { check(combined); return run(combined) }).finally(() => operations.delete(operation))
    operation.finished = finished
    return finished
  }
  const ctxOf = (document: string, member: Member): RequestContext => ({ document, member, rest: '' })
  const opened = (ctx: RequestContext, version?: string, source?: CanonicalSource) => {
    const current = readAuthoringDocument(editor, ctx)
    if (version !== undefined && current.source.version !== version || source && !sameSource(binding(current), source)) throw new RequestError(409, 'document-version-changed', { currentSource: binding(current) })
    return current
  }
  const resolved = async (document: string, source: CanonicalSource, signal: AbortSignal) => {
    check(signal)
    const result = services ? await services(document, source) : { audio }
    check(signal)
    return result
  }
  const workspacePath = (document: string, path: string, member: Member) => {
    editor.assertEditable(scopeOf(document), path, member)
    if (path.split('/').some(part => part.startsWith('.'))) throw new RequestError(403, 'audio-file-path')
  }
  const reader = async (ctx: RequestContext, path: string, signal?: AbortSignal): Promise<Uint8Array> => {
    signal?.throwIfAborted()
    const file = editor.readableFile(scopeOf(ctx.document), path, ctx.member)
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
      if (error.code === 'ELOOP') throw new RequestError(403, 'audio-file-path')
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new RequestError(404, 'audio-file-missing')
      throw error
    })
    try {
      const before = await handle.stat(), named = await lstat(editor.readableFile(scopeOf(ctx.document), path, ctx.member))
      if (!before.isFile() || before.dev !== named.dev || before.ino !== named.ino) throw new RequestError(403, 'audio-file-path')
      if (!before.size || before.size > DOCUMENT_AUDIO_MAX_BYTES) throw new RequestError(413, 'production.asset-size')
      const bytes = new Uint8Array(before.size + 1); let length = 0
      while (length < bytes.length) {
        signal?.throwIfAborted()
        const read = await handle.read(bytes, length, bytes.length - length, length)
        if (!read.bytesRead) break
        length += read.bytesRead
      }
      const after = await handle.stat(), current = await lstat(editor.readableFile(scopeOf(ctx.document), path, ctx.member))
      if (length !== before.size || stamp(before) !== stamp(after) || after.dev !== current.dev || after.ino !== current.ino) throw new RequestError(409, 'audio-file-changed')
      signal?.throwIfAborted()
      return bytes.slice(0, length)
    } finally { await handle.close() }
  }
  const pathOf = (ctx: RequestContext, asset: Asset) => {
    const file = productionAssetFile(join(root, ctx.document), asset.location)
    if (!file) throw new RequestError(422, 'production.asset-path')
    return relative(root, file).split('\\').join('/')
  }
  const inspect = async (ctx: RequestContext, asset: Asset, source: CanonicalSource, signal: AbortSignal) => {
    if (asset.kind !== 'audio') throw new RequestError(422, 'production.asset-kind')
    const [bytes, found] = await Promise.all([reader(ctx, pathOf(ctx, asset), signal), resolved(ctx.document, source, signal)])
    if (!found.audio) throw new RequestError(503, 'production-audio-unavailable')
    if (asset.fingerprint && asset.fingerprint.replace(/^sha256:/, '').toLowerCase() !== hash(bytes)) throw new RequestError(409, 'production.asset-changed')
    const { inspection } = await found.audio.inspectBytes(asset.id, bytes, signal)
    check(signal); opened(ctx, source.version, source)
    return inspection
  }
  const history = (ctx: RequestContext, content: TeachingDocument, origin: 'editor' | 'agent', validate?: () => Promise<void>): SourceTransactionHistory => ({
    run: work => { const guarded = async () => { await validate?.(); return work() }; return revisions ? revisions.transaction(guarded) : guarded() },
    commit: async paths => {
      if (!revisions) return undefined
      const ignored = (await Promise.all(paths.map(async path => await revisions.ignores(path) ? path : undefined))).filter((path): path is string => Boolean(path))
      if (ignored.length) throw new RequestError(409, 'document-files-ignored', { ignored })
      return revisions.commitWhileLocked({ paths, summary: content.metadata.lang?.startsWith('en') ? 'Edit audio media' : '编辑音频素材', body: '', origin: { kind: origin, member: ctx.member } })
    },
  })
  const remember = (key: string, receipt: Receipt) => { receipts.set(key, receipt); while (receipts.size > MAX_RECEIPTS) receipts.delete(receipts.keys().next().value!) }
  const readback = async (ctx: RequestContext, id: string, receipt: Receipt): Promise<VerifiedDocumentAudioImport> => {
    try {
      const current = opened(ctx, receipt.version), assetId = receipt.assetId!, asset = current.content.assets[assetId], inspection = receipt.inspection!
      if (!asset || asset.kind !== 'audio' || asset.fingerprint !== `sha256:${inspection.sha256}`) throw new RequestError(409, 'audio-readback-changed')
      const path = pathOf(ctx, asset), bytes = await reader(ctx, path)
      if (hash(bytes) !== inspection.sha256 || bytes.length !== inspection.byteLength || receipt.files.some(file => file.path === path ? file.version !== inspection.sha256.slice(0, 20) : editor.read(scopeOf(ctx.document), file.path, ctx.member).version !== file.version)) throw new RequestError(409, 'audio-readback-changed')
      const verified = opened(ctx, receipt.version)
      return { document: ctx.document, version: verified.source.version, fingerprint: fnv1a64(verified.source.content), content: verified.content, issues: verified.issues, changeId: id, assetId, inspection, files: receipt.files, ...receipt.commit ? { commit: receipt.commit } : {}, verification: { saved: true, source: binding(verified), asset: { assetId, path, sha256: inspection.sha256, byteLength: bytes.length }, compiled: 'not-requested', runtime: 'not-requested' } }
    } catch (error) {
      let currentSource: CanonicalSource | undefined
      try { currentSource = binding(opened(ctx)) } catch { /* The current document may be unavailable after a committed save. */ }
      throw new RequestError(409, 'audio-readback-changed', { committed: true, changeId: id, assetId: receipt.assetId, version: receipt.version, ...currentSource ? { currentSource } : {}, reason: error instanceof Error ? error.message : 'readback-failed' })
    }
  }
  const once = (ctx: RequestContext, change: DocumentAudioImport, source: CanonicalSource, title: string, sha256: string, byteLength: number, origin: 'editor' | 'agent', run: () => Promise<VerifiedDocumentAudioImport>) => {
    authorize(ctx.member); available()
    if (origin === 'agent' && reviewRequired) throw new RequestError(409, 'authoring-review-required')
    const key = JSON.stringify(['audio', ctx.document, ctx.member.id, change.id]), signature = hash(JSON.stringify([change.id, source.documentId, change.baseDocumentVersion, source.fingerprint, title, sha256, byteLength]))
    const previous = receipts.get(key)
    if (previous) {
      if (previous.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
      opened(ctx, previous.version)
      return readback(ctx, change.id, previous)
    }
    const pending = imports.get(key)
    if (pending) { if (pending.signature !== signature) throw new RequestError(409, 'document-change-id-reused'); return pending.promise }
    const promise = Promise.resolve().then(run).finally(() => { if (imports.get(key)?.promise === promise) imports.delete(key) })
    imports.set(key, { signature, source, promise })
    return promise
  }
  const importBytes = async (ctx: RequestContext, change: DocumentAudioImport, title: string, bytes: Uint8Array, source: CanonicalSource, found: DocumentAudioServices, origin: 'editor' | 'agent', signal: AbortSignal) => {
    check(signal)
    if (!found.audio) throw new RequestError(503, 'production-audio-unavailable')
    const current = opened(ctx, change.baseDocumentVersion, source), assetId = `audio_${randomUUID().replaceAll('-', '')}`, probed = await found.audio.inspectBytes(assetId, bytes, signal)
    if (probed.inspection.sha256 !== hash(bytes) || probed.inspection.byteLength !== bytes.length) throw new RequestError(409, 'audio-inspection-changed')
    const location = `assets/audio/${assetId}.${probed.extension}`, path = ctx.document ? `${ctx.document}/${location}` : location, candidate = structuredClone(current.content)
    candidate.assets[assetId] = { id: assetId, kind: 'audio', location, ...title ? { title } : {}, fingerprint: `sha256:${probed.inspection.sha256}`, mediaType: probed.inspection.mediaType }
    const content = `${JSON.stringify(candidate, null, 2)}\n`
    check(signal); opened(ctx, change.baseDocumentVersion, source)
    const saved = await editor.transactionWithBinary(scopeOf(ctx.document), { path: current.source.path, content, base: current.source.version }, { path, content: bytes }, ctx.member, history(ctx, candidate, origin, async () => { check(signal) }))
    const version = saved.versions.find(file => file.path === current.source.path)!.version
    const receipt: Receipt = { signature: hash(JSON.stringify([change.id, source.documentId, change.baseDocumentVersion, source.fingerprint, title, hash(bytes), bytes.length])), source, version, files: saved.versions, assetId, inspection: probed.inspection, ...saved.revision ? { commit: saved.revision } : {} }
    remember(JSON.stringify(['audio', ctx.document, ctx.member.id, change.id]), receipt)
    // A committed write is verified even when its request disconnected or shutdown began meanwhile.
    return readback(ctx, change.id, receipt)
  }
  const prepareClip = (ctx: RequestContext, request: DocumentMediaClipValidation) => {
    const current = opened(ctx, request.source.version, request.source), candidate = structuredClone(current.content)
    const clipId = 'clip' in request ? request.clip.id : request.removeClipId, before = candidate.production.mediaClips.find(clip => clip.id === clipId)
    if ('removeClipId' in request) {
      if (!before) throw new RequestError(404, 'document-media-clip-missing')
      candidate.production.mediaClips = candidate.production.mediaClips.filter(clip => clip.id !== clipId)
    } else {
      if (!sameSource(request.binding.source, request.source)) throw new RequestError(409, 'production-binding-changed')
      const index = candidate.production.mediaClips.findIndex(clip => clip.id === clipId)
      if (index < 0) candidate.production.mediaClips.push(structuredClone(request.clip))
      else candidate.production.mediaClips[index] = structuredClone(request.clip)
    }
    const checked = validateDocument(candidate)
    if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues })
    const after = checked.document.production.mediaClips.find(clip => clip.id === clipId)
    const answer: DocumentMediaClipValidationAnswer = {
      document: ctx.document, source: request.source, operation: 'removeClipId' in request ? 'remove' : before ? 'update' : 'add', clipId,
      ...before ? { before } : {}, ...after ? { after } : {},
      impact: { stepIds: [...new Set([before?.attachment.stepId, after?.attachment.stepId].filter((id): id is string => id !== undefined))], assetIds: [...new Set([before?.assetId, after?.assetId].filter((id): id is string => id !== undefined))] },
      issues: checked.issues, checked: { canonical: true, production: 'clip' in request ? 'validated' : 'not-required', ...'clip' in request ? { binding: request.binding } : {} },
    }
    const validate = async (signal: AbortSignal) => {
      check(signal); opened(ctx, request.source.version, request.source)
      if ('clip' in request) {
        for (const id of new Set(checked.document!.production.mediaClips.map(clip => clip.assetId))) {
          const asset = checked.document!.assets[id], file = asset && productionAssetFile(join(root, ctx.document), asset.location)
          if (!file) throw new RequestError(422, 'production.asset-path')
          editor.readableFile(scopeOf(ctx.document), relative(root, file).split('\\').join('/'), ctx.member)
        }
        const found = await resolved(ctx.document, request.source, signal)
        if (!found.audio) throw new RequestError(503, 'production-audio-unavailable')
        await found.audio.validateClips(request.binding, checked.document!.production.mediaClips, checked.document!.assets, signal)
      }
      check(signal); opened(ctx, request.source.version, request.source)
    }
    return { current, candidate: checked.document, content: `${JSON.stringify(checked.document, null, 2)}\n`, answer, validate }
  }
  const clipReadback = (ctx: RequestContext, id: string, receipt: Receipt): VerifiedDocumentMediaClipChange => {
    try {
      const current = opened(ctx, receipt.version)
      if (receipt.files.some(file => editor.read(scopeOf(ctx.document), file.path, ctx.member).version !== file.version)) throw new RequestError(409, 'media-clip-readback-changed')
      return { document: ctx.document, version: current.source.version, fingerprint: fnv1a64(current.source.content), content: current.content, issues: current.issues, changeId: id, files: receipt.files, ...receipt.commit ? { commit: receipt.commit } : {}, verification: { saved: true, source: binding(current), ...receipt.clip!, compiled: 'not-requested', runtime: 'not-requested' } }
    } catch (error) {
      let currentSource: CanonicalSource | undefined
      try { currentSource = binding(opened(ctx)) } catch { /* Report the committed receipt even when its document is unavailable. */ }
      throw new RequestError(409, 'media-clip-readback-changed', { committed: true, changeId: id, version: receipt.version, ...currentSource ? { currentSource } : {}, reason: error instanceof Error ? error.message : 'readback-failed' })
    }
  }
  const changeClip = (ctx: RequestContext, request: DocumentMediaClipEdit, origin: 'editor' | 'agent', signal: AbortSignal): Promise<VerifiedDocumentMediaClipChange> => {
    if (!validateDocumentMediaClipEdit(request)) throw new RequestError(400, 'document-media-clip-invalid')
    if (Buffer.byteLength(JSON.stringify(request)) > DOCUMENT_AUDIO_REQUEST_MAX_BYTES) throw new RequestError(413, 'document-audio-request-size')
    if (origin === 'agent' && reviewRequired) throw new RequestError(409, 'authoring-review-required')
    const key = JSON.stringify(['clip', ctx.document, ctx.member.id, request.id]), source = request.source
    const signature = hash(JSON.stringify([request.id, source.documentId, source.version, source.fingerprint, ...'clip' in request ? [request.binding.irRevision, request.binding.planId, request.binding.source.documentId, request.binding.source.version, request.binding.source.fingerprint, request.clip.id, request.clip.assetId, request.clip.sourceRange.startMs, request.clip.sourceRange.endMs, request.clip.attachment.stepId, request.clip.attachment.offsetMs, request.clip.volume, request.clip.muted ?? false] : [request.removeClipId]]))
    const previous = receipts.get(key)
    if (previous) {
      if (previous.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
      opened(ctx, previous.version)
      return Promise.resolve(clipReadback(ctx, request.id, previous))
    }
    const pending = clipChanges.get(key)
    if (pending) { if (pending.signature !== signature) throw new RequestError(409, 'document-change-id-reused'); return pending.promise }
    const promise = Promise.resolve().then(async () => {
      check(signal)
      const prepared = prepareClip(ctx, request)
      const saved = await editor.transaction(scopeOf(ctx.document), [{ path: prepared.current.source.path, content: prepared.content, base: source.version }], ctx.member, history(ctx, prepared.candidate, origin, () => prepared.validate(signal)))
      const receipt: Receipt = { signature, source, version: saved.versions[0]!.version, files: saved.versions, ...saved.revision ? { commit: saved.revision } : {}, clip: { production: 'clip' in request ? 'validated-before-save' : 'not-required', ...'clip' in request ? { binding: request.binding } : {} } }
      remember(key, receipt)
      return clipReadback(ctx, request.id, receipt)
    }).finally(() => { if (clipChanges.get(key)?.promise === promise) clipChanges.delete(key) })
    clipChanges.set(key, { signature, promise })
    return promise
  }
  const service: DocumentAudioAuthoring = {
    capabilities: (document, member) => work(member, undefined, async signal => {
      const ctx = ctxOf(document, member), current = opened(ctx), source = binding(current), found = await resolved(document, source, signal)
      opened(ctx, source.version, source)
      const available = Boolean(found.audio), unknown = !available && Boolean(found.findings?.some(finding => finding.severity === 'error'))
      return { source, available, status: available ? 'available' : unknown ? 'unknown' : 'unavailable', ...unknown ? { reason: 'services-unavailable' as const } : !available ? { reason: 'audio-unavailable' as const } : {}, verification: 'configuration-only', ...found.findings?.length ? { findings: found.findings } : {}, actions: { inspect: available, inspectWorkspace: available, importWorkspace: available && !reviewRequired, readProductionPlan: available, validateClipChange: true, changeClip: !reviewRequired }, ...reviewRequired ? { importUnavailableReason: 'review-required' as const, clipChangeUnavailableReason: 'review-required' as const } : {}, clips: { upsert: available, remove: true, upsertRequires: 'current-production-binding' }, limits: { audioBytes: DOCUMENT_AUDIO_MAX_BYTES, requestBytes: DOCUMENT_AUDIO_REQUEST_MAX_BYTES, receipts: MAX_RECEIPTS, concurrent: MAX_CONCURRENT }, workspaceFileScope: 'same-document', idempotency: 'process-current-source', review: reviewRequired ? 'required-unsupported' : revisions ? 'locks-and-history' : 'locks-only' } satisfies DocumentAudioCapabilities
    }),
    inspect: (document, request, member, signal) => work(member, signal, async signal => {
      if (!validateDocumentAudioInspect(request)) throw new RequestError(400, 'document-audio-query-invalid')
      const ctx = ctxOf(document, member), current = opened(ctx, request.source.version, request.source), asset = current.content.assets[request.assetId]
      if (!asset) throw new RequestError(404, 'production.asset-missing')
      const inspection = await inspect(ctx, asset, request.source, signal)
      return { document, version: request.source.version, fingerprint: request.source.fingerprint, inspection } satisfies DocumentAudioInspectionAnswer
    }),
    inspectWorkspace: (document, request, member, signal) => work(member, signal, async signal => {
      if (!validateDocumentWorkspaceAudioInspect(request)) throw new RequestError(400, 'document-audio-query-invalid')
      workspacePath(document, request.path, member)
      const ctx = ctxOf(document, member)
      opened(ctx, request.source.version, request.source)
      const [bytes, found] = await Promise.all([reader(ctx, request.path, signal), resolved(document, request.source, signal)])
      if (!found.audio) throw new RequestError(503, 'production-audio-unavailable')
      const probed = await found.audio.inspectBytes('workspace-audio-probe', bytes, signal)
      const { assetId: _assetId, mediaId: _mediaId, ...inspection } = probed.inspection
      if (inspection.sha256 !== hash(bytes) || inspection.byteLength !== bytes.length) throw new RequestError(409, 'audio-inspection-changed')
      check(signal); opened(ctx, request.source.version, request.source)
      return { document, source: request.source, file: { path: request.path, sha256: inspection.sha256, byteLength: inspection.byteLength }, inspection } satisfies WorkspaceAudioInspectionAnswer
    }),
    readProductionPlan: (document, request, member, signal) => work(member, signal, async signal => {
      if (!validateDocumentProductionPlanQuery(request)) throw new RequestError(400, 'production-query-invalid')
      const ctx = ctxOf(document, member)
      opened(ctx, request.source.version, request.source)
      const found = await resolved(document, request.source, signal)
      if (!found.audio) throw new RequestError(503, 'production-audio-unavailable')
      const plan = await found.audio.readPlan(request, signal)
      check(signal); opened(ctx, request.source.version, request.source)
      if (!sameSource(plan.binding.source, request.source) || request.irRevision !== undefined && plan.binding.irRevision !== request.irRevision) throw new RequestError(409, 'production-binding-changed')
      return plan
    }),
    importWorkspace(document, request, member, signal) {
      authorize(member); available()
      if (!validateDocumentWorkspaceAudioImport(request)) throw new RequestError(400, 'document-audio-import-invalid')
      if (Buffer.byteLength(JSON.stringify(request)) > DOCUMENT_AUDIO_REQUEST_MAX_BYTES) throw new RequestError(413, 'document-audio-request-size')
      workspacePath(document, request.file.path, member)
      const ctx = ctxOf(document, member), title = titleOf(basename(request.file.path)), change = { id: request.id, baseDocumentVersion: request.source.version }
      return work(member, signal, signal => once(ctx, change, request.source, title, request.file.sha256, request.file.byteLength, 'agent', async () => {
        opened(ctx, request.source.version, request.source)
        const [bytes, found] = await Promise.all([reader(ctx, request.file.path, signal), resolved(document, request.source, signal)])
        if (bytes.length !== request.file.byteLength || hash(bytes) !== request.file.sha256) throw new RequestError(409, 'audio-file-changed')
        return importBytes(ctx, change, title, bytes, request.source, found, 'agent', signal)
      }))
    },
    validateClipChange: (document, request, member, signal) => work(member, signal, async signal => {
      if (!validateDocumentMediaClipValidation(request)) throw new RequestError(400, 'document-media-clip-invalid')
      if (Buffer.byteLength(JSON.stringify(request)) > DOCUMENT_AUDIO_REQUEST_MAX_BYTES) throw new RequestError(413, 'document-audio-request-size')
      const ctx = ctxOf(document, member), prepared = prepareClip(ctx, request)
      await prepared.validate(signal)
      await editor.planTransaction(scopeOf(document), [{ path: prepared.current.source.path, content: prepared.content, base: request.source.version }], member)
      check(signal); opened(ctx, request.source.version, request.source)
      return prepared.answer
    }),
    changeClip: (document, request, member, signal) => work(member, signal, signal => changeClip(ctxOf(document, member), request, 'agent', signal)),
  }
  const guarded = (run: () => Promise<Response>) => catchRequestErrors(async () => { try { return await run() } catch (error) { if (error instanceof ProductionAudioRefusal) throw new RequestError(error.status, error.code); throw error } })
  const routes: Record<string, Route> = {
    'document/audio': { role: 'editor', maxBody: 17 << 20, handle: (request, ctx) => guarded(() => work(ctx.member, request.signal, async signal => {
      if (request.method === 'GET') {
        const params = new URL(request.url).searchParams, version = params.get('baseDocumentVersion'), id = params.get('assetId')
        if (!version || !id || id.length > 200) throw new RequestError(400, 'document-audio-query-invalid')
        const current = opened(ctx, version), asset = current.content.assets[id]
        if (!asset) throw new RequestError(404, 'production.asset-missing')
        return jsonResponse({ document: ctx.document, version, fingerprint: fnv1a64(current.source.content), inspection: await inspect(ctx, asset, binding(current), signal) } satisfies DocumentAudioInspectionAnswer)
      }
      if (request.method !== 'POST') throw new RequestError(405, 'GET or POST')
      const form = await request.formData().catch(() => undefined)
      if (!form || [...form.keys()].some(key => key !== 'change' && key !== 'file') || form.getAll('change').length !== 1 || form.getAll('file').length !== 1) throw new RequestError(400, 'document-audio-form-invalid')
      const text = form.get('change'), file = form.get('file')
      if (typeof text !== 'string' || text.length > 4096 || !(file instanceof File)) throw new RequestError(400, 'document-audio-form-invalid')
      let change: unknown
      try { change = JSON.parse(text) } catch { throw new RequestError(400, 'document-audio-change-invalid') }
      if (!header(change) || Object.keys(change).some(key => key !== 'id' && key !== 'baseDocumentVersion')) throw new RequestError(400, 'document-audio-change-invalid')
      if (!file.size || file.size > DOCUMENT_AUDIO_MAX_BYTES) throw new RequestError(413, 'production.asset-size')
      const title = titleOf(file.name), bytes = new Uint8Array(await file.arrayBuffer())
      const key = JSON.stringify(['audio', ctx.document, ctx.member.id, change.id])
      const source = receipts.get(key)?.source ?? imports.get(key)?.source ?? binding(opened(ctx, change.baseDocumentVersion))
      const answer = await once(ctx, change, source, title, hash(bytes), bytes.length, 'editor', async () => {
        opened(ctx, change.baseDocumentVersion, source)
        const found = await resolved(ctx.document, source, signal)
        return importBytes(ctx, change, title, bytes, source, found, 'editor', signal)
      })
      return jsonResponse(answer)
    })) },
    'document/media-clip': {
      role: 'editor', maxBody: 1 << 20,
      handle: (request, ctx) => guarded(() => work(ctx.member, request.signal, async signal => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        const raw: unknown = await request.json().catch(() => undefined)
        if (!isRecord(raw) || !header(raw)) throw new RequestError(400, 'document-media-clip-invalid')
        const fields = raw as Record<string, unknown>
        if ((fields.clip === undefined) === (fields.removeClipId === undefined)) throw new RequestError(400, 'document-media-clip-invalid')
        const upsert = fields.clip !== undefined, allowed = new Set(['id', 'baseDocumentVersion', ...upsert ? ['binding', 'clip'] : ['removeClipId']])
        if (Object.keys(fields).some(key => !allowed.has(key))) throw new RequestError(400, 'document-media-clip-invalid')
        const previous = receipts.get(JSON.stringify(['clip', ctx.document, ctx.member.id, raw.id]))
        const source = upsert && isRecord(fields.binding) ? fields.binding.source : previous?.source?.version === raw.baseDocumentVersion ? previous.source : binding(opened(ctx, raw.baseDocumentVersion))
        if (!isRecord(source) || source.version !== raw.baseDocumentVersion) throw new RequestError(409, 'production-binding-changed')
        const change = { id: raw.id, source, ...upsert ? { binding: fields.binding, clip: fields.clip } : { removeClipId: fields.removeClipId } }
        if (!validateDocumentMediaClipEdit(change)) throw new RequestError(400, 'document-media-clip-invalid')
        return jsonResponse(await changeClip(ctx, change, 'editor', signal))
      })),
    },
    'document/media-clip/validate': {
      role: 'editor', maxBody: DOCUMENT_AUDIO_REQUEST_MAX_BYTES,
      handle: (request, ctx) => guarded(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        return jsonResponse(await service.validateClipChange(ctx.document, await request.json().catch(() => undefined), ctx.member, request.signal))
      }),
    },
  }
  return { service, routes, async close() { closed = true; for (const operation of operations) operation.controller.abort(); await Promise.allSettled([...operations].map(operation => operation.finished)); receipts.clear() } }
}
