import type { CanonicalSource } from '../ir.ts'
import type { DocumentChangeAnswer } from './workspace.ts'
import type { NarrationNode, TeachingDocument } from './document.ts'
import type { Member } from './server.ts'

export type TranscriptionAdoptionPart = { type: 'text', text: string } | { type: 'preserve', key: string }
export interface TranscriptionAdoptionTarget {
  sectionId: string
  stepId: string
  narrationId?: string
  segmentIds: string[]
  content?: TranscriptionAdoptionPart[]
  discardAtoms?: string[]
  shared?: 'edit-shared' | 'fork'
  affectedStepIds?: string[]
}
export interface TranscriptionAdoptionDraft {
  id: string
  source: CanonicalSource
  candidate: { id: string, revision: string }
  draftRevision: number
  targets: TranscriptionAdoptionTarget[]
  /** Explicitly confirmed cleanup, only for cues actually removed by this adoption. */
  removeCueTimings?: string[]
}
export interface TranscriptionAdoptionApply {
  planId: string
  source: CanonicalSource
  candidate: { id: string, revision: string }
  draftRevision: number
}
export interface TranscriptionAdoptionConflict { code: string, target?: number, key?: string, stepIds?: string[] }
export interface TranscriptionAdoptionPreview {
  targets: { sectionId: string, stepId: string, narrationId?: string, outputNarrationId: string, segmentIds: string[], sourceText: string, before: NarrationNode[], proposed: NarrationNode[], atoms: { key: string, node: Exclude<NarrationNode, { type: 'text' }> }[] }[]
  conflicts: TranscriptionAdoptionConflict[]
  impact: { narrationIds: string[], stepIds: string[], sharedStepIds: string[], forks: { from: string, to: string, stepId: string, cues: { from: string, to: string }[] }[], removedAtoms: string[], removedCueTimings: string[] }
}
export interface TranscriptionAdoptionPlan extends TranscriptionAdoptionPreview {
  document: string
  changeId: string
  source: CanonicalSource
  candidate: { id: string, revision: string }
  draftRevision: number
  planId?: string
  expiresAt?: string
  content?: TeachingDocument
}
export interface TranscriptionAdoptionAnswer extends DocumentChangeAnswer {
  adoption: { planId: string, candidate: { id: string, revision: string }, draftRevision: number }
}
/** Agent-safe surface. An editor HTTP adapter receives its trusted write path separately. */
export interface DocumentTranscriptionAdoption {
  plan(document: string, draft: TranscriptionAdoptionDraft, member: Member): Promise<TranscriptionAdoptionPlan>
  /** The adoption's checks without writing: plan, draft revision, candidate, current source; `apply` checks everything again. */
  check(document: string, request: TranscriptionAdoptionApply, member: Member): Promise<void>
  apply(document: string, request: TranscriptionAdoptionApply, member: Member): Promise<TranscriptionAdoptionAnswer>
}

const id = { type: 'string', minLength: 1, maxLength: 200, pattern: '^[^\u0000-\u001f]+$', not: { enum: ['__proto__', 'constructor', 'prototype'] } }
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const key = { type: 'string', minLength: 1, maxLength: 512 }
const source = { type: 'object', properties: { documentId: id, version: { type: 'string', pattern: '^[a-f0-9]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f0-9]{16}$' } }, required: ['documentId', 'version', 'fingerprint'], additionalProperties: false }
const candidate = { type: 'object', properties: { id: digest, revision: digest }, required: ['id', 'revision'], additionalProperties: false }
const draftRevision = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
const unique = (items: object) => ({ type: 'array', items, uniqueItems: true, maxItems: 1000 })
export const TRANSCRIPTION_ADOPTION_DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'source', 'candidate', 'draftRevision', 'targets'],
  properties: { id, source, candidate, draftRevision, removeCueTimings: unique(id), targets: { type: 'array', minItems: 1, maxItems: 100, items: {
    type: 'object', additionalProperties: false, required: ['sectionId', 'stepId', 'segmentIds'], properties: {
      sectionId: id, stepId: id, narrationId: id, segmentIds: { ...unique(id), minItems: 1 },
      shared: { enum: ['edit-shared', 'fork'] }, affectedStepIds: unique(id), discardAtoms: unique(key),
      content: { type: 'array', maxItems: 1000, items: { oneOf: [
        { type: 'object', properties: { type: { const: 'text' }, text: { type: 'string', maxLength: 1_048_576 } }, required: ['type', 'text'], additionalProperties: false },
        { type: 'object', properties: { type: { const: 'preserve' }, key }, required: ['type', 'key'], additionalProperties: false },
      ] } },
    },
  } } },
}
export const TRANSCRIPTION_ADOPTION_APPLY_SCHEMA = { type: 'object', additionalProperties: false, properties: { planId: id, source, candidate, draftRevision }, required: ['planId', 'source', 'candidate', 'draftRevision'] }
