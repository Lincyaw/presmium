import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { TRANSCRIPTION_ADOPTION_APPLY_SCHEMA, TRANSCRIPTION_ADOPTION_DRAFT_SCHEMA } from '../contracts/transcription-adoption.ts'
import type { TranscriptionAdoptionApply, TranscriptionAdoptionDraft } from '../contracts/transcription-adoption.ts'

const draft = new Validator(structuredClone(TRANSCRIPTION_ADOPTION_DRAFT_SCHEMA) as unknown as Schema, '2020-12', false)
const apply = new Validator(structuredClone(TRANSCRIPTION_ADOPTION_APPLY_SCHEMA) as unknown as Schema, '2020-12', false)
export function validateTranscriptionAdoptionDraft(value: unknown): value is TranscriptionAdoptionDraft { return draft.validate(value).valid }
export function validateTranscriptionAdoptionApply(value: unknown): value is TranscriptionAdoptionApply { return apply.validate(value).valid }
