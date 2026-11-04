import { CHANGES_QUERY_SCHEMA, CHANGES_REQUEST_SCHEMA, hasRole } from '@lincyaw/kernel'
import type { ChangesCaller, ChangesQuery, WorkspaceChangesRequest } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { systemLocale } from './messages.ts'
const service = (call: Call) => { if (!call.host.workspaceChanges) throw Object.assign(new Error('changes-git-unavailable'), { status: 503 }); return call.host.workspaceChanges }
const caller = (call: Call): ChangesCaller => ({ member: call.caller.member, origin: 'agent', ...call.caller.document !== undefined ? { boundDocument: call.caller.document } : {}, ...call.caller.confirmed ? { confirmed: true } : {} })
export const WORKSPACE_CHANGES_TOOLS: ToolSpec[] = [
  { name: 'get_workspace_changes', kind: 'read', structured: true, workspace: 'candidate', inputSchema: CHANGES_QUERY_SCHEMA,
    description: 'Lists current uncommitted files in bounded pages with native workspace/document scope. available:false means no repository. Subsequent offsets require snapshot. Unsupported file kinds are marked, not silently skipped. Does not compile or change the real index. A snapshot pins the actual HEAD/ref/index and working bytes, not just names.',
    run: call => service(call).list(call.args as ChangesQuery, caller(call)) },
  { name: 'change_workspace_changes', kind: 'write', structured: true, workspace: 'author', access: 'workspace-owner', inputSchema: CHANGES_REQUEST_SCHEMA,
    description: 'Commits or discards an exact selection after workspace write approval. Omit paths for the set captured now; later additions are not included. Commit requires message; discard requires confirm:true. Captures state internally; optional snapshot pins an earlier read. Commits fixed bytes and preserves unrelated staging; discard restores both selected worktree and index. Refuses changed state, active repository operations and unsafe directory substitutions. Requires external unbound owner authority and respects required review. Returns the actual commit ID. After a lost acknowledgement read changes/history, never retry automatically.',
    run: async call => {
      if (call.caller.document !== undefined || call.caller.confirmed || !hasRole(call.caller.member, 'owner')) throw Object.assign(new Error('changes-permission-denied'), { status: 403 })
      const request = call.args as WorkspaceChangesRequest, prepared = await service(call).prepare(request, caller(call))
      await call.approve('write', messages => messages.changeWorkspaceChanges(request.action), { scope: 'workspace', lang: systemLocale() })
      call.signal.throwIfAborted()
      const result = await prepared.change(call.signal)
      return { ...result, ...result.revision ? { revision: result.revision.id } : {} }
    } },
]
