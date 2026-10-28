import type { AuthoringClientAction, AuthoringClientActionResult, ClientCommentDraftMetadata } from '@lincyaw/kernel'
import { isNewCommentDraft } from './comment-drafts.ts'
import type { CommentDraftCandidate, CommentDrafts } from './comment-drafts.ts'

const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const reference = (value: CommentDraftCandidate) => ({ id: value.id, revision: value.revision, token: value.token })
const boundary = (text: string, offset: number) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!))

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
  const value = read.candidates[0]!, text = JSON.stringify(value.content), sha256 = await hash(text)
  current()
  if (action.offset > text.length || !boundary(text, action.offset)) throw new Error('client-comment-offset-invalid')
  const base = { type: action.type, family: 'comment' as const, draft: reference(value), storage: value.storage,
    format: 'presmium-rich-text-json-v1' as const, offset: action.offset, totalUtf16: text.length, totalUtf8: new TextEncoder().encode(text).byteLength, sha256 }
  let low = action.offset, high = Math.min(text.length, action.offset + (action.maxChars ?? 2048)), best: AuthoringClientActionResult | undefined
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    let end = middle
    if (!boundary(text, end)) end--
    const result = { ...base, endOffset: end, jsonText: text.slice(action.offset, end) }
    if (fits(result)) { if (end > action.offset || end === text.length) best = result; low = middle + 1 }
    else high = middle - 1
  }
  if (!best) throw new Error('client-comment-fragment-too-large')
  return best
}
