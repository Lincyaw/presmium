import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_WORKSPACE_IMAGE_INSPECTION_SCHEMA, DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA } from '../contracts/document-image.ts'
import type { DocumentWorkspaceImageInspect, DocumentWorkspaceImageImport } from '../contracts/document-image.ts'
const inspect = new Validator(structuredClone(DOCUMENT_WORKSPACE_IMAGE_INSPECTION_SCHEMA) as unknown as Schema, '2020-12', false)
const importImage = new Validator(structuredClone(DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA) as unknown as Schema, '2020-12', false)
export const validateDocumentWorkspaceImageInspect = (value: unknown): value is DocumentWorkspaceImageInspect => inspect.validate(value).valid
export const validateDocumentWorkspaceImageImport = (value: unknown): value is DocumentWorkspaceImageImport => importImage.validate(value).valid
