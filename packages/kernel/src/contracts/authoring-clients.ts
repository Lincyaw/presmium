import type { Schema } from '@cfworker/json-schema'
import type { CanonicalSource } from '../ir.ts'
import type { Member } from './server.ts'
import type { ProductionBinding, ProductionPlaybackState } from './production.ts'
import { PRODUCTION_PLAYBACK_RATES } from './production.ts'
import { DOCUMENT_PAGE_DUPLICATION_SCHEMA } from './authoring.ts'

export const AUTHORING_CLIENT_MAX_REQUEST_CHARS = 4096
export const AUTHORING_CLIENT_MAX_RESPONSE_CHARS = 7168
export const AUTHORING_CLIENT_MAX_CLIENTS = 16
export const AUTHORING_CLIENT_MAX_REQUESTS = 64
export const AUTHORING_CLIENT_REQUEST_TIMEOUT_MS = 30000
export const AUTHORING_CLIENT_ACK_MAX_BYTES = 32768
export const AUTHORING_CLIENT_EVENT_MAX_BYTES = 8 << 10
export const AUTHORING_CLIENT_ACTIONS = ['state.read', 'source.flush', 'preview.prepare', 'comment-drafts.inspect', 'comment-drafts.read', 'component-drafts.inspect', 'component-drafts.read', 'component-drafts.restore', 'component-drafts.discard', 'playback.pause', 'position.step', 'playback.play', 'playback.seek', 'playback.rate'] as const
export type AuthoringClientActionType = typeof AUTHORING_CLIENT_ACTIONS[number]
export type AuthoringClientAction =
  | { type: 'state.read' }
  | { type: 'source.flush' }
  | { type: 'preview.prepare' }
  | { type: 'comment-drafts.inspect', cursor?: { after: string, token: string }, limit?: number }
  | { type: 'comment-drafts.read', draft: ClientCommentDraftReference, offset: number, maxChars?: number }
  | { type: 'component-drafts.inspect', cursor?: { after: string, token: string }, limit?: number }
  | { type: 'component-drafts.read', draft: ClientComponentDraftReference, offset: number, maxChars?: number }
  | { type: 'component-drafts.restore', draft: ClientComponentDraftReference, expectedCurrent: ClientComponentDraftReference | null }
  | { type: 'component-drafts.discard', draft: ClientComponentDraftReference, current: boolean }
  | { type: 'playback.pause' }
  | { type: 'position.step', sectionId: string, stepId: string }
  | { type: 'playback.play', binding: ProductionBinding }
  | { type: 'playback.seek', binding: ProductionBinding, timeMs: number }
  | { type: 'playback.rate', binding: ProductionBinding, rate: number }

export interface ClientCommentDraftReference { id: string, revision: number, token: string }
export interface ClientComponentDraftReference { id: string, revision: number, token: string, blockId: string, stepId?: string }
/** No parameter values, baselines, workspace identity or member IDs enter this metadata. */
export interface ClientComponentDraftMetadata {
  draft: ClientComponentDraftReference
  definitionId: string
  current: boolean
  storage: 'durable' | 'session'
  status: 'available' | 'pending' | 'session-only'
  updatedAt: number
  baseVersion: string
  sourceCurrent: boolean
  composing: boolean
  reset: boolean
}
/** Explicit inspection deliberately excludes content, source signatures, comment baselines and pending values. */
export interface ClientCommentDraftMetadata {
  draft: ClientCommentDraftReference
  kind: 'create' | 'reply' | 'edit'
  storage: 'durable' | 'session'
  updatedAt: number
  baseVersion: string
  composing: boolean
  pendingSubmission: boolean
  threadId?: string
  commentId?: string
}
export type AuthoringClientActionResult =
  | { type: 'comment-drafts.inspect', family: 'comment', coverage: 'stored-and-session' | 'session-only', skippedInvalid: number, token: string, drafts: ClientCommentDraftMetadata[], next?: { after: string, token: string } }
  | { type: 'comment-drafts.read', family: 'comment', draft: ClientCommentDraftReference, storage: 'durable' | 'session', format: 'presmium-rich-text-json-v1', offset: number, endOffset: number, totalUtf16: number, totalUtf8: number, sha256: string, jsonText: string }
  | { type: 'component-drafts.inspect', family: 'component', coverage: 'stored-and-session' | 'session-only', skippedInvalid: number, token: string, drafts: ClientComponentDraftMetadata[], next?: { after: string, token: string } }
  | { type: 'component-drafts.read', family: 'component', draft: ClientComponentDraftReference, storage: 'durable' | 'session', format: 'presmium-component-parameters-json-v1', offset: number, endOffset: number, totalUtf16: number, totalUtf8: number, sha256: string, jsonText: string }
  | { type: 'component-drafts.restore', family: 'component', draft: ClientComponentDraftReference, restored: ClientComponentDraftMetadata, preservedCurrent: ClientComponentDraftReference | null }
  | { type: 'component-drafts.discard', family: 'component', draft: ClientComponentDraftReference, current: boolean, discarded: true }

