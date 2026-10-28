import type { DocumentCaptionTimingAction } from '../document-caption-timings.ts'
import type { DocumentCommentAction, DocumentCommentEffect } from './document-comments.ts'
import type { JsonValue, VoiceSource } from './document.ts'
import type { DocumentVoiceImpact, DocumentVoiceScope } from '../document-voices.ts'
import type { CanonicalSource } from '../ir.ts'
import type { DocumentChange, DocumentChangeAnswer, RevisionOrigin } from './workspace.ts'
import type { DocumentChangePlan } from './authoring.ts'

export const DOCUMENT_ACTION_MAX_REQUEST_CHARS = 4096
export const DOCUMENT_ACTION_MAX_RESPONSE_CHARS = 7168
export const DOCUMENT_AUTHORING_ACTION_TYPES = ['comment.create', 'comment.reply', 'comment.update', 'comment.react', 'comment.resolve', 'comment.reopen', 'comment.delete', 'voice.set', 'component.parameters.patch', 'component.step-parameters.patch', 'component.step-parameters.reset', 'component.definition.use', 'caption.timing.set', 'caption.timing.reset'] as const
export const DOCUMENT_PARAMETER_MAX_CHANGES = 32
export const DOCUMENT_PARAMETER_MAX_PATH_DEPTH = 16
/** Paths belong only to this component's parameters; set replaces an array item or appends at its length. */
export type DocumentParameterChange = { op: 'set', path: string[], value: JsonValue } | { op: 'remove', path: string[] }
export type DocumentComponentAction =
  | { type: 'component.parameters.patch', blockId: string, changes: DocumentParameterChange[] }
  | { type: 'component.step-parameters.patch', blockId: string, stepId: string, changes: DocumentParameterChange[] }
  | { type: 'component.step-parameters.reset', blockId: string, stepId: string }
  | { type: 'component.definition.use', blockId: string, definitionId: string, changes?: DocumentParameterChange[] }
export interface DocumentComponentEffect {
  blockId: string
  sectionId: string
  layer: 'base' | 'step' | 'definition'
  stepId?: string
  definitionId: string
  previousDefinitionId?: string
  changed: boolean
  paths: string[][]
  affected: { blocks: string[], steps: string[], pages: string[] }
  overrides: { preserved: string[], materialized: string[], reset: string[] }
  references: { before: string[], after: string[] }
}
export const DOCUMENT_COMPONENT_IMPACT_COLLECTIONS = ['affected.blocks', 'affected.steps', 'affected.pages', 'overrides.preserved', 'overrides.materialized', 'overrides.reset', 'references.before', 'references.after'] as const
export type DocumentComponentImpactCollection = typeof DOCUMENT_COMPONENT_IMPACT_COLLECTIONS[number]
export interface DocumentComponentImpactQuery extends DocumentAuthoringActionRead { collection: DocumentComponentImpactCollection, offset?: number }
export interface DocumentComponentImpactAnswer {
  planId: string, digest: string, source: CanonicalSource, currentSource: CanonicalSource, state: 'current' | 'applied' | 'old'
  collection: DocumentComponentImpactCollection, offset: number, total: number, entries: string[], nextOffset?: number, complete: boolean
}
/** New recording adoption belongs to the real-media service, never a raw settings action. */
export type DocumentAuthoringAction = DocumentCommentAction | DocumentComponentAction | DocumentCaptionTimingAction | { type: 'voice.set', scope: DocumentVoiceScope, source: Exclude<VoiceSource, { type: 'recording' }> | null, replaceOverrides?: boolean }
export interface DocumentAuthoringActionRequest { id: string, source: CanonicalSource, action: DocumentAuthoringAction }
export type DocumentAuthoringActionEffect = { kind: 'caption', value: { stepId: string, segments: number, changed: boolean, mode: 'manual' | 'automatic' } } | { kind: 'comment', value: DocumentCommentEffect } | { kind: 'voice', scope: DocumentVoiceScope['kind'], value: DocumentVoiceImpact, recordings: { preserved: number, removed: number } } | { kind: 'component', value: DocumentComponentEffect }
export interface DocumentAuthoringActionPlan extends DocumentChangePlan {
  action: DocumentAuthoringAction
  effect: DocumentAuthoringActionEffect
  change: DocumentChange
}
export interface DocumentAuthoringActionReference { planId: string, source: CanonicalSource, digest: string, confirmDeletion?: true }
export interface DocumentAuthoringActionRead { planId: string, digest: string }
export interface DocumentAuthoringActionInspection { plan: DocumentAuthoringActionPlan, currentSource: CanonicalSource, state: 'current' | 'applied' | 'old' }
export interface AppliedDocumentAuthoringAction extends Omit<DocumentChangeAnswer, 'content' | 'issues' | 'commit'> {
  commit?: { id: string, origin: RevisionOrigin['kind'] }
  planId: string
  digest: string
  action: DocumentAuthoringAction['type']
  effect: DocumentAuthoringActionEffect
  verification: { saved: true, source: CanonicalSource, plannedVersion: string, actionStateVerified: true, compiled: 'not-requested', runtime: 'not-requested' }
}
