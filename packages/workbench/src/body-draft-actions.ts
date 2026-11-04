import type { AuthoringClientAction, AuthoringClientActionResult, ClientBodyDraftMetadata } from '@lincyaw/kernel'
import { authoringDraftFragment, draftContentHash } from './authoring-draft-fragment.ts'
import type { BodyDraftCandidate, DocumentDraftOperation, DocumentSession, DocumentSessionState } from './document-session.ts'

type BodyAction = Extract<AuthoringClientAction, { type: `body-drafts.${string}` }>
/** Explicit draft inspection never sends owner IDs, base hashes or body text in metadata. */
const metadata = (value: BodyDraftCandidate, version: string): ClientBodyDraftMetadata => ({
  draft: value.draft.token, current: value.draft.current, storage: value.storage, updatedAt: value.updatedAt, baseVersion: value.baseVersion, baseObserved: value.baseVersion === version,
  composing: value.composing, pendingSubmission: value.pendingSubmission,
})
export async function executeBodyDraftAction(session: DocumentSession, state: () => DocumentSessionState | undefined, action: BodyAction, operation: DocumentDraftOperation, fits: (result: AuthoringClientActionResult) => boolean): Promise<AuthoringClientActionResult> {
  const read = await session.readBodyDrafts(operation.signal, 'draft' in action ? action.draft : undefined)
  const guard = () => { operation.guard(); read.guard() }
  guard()
  if (action.type === 'body-drafts.inspect') {
    const values = read.candidates.map(value => metadata(value, operation.source.version)), token = await draftContentHash(JSON.stringify({ values, coverage: read.coverage }))
    guard()
    if (action.cursor && action.cursor.token !== token) throw new Error('client-body-drafts-changed')
    const start = action.cursor ? values.findIndex(value => value.draft === action.cursor!.after) + 1 : 0
    if (action.cursor && start === 0) throw new Error('client-body-drafts-changed')
    const result: Extract<AuthoringClientActionResult, { type: 'body-drafts.inspect' }> = { type: action.type, family: 'body', coverage: read.coverage, token, drafts: [] }
    for (const value of values.slice(start, start + (action.limit ?? 10))) {
      const next = { ...result, drafts: [...result.drafts, value], ...start + result.drafts.length + 1 < values.length ? { next: { after: value.draft, token } } : {} }
      if (!fits(next)) break
      result.drafts.push(value)
    }
    if (start < values.length && !result.drafts.length) throw new Error('client-body-metadata-too-large')
    if (start + result.drafts.length < values.length) result.next = { after: result.drafts.at(-1)!.draft, token }
    if (!fits(result)) throw new Error('client-body-metadata-too-large')
    guard(); return result
  }
  const value = read.candidates[0]!
  if (action.type === 'body-drafts.read') return authoringDraftFragment({ text: JSON.stringify(value.content), base: { type: action.type, family: 'body', draft: value.draft.token, storage: value.storage, format: 'presmium-document-json-v1' }, offset: action.offset, maxChars: action.maxChars }, guard, fits)
  if (!session.bodyDraftCapabilities().mutate || value.composing || value.pendingSubmission || action.type === 'body-drafts.restore' && value.draft.current || action.type === 'body-drafts.retry' && !value.draft.current) throw new Error('client-body-draft-needs-human')
  const result = (outcome: Extract<AuthoringClientActionResult, { family: 'body', outcome: string }>['outcome']): Extract<AuthoringClientActionResult, { family: 'body', outcome: string }> => {
    const now = state()
    return { type: action.type, family: 'body', draft: value.draft.token, outcome, dirty: Boolean(now?.dirty), conflicted: Boolean(now?.error), ...now?.backupPending ? { backupPending: true as const } : {}, ...now?.storageFailure ? { backupRetained: true as const } : {} }
  }
  if (!fits({ ...result(action.type === 'body-drafts.restore' ? 'restored' : action.type === 'body-drafts.retry' ? 'saved' : value.draft.current ? 'source-restored' : 'backup-discarded'), backupPending: true, backupRetained: true })) throw new Error('client-body-result-too-large')
  guard()
  let outcome: 'restored' | 'already-saved' | 'source-restored' | 'backup-discarded' | 'saved'
  if (action.type === 'body-drafts.restore') {
    const restored = await session.recoverDraft(value.draft, operation)
    if (!restored) throw new Error('client-body-drafts-changed')
    outcome = restored
  } else if (action.type === 'body-drafts.discard') {
    const done = value.draft.current ? await session.discard(operation) : await session.forgetDraft(value.draft, operation)
    if (!done) throw new Error('client-body-drafts-changed')
    outcome = value.draft.current ? 'source-restored' : 'backup-discarded'
  } else {
    await session.retry(operation)
    if (state()?.error || state()?.saving || state()?.restored) throw new Error('client-body-save-unverified')
    outcome = 'saved'
  }
  operation.signal.throwIfAborted()
  // A successful retry may finish at a new canonical version. The transport checks that saved source.
  const answer = result(outcome)
  if (!fits(answer)) throw new Error('client-body-result-too-large')
  return answer
}
