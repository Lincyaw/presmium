import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_OUTLINE_QUERY_SCHEMA, DOCUMENT_PART_QUERY_SCHEMA, DOCUMENT_READ_MAX_REQUEST_CHARS } from '../contracts/document-reads.ts'
import type { DocumentOutlineQuery, DocumentPartQuery } from '../contracts/document-reads.ts'

const outline = new Validator(structuredClone(DOCUMENT_OUTLINE_QUERY_SCHEMA) as unknown as Schema, '2020-12', false)
const part = new Validator(structuredClone(DOCUMENT_PART_QUERY_SCHEMA) as unknown as Schema, '2020-12', false)
const bounded = (value: unknown) => { try { return JSON.stringify(value).length <= DOCUMENT_READ_MAX_REQUEST_CHARS } catch { return false } }
export function validateDocumentOutlineQuery(value: unknown): value is DocumentOutlineQuery { return bounded(value) && outline.validate(value).valid }
export function validateDocumentPartQuery(value: unknown): value is DocumentPartQuery { return bounded(value) && part.validate(value).valid }
