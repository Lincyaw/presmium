import { PROJECT_APPLY_SCHEMA, PROJECT_MAX_REQUEST_CHARS, PROJECT_PLAN_SCHEMA } from '@lincyaw/kernel'
import type { ProjectCaller, ProjectAuthoring } from '@lincyaw/kernel'
import { validateProjectApply, validateProjectPlan } from '@lincyaw/kernel/node'
import type { Call, ToolSpec } from './mcp.ts'
const service = (call: Call): ProjectAuthoring => { if (!call.host.projectAuthoring) throw Object.assign(new Error('project-host-unavailable'), { status: 503 }); return call.host.projectAuthoring }
const caller = (call: Call): ProjectCaller => ({ member: call.caller.member, origin: 'agent', ...call.caller.document !== undefined ? { boundDocument: call.caller.document } : {} })
const budget = (call: Call) => { if (JSON.stringify(call.args).length > PROJECT_MAX_REQUEST_CHARS) throw Object.assign(new Error('project-request-too-large'), { status: 413 }) }
export const PROJECT_TOOLS: ToolSpec[] = [
  { name: 'get_project_capabilities', kind: 'read', structured: true, inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    description: 'Workspace project-management availability, actual HEAD/configuration observation and limits. This cheap read does not validate file trees, compile or write. Root-directory copy/move/delete remain unavailable. A document-bound token has no workspace-management grant.',
    run: call => service(call).capabilities(caller(call)) },
  { name: 'plan_project_change', kind: 'read', structured: true, inputSchema: PROJECT_PLAN_SCHEMA,
    description: 'Preflights create/copy/rename/delete of an ordinary document directory, or retitle of canonical metadata. Binds actual git HEAD, source/template bytes, workspace configuration and classified references. Fixes a new document UUID at planning. Returns compact impact, digest and expiry. No writes or compilation. Retain the same id for identical retries; 64 process-local plans, five minutes. Refuses unsupported references, root-directory operations and uncommitted destructive targets.',
    run: async call => { budget(call); if (!validateProjectPlan(call.args)) throw Object.assign(new Error('project-plan-invalid'), { status: 400 }); return service(call).plan(call.args, caller(call)) } },
  { name: 'apply_project_change', kind: 'operate', structured: true, inputSchema: PROJECT_APPLY_SCHEMA,
    description: 'Applies an exact reviewed project plan through the same directory writer/locks/git transaction as Web. Delete requires confirmDeletion:true after reviewing its impact. Refuses changed HEAD/tree/configuration, changed intent, wrong member or document-bound grant and required-review bypass. Identical plan retries return a receipt only while its result HEAD/tree remains current. Does not discard drafts, compile, synthesize or play.',
    run: async call => { budget(call); if (!validateProjectApply(call.args)) throw Object.assign(new Error('project-apply-invalid'), { status: 400 }); const plan = await service(call).readPlan(call.args, caller(call)); const lang = (await call.host.documents()).find(doc => doc.dir === plan.operation.dir)?.lang ?? 'zh-CN'; await call.approve('operate', m => m.projectChange, { lang, scope: 'workspace', detail: JSON.stringify({ operation: plan.operation, impact: plan.impact, digest: plan.digest }) }); return service(call).apply(call.args, caller(call), call.signal) } },
]