/** Reports contain no editor text. Time is an observed sample, never a server-estimated playhead. */
export interface AuthoringClientSnapshot {
  revision: number
  source: CanonicalSource
  view: 'document' | 'present'
  editing: { dirty: boolean, saving: boolean, composing: boolean, conflicted: boolean, locked: boolean, loading: boolean }
  interaction: string
  position?: { sectionId: string, stepId?: string }
  binding?: ProductionBinding
  preview?: { status: 'unprepared' | 'preparing' | 'prepared' | 'unavailable', source?: CanonicalSource, irRevision?: string, projectRevision?: number }
  playback?: ProductionPlaybackState
  actions: AuthoringClientActionType[]
  unsubmittedContent: 'not-inspected'
}
export interface AuthoringClientConnection { clientId: string, epoch: string, connectionId: string }
/** This credential belongs to the host-side transport; it is never returned by MCP client/state reads. */
export interface AuthoringClientLease extends AuthoringClientConnection { credential: string }
export interface AuthoringClientOpen { clientId: string, epoch: string, snapshot: AuthoringClientSnapshot }
export interface AuthoringClientDescriptor extends AuthoringClientConnection {
  document: string
  connected: boolean
  observedAt: string
  verification: 'reported-state'
  snapshot: AuthoringClientSnapshot
}
export interface AuthoringClientList { document: string, clients: AuthoringClientDescriptor[], nextAfter?: string, unavailable: readonly string[] }
export interface AuthoringClientRequest {
  clientId: string
  epoch: string
  requestId: string
  source: CanonicalSource
  expectedClientState: { connectionId: string, revision: number }
  action: AuthoringClientAction
}
export type AuthoringClientRequestState = 'sent' | 'executing' | 'done' | 'refused' | 'failed' | 'expired'
export interface AuthoringClientRequestResult extends AuthoringClientConnection {
  document: string
  requestId: string
  action: AuthoringClientActionType
  source: CanonicalSource
  state: AuthoringClientRequestState
  admittedAt: string
  expiresAt: string
  observedAt?: string
  snapshot?: AuthoringClientSnapshot
  result?: AuthoringClientActionResult
  error?: { code: string }
  verification: 'not-acknowledged' | 'browser-acknowledged'
  current: boolean
}
export type AuthoringClientEvent =
  | { type: 'connected', connectionId: string }
  | { type: 'request', request: AuthoringClientRequest, expiresAt: string }
  | { type: 'cancel', requestId: string, connectionId: string }
export interface AuthoringClientReport { sequence: number, snapshot: AuthoringClientSnapshot }
export interface AuthoringClientAcknowledgement extends AuthoringClientReport {
  requestId: string
  state: 'executing' | 'done' | 'refused' | 'failed'
  error?: { code: string }
  result?: AuthoringClientActionResult
}
export interface AuthoringClients {
  list(document: string, query: { clientId?: string, after?: string }, member: Member): Promise<AuthoringClientList>
  request(document: string, request: AuthoringClientRequest, member: Member): Promise<AuthoringClientRequestResult>
  get(document: string, query: { clientId: string, epoch: string, requestId: string }, member: Member): Promise<AuthoringClientRequestResult>
}

