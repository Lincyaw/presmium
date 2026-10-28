import type { AuthoringClientAction, AuthoringClientActionResult, ClientCommentDraftMetadata } from '@lincyaw/kernel'
import { isNewCommentDraft } from './comment-drafts.ts'
import { authoringDraftFragment, draftContentHash as hash } from '../authoring-draft-fragment.ts'
import type { CommentDraftCandidate, CommentDrafts } from './comment-drafts.ts'

const reference = (value: CommentDraftCandidate) => ({ id: value.id, revision: value.revision, token: value.token })

/** Only these fields may leave the client during inspection. Target signatures and baselines contain prose. */
function metadata(value: CommentDraftCandidate): ClientCommentDraftMetadata {
  const target = value.target
  return { draft: reference(value), kind: isNewCommentDraft(target) ? 'create' : target.commentId ? 'edit' : 'reply', storage: value.storage,
    updatedAt: value.updatedAt, baseVersion: value.version, composing: value.composing, pendingSubmission: Boolean(value.pending),
    ...isNewCommentDraft(target) ? {} : { threadId: target.threadId, ...target.commentId ? { commentId: target.commentId } : {} } }
}

export async function inspectCommentDrafts(drafts: CommentDrafts, action: Extract<AuthoringClientAction, { type: 'comment-drafts.inspect' | 'comment-drafts.read' }>, signal: AbortSignal, fits: (result: AuthoringClientActionResult) => boolean): Promise<AuthoringClientActionResult> {
  const read = await drafts.readForAgent(signal, action.type === 'comment-drafts.read' ? action.draft : undefined)
  const current = () => { signal.throwIfAborted(); if (drafts.revision !== read.revision) throw new Error('client-comment-drafts-changed') }
  if (action.type === 'comment-drafts.inspect') {
    const values = read.candidates.map(metadata), token = await hash(JSON.stringify({ values, coverage: read.coverage, skippedInvalid: read.skippedInvalid }))
    current()
    if (action.cursor && action.cursor.token !== token) throw new Error('client-comment-drafts-changed')
    const start = action.cursor ? values.findIndex(value => value.draft.id === action.cursor!.after) + 1 : 0
    if (action.cursor && start === 0) throw new Error('client-comment-drafts-changed')
    const result: Extract<AuthoringClientActionResult, { type: 'comment-drafts.inspect' }> = { type: action.type, family: 'comment', coverage: read.coverage, skippedInvalid: read.skippedInvalid, token, drafts: [] }
    for (const value of values.slice(start, start + (action.limit ?? 10))) {
      const next = { ...result, drafts: [...result.drafts, value], ...start + result.drafts.length + 1 < values.length ? { next: { after: value.draft.id, token } } : {} }
      if (!fits(next)) break
      result.drafts.push(value)
    }
    if (start < values.length && !result.drafts.length) throw new Error('client-comment-metadata-too-large')
    if (start + result.drafts.length < values.length) result.next = { after: result.drafts.at(-1)!.draft.id, token }
    if (!fits(result)) throw new Error('client-comment-metadata-too-large')
    return result
  }
  const value = read.candidates[0]!
  return authoringDraftFragment({ text: JSON.stringify(value.content), base: { type: action.type, family: 'comment', draft: reference(value), storage: value.storage, format: 'presmium-rich-text-json-v1' }, offset: action.offset, maxChars: action.maxChars }, current, fits)
}
