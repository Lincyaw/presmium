import type { DocumentCommentAction, DocumentCommentEffect } from './document-comments.ts'
import type { VoiceSource } from './document.ts'
import type { DocumentVoiceImpact, DocumentVoiceScope } from '../document-voices.ts'
import type { CanonicalSource } from '../ir.ts'
import type { DocumentChange, DocumentChangeAnswer, RevisionOrigin } from './workspace.ts'
import type { DocumentChangePlan } from './authoring.ts'

export const DOCUMENT_ACTION_MAX_REQUEST_CHARS = 4096
export const DOCUMENT_ACTION_MAX_RESPONSE_CHARS = 7168
export const DOCUMENT_AUTHORING_ACTION_TYPES = ['comment.create', 'comment.reply', 'comment.update', 'comment.react', 'comment.resolve', 'comment.reopen', 'comment.delete', 'voice.set'] as const
/** New recording adoption belongs to the real-media service, never a raw settings action. */
export type DocumentAuthoringAction = DocumentCommentAction | { type: 'voice.set', scope: DocumentVoiceScope, source: Exclude<VoiceSource, { type: 'recording' }> | null, replaceOverrides?: boolean }
export interface DocumentAuthoringActionRequest { id: string, source: CanonicalSource, action: DocumentAuthoringAction }
export type DocumentAuthoringActionEffect = { kind: 'comment', value: DocumentCommentEffect } | { kind: 'voice', scope: DocumentVoiceScope['kind'], value: DocumentVoiceImpact, recordings: { preserved: number, removed: number } }
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
