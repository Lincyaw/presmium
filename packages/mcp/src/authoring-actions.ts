import { DOCUMENT_ACTION_MAX_REQUEST_CHARS, DOCUMENT_ACTION_MAX_RESPONSE_CHARS } from '@lincyaw/kernel'
import type { DocumentAuthoringActionEffect, DocumentAuthoringActionPlan, DocumentAuthoringActionRequest, DocumentAuthoringActionReference, DocumentComponentImpactQuery } from '@lincyaw/kernel'
import { DOCUMENT_AUTHORING_ACTION_SCHEMA, DOCUMENT_AUTHORING_ACTION_APPLY_SCHEMA, DOCUMENT_AUTHORING_ACTION_IMPACT_SCHEMA } from '@lincyaw/kernel/node'
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
  if (JSON.stringify(call.args).length > DOCUMENT_ACTION_MAX_REQUEST_CHARS) throw Object.assign(new Error('authoring-action-request-too-large'), { status: 413, detail: { limits: { maxRequestChars: DOCUMENT_ACTION_MAX_REQUEST_CHARS }, next: 'Submit only changed fields; keep the local draft when an edited value exceeds the limit.' } })
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
function effectSummary(effect: DocumentAuthoringActionEffect) {
  if (effect.kind !== 'component') return effect
  const { paths, affected, overrides, references, ...target } = effect.value
  const counts = (value: Record<string, string[]>) => Object.fromEntries(Object.entries(value).map(([name, values]) => [name, values.length]))
  return { kind: 'component', value: { ...target, paths: paths.length, affected: counts(affected), overrides: counts(overrides), references: counts(references) } }
}
function summary(plan: DocumentAuthoringActionPlan, document: string) {
  const resource = (part: string) => `presmium://authoring-action/${encodeURIComponent(plan.planId)}/${plan.digest}/${part}?document=${encodeURIComponent(document)}`
  return { apiVersion: plan.apiVersion, planId: plan.planId, changeId: plan.changeId, source: plan.source, digest: plan.digest, expiresAt: plan.expiresAt,
    action: plan.action.type, effect: effectSummary(plan.effect), confirmationRequired: plan.action.type === 'comment.delete',
    impact: Object.fromEntries(Object.entries(plan.impact).map(([key, value]) => [key, Array.isArray(value) ? value.length : value])),
    validation: { errors: plan.issues.filter(issue => issue.severity === 'error').length, warnings: plan.issues.filter(issue => issue.severity === 'warning').length,
      sample: plan.issues.slice(0, 3).map(issue => ({ code: issue.code.slice(0, 64), path: issue.path.slice(0, 100), message: issue.message.slice(0, 120), severity: issue.severity })) },
    resources: plan.effect.kind === 'component' ? { impact: resource('impact/affected.steps/0') } : { candidate: resource('candidate'), details: resource('details') },
    next: plan.action.type === 'comment.delete' ? 'Review this exact deletion and apply the unchanged reference with confirmDeletion:true.' : plan.effect.kind === 'component' ? 'Read the actual inherited-step and Definition-reference impact, apply this unchanged reference, then read the target with the returned saved source.' : 'Apply this unchanged plan reference, then read the target with the returned saved source. Voice settings are not synthesis or recording adoption.' }
}
export const AUTHORING_ACTION_TOOLS: readonly ToolSpec[] = [
  {
    name: 'plan_authoring_action', kind: 'read', structured: true,
    description: 'Preflights canonical comments, voice.set or component actions through shared pure Web rules. Use exact source and a fresh intent id. Components support component.parameters.patch for base values, component.step-parameters.patch/reset for a stable step and component.definition.use for an existing Definition. Parameter changes are bounded set/remove path arrays for schema-declared editable fields; read-only ancestors/descendants and undeclared changes are refused. Whole-object edits preserve unknown fields. Exact whole-array reorders or item deletion are supported; ambiguous mixed reorder/edit must be split. This is not a whole-document or whole-parameters echo; arrays/objects are valid values and existing array items may be changed or removed. Preserve unknown parameters and revalidate the complete inherited graph. Step edits can affect descendants; read the returned actual impact, never claim only this step. Independent implementation copies are unavailable. Comment content is canonical RichTextNode[]; the service fixes IDs, trusted authors and dates. Voice accepts tts/none/null; recording requires adopt_recording. Returns compact counts/reference and a bounded impact resource, no scene compile or provider. Request<=4096 JSON chars, result<=7168 pretty JSON UTF16 chars.',
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
      const answer = await own.applyAction(document, call.args.request as DocumentAuthoringActionReference, call.caller.member)
      return { ...answer, effect: effectSummary(answer.effect) }
    }),
  },
  {
    name: 'read_authoring_action_impact', kind: 'read', structured: true,
    description: 'Reads a bounded page of the fixed component plan’s actual affected blocks/steps/pages, preserved/materialized/reset override StepIDs or before/after Definition references. Use its exact planId/digest, collection and nextOffset. Returns plan source plus current source/state; an old plan is not permission to apply. No compilation or new plan. The same retained plan, member/document scope and expiry rules apply; this creates no snapshot ledger.',
    inputSchema: schema(DOCUMENT_AUTHORING_ACTION_IMPACT_SCHEMA),
    run: call => bounded(call, async () => service(call).readActionImpact(await call.document(), call.args.request as DocumentComponentImpactQuery, call.caller.member)),
  },
]
