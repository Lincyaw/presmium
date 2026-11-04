import type { CanonicalSource } from '../ir.ts'
import type { Schema } from '@cfworker/json-schema'
import type { Finding } from './checks.ts'
import type { Member } from './server.ts'
import type { SpeechEngineInfo, VoiceCloneRequest, VoiceCloneStatus } from './speech.ts'
import type { VoiceCatalogAnswer, VoiceoverCancellation } from './voice.ts'
import type { DocumentVoiceTasks, VoiceoverJobQuery, VoiceoverStart, VoicePreviewStart } from './voiceover-execution.ts'

export interface DocumentVoiceCapabilities {
  document: string
  source: CanonicalSource
  /** Configuration discovery does not prove provider authentication or synthesis success. */
  verification: 'configuration-only'
  status: 'configured' | 'unavailable' | 'unknown'
  reason?: 'not-configured' | 'services-unavailable'
  voiceover: boolean
  preview: boolean
  engines: SpeechEngineInfo[]
  defaultEngine?: string
  actions: { status: boolean, list: true, get: true, start: boolean, cancel: true, quotePreview: boolean, preview: boolean, readPreview: true, clone?: boolean, cloneStatus?: boolean }
  tasks: { idempotency: 'process', limits: { intents: number, recentJobs: number, concurrent: number, quotes: number, quoteLifetimeMs: number, previewBytes: number, previewResources: number, retainedPreviewBytes: number } }
  findings?: Finding[]
}
export interface DocumentVoiceCatalogQuery { source?: CanonicalSource, engine?: string, lang?: string }
export interface DocumentVoiceCatalogAnswer extends VoiceCatalogAnswer { document: string, source: CanonicalSource, findings?: Finding[] }

export const VOICE_CLONE_MAX_AUDIO_BYTES = 10 << 20
/** Files are scoped workspace paths; the service reads and fixes their bytes before spending approval. */
export type DocumentVoiceCloneRequest = Omit<VoiceCloneRequest, 'sample' | 'consent'> & {
  source?: CanonicalSource
  sample: string
  consent: { speaker: string, scope: string, statement: string }
}
export interface DocumentVoiceCloneQuery { engine?: string, voice: string }
/** A process-local capability for this call, never a model argument or a retained plan. */
export interface PreparedVoiceClone {
  engine: string
  voice: string
  start(signal?: AbortSignal): Promise<VoiceCloneStatus>
  close(): void
}

/** Shared voice discovery and explicitly authorized tasks; discovery never compiles or synthesizes. */
export interface DocumentVoiceAuthoring extends DocumentVoiceTasks {
  capabilities(document: string, member: Member, signal?: AbortSignal): Promise<DocumentVoiceCapabilities>
  catalog(document: string, query: DocumentVoiceCatalogQuery, member: Member, signal?: AbortSignal): Promise<DocumentVoiceCatalogAnswer>
  /** Checks a start or preview with the same path as the action, without synthesizing, so an agent asks only for one that would run. */
  checkStart(document: string, request: VoiceoverStart, member: Member, signal?: AbortSignal): Promise<void>
  checkPreview(document: string, request: VoicePreviewStart, member: Member, signal?: AbortSignal): Promise<void>
  /** Undefined when there is something to cancel; otherwise the unchanged state that cancel would report. */
  checkCancel(document: string, query: VoiceoverJobQuery, member: Member): Promise<VoiceoverCancellation | undefined>
  prepareClone?(document: string, request: DocumentVoiceCloneRequest, member: Member, signal?: AbortSignal): Promise<PreparedVoiceClone>
  cloneStatus?(document: string, query: DocumentVoiceCloneQuery, member: Member, signal?: AbortSignal): Promise<VoiceCloneStatus>
}

export const DOCUMENT_VOICE_CATALOG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    source: { type: 'object', additionalProperties: false, properties: { documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', pattern: '^[a-f\\d]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f\\d]{16}$' } }, required: ['documentId', 'version', 'fingerprint'] },
    engine: { type: 'string', minLength: 1, maxLength: 200 },
    lang: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const

const cloneText = { type: 'string', minLength: 1, maxLength: 200 } as const
export const DOCUMENT_VOICE_CLONE_QUERY_SCHEMA: Schema = {
  type: 'object', additionalProperties: false, properties: { engine: cloneText, voice: cloneText }, required: ['voice'],
}
export const DOCUMENT_VOICE_CLONE_SCHEMA: Schema = {
  type: 'object', additionalProperties: false,
  properties: {
    source: structuredClone(DOCUMENT_VOICE_CATALOG_SCHEMA.properties.source) as unknown as Schema, engine: cloneText, voice: cloneText,
    sample: { type: 'string', minLength: 1, maxLength: 1024 },
    consent: { type: 'object', additionalProperties: false, properties: { speaker: cloneText, scope: { type: 'string', minLength: 1, maxLength: 2000 }, statement: { type: 'string', minLength: 1, maxLength: 1024 } }, required: ['speaker', 'scope', 'statement'] },
    lang: { type: 'string', minLength: 1, maxLength: 100 }, text: { type: 'string', maxLength: 4000 },
  }, required: ['voice', 'sample', 'consent'],
}
