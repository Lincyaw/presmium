import { createHash, randomUUID } from 'node:crypto'
import { applyDocumentOperations, AUTHORING_API_VERSION, DOCUMENT_ENTRY, DOCUMENT_OPERATION_TYPES, DOCUMENT_READ_MAX_REQUEST_CHARS, DOCUMENT_READ_MAX_RESPONSE_CHARS, DOCUMENT_SCHEMA_VERSION, documentOutline, documentPart, DocumentReadError, duplicateDocumentPage, fnv1a64, hasRole, validateDocument } from '@lincyaw/kernel'
import { validateDocumentChange, validateDocumentPageDuplication, validateDocumentPageDuplicationApply, validateDocumentOutlineQuery, validateDocumentPartQuery } from '@lincyaw/kernel/node'
import type { AppliedDocumentChange, ApplyDocumentChange, CanonicalSource, DocumentAnswer, DocumentAuthoring, DocumentChange, DocumentChangeAnswer, DocumentChangePlan, DocumentIssue, DocumentPageDuplicationPlan, Member, RequestContext, SourceTransactionChange, TeachingDocument } from '@lincyaw/kernel'
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
  type Plan = { key: string, signature: string, expires: number, ready: boolean, duplication?: { signature: string, result: Promise<DocumentPageDuplicationPlan> } }
  const plans = new Map<string, Plan>()
  const remember = <T>(table: Map<string, T>, key: string, value: T) => {
    table.set(key, value)
    while (table.size > MAX_RECEIPTS) table.delete(table.keys().next().value!)
  }
  const read = async (document: string, member: Member): Promise<DocumentAnswer> => {
    const { source, content, issues } = readAuthoringDocument(editor, { document, member })
    return { document, version: source.version, fingerprint: fnv1a64(source.content), content, issues }
  }
  const readSelection = <T>(document: string, expected: CanonicalSource | undefined, member: Member, select: (content: TeachingDocument, source: CanonicalSource) => T): T => {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'authoring-permission-denied')
    const scope = editor.scope(document), path = entryOf(document)
    const readSource = () => {
      try { return editor.read(scope, path, member) }
      catch (error) {
        if (expected && error instanceof RequestError && error.status === 413) throw new RequestError(409, 'document-version-changed')
        throw error
      }
    }
    const raw = readSource(), fingerprint = fnv1a64(raw.content)
    // Compare raw bytes first: a changed source that has become invalid is still a stale read.
    if (expected && (expected.version !== raw.version || expected.fingerprint !== fingerprint)) throw new RequestError(409, 'document-version-changed', { version: raw.version, fingerprint })
    const checked = decodeAuthoringDocument(raw.content)
    if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', {
      issueCount: checked.issues.length,
      issues: checked.issues.slice(0, 3).map(issue => ({ code: issue.code.slice(0, 64), path: issue.path.slice(0, 100), message: issue.message.slice(0, 120), severity: issue.severity })),
    })
    const source: CanonicalSource = { documentId: checked.document.id, version: raw.version, fingerprint }
    if (expected && expected.documentId !== source.documentId) throw new RequestError(409, 'document-version-changed', { source })
    let answer: T
    try { answer = select(checked.document, source) }
    catch (error) { if (error instanceof DocumentReadError) throw new RequestError(error.status, error.message); throw error }
    const after = readSource()
    if (after.version !== raw.version || after.content !== raw.content) throw new RequestError(409, 'document-version-changed', { version: after.version, fingerprint: fnv1a64(after.content) })
    return answer
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
  const planChange = async (document: string, raw: DocumentChange, member: Member, reserved?: { id: string, record: Plan }): Promise<DocumentChangePlan> => {
    const change = checkedChange(raw), current = await read(document, member)
    const candidate = await filesOf(document, current, change)
    const planned = await editor.planTransaction(editor.scope(document), candidate.changes, member)
    const impact: DocumentChangePlan['impact'] = { sections: [], blocks: [], steps: [], narrations: [], assets: [], definitions: [], sectionOrder: false, production: false, comments: false, metadata: false }
    for (const field of ['sections', 'blocks', 'steps', 'narrations', 'assets', 'definitions'] as const) impact[field] = [...new Set([...Object.keys(current.content[field]), ...Object.keys(candidate.content[field])])].filter(id => JSON.stringify(current.content[field][id]) !== JSON.stringify(candidate.content[field][id]))
    for (const field of ['sectionOrder', 'production', 'comments', 'metadata'] as const) impact[field] = JSON.stringify(current.content[field]) !== JSON.stringify(candidate.content[field])
    const planId = reserved?.id ?? randomUUID(), digest = signatureOf(change), expires = reserved?.record.expires ?? Date.now() + PLAN_LIFETIME_MS
    const record: Plan = reserved?.record ?? { key: keyOf(document, member, change.id), signature: digest, expires, ready: false }
    record.ready = true
    remember(plans, planId, record)
    return { apiVersion: AUTHORING_API_VERSION, planId, changeId: change.id, document, source: sourceOf(current), digest, expiresAt: new Date(expires).toISOString(), content: candidate.content, issues: candidate.issues, files: planned.versions.map(file => ({ ...file, base: candidate.changes.find(change => change.path === file.path)!.base })), impact }
  }
  const duplicationOf = async (document: string, planId: string, digest: string, member: Member, replay = false): Promise<DocumentPageDuplicationPlan> => {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'authoring-permission-denied')
    const record = plans.get(planId)
    if (!record?.ready || !record.duplication) throw new RequestError(409, 'document-plan-changed')
    const plan = await record.duplication.result
    if (record.key !== keyOf(document, member, plan.changeId) || record.signature !== digest || plan.digest !== digest) throw new RequestError(409, 'document-plan-changed')
    if (record.expires < Date.now() && !(replay && receipts.get(record.key)?.signature === digest)) throw new RequestError(409, 'document-plan-expired')
    return plan
  }
  const service: DocumentEditor = {
    capabilities(_document, member) {
      const allowed = hasRole(member, 'editor')
      return { apiVersion: AUTHORING_API_VERSION, documentSchemaVersion: DOCUMENT_SCHEMA_VERSION, available: allowed, ...allowed ? {} : { reason: 'permission-denied' as const }, actions: { read: allowed, outline: allowed, readPart: allowed, plan: allowed, apply: allowed && !reviewRequired, planPageDuplication: allowed, applyPageDuplication: allowed && !reviewRequired }, readLimits: { maxRequestChars: DOCUMENT_READ_MAX_REQUEST_CHARS, maxResponseChars: DOCUMENT_READ_MAX_RESPONSE_CHARS, responseSerialization: 'JSON.stringify(value,null,2)', offsetUnit: 'utf16' }, ...reviewRequired ? { applyUnavailableReason: 'review-required' as const } : {}, operations: DOCUMENT_OPERATION_TYPES, replacement: true, fileChanges: true, limits: { maxFiles: MAX_SOURCE_CHANGES, maxTextBytes: MAX_SOURCE, maxOperations: 1000, planLifetimeMs: PLAN_LIFETIME_MS, maxPlans: MAX_RECEIPTS, maxReceipts: MAX_RECEIPTS }, idempotency: 'process-current-source', review: reviewRequired ? 'required-unsupported' : revisions ? 'locks-and-history' : 'locks-only' }
    },
    read,
    async outline(document, query, member) {
      if (!validateDocumentOutlineQuery(query)) throw new RequestError(400, 'document-outline-query-invalid')
      return readSelection(document, query.source, member, (content, source) => documentOutline(content, source, query))
    },
    async readPart(document, query, member) {
      if (!validateDocumentPartQuery(query)) throw new RequestError(400, 'document-part-query-invalid')
      return readSelection(document, query.source, member, (content, source) => documentPart(content, source, query))
    },
    change: saveChange,
    plan: planChange,
    async planPageDuplication(document, raw, member) {
      if (!validateDocumentPageDuplication(raw)) throw new RequestError(400, 'page-duplication-invalid')
      const request = { id: raw.id, source: { documentId: raw.source.documentId, version: raw.source.version, fingerprint: raw.source.fingerprint }, sectionId: raw.sectionId, title: raw.title }
      const current = await read(document, member), source = sourceOf(current)
      if (source.documentId !== request.source.documentId || source.version !== request.source.version || source.fingerprint !== request.source.fingerprint) throw new RequestError(409, 'document-version-changed', { source })
      const key = keyOf(document, member, request.id), signature = createHash('sha256').update(JSON.stringify(request)).digest('hex'), receipt = receipts.get(key)
      if (receipt) throw new RequestError(409, receipt.version === current.version ? 'document-change-id-reused' : 'document-version-changed', { version: current.version })
      for (const plan of plans.values()) if (plan.key === key && plan.duplication) {
        if (plan.duplication.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
        if (plan.expires < Date.now()) throw new RequestError(409, 'document-plan-expired')
        return structuredClone(await plan.duplication.result)
      }
      const planId = randomUUID(), record: Plan = { key, signature: '', expires: Date.now() + PLAN_LIFETIME_MS, ready: false }
      const result = (async (): Promise<DocumentPageDuplicationPlan> => {
        let copied
        try { copied = duplicateDocumentPage(current.content, request.sectionId, request.title, () => randomUUID()) }
        catch (error) { throw new RequestError(422, 'page-duplication-invalid', { reason: error instanceof Error ? error.message : 'invalid-page' }) }
        const change: DocumentChange = { id: request.id, baseDocumentVersion: source.version, replacement: copied.document }
        record.signature = signatureOf(change)
        const plan = await planChange(document, change, member, { id: planId, record })
        return { ...plan, action: 'duplicatePage', section: { from: request.sectionId, to: copied.section }, mapping: copied.mapping, change }
      })()
      record.duplication = { signature, result }; remember(plans, planId, record)
      try { return structuredClone(await result) }
      catch (error) { if (plans.get(planId) === record) plans.delete(planId); throw error }
    },
    async readPageDuplicationPlan(document, reference, member) {
      const plan = await duplicationOf(document, reference.planId, reference.digest, member)
      const current = await read(document, member), currentSource = sourceOf(current), receipt = receipts.get(keyOf(document, member, plan.changeId))
      const sourceCurrent = plan.source.documentId === currentSource.documentId && plan.source.version === currentSource.version && plan.source.fingerprint === currentSource.fingerprint
      return { plan: structuredClone(plan), currentSource, state: receipt ? receipt.signature === plan.digest && receipt.version === current.version ? 'applied' : 'old' : sourceCurrent ? 'current' : 'old' }
    },
    async applyPageDuplication(document, reference, member) {
      if (reviewRequired) throw new RequestError(409, 'authoring-review-required')
      if (!validateDocumentPageDuplicationApply(reference)) throw new RequestError(400, 'page-duplication-reference-invalid')
      const plan = await duplicationOf(document, reference.planId, reference.digest, member, true)
      if (reference.source.documentId !== plan.source.documentId || reference.source.version !== plan.source.version || reference.source.fingerprint !== plan.source.fingerprint) throw new RequestError(409, 'document-plan-changed')
      const answer = await service.apply(document, { change: plan.change, planId: plan.planId }, member)
      const expected = plan.files.find(file => file.path === entryOf(document))!.version
      if (answer.version !== expected || !answer.content.sections[plan.section.to]) throw new RequestError(409, 'document-readback-changed', { committed: true, changeId: plan.changeId, version: answer.version })
      const { content: _content, issues: _issues, ...receipt } = answer
      return { ...receipt, planId: plan.planId, digest: plan.digest, section: plan.section,
        copied: { identities: Object.keys(plan.mapping).length, sections: plan.impact.sections.length, blocks: plan.impact.blocks.length, steps: plan.impact.steps.length, narrations: plan.impact.narrations.length },
        verification: { ...answer.verification, plannedVersion: expected, pagePresent: true } }
    },
    async apply(document, request: ApplyDocumentChange, member): Promise<AppliedDocumentChange> {
      if (reviewRequired) throw new RequestError(409, 'authoring-review-required')
      const change = checkedChange(request.change), key = keyOf(document, member, change.id)
      const plan = plans.get(request.planId)
      if (!plan?.ready || plan.key !== key || plan.signature !== signatureOf(change)) throw new RequestError(409, 'document-plan-changed')
      if (plan.expires < Date.now() && !receipts.has(key)) throw new RequestError(409, 'document-plan-expired')
      const answer = await saveChange(document, change, member, 'agent')
      return { ...answer, verification: { saved: true, source: sourceOf(answer), compiled: 'not-requested', runtime: 'not-requested' } }
    },
  }
  return service
}
