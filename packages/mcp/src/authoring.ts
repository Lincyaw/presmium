import { AUTHORING_API_VERSION, DOCUMENT_OUTLINE_QUERY_SCHEMA, DOCUMENT_PART_QUERY_SCHEMA, DOCUMENT_READ_MAX_REQUEST_CHARS, DOCUMENT_READ_MAX_RESPONSE_CHARS, DOCUMENT_PAGE_CHANGE_SCHEMA, DOCUMENT_PAGE_CHANGE_APPLY_SCHEMA, DOCUMENT_PAGE_DUPLICATION_APPLY_SCHEMA, DOCUMENT_PAGE_DUPLICATION_SCHEMA, DOCUMENT_SCHEMA_VERSION } from '@lincyaw/kernel'
import { deckLocale } from '@lincyaw/kernel'
import { DOCUMENT_CHANGE_JSON_SCHEMA } from '@lincyaw/kernel/node'
import type { DocumentAuthoring, DocumentChange, DocumentOutlineQuery, DocumentPartQuery, DocumentPageChangePlan, DocumentPageChangeReference, DocumentPageChangeRequest, DocumentPageDuplicationPlan, DocumentPageDuplicationReference, DocumentPageDuplicationRequest } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { documentChangeSummary, MCP_MESSAGES } from './messages.ts'

function service(call: Call): DocumentAuthoring {
  if (!call.host.authoring) throw Object.assign(new Error('authoring-host-unavailable'), { status: 503 })
  return call.host.authoring
}

const documentProperty = { type: 'string', description: 'The served document directory. Omit only for one document or a document-bound token.' }
function readQuery(call: Call) {
  if (JSON.stringify(call.args).length > DOCUMENT_READ_MAX_REQUEST_CHARS) throw Object.assign(new Error('document-read-request-too-large'), { status: 413 })
  const { document: _document, ...query } = call.args
  return query
}
const schema = (apply = false): Record<string, unknown> => {
  const { $defs } = structuredClone(DOCUMENT_CHANGE_JSON_SCHEMA) as { $defs: Record<string, unknown> }
  return { type: 'object', properties: { document: documentProperty, change: { $ref: '#/$defs/DocumentChange' }, ...apply ? { planId: { type: 'string', minLength: 1 } } : {} }, required: apply ? ['change', 'planId'] : ['change'], additionalProperties: false, $defs }
}

/** Keep the default agent result independent of document size; full material is explicitly requested. */
function duplicationSummary(plan: DocumentPageDuplicationPlan, document: string) {
  const resource = (part: string) => `presmium://page-duplication/${encodeURIComponent(plan.planId)}/${plan.digest}/${part}?document=${encodeURIComponent(document)}`
  const counts = Object.fromEntries(Object.entries(plan.impact).map(([field, value]) => [field, Array.isArray(value) ? value.length : value]))
  return { apiVersion: plan.apiVersion, action: plan.action, planId: plan.planId, changeId: plan.changeId, source: plan.source, digest: plan.digest, expiresAt: plan.expiresAt,
    section: plan.section, title: plan.content.sections[plan.section.to]!.title, copiedIdentities: Object.keys(plan.mapping).length, impact: counts,
    validation: { errors: plan.issues.filter(issue => issue.severity === 'error').length, warnings: plan.issues.filter(issue => issue.severity === 'warning').length,
      sample: plan.issues.slice(0, 3).map(issue => ({ code: issue.code.slice(0, 80), path: issue.path.slice(0, 200), message: issue.message.slice(0, 160), severity: issue.severity })) },
    resources: { candidate: resource('candidate'), mapping: resource('mapping'), details: resource('details') } }
}