/** Reserve the complete receipt and the host-only lease, rather than budgeting only the text fragment. */
export function authoringClientResultFits(context: { request: AuthoringClientRequest, connection: AuthoringClientConnection, document: string, snapshot: AuthoringClientSnapshot }, result: AuthoringClientActionResult): boolean {
  const { request, document, snapshot } = context, time = '2000-01-01T00:00:00.000Z'
  const connection = { clientId: context.connection.clientId, epoch: context.connection.epoch, connectionId: context.connection.connectionId }
  const receipt: AuthoringClientRequestResult = { ...connection, document, requestId: request.requestId, action: request.action.type, source: request.source,
    state: 'done', admittedAt: time, expiresAt: time, observedAt: time, snapshot, result, verification: 'browser-acknowledged', current: false }
  const body = { connection: { ...connection, credential: '0'.repeat(100) }, report: { sequence: Number.MAX_SAFE_INTEGER, snapshot, result, requestId: request.requestId, state: 'done' } }
  const wire = JSON.stringify(body)
  const frame = JSON.stringify({ type: 'authoring-client-publish', id: '0'.repeat(80), connectionId: connection.connectionId, sequence: Number.MAX_SAFE_INTEGER, kind: 'ack', value: body.report })
  // Clock samples can change without changing the client revision; recheck the actual snapshot before sending.
  return JSON.stringify(receipt, null, 2).length <= AUTHORING_CLIENT_MAX_RESPONSE_CHARS - 128
    && wire.length <= AUTHORING_CLIENT_MAX_RESPONSE_CHARS - 128 && new TextEncoder().encode(wire).byteLength <= AUTHORING_CLIENT_ACK_MAX_BYTES
    && new TextEncoder().encode(frame).byteLength <= AUTHORING_CLIENT_EVENT_MAX_BYTES - 128
}

