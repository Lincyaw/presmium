import type { CanonicalSource } from '../ir.ts'
import type { Member } from './server.ts'
import type { VoiceoverCancellation, VoiceoverJob, VoiceoverRequest, VoiceoverSnapshot, VoicePreviewAnswer, VoicePreviewQuery, VoicePreviewQuote, VoicePreviewRequest } from './voice.ts'
import { defineService } from './service.ts'

export interface VoiceoverStatusQuery { source?: CanonicalSource, revision?: string }
export type VoiceoverStart = Omit<VoiceoverRequest, 'confirmed'>
export type VoicePreviewStart = Omit<VoicePreviewRequest, 'confirmed'>
export type VoicePreviewCheck = VoicePreviewQuery & { source?: CanonicalSource }
export type VoiceoverJobQuery = { id: string } | { intent: string }
export interface VoiceoverProgress { completed: number, failed: number, error?: string }
export interface VoiceoverRunResult extends VoiceoverProgress { state: 'done' | 'failed' | 'stale' | 'cancelled' }
/** A claim on the existing generation lock. Dispose after execution or failed admission. */
export interface PreparedVoiceover {
  source: CanonicalSource
  revision: string
  scope: VoiceoverStart['scope']
  total: number
  run(signal: AbortSignal, progress: (value: VoiceoverProgress) => void): Promise<VoiceoverRunResult>
  dispose(): void
}
export interface VoicePreviewMedia extends Omit<VoicePreviewAnswer, 'audio'> { bytes: Uint8Array, mediaType: string }
/** Stateless plugin execution. The host owns intents and jobs; discovery creates neither. */
export interface VoiceoverExecution {
  status(query: VoiceoverStatusQuery, signal: AbortSignal): Promise<Omit<VoiceoverSnapshot, 'jobs'>>
  prepare(request: VoiceoverStart, signal: AbortSignal): Promise<PreparedVoiceover>
  quote(query: VoicePreviewCheck, signal: AbortSignal): Promise<VoicePreviewQuote>
  preview(request: VoicePreviewStart, signal: AbortSignal): Promise<VoicePreviewMedia>
}
export const VOICEOVER_EXECUTION = defineService<VoiceoverExecution>('presmium.voiceoverExecution')

export interface VoiceoverObservation extends VoiceoverCancellation { error?: string, current?: boolean | 'unknown' }
export interface VoiceoverJobsAnswer { document: string, jobs: (VoiceoverJob & { current: boolean | 'unknown' })[], idempotency: 'process', limits: { intents: number, recentJobs: number } }
export interface VoicePreviewResource extends Omit<VoicePreviewAnswer, 'audio'> { id: string, mediaType: string, byteLength: number, sha256: string }
export interface VoicePreviewResourceData { resource: VoicePreviewResource, bytes: Uint8Array }
/** Shared author entry. Adapters obtain spending approval; model input cannot supply confirmation. */
export interface DocumentVoiceTasks {
  snapshot(document: string, query: VoiceoverStatusQuery, member: Member, signal?: AbortSignal): Promise<VoiceoverSnapshot>
  listJobs(document: string, member: Member): Promise<VoiceoverJobsAnswer>
  getJob(document: string, query: VoiceoverJobQuery, member: Member): Promise<VoiceoverObservation>
  start(document: string, request: VoiceoverStart, member: Member, signal?: AbortSignal): Promise<VoiceoverJob>
  cancel(document: string, query: VoiceoverJobQuery, member: Member): Promise<VoiceoverCancellation>
  quotePreview(document: string, query: VoicePreviewCheck, member: Member, signal?: AbortSignal): Promise<VoicePreviewQuote>
  preview(document: string, request: VoicePreviewStart, member: Member, signal?: AbortSignal): Promise<VoicePreviewResource>
  readPreview(document: string, id: string, member: Member): Promise<VoicePreviewResourceData>
}
export const DOCUMENT_VOICE_TASKS = defineService<DocumentVoiceTasks>('presmium.documentVoiceTasks')

const source = { type: 'object', additionalProperties: false, properties: { documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', pattern: '^[a-f\\d]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f\\d]{16}$' } }, required: ['documentId', 'version', 'fingerprint'] } as const
const revision = { type: 'string', pattern: '^[a-f\\d]{16}$' } as const
const target = { type: 'object', additionalProperties: false, properties: { section: { type: 'string', minLength: 1, maxLength: 200 }, step: { type: 'integer', minimum: 0 }, binding: revision }, required: ['section', 'step', 'binding'] } as const
const scope = { oneOf: [
  { type: 'object', additionalProperties: false, properties: { kind: { const: 'document' } }, required: ['kind'] },
  { type: 'object', additionalProperties: false, properties: { kind: { const: 'page' }, section: target.properties.section }, required: ['kind', 'section'] },
  { type: 'object', additionalProperties: false, properties: { kind: { const: 'step' }, target }, required: ['kind', 'target'] },
  { type: 'object', additionalProperties: false, properties: { kind: { const: 'steps' }, targets: { type: 'array', items: target, minItems: 1, maxItems: 500 } }, required: ['kind', 'targets'] },
] } as const
const intent = { type: 'string', pattern: '^[A-Za-z\\d_-]{16,128}$' } as const
export const VOICEOVER_STATUS_SCHEMA = { type: 'object', additionalProperties: false, properties: { source, revision } } as const
export const VOICEOVER_START_SCHEMA = { type: 'object', additionalProperties: false, properties: { intent, source, revision, scope }, required: ['intent', 'source', 'revision', 'scope'] } as const
export const VOICEOVER_JOB_QUERY_SCHEMA = { oneOf: [
  { type: 'object', additionalProperties: false, properties: { id: { type: 'string', pattern: '^[a-f\\d]{8}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{12}$' } }, required: ['id'] },
  { type: 'object', additionalProperties: false, properties: { intent }, required: ['intent'] },
] } as const
const voice = { type: 'object', additionalProperties: false, properties: { voice: { type: 'string', minLength: 1, maxLength: 200 }, engine: { type: 'string', minLength: 1, maxLength: 200 }, rate: { type: 'number', exclusiveMinimum: 0 }, style: { type: 'string', maxLength: 200 } }, required: ['voice'] } as const
const preview = { revision, source, voice, mode: { enum: ['sample', 'step'] }, target } as const
export const VOICE_PREVIEW_CHECK_SCHEMA = { type: 'object', additionalProperties: false, properties: preview, required: ['revision', 'voice', 'mode'], allOf: [{ if: { properties: { mode: { const: 'step' } } }, then: { required: ['target'] } }] } as const
export const VOICE_PREVIEW_START_SCHEMA = { type: 'object', additionalProperties: false, properties: { ...preview, quote: { type: 'string', pattern: '^[a-f\\d]{64}$' } }, required: ['source', 'revision', 'voice', 'mode', 'quote'], allOf: VOICE_PREVIEW_CHECK_SCHEMA.allOf } as const
