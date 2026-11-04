import { hasRole, WORKSPACE_REVIEW_CHANGE_SCHEMA, WORKSPACE_REVIEW_QUERY_SCHEMA } from '@lincyaw/kernel'
import type { WorkspaceReviewChange, WorkspaceReviewQuery } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { systemLocale } from './messages.ts'

function service(call: Call) {
  if (call.caller.document !== undefined || call.caller.confirmed || !hasRole(call.caller.member, 'owner')) throw Object.assign(new Error('workspace-review-permission-denied'), { status: 403 })
  if (!call.host.workspaceReview) throw Object.assign(new Error('workspace-review-unavailable'), { status: 503 })
  return call.host.workspaceReview
}
const changeSchema = { ...WORKSPACE_REVIEW_CHANGE_SCHEMA, oneOf: WORKSPACE_REVIEW_CHANGE_SCHEMA.oneOf.map(variant => ({ ...variant, required: variant.required.filter(key => key !== 'snapshot') })) }

export const WORKSPACE_REVIEW_TOOLS: ToolSpec[] = [
  { name: 'get_review', kind: 'read', structured: true, workspace: 'author', access: 'workspace-owner',
    description: 'Reads the workspace candidate review without compiling or subscribing. Defaults to a small identity/state/count summary. part files or steps pages metadata; part diff with path reads one file or checkpoint diff in bounded UTF-16 fragments. Use the returned snapshot on later pages; concatenate fragments before interpreting the diff. No active review returns review:null. Requires an unbound owner credential; document agent credentials cannot inspect or approve workspace reviews.',
    inputSchema: WORKSPACE_REVIEW_QUERY_SCHEMA,
    run: call => service(call).read(call.args as WorkspaceReviewQuery, call.caller.member) },
  { name: 'change_review', kind: 'write', structured: true, workspace: 'author', access: 'workspace-owner',
    description: 'Accepts, rejects selected paths or the entire candidate, or restores its checkpoint, through the existing workspace review owner and write approval. Reject/restore require confirm:true. The server captures and checks the exact candidate internally; optional snapshot pins an earlier read. Refuses running or changed reviews, including binary changes. A restore step belongs to this review. Returns the real outcome and commit ID when accepted. No automatic retry after a lost response: inspect the review/history first. Only an unbound workspace owner can invoke this; an agent cannot approve its own document review.',
    inputSchema: changeSchema,
    run: async call => {
      const own = service(call)
      const current = await own.read({}, call.caller.member)
      if (!current.review) throw Object.assign(new Error('workspace-review-not-found'), { status: 404 })
      const change = { snapshot: current.snapshot, ...call.args } as WorkspaceReviewChange
      await call.approve('write', messages => messages.changeReview(change.action), { scope: 'workspace', lang: systemLocale(), check: () => own.check(change, call.caller.member) })
      call.signal.throwIfAborted()
      return own.change(change, call.caller.member, call.signal)
    } },
]
