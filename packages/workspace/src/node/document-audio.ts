import { createHash, randomUUID } from 'node:crypto'
import { join, relative } from 'node:path'
import { ASSET_TITLE_MAX_LENGTH, DOCUMENT_AUDIO_MAX_BYTES, fnv1a64, isRecord, jsonResponse, ProductionAudioRefusal, validateDocument } from '@lincyaw/kernel'
import type { Asset, DocumentAudioImportAnswer, DocumentAudioInspectionAnswer, DocumentChangeAnswer, DocumentMediaClipChange, ProductionAudioAuthoring, RequestContext, Route, TeachingDocument } from '@lincyaw/kernel'
import { productionAssetFile } from '@lincyaw/kernel/node'
import { readAuthoringDocument } from './document-editor.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { Revisions } from './revisions.ts'
import type { SourceEditor, SourceTransactionHistory } from './source-editor.ts'

interface Options { root: string, editor: SourceEditor, revisions?: Revisions, audio?: ProductionAudioAuthoring }
const MAX_AUDIO = DOCUMENT_AUDIO_MAX_BYTES
const header = (value: unknown): value is { id: string, baseDocumentVersion: string } => isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200 && typeof value.baseDocumentVersion === 'string' && /^[\da-f]{20}$/.test(value.baseDocumentVersion)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/** Authoring routes use canonical declarations, never a generic upload path or a compiled asset roster. */
export function documentAudioRoutes({ root, editor, revisions, audio }: Options): Record<string, Route> {
  const receipts = new Map<string, { signature: string, answer: DocumentChangeAnswer, assetId?: string }>()
  const opened = (ctx: RequestContext, version: string) => {
    const current = readAuthoringDocument(editor, ctx)
    if (current.source.version !== version) throw new RequestError(409, 'document-version-changed', { version: current.source.version })
    return current
  }
  const service = () => {
    if (!audio) throw new RequestError(503, 'production-audio-unavailable')
    return audio
  }
  const inspect = async (ctx: RequestContext, asset: Asset, signal: AbortSignal) => {
    const file = productionAssetFile(join(root, ctx.document), asset.location)
    if (!file) throw new RequestError(422, 'production.asset-path')
    editor.readableFile(editor.scope(ctx.document), relative(root, file).split('\\').join('/'), ctx.member)
    return service().inspectAsset(asset, signal)
  }
  const history = (ctx: RequestContext, content: TeachingDocument, validate?: () => Promise<void>): SourceTransactionHistory => ({
    run: work => {
      const guarded = async () => { await validate?.(); return work() }
      return revisions ? revisions.transaction(guarded) : guarded()
    },
    commit: async paths => {
      if (!revisions) return undefined
      const ignored = (await Promise.all(paths.map(async path => await revisions.ignores(path) ? path : undefined))).filter((path): path is string => Boolean(path))
      if (ignored.length) throw new RequestError(409, 'document-files-ignored', { ignored })
      return revisions.commitWhileLocked({ paths, summary: content.metadata.lang.startsWith('en') ? 'Edit audio media' : '编辑音频素材', body: '', origin: { kind: 'editor', member: ctx.member } })
    },
  })
  const remember = (key: string, signature: string, answer: DocumentChangeAnswer, assetId?: string) => {
    receipts.set(key, { signature, answer, assetId })
    while (receipts.size > 64) receipts.delete(receipts.keys().next().value!)
  }
  const receipt = (key: string, signature: string, ctx: RequestContext) => {
    const found = receipts.get(key)
    if (!found) return undefined
    if (found.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
    opened(ctx, found.answer.version)
    return found
  }
  const guarded = (work: () => Promise<Response>) => catchRequestErrors(async () => {
    try { return await work() }
    catch (error) { if (error instanceof ProductionAudioRefusal) throw new RequestError(error.status, error.code); throw error }
  })
  return {
    'document/audio': {
      role: 'editor', maxBody: 17 << 20,
      handle: (request, ctx) => guarded(async () => {
        if (request.method === 'GET') {
          const params = new URL(request.url).searchParams, version = params.get('baseDocumentVersion'), id = params.get('assetId')
          if (!version || !id || id.length > 200) throw new RequestError(400, 'document-audio-query-invalid')
          const current = opened(ctx, version), asset = current.content.assets[id]
          if (!asset) throw new RequestError(404, 'production.asset-missing')
          const inspection = await inspect(ctx, asset, request.signal)
          opened(ctx, version)
          return jsonResponse({ document: ctx.document, version, fingerprint: fnv1a64(current.source.content), inspection } satisfies DocumentAudioInspectionAnswer)
        }
        if (request.method !== 'POST') throw new RequestError(405, 'GET or POST')
        const form = await request.formData().catch(() => undefined)
        if (!form || [...form.keys()].some(key => key !== 'change' && key !== 'file') || form.getAll('change').length !== 1 || form.getAll('file').length !== 1) throw new RequestError(400, 'document-audio-form-invalid')
        const text = form.get('change'), file = form.get('file')
        if (typeof text !== 'string' || text.length > 4096 || !(file instanceof File)) throw new RequestError(400, 'document-audio-form-invalid')
        let change: unknown
        try { change = JSON.parse(text) } catch { throw new RequestError(400, 'document-audio-change-invalid') }
        if (!header(change) || Object.keys(change).some(key => key !== 'id' && key !== 'baseDocumentVersion')) throw new RequestError(400, 'document-audio-change-invalid')
        if (!file.size || file.size > MAX_AUDIO) throw new RequestError(413, 'production.asset-size')
        const title = [...(file.name.replaceAll('\\', '/').split('/').at(-1) ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, ASSET_TITLE_MAX_LENGTH).join('')
        const bytes = new Uint8Array(await file.arrayBuffer()), signature = digest(JSON.stringify([change, title, createHash('sha256').update(bytes).digest('hex')])), key = JSON.stringify(['audio', ctx.document, ctx.member.id, change.id])
        const previous = receipt(key, signature, ctx)
        if (previous?.assetId) {
          const current = opened(ctx, previous.answer.version), inspection = await inspect(ctx, current.content.assets[previous.assetId]!, request.signal)
          opened(ctx, previous.answer.version)
          return jsonResponse({ ...previous.answer, assetId: previous.assetId, inspection } satisfies DocumentAudioImportAnswer)
        }
        const current = opened(ctx, change.baseDocumentVersion), assetId = `audio_${randomUUID().replaceAll('-', '')}`, probed = await service().inspectBytes(assetId, bytes, request.signal)
        const location = `assets/audio/${assetId}.${probed.extension}`, path = ctx.document ? `${ctx.document}/${location}` : location
        const candidate = structuredClone(current.content)
        candidate.assets[assetId] = { id: assetId, kind: 'audio', location, ...title ? { title } : {}, fingerprint: `sha256:${probed.inspection.sha256}`, mediaType: probed.inspection.mediaType }
        const content = `${JSON.stringify(candidate, null, 2)}\n`
        request.signal.throwIfAborted()
        const saved = await editor.transactionWithBinary(editor.scope(ctx.document), { path: current.source.path, content, base: current.source.version }, { path, content: bytes }, ctx.member, history(ctx, candidate))
        const version = saved.versions.find(file => file.path === current.source.path)!.version
        const answer: DocumentAudioImportAnswer = { changeId: change.id, document: ctx.document, version, fingerprint: fnv1a64(content), content: candidate, issues: current.issues, files: saved.versions, assetId, inspection: probed.inspection, ...saved.revision ? { commit: saved.revision } : {} }
        remember(key, signature, answer, assetId)
        return jsonResponse(answer)
      }),
    },
    'document/media-clip': {
      role: 'editor', maxBody: 1 << 20,
      handle: (request, ctx) => guarded(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        const raw: unknown = await request.json().catch(() => undefined)
        if (!isRecord(raw) || !header(raw)) throw new RequestError(400, 'document-media-clip-invalid')
        const fields = raw as Record<string, unknown>
        if ((fields.clip === undefined) === (fields.removeClipId === undefined)) throw new RequestError(400, 'document-media-clip-invalid')
        const change = raw as unknown as DocumentMediaClipChange, signature = digest(JSON.stringify(raw)), key = JSON.stringify(['clip', ctx.document, ctx.member.id, change.id])
        const previous = receipt(key, signature, ctx)
        if (previous) return jsonResponse(previous.answer)
        const current = opened(ctx, change.baseDocumentVersion), candidate = structuredClone(current.content)
        if ('removeClipId' in change) {
          if (typeof change.removeClipId !== 'string' || !candidate.production.mediaClips.some(clip => clip.id === change.removeClipId)) throw new RequestError(404, 'document-media-clip-missing')
          candidate.production.mediaClips = candidate.production.mediaClips.filter(clip => clip.id !== change.removeClipId)
        } else {
          const binding = change.binding
          if (!isRecord(binding) || !isRecord(binding.source) || binding.source.documentId !== current.content.id || binding.source.version !== current.source.version || binding.source.fingerprint !== fnv1a64(current.source.content)
            || typeof binding.irRevision !== 'string' || !/^[\da-f]{16}$/.test(binding.irRevision) || typeof binding.planId !== 'string' || !/^[\da-f]{32}$/.test(binding.planId) || !isRecord(change.clip)) throw new RequestError(409, 'production-binding-changed')
          const index = candidate.production.mediaClips.findIndex(clip => clip.id === change.clip.id)
          if (index < 0) candidate.production.mediaClips.push(change.clip)
          else candidate.production.mediaClips[index] = change.clip
        }
        const checked = validateDocument(candidate)
        if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues })
        const validate = 'clip' in change ? async () => {
          for (const id of new Set(candidate.production.mediaClips.map(clip => clip.assetId))) {
            const asset = candidate.assets[id], file = asset && productionAssetFile(join(root, ctx.document), asset.location)
            if (!file) throw new RequestError(422, 'production.asset-path')
            editor.readableFile(editor.scope(ctx.document), relative(root, file).split('\\').join('/'), ctx.member)
          }
          await service().validateClips(change.binding, candidate.production.mediaClips, candidate.assets, request.signal)
        } : undefined
        const content = `${JSON.stringify(checked.document, null, 2)}\n`
        const saved = await editor.transaction(editor.scope(ctx.document), [{ path: current.source.path, content, base: current.source.version }], ctx.member, history(ctx, checked.document, validate))
        const answer: DocumentChangeAnswer = { changeId: change.id, document: ctx.document, version: saved.versions[0]!.version, fingerprint: fnv1a64(content), content: checked.document, issues: checked.issues, files: saved.versions, ...saved.revision ? { commit: saved.revision } : {} }
        remember(key, signature, answer)
        return jsonResponse(answer)
      }),
    },
  }
}
