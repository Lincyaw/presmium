import { AUTHORING_API_VERSION, DOCUMENT_SCHEMA_VERSION } from '@lincyaw/kernel'
import { DOCUMENT_CHANGE_JSON_SCHEMA } from '@lincyaw/kernel/node'
import type { DocumentAuthoring, DocumentChange } from '@lincyaw/kernel'
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

export const AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'get_authoring_capabilities', kind: 'read', structured: true,
    description: 'The actual canonical authoring operations, limits, review and retry scope of this host. Does not compile, synthesize, transcribe or write. A compiler-only stdio host reports authoring unavailable.',
    properties: { document: documentProperty },
    run: async call => {
      if (!call.host.authoring) return { apiVersion: AUTHORING_API_VERSION, documentSchemaVersion: DOCUMENT_SCHEMA_VERSION, available: false, reason: 'host-unavailable', actions: { read: false, plan: false, apply: false }, operations: [], replacement: false, fileChanges: false, idempotency: 'unavailable', review: 'unavailable' }
      const capability = service(call).capabilities(await call.document(), call.caller.member)
      if (!call.host.offers('operate')) return { ...capability, actions: { ...capability.actions, apply: false }, applyUnavailableReason: 'operation-disabled' }
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
