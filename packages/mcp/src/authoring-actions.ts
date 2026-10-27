import { DOCUMENT_ACTION_MAX_REQUEST_CHARS, DOCUMENT_ACTION_MAX_RESPONSE_CHARS } from '@lincyaw/kernel'
import type { DocumentAuthoringActionPlan, DocumentAuthoringActionRequest, DocumentAuthoringActionReference } from '@lincyaw/kernel'
import { DOCUMENT_AUTHORING_ACTION_SCHEMA, DOCUMENT_AUTHORING_ACTION_APPLY_SCHEMA } from '@lincyaw/kernel/node'
import type { Call, ToolSpec } from './mcp.ts'

function service(call: Call) {
  if (!call.host.authoring) throw Object.assign(new Error('authoring-host-unavailable'), { status: 503 })
  return call.host.authoring
}
function schema(source: unknown): Record<string, unknown> {
  const { $schema: _schema, $defs, ...request } = structuredClone(source) as Record<string, unknown>
  return { type: 'object', additionalProperties: false, properties: { document: { type: 'string', maxLength: 200 }, request }, required: ['request'], ...$defs ? { $defs } : {} }
}
async function bounded(call: Call, work: () => Promise<unknown>) {
  if (JSON.stringify(call.args).length > DOCUMENT_ACTION_MAX_REQUEST_CHARS) throw Object.assign(new Error('authoring-action-request-too-large'), { status: 413 })
  try {
    const value = await work()
    if (JSON.stringify(value, null, 2).length > DOCUMENT_ACTION_MAX_RESPONSE_CHARS) throw Object.assign(new Error('authoring-action-response-too-large'), { status: 413 })
    return value
  } catch (error) {
    const failure = error as { detail?: unknown }
    if (failure.detail && JSON.stringify(failure.detail).length > 2048) failure.detail = { truncated: true, next: 'Read complete canonical entities with read_document_part, then explicitly retry from the current source.' }
    throw error
  }
}
function summary(plan: DocumentAuthoringActionPlan, document: string) {
  const resource = (part: string) => `presmium://authoring-action/${encodeURIComponent(plan.planId)}/${plan.digest}/${part}?document=${encodeURIComponent(document)}`
  return { apiVersion: plan.apiVersion, planId: plan.planId, changeId: plan.changeId, source: plan.source, digest: plan.digest, expiresAt: plan.expiresAt,
    action: plan.action.type, effect: plan.effect, confirmationRequired: plan.action.type === 'comment.delete',
    impact: Object.fromEntries(Object.entries(plan.impact).map(([key, value]) => [key, Array.isArray(value) ? value.length : value])),
    validation: { errors: plan.issues.filter(issue => issue.severity === 'error').length, warnings: plan.issues.filter(issue => issue.severity === 'warning').length,
      sample: plan.issues.slice(0, 3).map(issue => ({ code: issue.code.slice(0, 64), path: issue.path.slice(0, 100), message: issue.message.slice(0, 120), severity: issue.severity })) },
    resources: { candidate: resource('candidate'), details: resource('details') },
    next: plan.action.type === 'comment.delete' ? 'Review this exact deletion and apply the unchanged reference with confirmDeletion:true.' : 'Apply this unchanged plan reference, then read the target with the returned saved source. Voice settings are not synthesis or recording adoption.' }
}
export const AUTHORING_ACTION_TOOLS: readonly ToolSpec[] = [
  {
    name: 'plan_authoring_action', kind: 'read', structured: true,
    description: 'Preflights one canonical comment.create/reply/update/react/resolve/reopen/delete or voice.set with the shared pure Web rules. Use exact source and a fresh intent id. Comment content is canonical RichTextNode[]; create supplies a stable UTF16 text anchor or explicit null, never ProseMirror/BlockNote JSON. The service fixes new IDs, author and timestamps; input content IDs are placeholders, not authority. Editors can delete any discussion but edit their own comments (owners may also manage earlier authors); reactions affect only the caller. Voice source accepts tts/none/null; null removes only the scoped setting, overrides are preserved unless replaceOverrides is explicit. New recording adoption requires adopt_recording. Returns a compact fixed plan/effect/impact/reference with optional full resources; no compilation, provider or model. Request<=4096 JSON chars, result<=7168 pretty JSON UTF16 chars.',
    inputSchema: schema(DOCUMENT_AUTHORING_ACTION_SCHEMA),
    run: call => bounded(call, async () => { const document = await call.document(); return summary(await service(call).planAction(document, call.args.request as DocumentAuthoringActionRequest, call.caller.member), document) }),
  },
  {
    name: 'apply_authoring_action', kind: 'operate', structured: true,
    description: 'Applies only the unchanged planId/source/digest returned by plan_authoring_action. Comment deletion also requires confirmDeletion:true after reviewing that exact plan. Reuses the original authoring transaction, member/doc scope, CAS, review gate, history, bounded receipts and exact saved-candidate readback. Other plan families are refused. Retry this exact reference after lost ACK; stale/expired/changed/unknown plans cannot silently replan or reallocate IDs. Saved voice configuration is not generation, provider capability, playback or validated recording adoption.',
    inputSchema: schema(DOCUMENT_AUTHORING_ACTION_APPLY_SCHEMA),
    run: call => bounded(call, async () => {
      const document = await call.document(), own = service(call), capability = own.capabilities(document, call.caller.member)
      if (!capability.actions.applyAction) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
      const entry = (await call.host.documents()).find(item => item.dir === document)
      await call.approve('operate', messages => messages.applyAuthoringAction, { lang: entry?.lang ?? '', detail: JSON.stringify({ document, request: call.args.request }) })
      call.signal.throwIfAborted()
      return own.applyAction(document, call.args.request as DocumentAuthoringActionReference, call.caller.member)
    }),
  },
]
