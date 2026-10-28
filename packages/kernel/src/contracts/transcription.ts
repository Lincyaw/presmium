import type { CanonicalSource } from '../ir.ts'
import type { TimeRange } from './document.ts'
import type { Member } from './server.ts'
import type { SpeechEngineInfo } from './speech.ts'
import type { Finding } from './checks.ts'

export const TRANSCRIPTION_REQUEST_MAX_BYTES = 32 << 10

export interface TranscriptionCapabilities {
  source: CanonicalSource
  available: boolean
  status: 'available' | 'unavailable' | 'unknown'
  reason?: 'speech-unavailable' | 'engine-unavailable' | 'audio-unavailable' | 'services-unavailable'
  /** Provider declaration and local configuration are known; authentication/recognition is not verified. */
  verification: 'configuration-only'
  findings?: Finding[]
  engines: SpeechEngineInfo[]
  range: 'whole-asset'
  limits: { audioBytes: number, durationMs: number, tasks: number, requestBytes: number }
}

/** A confirmed recognition request; no script, clip or voice selection is changed. */
export interface DocumentTranscriptionRequest {
  intent: string
  source: CanonicalSource
  assetId: string
  audioSha256: string
  engine: string
  lang?: string
  hints?: string[]
  confirmed: true
}

/** Agent input excludes host confirmation; HTTP and Node validate the confirmed form below. */
export const DOCUMENT_TRANSCRIPTION_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    intent: { type: 'string', pattern: '^[A-Za-z\\d_-]{16,128}$' },
    source: { type: 'object', additionalProperties: false, properties: { documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', pattern: '^[a-f\\d]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f\\d]{16}$' } }, required: ['documentId', 'version', 'fingerprint'] },
    assetId: { type: 'string', minLength: 1, maxLength: 200 },
    audioSha256: { type: 'string', pattern: '^[a-f\\d]{64}$' },
    engine: { type: 'string', minLength: 1, maxLength: 128 },
    lang: { type: 'string', minLength: 1, maxLength: 64 },
    hints: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 200 } },
  },
  required: ['intent', 'source', 'assetId', 'audioSha256', 'engine'],
} as const

export const DOCUMENT_TRANSCRIPTION_REQUEST_SCHEMA = {
  ...DOCUMENT_TRANSCRIPTION_INPUT_SCHEMA,
  properties: { ...DOCUMENT_TRANSCRIPTION_INPUT_SCHEMA.properties, confirmed: { const: true } },
  required: [...DOCUMENT_TRANSCRIPTION_INPUT_SCHEMA.required, 'confirmed'],
} as const

export interface TranscriptionRevision {
  transcriptionId: string
  revision: string
  createdAt: string
  source: CanonicalSource
  audio: { assetId: string, sha256: string, sourceRange: TimeRange }
  request: { engine: string, provider: string, local: boolean, lang?: string, hints: string[], fingerprint: string }
  result: {
    lang: string
    text: string
    segments: { id: string, text: string, startMs?: number, endMs?: number, words?: { text: string, startMs: number, endMs: number }[] }[]
  }
  timing: 'words' | 'segments' | 'none'
  warnings: string[]
}

export type TranscriptionTaskState = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'failed'
export interface TranscriptionTask {
  kind: 'transcription'
  id: string
  intent: string
  document: string
  source: CanonicalSource
  audio: { assetId: string, sha256: string }
  sequence: number
  state: TranscriptionTaskState
  current: boolean
  staleReason?: 'document-changed' | 'document-unavailable' | 'audio-changed'
  progress: { phase: 'queued' | 'recognizing' | 'saving' | 'finished' }
  createdAt: string
  startedAt?: string
  finishedAt?: string
  result?: { transcriptionId: string, revision: string }
  error?: string
}

export interface TranscriptionCancellation { intent: string, state: TranscriptionTaskState, task?: TranscriptionTask }
export interface TranscriptionListAnswer {
  tasks: TranscriptionTask[]
  issues: { id: string, code: string }[]
  truncated?: true
}

/** Workspace-owned authoring capability, shared by HTTP and agent adapters. */
export interface DocumentTranscriptions {
  capabilities(document: string, member: Member): Promise<TranscriptionCapabilities>
  start(document: string, request: DocumentTranscriptionRequest, member: Member, signal?: AbortSignal): Promise<TranscriptionTask>
  list(document: string, member: Member): Promise<TranscriptionListAnswer>
  get(document: string, query: { id: string } | { intent: string }, member: Member): Promise<TranscriptionTask>
  readResult(document: string, id: string, revision: string, member: Member): Promise<TranscriptionRevision>
  /** Rechecks current canonical source and the exact original audio, without recognizing it again. */
  verifyResult(document: string, id: string, revision: string, source: CanonicalSource, member: Member): Promise<TranscriptionRevision>
  cancel(document: string, query: { id: string } | { intent: string }, member: Member): Promise<TranscriptionCancellation>
  /** Checks a start with the same path, without storing a task or calling the provider, so an agent asks only for one that would run. */
  checkStart(document: string, request: DocumentTranscriptionRequest, member: Member, signal?: AbortSignal): Promise<void>
  /** Undefined when there is something to cancel; otherwise the unchanged state that cancel would report. */
  checkCancel(document: string, query: { id: string } | { intent: string }, member: Member): Promise<TranscriptionCancellation | undefined>
}
