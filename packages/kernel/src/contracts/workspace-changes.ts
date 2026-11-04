import type { Member } from './server.ts'
import type { Revision, UncommittedFile } from './workspace.ts'
export const CHANGES_MAX_REQUEST_CHARS = 1 << 20
export const CHANGES_MAX_RESPONSE_CHARS = 7168
export const CHANGES_MAX_FILES = 16_384
export const CHANGES_MAX_BYTES = 512 << 20
export interface ChangesCaller { member: Member, origin: 'editor' | 'agent', boundDocument?: string, confirmed?: boolean }
export interface ChangesQuery { document?: string, offset?: number, snapshot?: string }
export interface WorkspaceChangesAnswer { available: boolean, files: (UncommittedFile & { unsupported?: true })[], snapshot?: string, nextOffset?: number }
export type WorkspaceChangesRequest = { document?: string, paths?: string[], snapshot?: string } & (
  | { action: 'commit', message: string }
  | { action: 'discard', confirm: true }
)
export interface WorkspaceChangesResult { action: 'commit' | 'discard', files: number, refreshed?: false, revision?: Revision, committed?: boolean }
export interface PreparedWorkspaceChanges { readonly paths: readonly string[], change(signal?: AbortSignal): Promise<WorkspaceChangesResult> }
export interface WorkspaceChanges {
  list(query: ChangesQuery, caller: ChangesCaller): Promise<WorkspaceChangesAnswer>
  prepare(request: WorkspaceChangesRequest, caller: ChangesCaller): Promise<PreparedWorkspaceChanges>
}
const document = { type: 'string', maxLength: 500 } as const
const snapshot = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const
const paths = { type: 'array', minItems: 1, maxItems: CHANGES_MAX_FILES, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 500 } } as const
export const CHANGES_QUERY_SCHEMA = { type: 'object', additionalProperties: false, properties: { document, snapshot, offset: { type: 'integer', minimum: 0 } } } as const
export const CHANGES_REQUEST_SCHEMA = { oneOf: [
  { type: 'object', additionalProperties: false, required: ['action', 'message'], properties: { document, paths, snapshot, action: { const: 'commit' }, message: { type: 'string', minLength: 1, maxLength: 4000 } } },
  { type: 'object', additionalProperties: false, required: ['action', 'confirm'], properties: { document, paths, snapshot, action: { const: 'discard' }, confirm: { const: true } } },
] } as const