function pageSummary(plan: DocumentPageChangePlan, document: string) {
  const resource = (part: string) => `presmium://page-change/${encodeURIComponent(plan.planId)}/${plan.digest}/${part}?document=${encodeURIComponent(document)}`
  const title = plan.content.sections[plan.sectionId]?.title
  const effect = plan.deletion
  return { apiVersion: plan.apiVersion, action: plan.action.type, planId: plan.planId, changeId: plan.changeId, source: plan.source, digest: plan.digest, expiresAt: plan.expiresAt,
    target: { sectionId: plan.sectionId, ...title !== undefined ? { title: { preview: title.slice(0, 80), complete: title.length <= 80, totalChars: title.length } } : {},
      index: plan.content.sectionOrder.indexOf(plan.sectionId), present: Boolean(plan.content.sections[plan.sectionId]) },
    ...plan.created ? { created: plan.created, defaultTiming: plan.content.production.stepOverrides[plan.created.stepId] } : {},
    impact: Object.fromEntries(Object.entries(plan.impact).map(([field, value]) => [field, Array.isArray(value) ? value.length : value])),
    ...effect ? { deletion: { retainedEmpty: effect.retainedEmpty, removedBlocks: effect.blocks.length, removedSteps: effect.steps.length, removedNarrations: effect.narrations.length, retainedNarrations: effect.retainedNarrations.length,
      removedCues: effect.cues.length, removedClips: effect.clips.length, detachedCommentAnchors: effect.detachedComments.length, retainedCommentThreads: true, assetsAndDefinitionsPreserved: true, referenceCount: effect.references.length, confirmationRequired: true } } : {},
    validation: { errors: plan.issues.filter(issue => issue.severity === 'error').length, warnings: plan.issues.filter(issue => issue.severity === 'warning').length,
      sample: plan.issues.slice(0, 3).map(issue => ({ code: issue.code.slice(0, 64), path: issue.path.slice(0, 100), message: issue.message.slice(0, 120), severity: issue.severity })) },
    resources: { candidate: resource('candidate'), details: resource('details') },
    next: effect ? 'Review this fixed deletion impact, then apply the same reference with confirmDeletion:true. No assets or discussions are deleted.' : 'Apply this unchanged plan reference, then read the target with the returned saved source.' }
}

/** The page tools never ask the model to echo candidate content or lose JSON to result pruning. */
async function pageCall(call: Call, work: () => Promise<unknown>) {
  if (JSON.stringify(call.args).length > DOCUMENT_READ_MAX_REQUEST_CHARS) throw Object.assign(new Error('page-change-request-too-large'), { status: 413 })
  try {
    const result = await work()
    if (JSON.stringify(result, null, 2).length > DOCUMENT_READ_MAX_RESPONSE_CHARS) throw Object.assign(new Error('page-change-response-too-large'), { status: 413 })
    return result
  } catch (error) {
    const failure = error as { message?: string, status?: number, detail?: Record<string, unknown> }
    if (JSON.stringify({ message: failure.message, detail: failure.detail }, null, 2).length <= 4096) throw error
    throw Object.assign(new Error((failure.message ?? 'page-change-failed').slice(0, 120)), { status: failure.status ?? 500, detail: {
      truncated: true, issueCount: failure.detail?.issueCount ?? (Array.isArray(failure.detail?.issues) ? failure.detail.issues.length : undefined), referenceCount: failure.detail?.referenceCount,
      next: 'Inspect the canonical entities using source-bound read_document_part. Resolve the reported error and explicitly preflight again; no operation was automatically repeated.',
    } })
  }
}

