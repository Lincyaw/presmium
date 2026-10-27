import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_JSON_SCHEMA } from './document-schema.ts'
import type { DocumentChange } from './contracts/workspace.ts'
import type { DocumentIssue } from './contracts/document.ts'

const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` })
const id: Schema = { type: 'string', minLength: 1, maxLength: 200 }
const index: Schema = { type: 'integer', minimum: 0 }
const operation = (type: string, fields: Record<string, Schema>, required = Object.keys(fields)) => object({ type: { const: type }, ...fields }, ['type', ...required])
const { $schema: _schema, $id: _id, $defs, ...documentSchema } = structuredClone(DOCUMENT_JSON_SCHEMA) as Exclude<Schema, boolean>

/** Shared strict request schema; nested values reuse the canonical document definitions. */
export const DOCUMENT_CHANGE_JSON_SCHEMA: Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $ref: '#/$defs/DocumentChange',
  $defs: {
    ...$defs,
    TeachingDocument: documentSchema,
    DocumentOperation: { oneOf: [
      operation('insertBlock', { sectionId: id, parentId: id, index, block: ref('Block') }, ['sectionId', 'index', 'block']),
      operation('moveBlock', { blockId: id, sectionId: id, parentId: id, index }, ['blockId', 'sectionId', 'index']),
      operation('deleteBlock', { blockId: id }),
      operation('updateText', { blockId: id, content: { type: 'array', items: ref('RichTextNode') } }),
      operation('updateSection', { sectionId: id, title: { type: 'string' }, layout: ref('Layout') }, ['sectionId']),
      operation('setStepState', { stepId: id, visuals: { type: 'array', items: ref('Visual') }, inherits: id }, ['stepId', 'visuals']),
      operation('setNarration', { narration: ref('Narration'), stepId: id, index }, ['narration']),
      operation('setTiming', { stepId: id, sectionId: id, value: ref('StepProduction') }, ['value']),
      operation('replaceAsset', { asset: ref('Asset') }),
    ] },
    DocumentChange: {
      ...object({ id, baseDocumentVersion: { type: 'string', minLength: 1, maxLength: 128 }, replacement: ref('TeachingDocument'), operations: { type: 'array', minItems: 1, maxItems: 1000, items: ref('DocumentOperation') }, fileChanges: { type: 'array', maxItems: 15, items: object({ path: { type: 'string', minLength: 1 }, content: { type: 'string' }, base: { type: ['string', 'null'] } }) } }, ['id', 'baseDocumentVersion']),
      oneOf: [{ required: ['replacement'], not: { required: ['operations'] } }, { required: ['operations'], not: { required: ['replacement'] } }],
    },
  },
}

const validator = new Validator(structuredClone(DOCUMENT_CHANGE_JSON_SCHEMA), '2020-12', false)

export function validateDocumentChange(value: unknown): { change?: DocumentChange, issues: DocumentIssue[] } {
  const checked = validator.validate(value)
  const issues: DocumentIssue[] = checked.errors.slice(0, 100).map(error => ({ path: error.instanceLocation.replace(/^#/, ''), code: `schema.${error.keyword}`, message: error.error, severity: 'error' }))
  return { ...checked.valid ? { change: value as DocumentChange } : {}, issues }
}
