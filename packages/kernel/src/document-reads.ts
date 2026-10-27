import { DOCUMENT_ENTITY_COLLECTIONS, DOCUMENT_READ_MAX_RESPONSE_CHARS } from './contracts/document-reads.ts'
import type { DocumentOutlineAnswer, DocumentOutlineEntry, DocumentOutlineQuery, DocumentPartAnswer, DocumentPartQuery } from './contracts/document-reads.ts'
import type { JsonValue, TeachingDocument } from './contracts/document.ts'
import type { CanonicalSource } from './ir.ts'
import { fnv1a64 } from './fingerprint.ts'

export class DocumentReadError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const fits = (value: unknown) => JSON.stringify(value, null, 2).length <= DOCUMENT_READ_MAX_RESPONSE_CHARS
const fail = (status: number, code: string): never => { throw new DocumentReadError(status, code) }
/** Offsets index decoded UTF-16 text; a valid surrogate pair is always kept together. */
function boundary(text: string, offset: number): boolean {
  return !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!))
}
function preview(text: string): NonNullable<DocumentOutlineEntry['title']> {
  let end = Math.min(text.length, 80)
  if (!boundary(text, end)) end--
  return { preview: text.slice(0, end), complete: end === text.length, totalChars: text.length }
}

export function documentOutline(content: TeachingDocument, source: CanonicalSource, query: DocumentOutlineQuery): DocumentOutlineAnswer {
  const collection = query.collection ?? 'sections', offset = query.offset ?? 0
  const records = content[collection] ?? {}, ids = collection === 'sections' ? content.sectionOrder : Object.keys(records)
  if (offset > ids.length) return fail(400, 'document-read-offset-invalid')
  const answer: DocumentOutlineAnswer = { source, documentSchemaVersion: content.schemaVersion,
    counts: Object.fromEntries(DOCUMENT_ENTITY_COLLECTIONS.map(name => [name, Object.keys(content[name] ?? {}).length])) as DocumentOutlineAnswer['counts'],
    collection, present: Object.hasOwn(content, collection), offset, total: ids.length, complete: offset === ids.length, entries: [] }
  for (let i = offset; i < ids.length; i++) {
    const id = ids[i]!, record = records[id] as unknown as Record<string, unknown>
    const entry: DocumentOutlineEntry = { id }
    if (typeof record.type === 'string') entry.type = record.type
    if (typeof record.sectionId === 'string') entry.sectionId = record.sectionId
    if (typeof record.title === 'string') entry.title = preview(record.title)
    if (collection === 'sections') entry.counts = { children: (record.children as unknown[]).length, steps: (record.stepOrder as unknown[]).length }
    if (collection === 'steps') entry.counts = { narrations: (record.narrationIds as unknown[]).length }
    answer.entries.push(entry)
    answer.complete = i + 1 === ids.length
    if (answer.complete) delete answer.nextOffset
    else answer.nextOffset = i + 1
    if (fits(answer)) continue
    answer.entries.pop(); answer.complete = false; answer.nextOffset = i
    if (!answer.entries.length) return fail(413, 'document-read-response-too-large')
    break
  }
  if (!fits(answer)) return fail(413, 'document-read-response-too-large')
  return answer
}

export function documentPart(content: TeachingDocument, source: CanonicalSource, query: DocumentPartQuery): DocumentPartAnswer {
  const { target } = query
  let value: unknown = content[target.collection]
  if ('id' in target) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, target.id)) return fail(404, 'document-entity-not-found')
    value = (value as Record<string, unknown>)[target.id]
  }
  for (const field of target.path ?? []) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, field) || (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(field) || !Number.isSafeInteger(Number(field))))) return fail(404, 'document-field-not-found')
    value = (value as Record<string, unknown>)[field]
  }
  if (value === undefined) return fail(404, 'document-field-not-found')
  const text = JSON.stringify(value), offset = query.offset ?? 0
  if (offset > text.length || !boundary(text, offset)) return fail(400, 'document-read-offset-invalid')
  const base = { source, target, valueDigest: { algorithm: 'fnv1a64' as const, serialization: 'JSON.stringify' as const, value: fnv1a64(text) } }
  const whole: DocumentPartAnswer = { ...base, encoding: 'value', complete: true, value: value as JsonValue }
  if (offset === 0 && fits(whole)) return whole
  const fragment = (end: number): DocumentPartAnswer => ({ ...base, encoding: 'json-text-fragment', offsetUnit: 'utf16', offset, ...end < text.length ? { nextOffset: end } : {}, totalChars: text.length, complete: end === text.length, text: text.slice(offset, end) })
  // Find the largest prefix whose fully escaped, indented response fits the actual text budget.
  let low = offset, high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(fragment(mid))) low = mid
    else high = mid - 1
  }
  if (!boundary(text, low)) low--
  if (low === offset && offset < text.length) return fail(413, 'document-read-response-too-large')
  const answer = fragment(low)
  if (!fits(answer)) return fail(413, 'document-read-response-too-large')
  return answer
}
