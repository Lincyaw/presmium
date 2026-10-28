import type { AuthoringClientAction, AuthoringClientActionResult, ClientCommentDraftReference } from '@lincyaw/kernel'
import { draftContentHash } from '../authoring-draft-fragment.ts'
import { commentDraftReference } from './comment-draft-inspection.ts'
import { isNewCommentDraft } from './comment-drafts.ts'
import type { CommentDrafts } from './comment-drafts.ts'

const sameReference = (a: ClientCommentDraftReference | null, b: ClientCommentDraftReference | null): boolean => a === null || b === null ? a === b
  : a.id === b.id && a.revision === b.revision && a.token === b.token

/** The native composer, rather than its backup, acknowledges actual editor adoption. */
export async function mutateCommentDrafts(drafts: CommentDrafts, action: Extract<AuthoringClientAction, { type: 'comment-drafts.restore' | 'comment-drafts.discard' }>, signal: AbortSignal, owned: () => void, fits: (result: AuthoringClientActionResult) => boolean): Promise<AuthoringClientActionResult> {
  const read = await drafts.readForAgent(signal, action.draft), candidate = read.candidates[0]!
  owned()
  if (action.type === 'comment-drafts.discard') {
    const guard = () => { signal.throwIfAborted(); owned(); if (drafts.targetActive(candidate.target) || candidate.composing || candidate.pending) throw new Error('client-comment-draft-needs-human') }
    const result: AuthoringClientActionResult = { type: action.type, family: 'comment', draft: action.draft, discarded: true }
    guard()
    if (!fits(result)) throw new Error('client-comment-result-too-large')
    if (!await drafts.discard(action.draft, { signal, guard })) throw new Error('client-comment-drafts-changed')
    guard()
    return result
  }
  if (isNewCommentDraft(candidate.target) || candidate.composing || candidate.pending || candidate.storage !== 'durable') throw new Error('client-comment-draft-needs-human')
  const composer = drafts.composer(action.composerId), choice = await drafts.restoreChoice(candidate, signal)
  owned()
  if (!composer?.restore || choice?.composerId !== action.composerId || !sameReference(choice.expectedCurrent, action.expectedCurrent)) throw new Error('client-comment-composer-unavailable')
  const previous = composer.snapshot().record
  if (previous) {
    if (!action.expectedCurrent) throw new Error('client-comment-drafts-changed')
    const current = await drafts.readForAgent(signal, action.expectedCurrent)
    owned()
    if (current.candidates[0]?.storage !== 'durable') throw new Error('client-comment-draft-needs-human')
  } else if (action.expectedCurrent !== null) throw new Error('client-comment-drafts-changed')
  const guard = () => {
    signal.throwIfAborted(); owned()
    const state = composer.snapshot()
    if (!drafts.ownersKnown || drafts.composer(action.composerId) !== composer || state.record !== previous || !state.available || state.composing || composer.targetState() === 'unavailable') throw new Error('client-comment-composer-changed')
  }
  guard()
  const targetState = composer.targetState()
  if (targetState === 'unavailable') throw new Error('client-comment-composer-unavailable')
  if (!fits({ type: action.type, family: 'comment', draft: action.draft, composerId: action.composerId,
    restored: { id: '0'.repeat(36), revision: 1, token: '0'.repeat(64) }, preservedCurrent: action.expectedCurrent, targetState })) throw new Error('client-comment-result-too-large')
  const record = await composer.restore(candidate, { signal, guard })
  if (!record) throw new Error('client-comment-native-unverified')
  const adopted = () => {
    signal.throwIfAborted(); owned()
    const state = composer.snapshot()
    if (!drafts.ownersKnown || drafts.composer(action.composerId) !== composer || state.record !== record || !state.available || state.composing || !drafts.owns(record)) throw new Error('client-comment-composer-changed')
  }
  adopted()
  const token = await draftContentHash(JSON.stringify(record))
  adopted()
  const result: AuthoringClientActionResult = { type: action.type, family: 'comment', draft: action.draft, composerId: action.composerId,
    restored: commentDraftReference({ ...record, token, storage: 'durable' }), preservedCurrent: action.expectedCurrent, targetState }
  if (!fits(result)) throw new Error('client-comment-result-too-large')
  return result
}
