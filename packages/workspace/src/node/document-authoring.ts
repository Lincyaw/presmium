import { createHash, randomUUID } from 'node:crypto'
import { applyDocumentOperations, AUTHORING_API_VERSION, DOCUMENT_ENTRY, DOCUMENT_OPERATION_TYPES, DOCUMENT_SCHEMA_VERSION, fnv1a64, hasRole, validateDocument } from '@lincyaw/kernel'
import { validateDocumentChange } from '@lincyaw/kernel/node'
import type { AppliedDocumentChange, ApplyDocumentChange, DocumentAnswer, DocumentAuthoring, DocumentChange, DocumentChangeAnswer, DocumentChangePlan, DocumentIssue, Member, RequestContext, SourceTransactionChange, TeachingDocument } from '@lincyaw/kernel'
import { RequestError } from './errors.ts'
import { MAX_SOURCE, MAX_SOURCE_CHANGES } from './source-editor.ts'
import type { SourceEditor, SourceTransactionHistory } from './source-editor.ts'
import type { Revisions } from './revisions.ts'

const PLAN_LIFETIME_MS = 5 * 60_000
const MAX_RECEIPTS = 64
const entryOf = (directory: string) => directory ? `${directory}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY
const signatureOf = (change: DocumentChange) => createHash('sha256').update(JSON.stringify(change)).digest('hex')
const keyOf = (document: string, member: Member, id: string) => JSON.stringify([document, member.id, id])
const sourceOf = (answer: DocumentAnswer) => ({ documentId: answer.content.id, version: answer.version, fingerprint: answer.fingerprint })

export function decodeAuthoringDocument(content: string): { document?: TeachingDocument, issues: DocumentIssue[] } {
  let value: unknown
  try { value = JSON.parse(content.replace(/^\uFEFF/, '')) }
  catch { return { issues: [{ path: '', code: 'json-syntax', message: 'The document is not valid JSON.', severity: 'error' }] } }
  return validateDocument(value)
}

export function readAuthoringDocument(editor: SourceEditor, ctx: Pick<RequestContext, 'document' | 'member'>) {
  if (!hasRole(ctx.member, 'editor')) throw new RequestError(403, 'authoring-permission-denied')
  const source = editor.read(editor.scope(ctx.document), entryOf(ctx.document), ctx.member)
  const checked = decodeAuthoringDocument(source.content)
  if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues })
  return { source, content: checked.document, issues: checked.issues }
}

export interface DocumentEditor extends DocumentAuthoring {
  /** Direct author saves retain the HTTP transaction boundary; agents apply a reviewed preflight. */
  change(document: string, change: DocumentChange, member: Member): Promise<DocumentChangeAnswer>
}

export function createDocumentEditor({ editor, revisions, reviewRequired = false }: { editor: SourceEditor, revisions?: Revisions, reviewRequired?: boolean }): DocumentEditor {
  const receipts = new Map<string, { signature: string, version: string, files: DocumentChangeAnswer['files'], commit?: DocumentChangeAnswer['commit'] }>()
  const plans = new Map<string, { key: string, signature: string, expires: number }>()
  const remember = <T>(table: Map<string, T>, key: string, value: T) => {
    table.set(key, value)
    while (table.size > MAX_RECEIPTS) table.delete(table.keys().next().value!)
  }
  const read = async (document: string, member: Member): Promise<DocumentAnswer> => {
    const { source, content, issues } = readAuthoringDocument(editor, { document, member })
    return { document, version: source.version, fingerprint: fnv1a64(source.content), content, issues }
  }
  const checkedChange = (raw: unknown): DocumentChange => {
    const checked = validateDocumentChange(raw)
    if (!checked.change) throw new RequestError(400, 'document-change-invalid', { issues: checked.issues })
    return checked.change
  }
  const filesOf = async (document: string, current: DocumentAnswer, change: DocumentChange): Promise<{ content: TeachingDocument, issues: DocumentIssue[], changes: SourceTransactionChange[] }> => {
    if (current.version !== change.baseDocumentVersion) throw new RequestError(409, 'document-version-changed', { version: current.version })
    let candidate: unknown = change.replacement
    if (change.operations) {
      try { candidate = applyDocumentOperations(current.content, change.operations) }
      catch (error) { throw new RequestError(422, 'document-operation-invalid', { reason: error instanceof Error ? error.message : 'invalid-operation' }) }
    }
    const checked = validateDocument(candidate)
    if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues })
    if (checked.document.id !== current.content.id) throw new RequestError(422, 'document-identity-changed')
    const path = entryOf(document), fileChanges = change.fileChanges ?? []
    if (fileChanges.some(file => file.path === path)) throw new RequestError(422, 'document-file-repeated')
    const changes = [{ path, content: `${JSON.stringify(checked.document, null, 2)}\n`, base: current.version }, ...fileChanges]
    if (revisions) {
      const ignored = (await Promise.all(changes.map(async file => await revisions.ignores(file.path) ? file.path : undefined))).filter((path): path is string => Boolean(path))
      if (ignored.length) throw new RequestError(409, 'document-files-ignored', { ignored })
    }
    return { content: checked.document, issues: checked.issues, changes }
  }
  const saveChange = async (document: string, raw: DocumentChange, member: Member, origin: 'editor' | 'agent' = 'editor'): Promise<DocumentChangeAnswer> => {
    const change = checkedChange(raw), current = await read(document, member)
    const signature = signatureOf(change), key = keyOf(document, member, change.id), receipt = receipts.get(key)
    if (receipt) {
      if (receipt.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
      if (receipt.version !== current.version) throw new RequestError(409, 'document-version-changed', { version: current.version })
      if (receipt.files.some(file => editor.read(editor.scope(document), file.path, member).version !== file.version)) throw new RequestError(409, 'document-files-changed')
      return { ...current, changeId: change.id, files: receipt.files, ...receipt.commit ? { commit: receipt.commit } : {} }
    }
    const candidate = await filesOf(document, current, change)
    const ownHistory: SourceTransactionHistory | undefined = revisions ? { run: work => revisions.transaction(work), commit: (paths, lang) => revisions.commitWhileLocked({ paths, summary: lang?.startsWith('en') ? 'Edit document' : '编辑文稿', body: '', origin: { kind: origin, member } }) } : undefined
    const saved = await editor.transaction(editor.scope(document), candidate.changes, member, ownHistory)
    const version = saved.versions.find(file => file.path === entryOf(document))!.version
    remember(receipts, key, { signature, version, files: saved.versions, ...saved.revision ? { commit: saved.revision } : {} })
    const verified = await read(document, member)
    if (verified.version !== version || saved.versions.some(file => editor.read(editor.scope(document), file.path, member).version !== file.version)) throw new RequestError(409, 'document-readback-changed', { changeId: change.id, committed: true, version, currentVersion: verified.version })
    return { ...verified, changeId: change.id, files: saved.versions, ...saved.revision ? { commit: saved.revision } : {} }
  }
  const service: DocumentEditor = {
    capabilities(_document, member) {
      const allowed = hasRole(member, 'editor')
      return { apiVersion: AUTHORING_API_VERSION, documentSchemaVersion: DOCUMENT_SCHEMA_VERSION, available: allowed, ...allowed ? {} : { reason: 'permission-denied' as const }, actions: { read: allowed, plan: allowed, apply: allowed && !reviewRequired }, ...reviewRequired ? { applyUnavailableReason: 'review-required' as const } : {}, operations: DOCUMENT_OPERATION_TYPES, replacement: true, fileChanges: true, limits: { maxFiles: MAX_SOURCE_CHANGES, maxTextBytes: MAX_SOURCE, maxOperations: 1000, planLifetimeMs: PLAN_LIFETIME_MS }, idempotency: 'process-current-source', review: reviewRequired ? 'required-unsupported' : revisions ? 'locks-and-history' : 'locks-only' }
    },
    read,
    change: saveChange,
    async plan(document, raw, member) {
      const change = checkedChange(raw), current = await read(document, member)
      const candidate = await filesOf(document, current, change)
      const planned = await editor.planTransaction(editor.scope(document), candidate.changes, member)
      const impact: DocumentChangePlan['impact'] = { sections: [], blocks: [], steps: [], narrations: [], assets: [], definitions: [], sectionOrder: false, production: false, comments: false, metadata: false }
      for (const field of ['sections', 'blocks', 'steps', 'narrations', 'assets', 'definitions'] as const) impact[field] = [...new Set([...Object.keys(current.content[field]), ...Object.keys(candidate.content[field])])].filter(id => JSON.stringify(current.content[field][id]) !== JSON.stringify(candidate.content[field][id]))
      for (const field of ['sectionOrder', 'production', 'comments', 'metadata'] as const) impact[field] = JSON.stringify(current.content[field]) !== JSON.stringify(candidate.content[field])
      const planId = randomUUID(), digest = signatureOf(change), expires = Date.now() + PLAN_LIFETIME_MS
      remember(plans, planId, { key: keyOf(document, member, change.id), signature: digest, expires })
      return { apiVersion: AUTHORING_API_VERSION, planId, changeId: change.id, document, source: sourceOf(current), digest, expiresAt: new Date(expires).toISOString(), content: candidate.content, issues: candidate.issues, files: planned.versions.map(file => ({ ...file, base: candidate.changes.find(change => change.path === file.path)!.base })), impact }
    },
    async apply(document, request: ApplyDocumentChange, member): Promise<AppliedDocumentChange> {
      if (reviewRequired) throw new RequestError(409, 'authoring-review-required')
      const change = checkedChange(request.change), key = keyOf(document, member, change.id)
      const plan = plans.get(request.planId)
      if (!plan || plan.key !== key || plan.signature !== signatureOf(change)) throw new RequestError(409, 'document-plan-changed')
      if (plan.expires < Date.now() && !receipts.has(key)) throw new RequestError(409, 'document-plan-expired')
      const answer = await saveChange(document, change, member, 'agent')
      return { ...answer, verification: { saved: true, source: sourceOf(answer), compiled: 'not-requested', runtime: 'not-requested' } }
    },
  }
  return service
}
