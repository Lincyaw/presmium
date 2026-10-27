import type { CanonicalSource } from '../ir.ts'
import type { JsonValue } from './document.ts'

export const DOCUMENT_READ_MAX_REQUEST_CHARS = 2048
/** Includes JSON escaping and indentation used by the MCP text result. */
export const DOCUMENT_READ_MAX_RESPONSE_CHARS = 7168
export const DOCUMENT_ENTITY_COLLECTIONS = ['sections', 'blocks', 'steps', 'narrations', 'assets', 'definitions', 'comments'] as const
export const DOCUMENT_ROOT_FIELDS = ['schemaVersion', 'id', 'metadata', 'sectionOrder', 'production'] as const
export type DocumentEntityCollection = typeof DOCUMENT_ENTITY_COLLECTIONS[number]
export type DocumentPartTarget = { collection: DocumentEntityCollection, id: string, path?: string[] } | { collection: typeof DOCUMENT_ROOT_FIELDS[number], path?: string[] }
export interface DocumentOutlineQuery { source?: CanonicalSource, collection?: DocumentEntityCollection, offset?: number }
export interface DocumentPartQuery { source: CanonicalSource, target: DocumentPartTarget, offset?: number }
export interface DocumentOutlineEntry {
  id: string
  type?: string
  sectionId?: string
  title?: { preview: string, complete: boolean, totalChars: number }
  counts?: { children?: number, steps?: number, narrations?: number }
}
export interface DocumentOutlineAnswer {
  source: CanonicalSource
  documentSchemaVersion: number
  counts: Record<DocumentEntityCollection, number>
  collection: DocumentEntityCollection
  present: boolean
  offset: number
  nextOffset?: number
  total: number
  complete: boolean
  entries: DocumentOutlineEntry[]
}
interface DocumentPartAnswerBase {
  source: CanonicalSource
  target: DocumentPartTarget
  /** FNV-1a 64 of JSON.stringify(selected canonical value), with no indentation. */
  valueDigest: { algorithm: 'fnv1a64', serialization: 'JSON.stringify', value: string }
}
export type DocumentPartAnswer = DocumentPartAnswerBase & (
  { encoding: 'value', complete: true, value: JsonValue } |
  { encoding: 'json-text-fragment', offsetUnit: 'utf16', offset: number, nextOffset?: number, totalChars: number, complete: boolean, text: string }
)

const source = { type: 'object', additionalProperties: false, required: ['documentId', 'version', 'fingerprint'], properties: {
  documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', minLength: 1, maxLength: 128 }, fingerprint: { type: 'string', minLength: 1, maxLength: 128 },
} } as const
const offset = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const
const path = { type: 'array', maxItems: 64, items: { type: 'string', maxLength: 1024 } } as const
export const DOCUMENT_OUTLINE_QUERY_SCHEMA = {
  type: 'object', additionalProperties: false, properties: { source, collection: { enum: DOCUMENT_ENTITY_COLLECTIONS }, offset },
  if: { required: ['offset'], properties: { offset: { minimum: 1 } } }, then: { required: ['source'] },
} as const
export const DOCUMENT_PART_QUERY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['source', 'target'], properties: { source, offset, target: { oneOf: [
    { type: 'object', additionalProperties: false, required: ['collection', 'id'], properties: { collection: { enum: DOCUMENT_ENTITY_COLLECTIONS }, id: { type: 'string', minLength: 1, maxLength: 200 }, path } },
    { type: 'object', additionalProperties: false, required: ['collection'], properties: { collection: { enum: DOCUMENT_ROOT_FIELDS }, path } },
  ] } },
} as const
