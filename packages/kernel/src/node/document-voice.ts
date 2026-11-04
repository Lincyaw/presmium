import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_VOICE_CATALOG_SCHEMA, DOCUMENT_VOICE_CLONE_SCHEMA, DOCUMENT_VOICE_CLONE_QUERY_SCHEMA } from '../contracts/document-voice.ts'
import type { DocumentVoiceCatalogQuery, DocumentVoiceCloneRequest, DocumentVoiceCloneQuery } from '../contracts/document-voice.ts'

const validator = new Validator(structuredClone(DOCUMENT_VOICE_CATALOG_SCHEMA) as unknown as Schema, '2020-12', false)
export const validateDocumentVoiceCatalogQuery = (value: unknown): value is DocumentVoiceCatalogQuery => validator.validate(value).valid
const clone = new Validator(structuredClone(DOCUMENT_VOICE_CLONE_SCHEMA), '2020-12', false)
const cloneQuery = new Validator(structuredClone(DOCUMENT_VOICE_CLONE_QUERY_SCHEMA), '2020-12', false)
export const validateDocumentVoiceClone = (value: unknown): value is DocumentVoiceCloneRequest => clone.validate(value).valid
export const validateDocumentVoiceCloneQuery = (value: unknown): value is DocumentVoiceCloneQuery => cloneQuery.validate(value).valid
