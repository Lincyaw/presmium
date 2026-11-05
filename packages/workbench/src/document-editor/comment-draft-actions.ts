import type { AuthoringClientAction, AuthoringClientActionResult, ClientCommentDraftReference } from '@lincyaw/kernel'
import { draftContentHash } from '../authoring-draft-fragment.ts'
import { commentDraftReference } from './comment-draft-inspection.ts'
import type { CommentDrafts, CommentDraftCandidate, CommentDraftOperation } from './comment-drafts.ts'

/** Native views call this same guarded retirement before clearing their visible form state. */
export async function discardNativeCommentDraft(drafts: CommentDrafts, candidate: CommentDraftCandidate, operation: CommentDraftOperation | undefined, guard: () => void, clear: () => void): Promise<boolean> {
  const current = () => { operation?.signal?.throwIfAborted(); operation?.guard?.(); guard() }
  current()
  if (!await drafts.discard(candidate, { signal: operation?.signal, guard: current })) return false
  current(); clear(); return true
}

const sameReference = (a: ClientCommentDraftReference | null, b: ClientCommentDraftReference | null): boolean => a === null || b === null ? a === b
  : a.id === b.id && a.revision === b.revision && a.token === b.token

/** The native composer, rather than its backup, acknowledges actual editor adoption. */
export async function mutateCommentDrafts(drafts: CommentDrafts, action: Extract<AuthoringClientAction, { type: 'comment-drafts.restore' | 'comment-drafts.discard' }>, signal: AbortSignal, owned: () => void, fits: (result: AuthoringClientActionResult) => boolean): Promise<AuthoringClientActionResult> {
  const input = drafts.inputGuard()
  const readBeforeMutation = async (reference: ClientCommentDraftReference) => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted(); owned(); input()
      try { const value = await drafts.readForAgent(signal, reference); signal.throwIfAborted(); owned(); input(); return value }
      catch (error) {
        signal.throwIfAborted(); owned(); input()
        if (attempt >= 3 || !(error instanceof Error) || error.message !== 'client-comment-drafts-changed') throw error
      }
    }
  }
  const read = await readBeforeMutation(action.draft), candidate = read.candidates[0]!
  owned()
  if (action.type === 'comment-drafts.discard') {
    const guard = () => { signal.throwIfAborted(); owned(); if (!drafts.canDiscard(candidate)) throw new Error('client-comment-draft-needs-human') }
    const result: AuthoringClientActionResult = { type: action.type, family: 'comment', draft: action.draft, discarded: true }
    guard()
    if (!fits(result)) throw new Error('client-comment-result-too-large')
    if (!await drafts.discardProposal(candidate, { signal, guard })) throw new Error('client-comment-drafts-changed')
    signal.throwIfAborted(); owned()
    return result
  }
  if (candidate.composing || candidate.pending || candidate.storage !== 'durable') throw new Error('client-comment-draft-needs-human')
  const choice = await drafts.restoreChoice(candidate, signal)
  owned(); input()
  if (!choice || action.composerId !== undefined && (choice.composerId !== action.composerId || !sameReference(choice.expectedCurrent, action.expectedCurrent ?? null))) throw new Error('client-comment-composer-unavailable')
  const { composerId, expectedCurrent } = choice, composer = drafts.composer(composerId)
  if (!composer?.restore) throw new Error('client-comment-composer-unavailable')
  const previous = composer.snapshot().record
  if (previous) {
    if (!expectedCurrent) throw new Error('client-comment-drafts-changed')
    const current = await readBeforeMutation(expectedCurrent)
    owned()
    if (current.candidates[0]?.storage !== 'durable') throw new Error('client-comment-draft-needs-human')
  } else if (expectedCurrent !== null) throw new Error('client-comment-drafts-changed')
  const guard = () => {
    signal.throwIfAborted(); owned()
    const state = composer.snapshot()
    if (!drafts.ownersKnown || drafts.composer(composerId) !== composer || state.record !== previous || !state.available || state.composing || composer.targetState(candidate.target) === 'unavailable') throw new Error('client-comment-composer-changed')
  }
  guard()
  const targetState = composer.targetState(candidate.target)
  if (targetState === 'unavailable') throw new Error('client-comment-composer-unavailable')
  if (!fits({ type: action.type, family: 'comment', draft: action.draft, composerId,
    restored: { id: '0'.repeat(36), revision: 1, token: '0'.repeat(64) }, preservedCurrent: expectedCurrent, targetState })) throw new Error('client-comment-result-too-large')
  const record = await composer.restore(candidate, { signal, guard })
  if (!record) throw new Error('client-comment-native-unverified')
  const adopted = () => {
    signal.throwIfAborted(); owned()
    const state = composer.snapshot()
    if (!drafts.ownersKnown || drafts.composer(composerId) !== composer || state.record !== record || !state.available || state.composing || !drafts.owns(record)) throw new Error('client-comment-composer-changed')
  }
  adopted()
  const token = await draftContentHash(JSON.stringify(record))
  adopted()
  const result: AuthoringClientActionResult = { type: action.type, family: 'comment', draft: action.draft, composerId,
    restored: commentDraftReference({ ...record, token, storage: 'durable' }), preservedCurrent: expectedCurrent, targetState }
  if (!fits(result)) throw new Error('client-comment-result-too-large')
  return result
}
