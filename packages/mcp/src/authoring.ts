import { AUTHORING_API_VERSION, DOCUMENT_PAGE_DUPLICATION_APPLY_SCHEMA, DOCUMENT_PAGE_DUPLICATION_SCHEMA, DOCUMENT_SCHEMA_VERSION } from '@lincyaw/kernel'
import { DOCUMENT_CHANGE_JSON_SCHEMA } from '@lincyaw/kernel/node'
import type { DocumentAuthoring, DocumentChange, DocumentPageDuplicationPlan, DocumentPageDuplicationReference, DocumentPageDuplicationRequest } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

function service(call: Call): DocumentAuthoring {
  if (!call.host.authoring) throw Object.assign(new Error('authoring-host-unavailable'), { status: 503 })
  return call.host.authoring
}

const documentProperty = { type: 'string', description: 'The served document directory. Omit only for one document or a document-bound token.' }
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

export const AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'get_authoring_capabilities', kind: 'read', structured: true,
    description: 'The actual canonical authoring operations, limits, review and retry scope of this host. Does not compile, synthesize, transcribe or write. A compiler-only stdio host reports authoring unavailable.',
    properties: { document: documentProperty },
    run: async call => {
      if (!call.host.authoring) return { apiVersion: AUTHORING_API_VERSION, documentSchemaVersion: DOCUMENT_SCHEMA_VERSION, available: false, reason: 'host-unavailable', actions: { read: false, plan: false, apply: false, planPageDuplication: false, applyPageDuplication: false }, operations: [], replacement: false, fileChanges: false, idempotency: 'unavailable', review: 'unavailable' }
      const capability = service(call).capabilities(await call.document(), call.caller.member)
      if (!call.host.offers('operate')) return { ...capability, actions: { ...capability.actions, apply: false, applyPageDuplication: false }, applyUnavailableReason: 'operation-disabled' }
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
    name: 'plan_document_change', kind: 'read', structured: true,
    description: 'Preflights a versioned DocumentChange with canonical semantic operations or an explicit replacement and optional same-document text files. Validates candidate, identity, references, all file bases and transaction limits without saving or compiling. Returns planId, candidate, entity impact, source and predicted files. Existing-file bases are exact versions; null exclusively creates a new text file.',
    inputSchema: schema(),
    run: async call => service(call).plan(await call.document(), call.args.change as DocumentChange, call.caller.member),
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
      await call.approve('operate', messages => messages.duplicatePage, { lang: current.content.metadata.lang ?? '', detail: JSON.stringify({ document, request: call.args.request }) })
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
      await call.approve('operate', messages => messages.tool('apply_document_change'), { lang: current.content.metadata.lang ?? '', detail: JSON.stringify({ document, planId: call.args.planId, change: call.args.change }) })
      call.signal.throwIfAborted()
      return own.apply(document, { change: call.args.change as DocumentChange, planId: String(call.args.planId) }, call.caller.member)
    },
  },
]
