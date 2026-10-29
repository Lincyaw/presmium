import { createHash, randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { bodyLimit } from 'hono/body-limit'
import { imageSize } from 'image-size'
import { applyDocumentAuthoringAction, ASSET_TITLE_MAX_LENGTH, AUTHORING_API_VERSION, DOCUMENT_ACTION_MAX_REQUEST_CHARS, DOCUMENT_AUTHORING_ACTION_TYPES, DOCUMENT_IMAGE_MAX_BYTES, DOCUMENT_OPERATION_TYPES, documentOutline, documentPart, DocumentCaptionTimingError, DocumentCommentError, DocumentComponentError, DocumentReadError, isRecord, validateDocument } from '@lincyaw/kernel'
import { validateDocumentAuthoringAction, validateDocumentAuthoringActionReference, validateDocumentOutlineQuery, validateDocumentPartQuery } from '@lincyaw/kernel/node'
import type { AppliedDocumentAuthoringAction, Asset, CanonicalSource, DocumentAnswer, DocumentAuthoringAction, DocumentAuthoringActionEffect, DocumentAuthoringActionPlan, DocumentChange, DocumentChangePlan, DocumentEvent, DocumentImageImportAnswer, DocumentOutlineQuery, DocumentPartQuery, HistoryRevision, IrEvent, Member, RevisionsAnswer, TeachingDocument } from '@lincyaw/kernel'
import { CloudError, requireId, requireInteger, requireText } from '../domain/errors.ts'
import type { CloudUser } from './auth.ts'
import type { Database } from './database.ts'
import { documentText } from './documents.ts'
import type { CloudPlan, Documents } from './documents.ts'
import type { Spaces } from './spaces.ts'
import type { ContentService } from './content.ts'
import type { ObjectStorage } from './storage.ts'
import type { Admission } from './admission.ts'
import { workbenchOutputRoutes } from './workbench-outputs.ts'

export interface WorkbenchRouteDependencies {
  db: Database
  spaces: Spaces
  documents: Documents
  current(request: Request): Promise<CloudUser>
  mutate(request: Request): Promise<CloudUser>
  publicUrl: string
  content?: ContentService
  storage?: ObjectStorage
  admission?: Admission
}

const base = '/api/spaces/:sid/presmium'
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const imageFormats: Record<string, { extension: string, mediaType: string }> = {
  png: { extension: 'png', mediaType: 'image/png' }, jpg: { extension: 'jpg', mediaType: 'image/jpeg' },
  gif: { extension: 'gif', mediaType: 'image/gif' }, webp: { extension: 'webp', mediaType: 'image/webp' },
  svg: { extension: 'svg', mediaType: 'image/svg+xml' }, bmp: { extension: 'bmp', mediaType: 'image/bmp' },
}
// A scoped opaque version reference that fits the existing history wire schema
// and can be resolved without scanning every retained revision.
const historyId = (document: string, version: string) => `${version.replace(/-/g, '').toLowerCase()}${sha(`presmium.cloud.history:${document}:${version.toLowerCase()}`).slice(0, 32)}`
function historyVersion(document: string, reference: unknown): string {
  if (typeof reference !== 'string' || !/^[a-f0-9]{64}$/.test(reference)) throw new CloudError(400, 'history-revision-invalid')
  const id = reference.slice(0, 32), version = requireId(`${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`)
  if (historyId(document, version) !== reference) throw new CloudError(400, 'history-revision-invalid')
  return version
}
const HISTORY_MESSAGES = {
  'zh-CN': { created: '创建文稿', saved: '保存文稿', restored: '恢复快照', assistant: 'AI 助手修改文稿' },
  en: { created: 'Document created', saved: 'Document saved', restored: 'Snapshot restored', assistant: 'Document updated by AI assistant' },
}
function historyMessage(message: string, lang: string | undefined): string {
  const t = HISTORY_MESSAGES[lang === 'en' ? 'en' : 'zh-CN']
  return message === 'document.created' ? t.created : message === 'document.restored' || message.startsWith('document.restore:') ? t.restored : message === 'document.agent-change' ? t.assistant : t.saved
}
const sourceOf = (answer: DocumentAnswer) => ({ documentId: answer.content.id, version: answer.version, fingerprint: answer.fingerprint })
const sameSource = (left: CanonicalSource, right: CanonicalSource) => left.documentId === right.documentId && left.version === right.version && left.fingerprint === right.fingerprint
const stable = (value: unknown) => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry)
function changeImpact(before: TeachingDocument, after: TeachingDocument): DocumentChangePlan['impact'] {
  const changed = (collection: 'sections' | 'blocks' | 'steps' | 'narrations' | 'assets' | 'definitions') => [...new Set([...Object.keys(before[collection]), ...Object.keys(after[collection])])].filter(id => stable(before[collection][id]) !== stable(after[collection][id]))
  return { sections: changed('sections'), blocks: changed('blocks'), steps: changed('steps'), narrations: changed('narrations'), assets: changed('assets'), definitions: changed('definitions'), sectionOrder: stable(before.sectionOrder) !== stable(after.sectionOrder), production: stable(before.production) !== stable(after.production), comments: stable(before.comments) !== stable(after.comments), metadata: stable(before.metadata) !== stable(after.metadata) }
}
interface SemanticMetadata { family: 'authoring-action', signature: string, action: DocumentAuthoringAction, effect: DocumentAuthoringActionEffect, impact: DocumentChangePlan['impact'] }
function actionPlan(plan: CloudPlan): DocumentAuthoringActionPlan {
  const metadata = plan.metadata as unknown as SemanticMetadata | undefined
  if (metadata?.family !== 'authoring-action') throw new CloudError(409, 'document-plan-family-changed')
  return { apiVersion: AUTHORING_API_VERSION, planId: plan.planId, changeId: plan.changeId, document: plan.document, source: plan.source, digest: plan.digest, expiresAt: plan.expiresAt, content: plan.content, issues: validateDocument(plan.content).issues, files: plan.files.map(file => ({ ...file, path: `${plan.document}/${file.path}`, version: file.path === 'lecture.json' ? plan.predictedVersion : file.version })), impact: metadata.impact, action: metadata.action, effect: metadata.effect, change: { id: plan.changeId, baseDocumentVersion: plan.source.version, replacement: plan.content } }
}
const queryOf = <T>(c: Context): T => {
  const query = c.req.query('query') ?? '{}'
  if (query.length > 16_384) throw new CloudError(413, 'document-read-request-too-large')
  try { return JSON.parse(query) as T } catch { throw new CloudError(400, 'document-read-query-invalid') }
}
function sourcePath(document: string, input: unknown): string {
  const path = requireText(input, 'project-path-invalid', 1000)
  const relative = path.startsWith(`${document}/`) ? path.slice(document.length + 1) : path
  if (relative.startsWith('/') || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..' || ['.git', 'node_modules', '.presmium'].includes(part))) throw new CloudError(400, 'project-path-invalid')
  return relative
}

/** Adapts the existing browser protocol to the shared canonical application service. */
export function workbenchRoutes(app: Hono, dependencies: WorkbenchRouteDependencies) {
  const { db, spaces, documents, current, mutate, publicUrl, content, storage } = dependencies
  const streams = new Set<AbortController>()
  const identity = async (c: Context, write = false, documentRequired = true) => {
    const user = await (write ? mutate : current)(c.req.raw), spaceId = requireId(c.req.param('sid'))
    const membership = await spaces.authorize(user.id, spaceId, write ? 'write' : 'read')
    const document = c.req.query('document')
    if (documentRequired) requireId(document)
    const member: Member = { id: user.id, name: user.name, ...user.email ? { email: user.email } : {}, roles: [membership.role] }
    return { user, spaceId, document: document!, member, membership }
  }
  const read = async (c: Context) => {
    const context = await identity(c)
    return { ...context, answer: await documents.read(context.user.id, context.spaceId, context.document) }
  }
  const unavailable = (code: string): never => { throw new CloudError(503, code) }
  const authorizedUnavailable = (code: string) => async (c: Context) => { await identity(c, c.req.method !== 'GET'); return unavailable(code) }

  app.get(`${base}/workbench`, async c => {
    const { user, spaceId, member } = await identity(c, false, false)
    const space = (await spaces.list(user.id)).find(space => space.id === spaceId)
    if (!space) throw new CloudError(404, 'space-not-found')
    return c.json({ root: `cloud://${spaceId}`, member, mcp: new URL(`/mcp/${spaceId}`, publicUrl).href })
  })
  app.get(`${base}/documents`, async c => {
    const { user, spaceId } = await identity(c, false, false)
    const space = (await spaces.list(user.id)).find(space => space.id === spaceId)
    const list = await documents.list(user.id, spaceId)
    return c.json({ title: space?.name ?? '', documents: list.map(document => ({ dir: document.id, title: document.title, lang: document.lang })), templates: [], git: false, single: false })
  })
  app.get(`${base}/document`, async c => c.json((await read(c)).answer))
  app.post(`${base}/document/change`, async c => {
    const { user, spaceId, document } = await identity(c, true)
    return c.json(await documents.change(user.id, spaceId, document, await c.req.json()))
  })
  app.use(`${base}/document/image`, bodyLimit({ maxSize: DOCUMENT_IMAGE_MAX_BYTES + (64 << 10), onError: c => c.json({ error: 'document-image-size' }, 413) }))
  app.post(`${base}/document/image`, async c => {
    const { user, spaceId, document } = await identity(c, true)
    if (!storage) throw new CloudError(503, 'asset-storage-unavailable')
    const form = await c.req.raw.formData().catch(() => undefined)
    if (!form || [...form.keys()].some(key => key !== 'change' && key !== 'file') || form.getAll('change').length !== 1 || form.getAll('file').length !== 1) throw new CloudError(400, 'document-image-form-invalid')
    const header = form.get('change'), file = form.get('file')
    if (typeof header !== 'string' || header.length > 4096 || !(file instanceof File)) throw new CloudError(400, 'document-image-form-invalid')
    let change: unknown
    try { change = JSON.parse(header) } catch { throw new CloudError(400, 'document-image-change-invalid') }
    if (!isRecord(change) || Object.keys(change).some(key => !['id', 'baseDocumentVersion'].includes(key))) throw new CloudError(400, 'document-image-change-invalid')
    const id = requireText(change.id, 'document-image-change-invalid', 200), version = requireId(change.baseDocumentVersion)
    if (!file.size || file.size > DOCUMENT_IMAGE_MAX_BYTES) throw new CloudError(413, 'document-image-size')
    const bytes = new Uint8Array(await file.arrayBuffer())
    let image: ReturnType<typeof imageSize>
    try { image = imageSize(bytes) } catch { throw new CloudError(422, 'document-image-format') }
    const format = image.type && Object.hasOwn(imageFormats, image.type) ? imageFormats[image.type] : undefined
    if (!format) throw new CloudError(422, 'document-image-format')
    const { width, height } = image
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > 40_000_000) throw new CloudError(422, 'document-image-dimensions')
    const hash = createHash('sha256').update(bytes).digest('hex'), assetId = `image_${hash}`
    const title = [...(file.name.replaceAll('\\', '/').split('/').at(-1) ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, ASSET_TITLE_MAX_LENGTH).join('')
    const asset: Asset = { id: assetId, kind: 'image', location: `assets/${hash}.${format.extension}`, fingerprint: `sha256:${hash}`, mediaType: format.mediaType, ...title ? { title } : {} }
    const snapshot = await documents.snapshot(user.id, spaceId, document, version), replacement = structuredClone(snapshot.content)
    replacement.assets[assetId] = asset
    // Object bytes precede the canonical reference. A failed source CAS can leave
    // a quota-counted unreferenced object, never a document pointing at absent bytes.
    await storage.put(spaceId, bytes, format.mediaType)
    const saved = await documents.change(user.id, spaceId, document, { id, baseDocumentVersion: version, replacement } satisfies DocumentChange)
    return c.json({ ...saved, files: saved.files.map(file => ({ ...file, path: `${document}/${file.path}` })), assetId, dimensions: { width, height } } satisfies DocumentImageImportAnswer)
  })
  app.get(`${base}/document/asset`, async c => {
    const { answer, spaceId } = await read(c)
    if (!storage) throw new CloudError(503, 'asset-storage-unavailable')
    const assetId = requireText(c.req.query('asset'), 'document-asset-id-required'), asset = answer.content.assets[assetId]
    if (!asset) throw new CloudError(404, 'document-asset-missing')
    if (asset.kind !== 'image') throw new CloudError(503, 'cloud-media-service-unavailable')
    const location = /^assets\/([a-f0-9]{64})\.(png|jpe?g|gif|webp|svg|bmp)$/.exec(asset.location)
    if (!location || asset.fingerprint !== `sha256:${location[1]}`) throw new CloudError(409, 'document-asset-location-invalid')
    const format = imageFormats[location[2] === 'jpeg' ? 'jpg' : location[2]!]
    if (!format || asset.mediaType !== format.mediaType) throw new CloudError(409, 'document-asset-media-type-invalid')
    const object = await storage.get(spaceId, `spaces/${spaceId}/${location[1]}`)
    if (object.sha256 !== location[1]) { await object.body.cancel(); throw new CloudError(409, 'document-asset-changed') }
    return new Response(object.body, { headers: {
      'Content-Type': format.mediaType, 'Content-Length': String(object.bytes), 'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${location[1]}.${format.extension}"`, 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    } })
  })
  app.get(`${base}/document/capabilities`, async c => {
    const { member } = await read(c), writable = member.roles.some(role => role === 'editor' || role === 'owner')
    return c.json({ apiVersion: AUTHORING_API_VERSION, documentSchemaVersion: 1, available: true, actions: { read: true, outline: true, readPart: true, plan: writable, apply: writable, planPageDuplication: false, applyPageDuplication: false, planPageChange: false, applyPageChange: false, planAction: writable, applyAction: writable }, semanticActions: DOCUMENT_AUTHORING_ACTION_TYPES.filter(type => type !== 'caption.timing.set'), operations: DOCUMENT_OPERATION_TYPES, replacement: writable, fileChanges: writable, idempotency: 'process-current-source', review: 'locks-and-history' })
  })
  const readPart = async (c: Context, outline: boolean) => {
    const { answer } = await read(c), query = queryOf<DocumentOutlineQuery | DocumentPartQuery>(c)
    if (!(outline ? validateDocumentOutlineQuery(query) : validateDocumentPartQuery(query))) throw new CloudError(400, 'document-read-query-invalid')
    const expected = query.source
    if (expected && !sameSource(expected, sourceOf(answer))) throw new CloudError(409, 'document-version-changed')
    try { return c.json(outline ? documentOutline(answer.content, sourceOf(answer), query as DocumentOutlineQuery) : documentPart(answer.content, sourceOf(answer), query as DocumentPartQuery)) }
    catch (error) { if (error instanceof DocumentReadError) throw new CloudError(error.status, error.message); throw error }
  }
  app.get(`${base}/document/outline`, c => readPart(c, true))
  app.get(`${base}/document/part`, c => readPart(c, false))
  app.post(`${base}/document/action/plan`, async c => {
    const context = await identity(c, true), raw: unknown = await c.req.json()
    if (JSON.stringify(raw).length > DOCUMENT_ACTION_MAX_REQUEST_CHARS) throw new CloudError(413, 'authoring-action-request-too-large')
    if (!validateDocumentAuthoringAction(raw)) throw new CloudError(400, 'authoring-action-invalid')
    if (raw.action.type === 'caption.timing.set') throw new CloudError(503, 'caption-production-unavailable')
    const signature = sha(stable(raw))
    const previousPlan = async () => {
      const previous = (await db.query('SELECT result FROM document_plans WHERE document_id=$1 AND user_id=$2 AND request_id=$3', [context.document, context.user.id, raw.id])).rows[0]?.result as CloudPlan | undefined
      if (previous) {
        if (previous.metadata?.family !== 'authoring-action' || previous.metadata.signature !== signature) throw new CloudError(409, 'operation-id-reused')
        if (new Date(previous.expiresAt).valueOf() <= Date.now()) throw new CloudError(409, 'document-plan-expired')
      }
      return previous
    }
    // The canonical service chooses one persisted candidate under its document
    // row lock. Concurrent identical intents join that candidate, including its
    // generated IDs and timestamps, without borrowing a second DB connection.
    let planned = await previousPlan()
    if (!planned) {
      const answer = await documents.read(context.user.id, context.spaceId, context.document)
      if (!sameSource(raw.source, sourceOf(answer))) throw new CloudError(409, 'document-version-changed')
      let next: ReturnType<typeof applyDocumentAuthoringAction>
      try { next = applyDocumentAuthoringAction(answer.content, raw.action, { member: context.member, now: new Date().toISOString(), allocate: randomUUID, allocateContentIds: true }) }
      catch (error) { if (error instanceof DocumentCommentError || error instanceof DocumentComponentError || error instanceof DocumentCaptionTimingError) throw new CloudError(error.status, error.message); throw error }
      const change: DocumentChange = { id: raw.id, baseDocumentVersion: answer.version, replacement: next.content }
      const metadata: SemanticMetadata = { family: 'authoring-action', signature, action: raw.action, effect: next.effect, impact: changeImpact(answer.content, next.content) }
      try { planned = await documents.plan(context.user.id, context.spaceId, context.document, change, metadata as unknown as Record<string, unknown>) }
      catch (error) {
        if (!(error instanceof CloudError) || error.code !== 'operation-id-reused') throw error
        planned = await previousPlan()
        if (!planned) throw error
      }
    }
    return c.json(actionPlan(planned))
  })
  const storedAction = async (c: Context, write = false) => {
    const context = await identity(c, write)
    const reference = write ? await c.req.json() : { planId: c.req.query('planId'), digest: c.req.query('digest') }
    if (write && !validateDocumentAuthoringActionReference(reference)) throw new CloudError(400, 'authoring-action-reference-invalid')
    const planId = requireId(reference.planId), digest = requireText(reference.digest)
    const result = await db.query('SELECT result FROM document_plans WHERE id=$1 AND document_id=$2 AND user_id=$3', [planId, context.document, context.user.id])
    const stored = result.rows[0]?.result as CloudPlan | undefined
    if (!stored || stored.digest !== digest || write && !sameSource(reference.source, stored.source)) throw new CloudError(409, 'document-plan-changed')
    return { ...context, reference, stored, plan: actionPlan(stored) }
  }
  app.get(`${base}/document/action/plan`, async c => {
    const { user, spaceId, document, stored, plan } = await storedAction(c)
    const answer = await documents.read(user.id, spaceId, document), currentSource = sourceOf(answer)
    return c.json({ plan, currentSource, state: answer.version === stored.predictedVersion ? 'applied' : sameSource(plan.source, currentSource) ? 'current' : 'old' })
  })
  app.post(`${base}/document/action/apply`, async c => {
    const { user, spaceId, document, reference, stored, plan } = await storedAction(c, true)
    if (plan.action.type === 'comment.delete' && reference.confirmDeletion !== true) throw new CloudError(409, 'comment-deletion-confirmation-required')
    if (plan.action.type !== 'comment.delete' && reference.confirmDeletion !== undefined) throw new CloudError(400, 'comment-deletion-confirmation-unexpected')
    const saved = await documents.apply(user.id, spaceId, document, stored.planId, plan.change)
    const { content: _content, issues: _issues, commit: _commit, ...receipt } = saved
    const result: AppliedDocumentAuthoringAction = { ...receipt, files: receipt.files.map(file => ({ ...file, path: `${document}/${file.path}` })), planId: plan.planId, digest: plan.digest, action: plan.action.type, effect: plan.effect, verification: { saved: true, source: sourceOf(saved), plannedVersion: stored.predictedVersion, actionStateVerified: true, compiled: 'not-requested', runtime: 'not-requested' } }
    return c.json(result)
  })
  app.get(`${base}/document/events`, async c => {
    const context = await read(c)
    const controller = new AbortController()
    streams.add(controller)
    c.header('X-Accel-Buffering', 'no')
    // The persisted source is checked on every observation, so membership revocation
    // closes the stream too. Polling is bounded and survives replica restarts.
    return streamSSE(c, async stream => {
      stream.onAbort(() => controller.abort())
      let last: string | undefined, sequence = 0
      try {
        while (!stream.aborted && !controller.signal.aborted) {
          const user = await current(new Request(c.req.raw.url, { headers: c.req.raw.headers, signal: controller.signal }))
          const answer = await documents.read(user.id, context.spaceId, context.document)
          if (answer.version !== last) {
            const event: DocumentEvent = { document: context.document, version: answer.version, valid: !answer.issues.some(issue => issue.severity === 'error'), issues: answer.issues, projectRevision: answer.version }
            await stream.writeSSE({ event: 'document', id: String(++sequence), data: JSON.stringify(event) })
            last = answer.version
          }
          await stream.sleep(2000)
        }
      } catch { /* A disconnected or revoked reader receives no further source data. */ }
      finally { controller.abort(); streams.delete(controller) }
    })
  })

  app.get(`${base}/files`, async c => {
    const { user, spaceId, document } = await identity(c)
    const snapshot = await documents.snapshot(user.id, spaceId, document)
    return c.json({ document, home: false, files: [{ path: `${document}/lecture.json` }, ...Object.keys(snapshot.files).map(path => ({ path: `${document}/${path}` }))] })
  })
  app.get(`${base}/source`, async c => {
    const { user, spaceId, document } = await identity(c), path = sourcePath(document, c.req.query('path'))
    const snapshot = await documents.snapshot(user.id, spaceId, document)
    if (path === 'lecture.json') return c.json({ path: `${document}/${path}`, content: documentText(snapshot.content), version: snapshot.id })
    const file = snapshot.files[path]
    if (!file) throw new CloudError(404, 'project-file-not-found')
    return c.json({ path: `${document}/${path}`, content: file.content, version: file.version })
  })
  app.post(`${base}/source/transaction`, async c => {
    const { user, spaceId, document } = await identity(c, true), body = await c.req.json()
    if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 32) throw new CloudError(400, 'project-file-changes-invalid')
    const snapshot = await documents.snapshot(user.id, spaceId, document)
    const change: DocumentChange = { id: typeof body.id === 'string' ? body.id : randomUUID(), baseDocumentVersion: snapshot.id, fileChanges: [] }
    const paths = new Set<string>()
    for (const file of body.changes) {
      const path = sourcePath(document, file.path)
      if (paths.has(path)) throw new CloudError(400, 'project-path-duplicate')
      paths.add(path)
      if (typeof file.content !== 'string' || !(file.base === null || typeof file.base === 'string')) throw new CloudError(400, 'project-file-change-invalid')
      if (path === 'lecture.json') {
        if (file.base !== snapshot.id) throw new CloudError(409, 'document-version-changed')
        try { change.replacement = JSON.parse(file.content) as TeachingDocument } catch { throw new CloudError(422, 'document-invalid') }
      } else change.fileChanges!.push({ path, content: file.content, base: file.base })
    }
    change.replacement ??= snapshot.content
    const saved = await documents.change(user.id, spaceId, document, change)
    return c.json({ versions: saved.files.map(file => ({ ...file, path: `${document}/${file.path}` })) })
  })

  app.get(`${base}/revisions`, async c => {
    const { user, spaceId, document } = await identity(c)
    const source = await documents.read(user.id, spaceId, document), query = queryOf<{ offset?: number, snapshot?: string }>(c)
    const offset = requireInteger(query.offset ?? 0, 'history-offset-invalid', 0, 100_000), snapshot = sha(`cloud.history:${document}:${source.version}`)
    if (query.snapshot && query.snapshot !== snapshot) throw new CloudError(409, 'document-history-changed')
    const page = await documents.historyPage(user.id, spaceId, document, { offset, limit: 20, snapshot: source.version })
    const revisions: HistoryRevision[] = page.revisions.map(version => ({ id: historyId(document, version.id), message: historyMessage(version.message, source.content.metadata.lang), author: version.author, date: new Date(version.date).toISOString(), origin: { kind: version.message === 'document.agent-change' ? 'agent' : 'editor', member: { id: version.userId, name: version.author, roles: ['editor'] } }, files: [`${document}/lecture.json`], revertible: false }))
    // Snapshot restore is a separate explicit cloud operation. Selective undo is
    // deliberately unavailable until it has its own conflict-aware transaction.
    return c.json({ revisions, historyBinding: { source: { version: source.version, fingerprint: source.fingerprint }, snapshot }, ...page.nextCursor ? { nextOffset: offset + revisions.length } : {}, ...offset > 0 ? { previousOffset: Math.max(0, offset - 20) } : {} } satisfies RevisionsAnswer)
  })
  app.get(`${base}/history/file`, async c => {
    const { user, spaceId, document } = await identity(c), query = queryOf<{ revision: string, path?: string, offset?: number }>(c)
    const snapshot = await documents.snapshot(user.id, spaceId, document, historyVersion(document, query.revision))
    const path = query.path ? sourcePath(document, query.path) : 'lecture.json'
    const content = path === 'lecture.json' ? documentText(snapshot.content) : snapshot.files[path]?.content
    if (content === undefined) throw new CloudError(404, 'project-file-not-found')
    const offset = requireInteger(query.offset ?? 0, 'history-offset-invalid', 0, content.length), text = content.slice(offset, offset + 4000), next = offset + text.length
    return c.json({ document, revision: query.revision, path: `${document}/${path}`, encoding: 'utf8-text-fragment', text, offset, ...next < content.length ? { nextOffset: next } : {}, totalChars: content.length, complete: next === content.length, sha256: sha(content), verification: 'historical-file-only' })
  })
  app.get(`${base}/document/version`, async c => {
    const { user, spaceId, document } = await identity(c)
    const snapshot = await documents.snapshot(user.id, spaceId, document, historyVersion(document, c.req.query('revision')))
    return c.json({ document, version: snapshot.id, fingerprint: snapshot.fingerprint, content: snapshot.content })
  })
  app.post(`${base}/document/version/restore`, async c => {
    const { user, spaceId, document } = await identity(c, true), body = await c.req.json()
    return c.json(await documents.restore(user.id, spaceId, document, { requestId: requireText(body.requestId), version: historyVersion(document, body.revision), base: requireId(body.baseDocumentVersion) }))
  })
  app.get('/api/spaces/:sid/documents/:id/versions/:version', async c => {
    const user = await current(c.req.raw), spaceId = requireId(c.req.param('sid')), document = requireId(c.req.param('id'))
    const snapshot = await documents.snapshot(user.id, spaceId, document, requireId(c.req.param('version')))
    return c.json({ document, version: snapshot.id, fingerprint: snapshot.fingerprint, content: snapshot.content })
  })
  app.get(`${base}/changes`, async c => { await read(c); return c.json({ files: [] }) })
  app.get(`${base}/telemetry`, async c => { await identity(c, false, false); return c.json({ enabled: false }) })
  app.get(`${base}/preview`, async c => {
    const { user, spaceId, document } = await identity(c), renderer = c.req.query('view') ?? 'web'
    if (renderer !== 'web' && renderer !== 'slides') throw new CloudError(400, 'preview-renderer-invalid')
    if (!content) throw new CloudError(503, 'cloud-compilation-unavailable')
    return c.json(await content.preview(user.id, spaceId, document, renderer))
  })
  app.get(`${base}/ir`, async c => {
    const { user, spaceId, document } = await identity(c)
    if (!content) throw new CloudError(503, 'cloud-compilation-unavailable')
    const answer = await content.ir(user.id, spaceId, document)
    return c.json(answer)
  })
  app.get(`${base}/ir/events`, async c => {
    const context = await identity(c)
    if (!content) throw new CloudError(503, 'cloud-compilation-unavailable')
    const controller = new AbortController(); streams.add(controller)
    c.header('X-Accel-Buffering', 'no')
    return streamSSE(c, async stream => {
      stream.onAbort(() => controller.abort())
      let last: string | undefined
      try {
        await stream.writeSSE({ event: 'open', data: '{}' })
        while (!stream.aborted && !controller.signal.aborted) {
          const user = await current(new Request(c.req.raw.url, { headers: c.req.raw.headers, signal: controller.signal }))
          try {
            // Observation follows already-requested preparation, without rebuilding failed or untouched source.
            const answer = await content.observedIr(user.id, context.spaceId, context.document)
            if (answer && answer.revision !== last) {
              const event: IrEvent = { document: context.document, revision: answer.revision, diagnostics: { errors: answer.diagnostics.filter(finding => finding.severity === 'error').length, warnings: answer.diagnostics.filter(finding => finding.severity === 'warning').length }, files: [`${context.document}/lecture.json`] }
              await stream.writeSSE({ event: 'revision', data: JSON.stringify(event) }); last = answer.revision
            }
          } catch (error) { if (!(error instanceof CloudError) || !['cloud-preview-required', 'preview-preparing', 'preview-build-failed', 'preview-build-cancelled'].includes(error.code)) throw error }
          await stream.sleep(2000)
        }
      } catch { /* Revoked observers are disconnected before another artifact is disclosed. */ }
      finally { controller.abort(); streams.delete(controller) }
    })
  })

  const outputs = workbenchOutputRoutes(app, dependencies)
  // These routes have no cloud owner yet. A source save never claims that an
  // unrelated compiler, player, paid service or review transaction has run.
  for (const path of ['voice-catalog', 'voice-capabilities', 'voiceover', 'voiceover/jobs', 'voiceover/job', 'voiceover/cancel', 'voice-preview', 'voice-preview/media', 'production-plan', 'production-media', 'production-asset', 'document/audio', 'document/audio/capabilities', 'document/recording/adopt', 'document/media-clip', 'document/transcription/capabilities', 'document/transcription', 'document/transcription/result', 'document/transcription/cancel']) app.all(`${base}/${path}`, authorizedUnavailable('cloud-media-service-unavailable'))
  for (const path of ['focus', 'control', 'diagnostics', 'diagnostics/events', 'diagnostics/authoring', 'review', 'review/accept', 'review/reject', 'review/restore', 'history/undo', 'history/redo', 'revisions/revert']) app.all(`${base}/${path}`, authorizedUnavailable('cloud-operation-unavailable'))

  return { close() { outputs.close(); for (const controller of streams) controller.abort(); streams.clear() } }
}
