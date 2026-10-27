import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_HISTORY_CHANGE_SCHEMA, DOCUMENT_HISTORY_QUERY_SCHEMA, DOCUMENT_HISTORY_READ_SCHEMA } from '../contracts/document-history.ts'
import type { DocumentHistoryChange, DocumentHistoryQuery, DocumentHistoryRead } from '../contracts/document-history.ts'

const query = new Validator(structuredClone(DOCUMENT_HISTORY_QUERY_SCHEMA) as unknown as Schema, '2020-12', false)
const read = new Validator(structuredClone(DOCUMENT_HISTORY_READ_SCHEMA) as unknown as Schema, '2020-12', false)
const change = new Validator(structuredClone(DOCUMENT_HISTORY_CHANGE_SCHEMA) as unknown as Schema, '2020-12', false)
export const validateDocumentHistoryQuery = (value: unknown): value is DocumentHistoryQuery => query.validate(value).valid
export const validateDocumentHistoryRead = (value: unknown): value is DocumentHistoryRead => read.validate(value).valid
export const validateDocumentHistoryChange = (value: unknown): value is DocumentHistoryChange => change.validate(value).valid
