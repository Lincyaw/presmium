import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_VOICE_CATALOG_SCHEMA } from '../contracts/document-voice.ts'
import type { DocumentVoiceCatalogQuery } from '../contracts/document-voice.ts'

const validator = new Validator(structuredClone(DOCUMENT_VOICE_CATALOG_SCHEMA) as unknown as Schema, '2020-12', false)
export const validateDocumentVoiceCatalogQuery = (value: unknown): value is DocumentVoiceCatalogQuery => validator.validate(value).valid
