import type { Schema } from '@cfworker/json-schema'
import type { Member } from './server.ts'
import type { AuthoringClientConnection, AuthoringClientLease, AuthoringClientRequestState } from './authoring-clients.ts'

/** Window lifetime survives home and document changes; it never asserts a CanonicalSource. */
export const AUTHORING_WINDOW_ACTIONS = ['window.read', 'document.open', 'document.close'] as const
export type AuthoringWindowAction = { type: 'window.read' } | { type: 'document.open', document: string } | { type: 'document.close' }
export type AuthoringWindowLocation = { type: 'home' } | { type: 'document', document: string, documentId?: string, status: 'loading' | 'ready' | 'failed' }
export interface AuthoringWindowSnapshot { revision: number, location: AuthoringWindowLocation, actions: (typeof AUTHORING_WINDOW_ACTIONS[number])[] }
export interface AuthoringWindowOpen { clientId: string, epoch: string, snapshot: AuthoringWindowSnapshot }
export interface AuthoringWindowDescriptor extends AuthoringClientConnection { connected: boolean, snapshot: AuthoringWindowSnapshot, observedAt: string, pendingRequest?: { requestId: string, action: AuthoringWindowAction['type'], cancellationRequested?: true } }
export interface AuthoringWindowRequest extends AuthoringClientConnection {
  requestId: string
  revision: number
  action: AuthoringWindowAction
  /** Pinned internally before approval; path reuse cannot select a different document. */
  target?: { document: string, documentId: string }
}
export interface AuthoringWindowRequestResult extends AuthoringClientConnection {
  requestId: string, action: AuthoringWindowAction['type'], state: AuthoringClientRequestState, admittedAt: string, expiresAt: string,
  snapshot?: AuthoringWindowSnapshot, outcome?: 'observed' | 'opened' | 'closed' | 'unchanged', cancellationRequested?: true, error?: { code: string }, acknowledged: boolean, current: boolean
}
export type AuthoringWindowEvent = { type: 'connected', connectionId: string } | { type: 'request', request: AuthoringWindowRequest, expiresAt: string } | { type: 'cancel', connectionId: string, requestId: string }
export interface AuthoringWindowReport { sequence: number, snapshot: AuthoringWindowSnapshot }
export interface AuthoringWindowAcknowledgement extends AuthoringWindowReport { requestId: string, state: 'executing' | 'done' | 'refused' | 'failed', outcome?: AuthoringWindowRequestResult['outcome'], error?: { code: string } }
export type AuthoringWindowReference = Pick<AuthoringWindowRequest, 'clientId' | 'epoch' | 'requestId'>
export interface AuthoringWindows {
  list(query: { clientId?: string, after?: string }, member: Member): Promise<{ scope: 'workspace', clients: AuthoringWindowDescriptor[], nextAfter?: string }>
  request(request: AuthoringWindowRequest, member: Member): Promise<AuthoringWindowRequestResult>
  get(reference: AuthoringWindowReference | string, member: Member): Promise<AuthoringWindowRequestResult>
  cancel(reference: AuthoringWindowReference | string, member: Member): Promise<AuthoringWindowRequestResult>
}

const id: Schema = { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9.-]+$' }
export const AUTHORING_WINDOW_HANDLE_SCHEMA: Schema = id
const directory: Schema = { type: 'string', maxLength: 200 }
const entity: Schema = { type: 'string', minLength: 1, maxLength: 200 }
const integer: Schema = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', additionalProperties: false, properties, required })
const connection = { clientId: id, epoch: id, connectionId: id }
export const AUTHORING_WINDOW_ACTION_SCHEMA: Schema = { oneOf: [object({ type: { const: 'window.read' } }), object({ type: { const: 'document.open' }, document: directory }), object({ type: { const: 'document.close' } })] }
export const AUTHORING_WINDOW_SNAPSHOT_SCHEMA: Schema = object({ revision: integer, location: { oneOf: [object({ type: { const: 'home' } }), object({ type: { const: 'document' }, document: directory, documentId: entity, status: { enum: ['loading', 'ready', 'failed'] } }, ['type', 'document', 'status'])] }, actions: { type: 'array', items: { enum: [...AUTHORING_WINDOW_ACTIONS] }, maxItems: AUTHORING_WINDOW_ACTIONS.length, uniqueItems: true } })
export const AUTHORING_WINDOW_OPEN_SCHEMA: Schema = object({ clientId: id, epoch: id, snapshot: AUTHORING_WINDOW_SNAPSHOT_SCHEMA })
export const AUTHORING_WINDOW_REQUEST_SCHEMA: Schema = object({ ...connection, requestId: id, revision: integer, action: AUTHORING_WINDOW_ACTION_SCHEMA, target: object({ document: directory, documentId: entity }) }, [...Object.keys(connection), 'requestId', 'revision', 'action'])
export const AUTHORING_WINDOW_REPORT_SCHEMA: Schema = object({ sequence: integer, snapshot: AUTHORING_WINDOW_SNAPSHOT_SCHEMA })
export const AUTHORING_WINDOW_ACK_SCHEMA: Schema = object({ sequence: integer, snapshot: AUTHORING_WINDOW_SNAPSHOT_SCHEMA, requestId: id, state: { enum: ['executing', 'done', 'refused', 'failed'] }, outcome: { enum: ['observed', 'opened', 'closed', 'unchanged'] }, error: object({ code: { type: 'string', minLength: 1, maxLength: 160 } }) }, ['sequence', 'snapshot', 'requestId', 'state'])
export type AuthoringWindowLease = AuthoringClientLease
