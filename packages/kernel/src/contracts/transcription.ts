import type { CanonicalSource } from '../ir.ts'
import type { TimeRange } from './document.ts'
import type { Member } from './server.ts'
import type { SpeechEngineInfo } from './speech.ts'

export interface TranscriptionCapabilities {
  available: boolean
  reason?: 'speech-unavailable' | 'engine-unavailable' | 'audio-unavailable'
  engines: SpeechEngineInfo[]
  range: 'whole-asset'
  limits: { audioBytes: number, durationMs: number }
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

/** Workspace-owned authoring capability, shared by HTTP and agent adapters. */
export interface DocumentTranscriptions {
  capabilities(document: string, member: Member): Promise<TranscriptionCapabilities>
  start(document: string, request: DocumentTranscriptionRequest, member: Member, signal?: AbortSignal): Promise<TranscriptionTask>
  get(document: string, query: { id: string } | { intent: string }, member: Member): Promise<TranscriptionTask>
  readResult(document: string, id: string, revision: string, member: Member): Promise<TranscriptionRevision>
  cancel(document: string, query: { id: string } | { intent: string }, member: Member): Promise<TranscriptionCancellation>
}
