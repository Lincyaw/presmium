import type { Member } from './server.ts'
import type { HistoryRevision, RevisionsAnswer } from './workspace.ts'

export const DOCUMENT_HISTORY_MAX_REQUEST_CHARS = 2048
export const DOCUMENT_HISTORY_MAX_RESPONSE_CHARS = 7168
export const DOCUMENT_HISTORY_MAX_FILE_BYTES = 2 << 20
export const DOCUMENT_HISTORY_PAGE_SIZE = 20

/** Actual saved bytes; a malformed current JSON can still be inspected and undone. */
export interface DocumentHistorySource { version: string, fingerprint: string }
export interface DocumentHistoryBinding { source: DocumentHistorySource, snapshot: string }
export interface DocumentHistoryQuery { offset?: number, snapshot?: string }
export interface DocumentHistoryAnswer extends RevisionsAnswer {
  document: string
  available: boolean
  unborn?: true
  historyBinding?: DocumentHistoryBinding
  nextOffset?: number
  /** Compact summaries and file lists may be abbreviated, never commit IDs. */
  truncated?: true
}
export interface DocumentHistoryRead { revision: string, path?: string, offset?: number }
export interface DocumentHistoryFile {
  document: string
  revision: string
  path: string
  encoding: 'utf8-text-fragment'
  text: string
  offset: number
  nextOffset?: number
  totalChars: number
  complete: boolean
  sha256: string
  verification: 'historical-file-only'
}
export interface DocumentHistoryChange extends DocumentHistoryBinding { id: string, expect: string }
export interface DocumentHistoryChanged extends DocumentHistoryBinding {
  document: string
  ok: true
  revision: Pick<HistoryRevision, 'id' | 'origin'>
  verification: { saved: true, compiled: 'not-requested', runtime: 'not-requested' }
}
/** One workspace owner; HTTP and MCP do not implement reversion or write files. */
export interface DocumentHistory {
  list(document: string, query: DocumentHistoryQuery, member: Member): Promise<DocumentHistoryAnswer>
  read(document: string, query: DocumentHistoryRead, member: Member): Promise<DocumentHistoryFile>
  change(document: string, which: 'undo' | 'redo' | 'revert', request: DocumentHistoryChange, member: Member, origin?: 'editor' | 'agent'): Promise<DocumentHistoryChanged>
}
const hash = { type: 'string', pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' } as const
export const DOCUMENT_HISTORY_QUERY_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  offset: { type: 'integer', minimum: 0 }, snapshot: hash,
} } as const
export const DOCUMENT_HISTORY_READ_SCHEMA = { type: 'object', additionalProperties: false, required: ['revision'], properties: {
  revision: hash, path: { type: 'string', minLength: 1, maxLength: 500 }, offset: { type: 'integer', minimum: 0 },
} } as const
export const DOCUMENT_HISTORY_CHANGE_SCHEMA = { type: 'object', additionalProperties: false, required: ['id', 'source', 'snapshot', 'expect'], properties: {
  id: { type: 'string', minLength: 1, maxLength: 200 }, snapshot: hash, expect: hash,
  source: { type: 'object', additionalProperties: false, required: ['version', 'fingerprint'], properties: {
    version: { type: 'string', minLength: 1, maxLength: 128 }, fingerprint: { type: 'string', minLength: 1, maxLength: 128 },
  } },
} } as const