export const AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'get_authoring_capabilities', kind: 'read', structured: true,
    description: 'The actual canonical authoring operations, limits, review and retry scope of this host. Does not compile, synthesize, transcribe or write. A compiler-only stdio host reports authoring unavailable.',
    properties: { document: documentProperty },
    run: async call => {
      if (!call.host.authoring) return { apiVersion: AUTHORING_API_VERSION, documentSchemaVersion: DOCUMENT_SCHEMA_VERSION, available: false, reason: 'host-unavailable', actions: { read: false, outline: false, readPart: false, plan: false, apply: false, planPageDuplication: false, applyPageDuplication: false, planPageChange: false, applyPageChange: false, planAction: false, applyAction: false }, operations: [], replacement: false, fileChanges: false, idempotency: 'unavailable', review: 'unavailable' }
      const capability = service(call).capabilities(await call.document(), call.caller.member)
      if (!call.host.offers('operate')) return { ...capability, actions: { ...capability.actions, apply: false, applyPageDuplication: false, applyPageChange: false, applyAction: false }, applyUnavailableReason: 'operation-disabled' }
      return capability
    },
  },
  {
    name: 'get_document', kind: 'read', structured: true,
    description: 'The canonical saved lecture.json: stable entities, exact source version and fingerprint, content and validation issues. Independent of runtime compilation. Use this source for authoring; get_section/get_step read derived runtime data.',
    properties: { document: documentProperty },
    run: async call => service(call).read(await call.document(), call.caller.member),
  },
  {
    name: 'get_document_outline', kind: 'read', structured: true,
    description: 'Compact canonical authoring discovery, independent of compilation. Defaults to pages in sectionOrder; other collections include unused entities. Titles are explicitly marked previews, never complete content when shortened. Each pretty-JSON reply is at most 7168 UTF-16 characters. Retain the returned source; offset > 0 requires it and any source change refuses the page. Use read_document_part for complete fields/entities; get_section/get_step are derived runtime data.',
    inputSchema: { ...DOCUMENT_OUTLINE_QUERY_SCHEMA, properties: { ...DOCUMENT_OUTLINE_QUERY_SCHEMA.properties, document: { ...documentProperty, maxLength: 200 } } },
    run: async call => service(call).outline(await call.document(), readQuery(call) as DocumentOutlineQuery, call.caller.member),
  },
  {
    name: 'read_document_part', kind: 'read', structured: true,
    description: 'Reads an exact selected value of saved canonical authoring content, with required source on every request. Select a stable entity collection/id or a root field, then optional own JSON fields or canonical array indices. Unknown entities/fields return 404; no filesystem paths or prototype traversal. Small values use encoding:value. Large values use json-text-fragment: concatenate decoded text in offset order, then JSON.parse once; valueDigest is fnv1a64 of JSON.stringify(selected value). UTF-16 nextOffset never splits a valid surrogate pair; mid-pair offsets are rejected. Every reply is at most 7168 pretty-JSON UTF-16 characters. Source changes, including invalid JSON, return 409; no server snapshot ledger. Partial content is not a whole-document replacement.',
    inputSchema: { ...DOCUMENT_PART_QUERY_SCHEMA, properties: { ...DOCUMENT_PART_QUERY_SCHEMA.properties, document: { ...documentProperty, maxLength: 200 } } },
    run: async call => service(call).readPart(await call.document(), readQuery(call) as unknown as DocumentPartQuery, call.caller.member),
  },
  {
    name: 'plan_document_change', kind: 'read', structured: true,
    description: 'Preflights a versioned DocumentChange with canonical semantic operations or an explicit replacement and optional same-document text files. Validates candidate, identity, references, all file bases and transaction limits without saving or compiling. Returns planId, candidate, entity impact, source and predicted files. Existing-file bases are exact versions; null exclusively creates a new text file.',
    inputSchema: schema(),
    run: async call => service(call).plan(await call.document(), call.args.change as DocumentChange, call.caller.member),
  },
  {
    name: 'plan_page_change', kind: 'read', structured: true,
    description: 'Preflights one canonical page create, rename, move or delete through the same pure rules used by Web. Supply exact source and a unique id. Create fixes four IDs and the real 4000ms/500ms defaults; after:null appends. Move uses before:null to append. Delete reports owned content, retained/shared narrations, removed cues/clips and detached comment-anchor counts; all retained narration cue references, including unused narrations, block deletion. Last-page deletion keeps its title and an empty step. No opaque payload rewriting, asset deletion, compilation or model service. Returns a compact plan/source/digest/expiry/target/impact; full candidate/details are optional resources. Apply only that reference; never echo a document or silently replan after409. Replies fit7168 pretty-JSON UTF16 characters; inputs fit2048.',
    inputSchema: { type: 'object', properties: { document: { ...documentProperty, maxLength: 200 }, request: DOCUMENT_PAGE_CHANGE_SCHEMA }, required: ['request'], additionalProperties: false },
    run: call => pageCall(call, async () => { const document = await call.document(); return pageSummary(await service(call).planPageChange(document, call.args.request as DocumentPageChangeRequest, call.caller.member), document) }),
  },
  {
    name: 'apply_page_change', kind: 'operate', structured: true,
    description: 'Commits the exact page preflight using only planId/source/digest. Deletion additionally requires confirmDeletion:true, bound to this planned action and source; unresolved retained references are never silently removed. Reuses the original Web transaction, CAS, file/member scope, lock, history, agent review and bounded process-current-source receipts. Returns only compact saved-source/target/count/readback evidence. Retry the identical reference after a lost ACK; stale, expired, changed or unknown plans return409 and must not be silently regenerated. Saved is not compiled or played.',
    inputSchema: { type: 'object', properties: { document: { ...documentProperty, maxLength: 200 }, request: DOCUMENT_PAGE_CHANGE_APPLY_SCHEMA }, required: ['request'], additionalProperties: false },
    run: call => pageCall(call, async () => {
      const document = await call.document(), own = service(call), capability = own.capabilities(document, call.caller.member)
      if (!capability.actions.applyPageChange) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
      const summary = (await call.host.documents()).find(item => item.dir === document)
      await call.approve('operate', messages => messages.applyPagePlan, { lang: summary?.lang ?? '', check: () => own.checkPageChange(document, call.args.request as DocumentPageChangeReference, call.caller.member) })
      call.signal.throwIfAborted()
      return own.applyPageChange(document, call.args.request as DocumentPageChangeReference, call.caller.member)
    }),
  },
  {
    name: 'plan_page_duplication', kind: 'read', structured: true,
    description: 'Preflights duplication of one canonical page without saving or compiling. Supply the exact source, a unique change id, sectionId and copy title. The server fixes fresh IDs and returns a compact source/planId/digest/expiry/target/count summary. Commit only that reference using apply_page_duplication; never copy a full document through model arguments. Full candidate, copied-ID mapping and validation details are available through the returned resources on demand. Assets/definitions stay shared; opaque payloads and original comments stay unchanged. Known plans and receipts are bounded and process-local; do not silently replan after a 409.',
    inputSchema: { type: 'object', properties: { document: documentProperty, request: DOCUMENT_PAGE_DUPLICATION_SCHEMA }, required: ['request'], additionalProperties: false },
    run: async call => { const document = await call.document(); return duplicationSummary(await service(call).planPageDuplication(document, call.args.request as DocumentPageDuplicationRequest, call.caller.member), document) },
  },
  {
    name: 'apply_page_duplication', kind: 'operate', structured: true,
    description: 'Commits a page duplication using only the unchanged planId, source and digest from plan_page_duplication. The shared service retrieves its exact planned change and calls the existing apply/transaction/receipt path. Returns a compact actual saved-source, target and verified-count receipt. No full-document model input, new IDs, compilation or model service is involved. Unknown/changed/expired plans, stale source and required agent review are refused; retry the identical reference only within the advertised process-current-source scope.',
    inputSchema: { type: 'object', properties: { document: documentProperty, request: DOCUMENT_PAGE_DUPLICATION_APPLY_SCHEMA }, required: ['request'], additionalProperties: false },
    run: async call => {
      const document = await call.document(), own = service(call), capability = own.capabilities(document, call.caller.member)
      if (!capability.actions.applyPageDuplication) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
      const current = await own.read(document, call.caller.member)
      await call.approve('operate', messages => messages.duplicatePage, { lang: current.content.metadata.lang ?? '', check: () => own.checkPageDuplication(document, call.args.request as DocumentPageDuplicationReference, call.caller.member) })
      call.signal.throwIfAborted()
      return own.applyPageDuplication(document, call.args.request as DocumentPageDuplicationReference, call.caller.member)
    },
  },
  {
    name: 'apply_document_change', kind: 'operate', structured: true,
    description: 'Applies the unchanged DocumentChange and planId returned by plan_document_change through the same transaction as Web. Retains CAS, file scope, locking, rollback and history; reads saved source/files back. No compilation or paid service is requested. Retry the same id and payload only within the advertised idempotency scope; stale bases are refused. Required agent review is not yet supported by this action.',
    inputSchema: schema(true),
    run: async call => {
      const document = await call.document(), own = service(call)
      const capability = own.capabilities(document, call.caller.member)
      if (!capability.actions.apply) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
      const current = await own.read(document, call.caller.member)
      await call.approve('operate', messages => messages.applyDocumentChange, { lang: current.content.metadata.lang ?? '', detail: documentChangeSummary(MCP_MESSAGES[deckLocale(current.content.metadata.lang)], call.args.change as DocumentChange, current.content), check: () => own.checkApply(document, { change: call.args.change as DocumentChange, planId: String(call.args.planId) }, call.caller.member) })
      call.signal.throwIfAborted()
      return own.apply(document, { change: call.args.change as DocumentChange, planId: String(call.args.planId) }, call.caller.member)
    },
  },
]
