import { createHash, randomUUID } from 'node:crypto'
import { applyDocumentOperations, AUTHORING_API_VERSION, createDocumentPage, DOCUMENT_ENTRY, DOCUMENT_OPERATION_TYPES, DOCUMENT_READ_MAX_REQUEST_CHARS, DOCUMENT_READ_MAX_RESPONSE_CHARS, DOCUMENT_SCHEMA_VERSION, documentOutline, documentPart, DocumentReadError, duplicateDocumentPage, fnv1a64, hasRole, moveDocumentPage, pageDeletionImpact, removeDocumentPage, renameDocumentPage, validateDocument } from '@lincyaw/kernel'
import { validateDocumentChange, validateDocumentPageChange, validateDocumentPageChangeApply, validateDocumentPageDuplication, validateDocumentPageDuplicationApply, validateDocumentOutlineQuery, validateDocumentPartQuery } from '@lincyaw/kernel/node'
import type { AppliedDocumentChange, ApplyDocumentChange, CanonicalSource, DocumentAnswer, DocumentAuthoring, DocumentChange, DocumentChangeAnswer, DocumentChangePlan, DocumentIssue, DocumentPageAction, DocumentPageChangePlan, DocumentPageDuplicationPlan, Member, RequestContext, SourceTransactionChange, TeachingDocument } from '@lincyaw/kernel'
import { RequestError } from './errors.ts'
import { applyDocumentAuthoringAction, DOCUMENT_ACTION_MAX_REQUEST_CHARS, DOCUMENT_ACTION_MAX_RESPONSE_CHARS, DOCUMENT_AUTHORING_ACTION_TYPES, DOCUMENT_PARAMETER_MAX_CHANGES, DOCUMENT_PARAMETER_MAX_PATH_DEPTH, DocumentCommentError, DocumentComponentError, DocumentCaptionTimingError, ProductionAudioRefusal } from '@lincyaw/kernel'
import { validateDocumentAuthoringAction, validateDocumentAuthoringActionReference, validateDocumentAuthoringActionImpact } from '@lincyaw/kernel/node'
import type { AppliedDocumentAuthoringAction, DocumentAuthoringActionReference, DocumentAuthoringActionPlan, DocumentComponentImpactAnswer, DocumentAuthoringAction, ProductionPlan } from '@lincyaw/kernel'
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
  /** Only the authenticated editor HTTP adapter selects this origin; no request field can select it. */
  applyEditorAction(document: string, reference: DocumentAuthoringActionReference, member: Member): Promise<AppliedDocumentAuthoringAction>
}

