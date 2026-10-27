import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_AUDIO_INSPECTION_SCHEMA, DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA, DOCUMENT_WORKSPACE_AUDIO_INSPECTION_SCHEMA } from '../contracts/document-audio.ts'
import type { DocumentAudioInspect, DocumentWorkspaceAudioImport, DocumentWorkspaceAudioInspect } from '../contracts/document-audio.ts'

const inspectValidator = new Validator(structuredClone(DOCUMENT_AUDIO_INSPECTION_SCHEMA) as unknown as Schema, '2020-12', false)
const importValidator = new Validator(structuredClone(DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA) as unknown as Schema, '2020-12', false)
export const validateDocumentAudioInspect = (value: unknown): value is DocumentAudioInspect => inspectValidator.validate(value).valid
export const validateDocumentWorkspaceAudioImport = (value: unknown): value is DocumentWorkspaceAudioImport => importValidator.validate(value).valid

const workspaceInspectValidator = new Validator(structuredClone(DOCUMENT_WORKSPACE_AUDIO_INSPECTION_SCHEMA) as unknown as Schema, '2020-12', false)
export const validateDocumentWorkspaceAudioInspect = (value: unknown): value is DocumentWorkspaceAudioInspect => workspaceInspectValidator.validate(value).valid
