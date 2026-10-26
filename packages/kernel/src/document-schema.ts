import type { Schema } from '@cfworker/json-schema'
import { ASSET_TITLE_MAX_LENGTH, DOCUMENT_SCHEMA_VERSION } from './contracts/document.ts'

const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` })
const string: Schema = { type: 'string' }
const id: Schema = { type: 'string', minLength: 1, maxLength: 200, pattern: '^[^\\u0000-\\u001f]+$', not: { enum: ['__proto__', 'constructor', 'prototype'] } }
const positive: Schema = { type: 'number', exclusiveMinimum: 0 }
const nonnegative: Schema = { type: 'number', minimum: 0 }
const integer: Schema = { type: 'integer', minimum: 0 }
const list = (items: Schema): Schema => ({ type: 'array', items })
const ids: Schema = { type: 'array', items: id, uniqueItems: true }
const record = (value: Schema): Schema => ({ type: 'object', additionalProperties: value })
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const tag = (type: string): Schema => ({ const: type })
const scope = { only: list(string), audience: list(string) }
const style = object({ alignment: { enum: ['left', 'center', 'right', 'justify'] }, color: string, background: string }, [])
const exclusiveCode = [{ required: ['value'], not: { required: ['origin'] } }, { required: ['origin'], not: { required: ['value'] } }]
const rich = (type: string, properties: Record<string, Schema>, required: string[] = Object.keys(properties)): Schema => object({ id, type: tag(type), ...properties }, ['id', 'type', ...required])
const block = (type: string, properties: Record<string, Schema>, required: string[] = Object.keys(properties)): Schema => object({ id, type: tag(type), ...scope, ...properties }, ['id', 'type', ...required])

/** Public authoring schema; domain graph checks are shared by the UI, agent and compiler validator. */
export const DOCUMENT_JSON_SCHEMA: Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:presmium:teaching-document:1',
  ...object({
    schemaVersion: { const: DOCUMENT_SCHEMA_VERSION }, id,
    metadata: object({ title: string, description: string, tags: list(string), lang: { type: 'string', minLength: 1 }, plugins: list(string), presmium: record(ref('JsonObject')), renderers: record(ref('JsonObject')), execute: ref('JsonObject'), checks: ref('JsonObject'), translations: record(string), translationOf: object({ entry: string, digest: string }) }, ['title', 'lang']),
    sectionOrder: { ...ids, minItems: 1 }, sections: record(ref('Section')), blocks: record(ref('Block')),
    steps: record(ref('Step')), narrations: record(ref('Narration')), assets: record(ref('Asset')),
    definitions: record(ref('Definition')), production: ref('Production'), comments: record(ref('Thread')),
  }, ['schemaVersion', 'id', 'metadata', 'sectionOrder', 'sections', 'blocks', 'steps', 'narrations', 'assets', 'definitions', 'production']),
  $defs: {
    JsonValue: { anyOf: [{ type: ['null', 'boolean', 'number', 'string'] }, { type: 'array', items: ref('JsonValue') }, ref('JsonObject')] },
    JsonObject: { type: 'object', additionalProperties: ref('JsonValue') },
    JsonSchema: { anyOf: [{ type: 'boolean' }, ref('JsonObject')] },
    Layout: object({ type: { enum: ['stack', 'columns', 'canvas', 'scrolly'] }, properties: ref('JsonObject'), renderers: record(ref('JsonObject')) }, ['type']),
    Section: object({ id, title: string, level: { type: 'integer', minimum: 1, maximum: 6 }, children: ids, stepOrder: { ...ids, minItems: 1 }, layout: ref('Layout'), audience: list(string), config: record(ref('JsonObject')) }, ['id', 'title', 'children', 'stepOrder', 'layout']),
    Mark: { oneOf: [object({ type: { enum: ['bold', 'italic', 'underline', 'strike', 'code'] } }), object({ type: { enum: ['color', 'background'] }, value: string })] },
    Inline: { oneOf: [
      object({ type: tag('text'), text: string, marks: list(ref('Mark')) }, ['type', 'text']),
      object({ type: tag('link'), href: string, children: list(ref('Inline')) }),
      object({ type: tag('math'), value: string }), object({ type: tag('break') }),
      object({ type: tag('extension'), kind: id, schemaVersion: { type: 'integer', minimum: 1 }, data: ref('JsonObject'), fallback: string }),
    ] },
    RichTextNode: { oneOf: [
      rich('paragraph', { children: list(ref('Inline')), style }, ['children']),
      rich('heading', { level: { type: 'integer', minimum: 1, maximum: 6 }, children: list(ref('Inline')), style }, ['level', 'children']),
      rich('list', { ordered: { type: 'boolean' }, start: { type: 'integer', minimum: 1 }, children: list(ref('ListItem')) }, ['ordered', 'children']),
      rich('blockquote', { children: list(ref('RichTextNode')) }),
      rich('code', { language: string, value: string }), rich('math', { value: string }),
      rich('table', { children: list(ref('TableRow')), headerRows: integer, headerColumns: integer, columnWidths: list(positive) }, ['children']),
      rich('extension', { kind: id, schemaVersion: { type: 'integer', minimum: 1 }, data: ref('JsonObject'), fallback: list(ref('RichTextNode')) }),
    ] },
    ListItem: rich('listItem', { children: list(ref('RichTextNode')), checked: { type: 'boolean' } }, ['children']),
    TableRow: rich('tableRow', { children: list(ref('TableCell')) }),
    TableCell: rich('tableCell', { children: list(ref('Inline')), style, colspan: { type: 'integer', minimum: 1 }, rowspan: { type: 'integer', minimum: 1 } }, ['children']),
    CodeReference: object({ anchor: { type: 'string', minLength: 1 }, pin: string, repo: string, highlightRegions: record({ type: 'string', minLength: 1 }) }, ['anchor']),
    VariantReference: object({ anchor: { type: 'string', minLength: 1 }, pin: string, repo: string }, ['anchor']),
    CodeVariant: { ...object({ id, title: string, value: string, origin: ref('VariantReference') }, ['id', 'title']), oneOf: exclusiveCode },
    CodeExecution: object({ args: record(string), stdin: string, timeoutMs: positive, executor: string, when: { enum: ['compile', 'live', 'both'] }, session: string }, ['when']),
    Block: { oneOf: [
      block('text', { content: list(ref('RichTextNode')), reveal: object({ type: tag('items'), order: ids }) }, ['content']),
      block('container', { layout: { enum: ['stack', 'columns', 'tabs'] }, children: ids, properties: object({ title: string, columnWidths: list(positive), tabTitles: list(string) }, []) }),
      block('image', { assetId: id, alt: string, caption: list(ref('Inline')), width: positive, alignment: { enum: ['left', 'center', 'right', 'justify'] } }, ['assetId', 'alt']),
      { ...block('code', { language: string, value: string, origin: ref('CodeReference'), title: string, execution: ref('CodeExecution'), highlight: record(list({ type: 'integer', minimum: 1 })), variants: list(ref('CodeVariant')), echo: { type: 'boolean' } }, ['language']), oneOf: exclusiveCode },
      block('component', { definitionId: id, parameters: ref('JsonObject'), children: ids }, ['definitionId', 'parameters']),
    ] },
    Visual: object({ blockId: id, visible: { type: 'boolean' }, state: id, parameters: ref('JsonObject') }, ['blockId', 'visible']),
    Step: object({ id, sectionId: id, title: string, visuals: list(ref('Visual')), narrationIds: ids, inherits: id }, ['id', 'sectionId', 'visuals', 'narrationIds']),
    NarrationNode: { oneOf: [object({ type: tag('text'), text: string }), object({ type: tag('pronunciation'), display: string, spoken: string }), object({ id, type: tag('cue'), action: { type: 'string', minLength: 1 }, target: object({ blockId: id, element: string }, ['blockId']), parameters: ref('JsonObject') }, ['id', 'type', 'action'])] },
    Narration: object({ id, content: list(ref('NarrationNode')) }),
    Asset: object({ id, kind: { enum: ['image', 'audio', 'video', 'file'] }, location: { type: 'string', minLength: 1 }, title: { type: 'string', minLength: 1, maxLength: ASSET_TITLE_MAX_LENGTH }, fingerprint: string, mediaType: string }, ['id', 'kind', 'location']),
    Implementation: { oneOf: [object({ type: tag('file'), path: { type: 'string', minLength: 1 }, exportName: string, fingerprint: string }, ['type', 'path']), object({ type: tag('module'), specifier: { type: 'string', minLength: 1 }, exportName: string }, ['type', 'specifier']), object({ type: tag('plugin'), plugin: id, name: id })] },
    State: object({ id, title: string, parameterSchema: ref('JsonSchema'), legacyIndex: integer }, ['id']),
    Definition: object({ id, kind: { type: 'string', minLength: 1 }, schemaVersion: { type: 'integer', minimum: 1 }, implementation: ref('Implementation'), parameterSchema: ref('JsonSchema'), states: list(ref('State')), data: ref('JsonObject') }, ['id', 'kind', 'schemaVersion', 'implementation', 'parameterSchema', 'states']),
    VoiceSource: { oneOf: [object({ type: tag('none') }), object({ type: tag('tts'), voice: object({ voice: { type: 'string', minLength: 1 }, engine: string, rate: positive, style: string }, ['voice']) }), object({ type: tag('recording'), assetId: id })] },
    StepProduction: object({ narrationStart: { enum: ['with-animation', 'after-animation'] }, minimumHoldMs: nonnegative, trailingPauseMs: nonnegative, voiceSource: ref('VoiceSource') }, []),
    MediaClip: object({ id, assetId: id, sourceRange: object({ startMs: nonnegative, endMs: nonnegative }), attachment: object({ stepId: id, offsetMs: nonnegative }), volume: { type: 'number', minimum: 0, maximum: 1 }, muted: { type: 'boolean' } }, ['id', 'assetId', 'sourceRange', 'attachment', 'volume']),
    Production: object({ defaults: ref('StepProduction'), sectionOverrides: record(ref('StepProduction')), stepOverrides: record(ref('StepProduction')), narrationOverrides: record(object({ narrationStart: { enum: ['with-animation', 'after-animation'] } })), cueTimings: record(object({ pauseMs: nonnegative })), mediaClips: list(ref('MediaClip')) }, ['defaults', 'stepOverrides', 'mediaClips']),
    TextPoint: object({ blockId: { type: 'string', minLength: 1, maxLength: 205 }, offset: integer }),
    Comment: object({ id, type: tag('comment'), userId: id, createdAt: string, updatedAt: string, deletedAt: string, content: list(ref('RichTextNode')), metadata: ref('JsonObject'), reactions: list(object({ emoji: string, createdAt: string, userIds: ids })) }, ['id', 'type', 'userId', 'createdAt', 'updatedAt', 'reactions']),
    Thread: object({ id, type: tag('thread'), createdAt: string, updatedAt: string, resolved: { type: 'boolean' }, resolvedUpdatedAt: string, resolvedBy: id, metadata: ref('JsonObject'), deletedAt: string, anchor: object({ from: ref('TextPoint'), to: ref('TextPoint') }), comments: list(ref('Comment')) }, ['id', 'type', 'createdAt', 'updatedAt', 'resolved', 'comments']),
  },
}
