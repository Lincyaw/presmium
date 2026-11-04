import type { Member } from './server.ts'
import type { SourceFile } from './workspace.ts'

export const SOURCE_MAX_BYTES = 2 << 20
export const SOURCE_MAX_FILES = 16
export const SOURCE_MAX_REQUEST_CHARS = SOURCE_MAX_BYTES * 3 + 8192
export const SOURCE_MAX_RESPONSE_CHARS = 7168
export const SOURCE_FRAGMENT_CHARS = 4000
/** Supplied by an adapter, never accepted as model arguments. */
export interface SourceCaller { member: Member, boundDocument?: string, confirmed?: boolean, origin: 'editor' | 'agent' }
export interface SourceListQuery { document?: string, query?: string, offset?: number, snapshot?: string }
export interface SourceListAnswer { files: SourceFile[], snapshot: string, nextOffset?: number, truncated?: true }
export interface SourceReadQuery { document?: string, path: string, offset?: number, version?: string }
export interface SourceReadAnswer { path: string, version: string, text: string, offset: number, totalChars: number, nextOffset?: number }
export type SourceEditFile = { path: string, version?: string } & ({ content: string, create?: true } | { find: string, replace: string })
export type SourceEdit = ({ document?: string } & SourceEditFile) | { document?: string, edits: SourceEditFile[] }
export interface SourceSaved { saved: true, changed: boolean, path?: string, files?: number, revision?: string, current?: false }
export interface PreparedSourceEdit { change(signal?: AbortSignal): Promise<SourceSaved> }
/** Current source editor scope and transaction owner; invalid IR is readable and repairable. */
export interface WorkspaceSource {
  list(query: SourceListQuery, caller: SourceCaller): Promise<SourceListAnswer>
  read(query: SourceReadQuery, caller: SourceCaller): Promise<SourceReadAnswer>
  prepare(edit: SourceEdit, caller: SourceCaller): Promise<PreparedSourceEdit>
}
const document = { type: 'string', maxLength: 500 } as const
const path = { type: 'string', minLength: 1, maxLength: 500 } as const
const version = { type: 'string', pattern: '^[a-f0-9]{20}$' } as const
const offset = { type: 'integer', minimum: 0 } as const
export const SOURCE_LIST_SCHEMA = { type: 'object', additionalProperties: false, properties: { document, query: { type: 'string', maxLength: 200 }, offset, snapshot: { type: 'string', pattern: '^[a-f0-9]{64}$' } } } as const
export const SOURCE_READ_SCHEMA = { type: 'object', additionalProperties: false, required: ['path'], properties: { document, path, offset, version } } as const
const fileSchema = { oneOf: [
  { type: 'object', additionalProperties: false, required: ['path', 'content'], properties: { path, version, content: { type: 'string', maxLength: SOURCE_MAX_BYTES }, create: { const: true } } },
  { type: 'object', additionalProperties: false, required: ['path', 'find', 'replace'], properties: { path, version, find: { type: 'string', minLength: 1, maxLength: SOURCE_MAX_BYTES }, replace: { type: 'string', maxLength: SOURCE_MAX_BYTES } } },
] } as const
export const SOURCE_EDIT_SCHEMA = { oneOf: [
  ...fileSchema.oneOf.map(schema => ({ ...schema, properties: { document, ...schema.properties } })),
  { type: 'object', additionalProperties: false, required: ['edits'], properties: { document, edits: { type: 'array', minItems: 1, maxItems: SOURCE_MAX_FILES, items: fileSchema } } },
] } as const
