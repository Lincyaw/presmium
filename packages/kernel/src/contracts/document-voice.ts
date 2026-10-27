import type { CanonicalSource } from '../ir.ts'
import type { Finding } from './checks.ts'
import type { Member } from './server.ts'
import type { SpeechEngineInfo } from './speech.ts'
import type { VoiceCatalogAnswer } from './voice.ts'

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
  findings?: Finding[]
}
export interface DocumentVoiceCatalogQuery { source?: CanonicalSource, engine?: string, lang?: string }
export interface DocumentVoiceCatalogAnswer extends VoiceCatalogAnswer { document: string, source: CanonicalSource, findings?: Finding[] }

/** Actual voice discovery shared by Web and MCP; it never compiles scenes or synthesizes speech. */
export interface DocumentVoiceAuthoring {
  capabilities(document: string, member: Member, signal?: AbortSignal): Promise<DocumentVoiceCapabilities>
  catalog(document: string, query: DocumentVoiceCatalogQuery, member: Member, signal?: AbortSignal): Promise<DocumentVoiceCatalogAnswer>
}

export const DOCUMENT_VOICE_CATALOG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    source: { type: 'object', additionalProperties: false, properties: { documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', pattern: '^[a-f\\d]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f\\d]{16}$' } }, required: ['documentId', 'version', 'fingerprint'] },
    engine: { type: 'string', minLength: 1, maxLength: 200 },
    lang: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const