const id: Schema = { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9.-]+$' }
const entity: Schema = { type: 'string', minLength: 1, maxLength: 200 }
const integer: Schema = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
const number: Schema = { type: 'number', minimum: 0 }
const bool: Schema = { type: 'boolean' }
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', additionalProperties: false, properties, required })
const digest: Schema = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const draftReference = object({ id: entity, revision: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, token: digest })
const componentDraftReference = object({ id: entity, revision: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, token: digest, blockId: entity, stepId: entity }, ['id', 'revision', 'token', 'blockId'])
const componentMetadata = object({ draft: componentDraftReference, definitionId: entity, current: bool, storage: { enum: ['durable', 'session'] }, status: { enum: ['available', 'pending', 'session-only'] }, updatedAt: integer, baseVersion: entity, sourceCurrent: bool, composing: bool, reset: bool })
const nullableComponentReference: Schema = { oneOf: [componentDraftReference, { type: 'null' }] }
const cursor = object({ after: entity, token: digest })
export const AUTHORING_CLIENT_ACTION_RESULT_SCHEMA: Schema = { oneOf: [
  object({ type: { const: 'comment-drafts.inspect' }, family: { const: 'comment' }, coverage: { enum: ['stored-and-session', 'session-only'] }, skippedInvalid: integer,
    token: digest, drafts: { type: 'array', maxItems: 10, items: object({ draft: draftReference, kind: { enum: ['create', 'reply', 'edit'] }, storage: { enum: ['durable', 'session'] }, updatedAt: integer, baseVersion: entity, composing: bool, pendingSubmission: bool, threadId: entity, commentId: entity }, ['draft', 'kind', 'storage', 'updatedAt', 'baseVersion', 'composing', 'pendingSubmission']) }, next: cursor }, ['type', 'family', 'coverage', 'skippedInvalid', 'token', 'drafts']),
  object({ type: { const: 'comment-drafts.read' }, family: { const: 'comment' }, draft: draftReference, storage: { enum: ['durable', 'session'] }, format: { const: 'presmium-rich-text-json-v1' }, offset: integer, endOffset: integer, totalUtf16: integer, totalUtf8: integer, sha256: digest, jsonText: { type: 'string', maxLength: 2048 } }),
  object({ type: { const: 'component-drafts.inspect' }, family: { const: 'component' }, coverage: { enum: ['stored-and-session', 'session-only'] }, skippedInvalid: integer,
    token: digest, drafts: { type: 'array', maxItems: 10, items: componentMetadata }, next: cursor }, ['type', 'family', 'coverage', 'skippedInvalid', 'token', 'drafts']),
  object({ type: { const: 'component-drafts.read' }, family: { const: 'component' }, draft: componentDraftReference, storage: { enum: ['durable', 'session'] }, format: { const: 'presmium-component-parameters-json-v1' }, offset: integer, endOffset: integer, totalUtf16: integer, totalUtf8: integer, sha256: digest, jsonText: { type: 'string', maxLength: 2048 } }),
  object({ type: { const: 'component-drafts.restore' }, family: { const: 'component' }, draft: componentDraftReference, restored: componentMetadata, preservedCurrent: nullableComponentReference }),
  object({ type: { const: 'component-drafts.discard' }, family: { const: 'component' }, draft: componentDraftReference, current: bool, discarded: { const: true } }),
] }
const source = DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.source as unknown as Schema
const binding = object({ source, irRevision: entity, planId: entity })
const position = object({ timeMs: number, stepTimeMs: number, sectionId: entity, stepId: entity, durationMs: number, playing: bool, rate: { type: 'number', exclusiveMinimum: 0, maximum: 16 }, trying: bool }, ['timeMs', 'durationMs', 'playing', 'rate', 'trying'])
const playback = object({ binding, status: { enum: ['loading', 'ready', 'estimated', 'unavailable', 'failed'] }, position, error: { type: 'string', maxLength: 300 } }, ['binding', 'status'])
export const AUTHORING_CLIENT_SNAPSHOT_SCHEMA: Schema = object({
  revision: integer, source, view: { enum: ['document', 'present'] }, editing: object({ dirty: bool, saving: bool, composing: bool, conflicted: bool, locked: bool, loading: bool }),
  interaction: { type: 'string', maxLength: 200 }, position: object({ sectionId: entity, stepId: entity }, ['sectionId']), binding, playback,
  preview: { oneOf: [object({ status: { enum: ['unprepared', 'preparing', 'unavailable'] } }), object({ status: { const: 'prepared' }, source, irRevision: entity, projectRevision: integer })] },
  actions: { type: 'array', items: { enum: [...AUTHORING_CLIENT_ACTIONS] }, maxItems: AUTHORING_CLIENT_ACTIONS.length, uniqueItems: true }, unsubmittedContent: { const: 'not-inspected' },
}, ['revision', 'source', 'view', 'editing', 'interaction', 'actions', 'unsubmittedContent'])
const action = (type: string, properties: Record<string, Schema> = {}): Schema => object({ type: { const: type }, ...properties })
export const AUTHORING_CLIENT_ACTION_SCHEMA: Schema = { oneOf: [
  action('state.read'), action('source.flush'), action('preview.prepare'), action('playback.pause'), action('position.step', { sectionId: entity, stepId: entity }),
  object({ type: { const: 'comment-drafts.inspect' }, cursor, limit: { type: 'integer', minimum: 1, maximum: 10 } }, ['type']),
  object({ type: { const: 'comment-drafts.read' }, draft: draftReference, offset: integer, maxChars: { type: 'integer', minimum: 2, maximum: 2048 } }, ['type', 'draft', 'offset']),
  object({ type: { const: 'component-drafts.inspect' }, cursor, limit: { type: 'integer', minimum: 1, maximum: 10 } }, ['type']),
  object({ type: { const: 'component-drafts.read' }, draft: componentDraftReference, offset: integer, maxChars: { type: 'integer', minimum: 2, maximum: 2048 } }, ['type', 'draft', 'offset']),
  action('component-drafts.restore', { draft: componentDraftReference, expectedCurrent: nullableComponentReference }),
  action('component-drafts.discard', { draft: componentDraftReference, current: bool }),
  action('playback.play', { binding }), action('playback.seek', { binding, timeMs: number }), action('playback.rate', { binding, rate: { enum: [...PRODUCTION_PLAYBACK_RATES] } }),
] }
export const AUTHORING_CLIENT_REQUEST_SCHEMA: Schema = object({ clientId: id, epoch: id, requestId: id, source, expectedClientState: object({ connectionId: id, revision: integer }), action: AUTHORING_CLIENT_ACTION_SCHEMA })
export const AUTHORING_CLIENT_QUERY_SCHEMA: Schema = object({ clientId: id, after: id }, [])
export const AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA: Schema = object({ clientId: id, epoch: id, requestId: id })
export const AUTHORING_CLIENT_OPEN_SCHEMA: Schema = object({ clientId: id, epoch: id, snapshot: AUTHORING_CLIENT_SNAPSHOT_SCHEMA })
export const AUTHORING_CLIENT_REPORT_SCHEMA: Schema = object({ sequence: integer, snapshot: AUTHORING_CLIENT_SNAPSHOT_SCHEMA })
export const AUTHORING_CLIENT_ACK_SCHEMA: Schema = object({ sequence: integer, snapshot: AUTHORING_CLIENT_SNAPSHOT_SCHEMA, requestId: id, state: { enum: ['executing', 'done', 'refused', 'failed'] }, error: object({ code: { type: 'string', minLength: 1, maxLength: 160 } }), result: AUTHORING_CLIENT_ACTION_RESULT_SCHEMA }, ['sequence', 'snapshot', 'requestId', 'state'])
export const AUTHORING_CLIENT_CONNECTION_SCHEMA: Schema = object({ clientId: id, epoch: id, connectionId: id, credential: { type: 'string', minLength: 32, maxLength: 100 } })
