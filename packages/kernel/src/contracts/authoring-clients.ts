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
export const AUTHORING_CLIENT_ACTIONS = ['state.read', 'source.flush', 'playback.pause', 'position.step', 'playback.play', 'playback.seek', 'playback.rate'] as const
export type AuthoringClientActionType = typeof AUTHORING_CLIENT_ACTIONS[number]
export type AuthoringClientAction =
  | { type: 'state.read' }
  | { type: 'source.flush' }
  | { type: 'playback.pause' }
  | { type: 'position.step', sectionId: string, stepId: string }
  | { type: 'playback.play', binding: ProductionBinding }
  | { type: 'playback.seek', binding: ProductionBinding, timeMs: number }
  | { type: 'playback.rate', binding: ProductionBinding, rate: number }

/** Reports contain no editor text. Time is an observed sample, never a server-estimated playhead. */
export interface AuthoringClientSnapshot {
  revision: number
  source: CanonicalSource
  view: 'document' | 'present'
  editing: { dirty: boolean, saving: boolean, composing: boolean, conflicted: boolean, locked: boolean, loading: boolean }
  interaction: string
  position?: { sectionId: string, stepId?: string }
  binding?: ProductionBinding
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
}
export interface AuthoringClients {
  list(document: string, query: { clientId?: string, after?: string }, member: Member): Promise<AuthoringClientList>
  request(document: string, request: AuthoringClientRequest, member: Member): Promise<AuthoringClientRequestResult>
  get(document: string, query: { clientId: string, epoch: string, requestId: string }, member: Member): Promise<AuthoringClientRequestResult>
}

const id: Schema = { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9.-]+$' }
const entity: Schema = { type: 'string', minLength: 1, maxLength: 200 }
const integer: Schema = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
const number: Schema = { type: 'number', minimum: 0 }
const bool: Schema = { type: 'boolean' }
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', additionalProperties: false, properties, required })
const source = DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.source as unknown as Schema
const binding = object({ source, irRevision: entity, planId: entity })
const position = object({ timeMs: number, stepTimeMs: number, sectionId: entity, stepId: entity, durationMs: number, playing: bool, rate: { type: 'number', exclusiveMinimum: 0, maximum: 16 }, trying: bool }, ['timeMs', 'durationMs', 'playing', 'rate', 'trying'])
const playback = object({ binding, status: { enum: ['loading', 'ready', 'estimated', 'unavailable', 'failed'] }, position, error: { type: 'string', maxLength: 300 } }, ['binding', 'status'])
export const AUTHORING_CLIENT_SNAPSHOT_SCHEMA: Schema = object({
  revision: integer, source, view: { enum: ['document', 'present'] }, editing: object({ dirty: bool, saving: bool, composing: bool, conflicted: bool, locked: bool, loading: bool }),
  interaction: { type: 'string', maxLength: 200 }, position: object({ sectionId: entity, stepId: entity }, ['sectionId']), binding, playback,
  actions: { type: 'array', items: { enum: [...AUTHORING_CLIENT_ACTIONS] }, maxItems: AUTHORING_CLIENT_ACTIONS.length, uniqueItems: true }, unsubmittedContent: { const: 'not-inspected' },
}, ['revision', 'source', 'view', 'editing', 'interaction', 'actions', 'unsubmittedContent'])
const action = (type: string, properties: Record<string, Schema> = {}): Schema => object({ type: { const: type }, ...properties })
export const AUTHORING_CLIENT_ACTION_SCHEMA: Schema = { oneOf: [
  action('state.read'), action('source.flush'), action('playback.pause'), action('position.step', { sectionId: entity, stepId: entity }),
  action('playback.play', { binding }), action('playback.seek', { binding, timeMs: number }), action('playback.rate', { binding, rate: { enum: [...PRODUCTION_PLAYBACK_RATES] } }),
] }
export const AUTHORING_CLIENT_REQUEST_SCHEMA: Schema = object({ clientId: id, epoch: id, requestId: id, source, expectedClientState: object({ connectionId: id, revision: integer }), action: AUTHORING_CLIENT_ACTION_SCHEMA })
export const AUTHORING_CLIENT_QUERY_SCHEMA: Schema = object({ clientId: id, after: id }, [])
export const AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA: Schema = object({ clientId: id, epoch: id, requestId: id })
export const AUTHORING_CLIENT_OPEN_SCHEMA: Schema = object({ clientId: id, epoch: id, snapshot: AUTHORING_CLIENT_SNAPSHOT_SCHEMA })
export const AUTHORING_CLIENT_REPORT_SCHEMA: Schema = object({ sequence: integer, snapshot: AUTHORING_CLIENT_SNAPSHOT_SCHEMA })
export const AUTHORING_CLIENT_ACK_SCHEMA: Schema = object({ sequence: integer, snapshot: AUTHORING_CLIENT_SNAPSHOT_SCHEMA, requestId: id, state: { enum: ['executing', 'done', 'refused', 'failed'] }, error: object({ code: { type: 'string', minLength: 1, maxLength: 160 } }) }, ['sequence', 'snapshot', 'requestId', 'state'])
export const AUTHORING_CLIENT_CONNECTION_SCHEMA: Schema = object({ clientId: id, epoch: id, connectionId: id, credential: { type: 'string', minLength: 32, maxLength: 100 } })
