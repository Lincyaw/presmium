import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_TRANSCRIPTION_REQUEST_SCHEMA } from '../contracts/transcription.ts'
import type { DocumentTranscriptionRequest } from '../contracts/transcription.ts'

const requestValidator = new Validator(structuredClone(DOCUMENT_TRANSCRIPTION_REQUEST_SCHEMA) as unknown as Schema, '2020-12', false)

export function validateDocumentTranscriptionRequest(value: unknown): value is DocumentTranscriptionRequest {
  return requestValidator.validate(value).valid
}
