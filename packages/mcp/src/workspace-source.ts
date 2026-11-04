import { hasRole, SOURCE_EDIT_SCHEMA, SOURCE_LIST_SCHEMA, SOURCE_READ_SCHEMA } from '@lincyaw/kernel'
import type { SourceCaller, SourceEdit, SourceListQuery, SourceReadQuery } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { systemLocale } from './messages.ts'
const caller = (call: Call): SourceCaller => ({ member: call.caller.member, origin: 'agent', ...call.caller.document !== undefined ? { boundDocument: call.caller.document } : {}, ...call.caller.confirmed ? { confirmed: true } : {} })
const service = (call: Call) => { if (!call.host.workspaceSource) throw Object.assign(new Error('source-host-unavailable'), { status: 503 }); return call.host.workspaceSource }
export const SOURCE_TOOLS: ToolSpec[] = [
  { name: 'list_files', kind: 'read', structured: true, workspace: 'candidate', inputSchema: SOURCE_LIST_SCHEMA,
    description: 'Lists up to 20 current source paths from the native file editor, optionally filtering query or document. A bound token stays in its document, including an empty directory binding; an unbound owner defaults to the workspace. Preserves the editor’s binary markers, hidden-path policy and 2000-file truncated flag. Subsequent pages pin snapshot. Does not compile or read file contents.',
    run: call => service(call).list(call.args as SourceListQuery, caller(call)) },
  { name: 'read_source', kind: 'read', structured: true, workspace: 'candidate', inputSchema: SOURCE_READ_SCHEMA,
    description: 'Reads an exact current UTF-8 source file in bounded UTF-16 fragments, including invalid lecture.json. No compilation. Defaults to its first fragment; later offsets require the returned version so fragments cannot mix saves. Preserve text exactly and concatenate before parsing. Uses native editor scope, regular-file checks and the 2 MiB source limit. No binary files or symlink traversal.',
    run: call => service(call).read(call.args as unknown as SourceReadQuery, caller(call)) },
  { name: 'edit_source', kind: 'write', structured: true, workspace: 'author', access: 'workspace-owner', inputSchema: SOURCE_EDIT_SCHEMA,
    description: 'Saves one text file, or edits[] of up to 16 related files, through the native source transaction after workspace write approval. Supply content, or an exact unique find/replace; create:true exclusively creates a new ordinary text file. Captures the current version internally; optional version pins an earlier read. Valid lecture.json uses canonical edit tools; this path repairs only an existing invalid served entry and preserves its ID. Requires external unbound owner access and respects required-review policy. A batch stays in one document or entirely in the owner workspace scope. No compile. saved:true with current:false means writing succeeded but readback no longer matches; never retry after a lost response without reading current source/history.',
    run: async call => {
      if (call.caller.document !== undefined || call.caller.confirmed || !hasRole(call.caller.member, 'owner')) throw Object.assign(new Error('source-file-forbidden'), { status: 403 })
      const prepared = await service(call).prepare(call.args as SourceEdit, caller(call))
      await call.approve('write', messages => messages.editSource, { scope: 'workspace', lang: systemLocale() })
      call.signal.throwIfAborted()
      return prepared.change(call.signal)
    } },
]