export function createDocumentEditor({ editor, revisions, reviewRequired = false, productionPlan }: { editor: SourceEditor, revisions?: Revisions, reviewRequired?: boolean, productionPlan?: (document: string, source: CanonicalSource) => Promise<ProductionPlan> }): DocumentEditor {
  const validateCaption = async (document: string, source: CanonicalSource, action: DocumentAuthoringAction) => {
    if (action.type !== 'caption.timing.set') return
    if (!productionPlan) throw new RequestError(503, 'caption-production-unavailable')
    let plan: ProductionPlan
    try { plan = await productionPlan(document, source) }
    catch (error) { if (error instanceof ProductionAudioRefusal) throw new RequestError(error.status, error.code); throw error }
    const basis = plan.pages.flatMap(page => page.steps).find(step => step.stepId === action.stepId)?.captionTiming
    if (!basis?.available) throw new RequestError(422, basis?.reason ?? 'caption-timing-unavailable')
    if (JSON.stringify(plan.binding.source) !== JSON.stringify(source) || basis.sourceFingerprint !== action.value.sourceFingerprint || basis.playbackFingerprint !== action.value.playbackFingerprint || basis.durationMs !== action.value.durationMs || JSON.stringify(basis.narrationIds) !== JSON.stringify(action.value.narrationIds)) throw new RequestError(409, 'caption-playback-changed')
  }
  const receipts = new Map<string, { signature: string, version: string, files: DocumentChangeAnswer['files'], commit?: DocumentChangeAnswer['commit'] }>()
  type Plan = { key: string, signature: string, expires: number, ready: boolean, duplication?: { signature: string, result: Promise<DocumentPageDuplicationPlan> }, page?: { signature: string, result: Promise<DocumentPageChangePlan> }, action?: { signature: string, result: Promise<DocumentAuthoringActionPlan> } }
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
    if (reserved && plans.get(planId) !== record) throw new RequestError(409, 'document-plan-changed')
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
  const pageOf = async (document: string, planId: string, digest: string, member: Member, replay = false): Promise<DocumentPageChangePlan> => {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'authoring-permission-denied')
    const record = plans.get(planId)
    if (!record?.ready || !record.page) throw new RequestError(409, 'document-plan-changed')
    const plan = await record.page.result
    if (record.key !== keyOf(document, member, plan.changeId) || record.signature !== digest || plan.digest !== digest) throw new RequestError(409, 'document-plan-changed')
    if (record.expires < Date.now() && !(replay && receipts.get(record.key)?.signature === digest)) throw new RequestError(409, 'document-plan-expired')
    return plan
  }
  const actionOf = async (document: string, planId: string, digest: string, member: Member, replay = false): Promise<DocumentAuthoringActionPlan> => {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'authoring-permission-denied')
    const record = plans.get(planId)
    if (!record?.ready || !record.action) throw new RequestError(409, 'document-plan-family-changed')
    const plan = await record.action.result
    if (record.key !== keyOf(document, member, plan.changeId) || record.signature !== digest || plan.digest !== digest) throw new RequestError(409, 'document-plan-changed')
    if (record.expires < Date.now() && !(replay && receipts.get(record.key)?.signature === digest)) throw new RequestError(409, 'document-plan-expired')
    return plan
  }
  const applyPlannedChange = async (document: string, request: ApplyDocumentChange, member: Member, family: 'generic' | 'page' | 'duplication' | 'action', origin: 'agent' | 'editor' = 'agent'): Promise<AppliedDocumentChange> => {
    if (reviewRequired && origin === 'agent') throw new RequestError(409, 'authoring-review-required')
    const change = checkedChange(request.change), key = keyOf(document, member, change.id), plan = plans.get(request.planId)
    if (!plan?.ready || plan.key !== key || plan.signature !== signatureOf(change)) throw new RequestError(409, 'document-plan-changed')
    const actual = plan.action ? 'action' : plan.page ? 'page' : plan.duplication ? 'duplication' : 'generic'
    if (actual !== family) throw new RequestError(409, 'document-plan-family-changed')
    if (plan.expires < Date.now() && receipts.get(key)?.signature !== plan.signature) throw new RequestError(409, 'document-plan-expired')
    const answer = await saveChange(document, change, member, origin)
    return { ...answer, verification: { saved: true, source: sourceOf(answer), compiled: 'not-requested', runtime: 'not-requested' } }
  }
  const applyAction = async (document: string, reference: DocumentAuthoringActionReference, member: Member, origin: 'agent' | 'editor'): Promise<AppliedDocumentAuthoringAction> => {
    if (reviewRequired && origin === 'agent') throw new RequestError(409, 'authoring-review-required')
    if (!validateDocumentAuthoringActionReference(reference)) throw new RequestError(400, 'authoring-action-reference-invalid')
    const plan = await actionOf(document, reference.planId, reference.digest, member, true)
    if (reference.source.documentId !== plan.source.documentId || reference.source.version !== plan.source.version || reference.source.fingerprint !== plan.source.fingerprint) throw new RequestError(409, 'document-plan-changed')
    if (plan.action.type === 'comment.delete' && !reference.confirmDeletion) throw new RequestError(409, 'comment-deletion-confirmation-required', { planId: plan.planId, digest: plan.digest, next: 'Review this exact discussion deletion, then retry its reference with confirmDeletion:true.' })
    if (plan.action.type !== 'comment.delete' && reference.confirmDeletion) throw new RequestError(400, 'comment-deletion-confirmation-unexpected')
    const expected = plan.files.find(file => file.path === entryOf(document))!.version, receipt = receipts.get(keyOf(document, member, plan.changeId))
    if (receipt && receipt.signature !== plan.digest) throw new RequestError(409, 'document-change-id-reused')
    readSelection(document, receipt ? { documentId: plan.content.id, version: expected, fingerprint: fnv1a64(`${JSON.stringify(plan.content, null, 2)}\n`) } : plan.source, member, () => undefined)
    if (!receipt) await validateCaption(document, plan.source, plan.action)
    const answer = await applyPlannedChange(document, { change: plan.change, planId: plan.planId }, member, 'action', origin)
    if (answer.version !== expected || JSON.stringify(answer.content) !== JSON.stringify(plan.content)) throw new RequestError(409, 'document-readback-changed', { committed: true, changeId: plan.changeId, version: answer.version })
    const { content: _content, issues: _issues, commit, ...saved } = answer
    return { ...saved, ...commit ? { commit: { id: commit.id, origin: commit.origin.kind } } : {}, planId: plan.planId, digest: plan.digest, action: plan.action.type, effect: plan.effect,
      verification: { ...answer.verification, plannedVersion: expected, actionStateVerified: true } }
  }
  const service: DocumentEditor = {
    capabilities(_document, member) {
      const allowed = hasRole(member, 'editor')
      return { apiVersion: AUTHORING_API_VERSION, documentSchemaVersion: DOCUMENT_SCHEMA_VERSION, available: allowed, ...allowed ? {} : { reason: 'permission-denied' as const }, actions: { read: allowed, outline: allowed, readPart: allowed, plan: allowed, apply: allowed && !reviewRequired, planPageDuplication: allowed, applyPageDuplication: allowed && !reviewRequired, planPageChange: allowed, applyPageChange: allowed && !reviewRequired, planAction: allowed, applyAction: allowed && !reviewRequired }, readLimits: { maxRequestChars: DOCUMENT_READ_MAX_REQUEST_CHARS, maxResponseChars: DOCUMENT_READ_MAX_RESPONSE_CHARS, responseSerialization: 'JSON.stringify(value,null,2)', offsetUnit: 'utf16' }, ...reviewRequired ? { applyUnavailableReason: 'review-required' as const } : {}, pageLimits: { maxRequestChars: DOCUMENT_READ_MAX_REQUEST_CHARS, maxResponseChars: DOCUMENT_READ_MAX_RESPONSE_CHARS, responseSerialization: 'JSON.stringify(value,null,2)' }, semanticActions: DOCUMENT_AUTHORING_ACTION_TYPES, components: { parameters: true, stepParameters: true, restoreStepParameters: true, useExistingDefinition: true, impactRead: true, maxChanges: DOCUMENT_PARAMETER_MAX_CHANGES, maxPathDepth: DOCUMENT_PARAMETER_MAX_PATH_DEPTH, independentCopy: { available: false, reason: 'implementation-closure-unavailable' } }, actionLimits: { maxRequestChars: DOCUMENT_ACTION_MAX_REQUEST_CHARS, maxResponseChars: DOCUMENT_ACTION_MAX_RESPONSE_CHARS, responseSerialization: 'JSON.stringify(value,null,2)' }, operations: DOCUMENT_OPERATION_TYPES, replacement: true, fileChanges: true, limits: { maxFiles: MAX_SOURCE_CHANGES, maxTextBytes: MAX_SOURCE, maxOperations: 1000, planLifetimeMs: PLAN_LIFETIME_MS, maxPlans: MAX_RECEIPTS, maxReceipts: MAX_RECEIPTS }, idempotency: 'process-current-source', review: reviewRequired ? 'required-unsupported' : revisions ? 'locks-and-history' : 'locks-only' }
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
      const answer = await applyPlannedChange(document, { change: plan.change, planId: plan.planId }, member, 'duplication')
      const expected = plan.files.find(file => file.path === entryOf(document))!.version
      if (answer.version !== expected || !answer.content.sections[plan.section.to]) throw new RequestError(409, 'document-readback-changed', { committed: true, changeId: plan.changeId, version: answer.version })
      const { content: _content, issues: _issues, ...receipt } = answer
      return { ...receipt, planId: plan.planId, digest: plan.digest, section: plan.section,
        copied: { identities: Object.keys(plan.mapping).length, sections: plan.impact.sections.length, blocks: plan.impact.blocks.length, steps: plan.impact.steps.length, narrations: plan.impact.narrations.length },
        verification: { ...answer.verification, plannedVersion: expected, pagePresent: true } }
    },
    async planPageChange(document, raw, member) {
      if (!validateDocumentPageChange(raw)) throw new RequestError(400, 'page-change-invalid')
      if (JSON.stringify(raw).length > DOCUMENT_READ_MAX_REQUEST_CHARS) throw new RequestError(413, 'page-change-request-too-large')
      const source = { documentId: raw.source.documentId, version: raw.source.version, fingerprint: raw.source.fingerprint }
      const action: DocumentPageAction = raw.action.type === 'create' ? { type: 'create', title: raw.action.title.trim(), after: raw.action.after ?? null }
        : raw.action.type === 'rename' ? { type: 'rename', sectionId: raw.action.sectionId, title: raw.action.title.trim() }
          : raw.action.type === 'move' ? { type: 'move', sectionId: raw.action.sectionId, before: raw.action.before }
            : { type: 'delete', sectionId: raw.action.sectionId }
      const current = readSelection(document, source, member, content => content)
      if (action.type !== 'create' && !current.sections[action.sectionId] || action.type === 'create' && action.after != null && !current.sections[action.after] || action.type === 'move' && action.before !== null && !current.sections[action.before]) throw new RequestError(404, 'document-page-missing')
      const key = keyOf(document, member, raw.id), signature = createHash('sha256').update(JSON.stringify({ id: raw.id, source, action })).digest('hex'), receipt = receipts.get(key)
      if (receipt) throw new RequestError(409, receipt.version === source.version ? 'document-change-id-reused' : 'document-version-changed')
      for (const known of plans.values()) if (known.key === key) {
        if (!known.page || known.page.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
        if (known.expires < Date.now()) throw new RequestError(409, 'document-plan-expired')
        return structuredClone(await known.page.result)
      }
      const deletion = action.type === 'delete' ? pageDeletionImpact(current, action.sectionId) : undefined
      if (deletion?.references.length) throw new RequestError(409, 'page-referenced', {
        referenceCount: deletion.references.length, references: deletion.references.slice(0, 3), complete: deletion.references.length <= 3,
        next: 'Resolve references in retained narrations or steps, then read the new source and explicitly preflight again. Use read_document_part for the named entities; no references were removed.',
      })
      const planId = randomUUID(), record: Plan = { key, signature: '', expires: Date.now() + PLAN_LIFETIME_MS, ready: false }
      const result = (async (): Promise<DocumentPageChangePlan> => {
        let candidate: TeachingDocument, sectionId: string, created
        try {
          if (action.type === 'create') { const next = createDocumentPage(current, action.after ?? null, action.title, randomUUID); candidate = next.document; created = next.ids; sectionId = next.ids.sectionId }
          else {
            sectionId = action.sectionId
            candidate = action.type === 'rename' ? renameDocumentPage(current, sectionId, action.title)
              : action.type === 'move' ? moveDocumentPage(current, sectionId, action.before) : removeDocumentPage(current, sectionId, randomUUID)
          }
        } catch (error) { throw new RequestError(422, 'page-change-invalid', { reason: error instanceof Error ? error.message : 'invalid-page' }) }
        const change: DocumentChange = { id: raw.id, baseDocumentVersion: source.version, replacement: candidate }
        record.signature = signatureOf(change)
        const plan = await planChange(document, change, member, { id: planId, record })
        return { ...plan, action, sectionId, ...created ? { created } : {}, ...deletion ? { deletion } : {}, change }
      })()
      record.page = { signature, result }; remember(plans, planId, record)
      try { return structuredClone(await result) }
      catch (error) { if (plans.get(planId) === record) plans.delete(planId); throw error }
    },
    async readPageChangePlan(document, reference, member) {
      const plan = await pageOf(document, reference.planId, reference.digest, member)
      const current = await read(document, member), currentSource = sourceOf(current), receipt = receipts.get(keyOf(document, member, plan.changeId))
      const sameSource = plan.source.documentId === currentSource.documentId && plan.source.version === currentSource.version && plan.source.fingerprint === currentSource.fingerprint
      return { plan: structuredClone(plan), currentSource, state: receipt ? receipt.signature === plan.digest && receipt.version === current.version ? 'applied' : 'old' : sameSource ? 'current' : 'old' }
    },
    async applyPageChange(document, reference, member) {
      if (reviewRequired) throw new RequestError(409, 'authoring-review-required')
      if (!validateDocumentPageChangeApply(reference)) throw new RequestError(400, 'page-change-reference-invalid')
      const plan = await pageOf(document, reference.planId, reference.digest, member, true)
      if (reference.source.documentId !== plan.source.documentId || reference.source.version !== plan.source.version || reference.source.fingerprint !== plan.source.fingerprint) throw new RequestError(409, 'document-plan-changed')
      if (plan.action.type === 'delete' && reference.confirmDeletion !== true) throw new RequestError(409, 'page-deletion-confirmation-required', { planId: plan.planId, digest: plan.digest, next: 'Review this plan deletion impact and repeat the same reference with confirmDeletion:true.' })
      if (plan.action.type !== 'delete' && reference.confirmDeletion) throw new RequestError(400, 'page-deletion-confirmation-unexpected')
      const expected = plan.files.find(file => file.path === entryOf(document))!.version, receipt = receipts.get(keyOf(document, member, plan.changeId))
      if (receipt && receipt.signature !== plan.digest) throw new RequestError(409, 'document-change-id-reused')
      readSelection(document, receipt ? { documentId: plan.content.id, version: expected, fingerprint: fnv1a64(`${JSON.stringify(plan.content, null, 2)}\n`) } : plan.source, member, () => undefined)
      const answer = await applyPlannedChange(document, { change: plan.change, planId: plan.planId }, member, 'page')
      if (answer.version !== expected || JSON.stringify(answer.content) !== JSON.stringify(plan.content)) throw new RequestError(409, 'document-readback-changed', { committed: true, changeId: plan.changeId, version: answer.version })
      const { content: _content, issues: _issues, commit, ...saved } = answer
      return { ...saved, planId: plan.planId, digest: plan.digest, action: plan.action.type, sectionId: plan.sectionId, retainedEmpty: Boolean(plan.deletion?.retainedEmpty),
        ...commit ? { commit: { id: commit.id, origin: commit.origin.kind } } : {},
        changed: plan.impact.sectionOrder || Object.values(plan.impact).some(value => Array.isArray(value) ? value.length > 0 : value),
        impact: Object.fromEntries(Object.entries(plan.impact).map(([key, value]) => [key, Array.isArray(value) ? value.length : value])) as Record<keyof DocumentChangePlan['impact'], number | boolean>,
        verification: { ...answer.verification, plannedVersion: expected, pageStateVerified: true } }
    },
    async planAction(document, raw, member) {
      if (!validateDocumentAuthoringAction(raw)) throw new RequestError(400, 'authoring-action-invalid')
      if (JSON.stringify(raw).length > DOCUMENT_ACTION_MAX_REQUEST_CHARS) throw new RequestError(413, 'authoring-action-request-too-large', { limits: { maxRequestChars: DOCUMENT_ACTION_MAX_REQUEST_CHARS }, next: 'Submit only changed parameter fields. Retained values do not belong in the request; keep the local draft when an edited value exceeds this limit.' })
      const source = { documentId: raw.source.documentId, version: raw.source.version, fingerprint: raw.source.fingerprint }
      const current = readSelection(document, source, member, content => content), action = structuredClone(raw.action), key = keyOf(document, member, raw.id)
      const signature = createHash('sha256').update(JSON.stringify({ id: raw.id, source, action }, (_, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)).digest('hex')
      const receipt = receipts.get(key)
      if (receipt) throw new RequestError(409, receipt.version === source.version ? 'document-change-id-reused' : 'document-version-changed')
      for (const known of plans.values()) if (known.key === key) {
        if (!known.action || known.action.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
        if (known.expires < Date.now()) throw new RequestError(409, 'document-plan-expired')
        return structuredClone(await known.action.result)
      }
      const planId = randomUUID(), record: Plan = { key, signature: '', expires: Date.now() + PLAN_LIFETIME_MS, ready: false }
      // Reserve before any asynchronous materialization: this intent owns one set of IDs and dates.
      const result = Promise.resolve().then(async (): Promise<DocumentAuthoringActionPlan> => {
        if (plans.get(planId) !== record) throw new RequestError(409, 'document-plan-expired')
        await validateCaption(document, source, action)
        let materialized: ReturnType<typeof applyDocumentAuthoringAction>
        try { materialized = applyDocumentAuthoringAction(current, action, { member, now: new Date().toISOString(), allocate: randomUUID, allocateContentIds: true }) }
        catch (error) {
          if (error instanceof DocumentCommentError) throw new RequestError(error.status, error.message)
          if (error instanceof DocumentCaptionTimingError) throw new RequestError(error.status, error.message)
          if (error instanceof DocumentComponentError) throw new RequestError(error.status, error.message, error.detail)
          throw new RequestError(422, 'authoring-action-invalid', { reason: error instanceof Error ? error.message : 'invalid-action' })
        }
        const change: DocumentChange = { id: raw.id, baseDocumentVersion: source.version, replacement: materialized.content }
        record.signature = signatureOf(change)
        const plan = await planChange(document, change, member, { id: planId, record })
        return { ...plan, action, change, effect: materialized.effect }
      })
      record.action = { signature, result }; remember(plans, planId, record)
      try { return structuredClone(await result) }
      catch (error) { if (plans.get(planId) === record) plans.delete(planId); throw error }
    },
    async readActionPlan(document, reference, member) {
      if (!reference || typeof reference !== 'object' || Object.keys(reference).some(key => key !== 'planId' && key !== 'digest')
        || typeof reference.planId !== 'string' || !reference.planId || reference.planId.length > 200 || typeof reference.digest !== 'string' || !/^[a-f0-9]{64}$/.test(reference.digest)) throw new RequestError(400, 'authoring-action-read-invalid')
      const plan = await actionOf(document, reference.planId, reference.digest, member)
      const current = await read(document, member), currentSource = sourceOf(current), receipt = receipts.get(keyOf(document, member, plan.changeId))
      const sameSource = JSON.stringify(plan.source) === JSON.stringify(currentSource)
      return { plan: structuredClone(plan), currentSource, state: receipt ? receipt.signature === plan.digest && receipt.version === current.version ? 'applied' : 'old' : sameSource ? 'current' : 'old' }
    },
    async readActionImpact(document, query, member) {
      if (!validateDocumentAuthoringActionImpact(query)) throw new RequestError(400, 'authoring-action-impact-invalid')
      const { plan, ...state } = await service.readActionPlan(document, { planId: query.planId, digest: query.digest }, member)
      if (plan.effect.kind !== 'component') throw new RequestError(422, 'authoring-action-impact-unavailable')
      const [group, name] = query.collection.split('.') as ['affected' | 'overrides' | 'references', string]
      const values = (plan.effect.value[group] as unknown as Record<string, string[]>)[name]!
      const offset = query.offset ?? 0
      if (offset > values.length) throw new RequestError(400, 'authoring-action-impact-offset')
      const answer: DocumentComponentImpactAnswer = { planId: plan.planId, digest: plan.digest, source: plan.source, ...state, collection: query.collection, offset, total: values.length, entries: [], complete: offset === values.length }
      for (let index = offset; index < values.length; index++) {
        const next = index + 1, candidate = { ...answer, entries: [...answer.entries, values[index]!], complete: next === values.length, ...next < values.length ? { nextOffset: next } : { nextOffset: undefined } }
        if (JSON.stringify(candidate, null, 2).length > DOCUMENT_ACTION_MAX_RESPONSE_CHARS) break
        Object.assign(answer, candidate)
      }
      if (!answer.entries.length && offset < values.length || JSON.stringify(answer, null, 2).length > DOCUMENT_ACTION_MAX_RESPONSE_CHARS) throw new RequestError(413, 'authoring-action-impact-too-large')
      return answer
    },
    applyAction: (document, reference, member) => applyAction(document, reference, member, 'agent'),
    applyEditorAction: (document, reference, member) => applyAction(document, reference, member, 'editor'),
    async apply(document, request: ApplyDocumentChange, member): Promise<AppliedDocumentChange> {
      return applyPlannedChange(document, request, member, 'generic')
    },
  }
  return service
}
