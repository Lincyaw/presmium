import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { DOCUMENT_JSON_SCHEMA } from '../document-schema.ts'
import { DOCUMENT_PAGE_DUPLICATION_SCHEMA } from '../contracts/authoring.ts'
import type { DocumentAuthoringActionRequest, DocumentAuthoringActionReference } from '../contracts/authoring-actions.ts'

const id: Schema = { type: 'string', minLength: 1, maxLength: 200 }
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', additionalProperties: false, properties, required })
const action = (type: string, properties: Record<string, Schema>, required = Object.keys(properties)) => object({ type: { const: type }, ...properties }, ['type', ...required])
const content: Schema = { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/$defs/RichTextNode' } }
const metadata: Schema = { $ref: '#/$defs/JsonObject' }
const scope: Schema = { oneOf: [object({ kind: { const: 'document' } }), object({ kind: { const: 'page' }, sectionId: id }), object({ kind: { const: 'step' }, stepId: id }), object({ kind: { const: 'steps' }, stepIds: { type: 'array', minItems: 1, maxItems: 1000, items: id } })] }
const voice: Schema = { oneOf: [{ type: 'null' }, { allOf: [{ $ref: '#/$defs/VoiceSource' }, { properties: { type: { enum: ['none', 'tts'] } } }] }] }

/** Node-only schema reuses the actual canonical rich-text definitions, not BlockNote data. */
export const DOCUMENT_AUTHORING_ACTION_SCHEMA: Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...object({ id, source: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.source as unknown as Schema, action: { $ref: '#/$defs/AuthoringAction' } }),
  $defs: { ...(structuredClone(DOCUMENT_JSON_SCHEMA) as Exclude<Schema, boolean>).$defs,
    AuthoringAction: { oneOf: [
      action('comment.create', { content, anchor: { oneOf: [{ type: 'null' }, object({ from: { $ref: '#/$defs/TextPoint' }, to: { $ref: '#/$defs/TextPoint' } })] }, metadata, commentMetadata: metadata }, ['content', 'anchor']),
      action('comment.reply', { threadId: id, content, metadata }, ['threadId', 'content']),
      action('comment.update', { threadId: id, commentId: id, content, metadata }, ['threadId', 'commentId', 'content']),
      action('comment.react', { threadId: id, commentId: id, emoji: { type: 'string', minLength: 1, maxLength: 32 }, active: { type: 'boolean' } }),
      action('comment.resolve', { threadId: id }), action('comment.reopen', { threadId: id }),
      action('comment.delete', { threadId: id, commentId: id }, ['threadId']),
      action('voice.set', { scope, source: voice, replaceOverrides: { type: 'boolean' } }, ['scope', 'source']),
    ] },
  },
}
export const DOCUMENT_AUTHORING_ACTION_APPLY_SCHEMA: Schema = object({ planId: id, source: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.source as unknown as Schema, digest: { type: 'string', pattern: '^[a-f0-9]{64}$' }, confirmDeletion: { const: true } }, ['planId', 'source', 'digest'])
const request = new Validator(structuredClone(DOCUMENT_AUTHORING_ACTION_SCHEMA), '2020-12', false)
const reference = new Validator(structuredClone(DOCUMENT_AUTHORING_ACTION_APPLY_SCHEMA), '2020-12', false)
export function validateDocumentAuthoringAction(value: unknown): value is DocumentAuthoringActionRequest { return request.validate(value).valid }
export function validateDocumentAuthoringActionReference(value: unknown): value is DocumentAuthoringActionReference { return reference.validate(value).valid }
