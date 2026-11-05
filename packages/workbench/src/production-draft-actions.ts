import type { AuthoringClientAction, AuthoringClientActionResult } from '@lincyaw/kernel'
import { authoringDraftFragment, draftContentHash } from './authoring-draft-fragment.ts'
import type { DocumentProduction } from './document-production.ts'

/** Explicit reads use the native pending values; discard never submits production changes. */
export async function executeProductionDraftAction(owner: DocumentProduction, action: Extract<AuthoringClientAction, { type: `production-drafts.${string}` }>, signal: AbortSignal, owned: () => void, fits: (value: AuthoringClientActionResult) => boolean): Promise<AuthoringClientActionResult> {
  const snapshot = owner.productionDraftSnapshot()
  const guard = () => { signal.throwIfAborted(); owned(); snapshot.guard() }
  const values = await Promise.all(snapshot.candidates.map(async candidate => ({ candidate, metadata: { ...candidate.metadata, draft: await draftContentHash(JSON.stringify([snapshot.stamp, candidate.key])) } })))
  guard()
  if (action.type === 'production-drafts.inspect') {
    const token = await draftContentHash(JSON.stringify([snapshot.coverage, values.map(value => value.metadata)]))
    guard()
    if (action.cursor && action.cursor.token !== token) throw new Error('client-production-drafts-changed')
    const start = action.cursor ? values.findIndex(value => value.metadata.draft === action.cursor!.after) + 1 : 0
    if (action.cursor && !start) throw new Error('client-production-drafts-changed')
    const result: Extract<AuthoringClientActionResult, { type: 'production-drafts.inspect' }> = { type: action.type, family: 'production', coverage: snapshot.coverage, token, drafts: [] }
    for (const value of values.slice(start, start + (action.limit ?? 10))) {
      const next = { ...result, drafts: [...result.drafts, value.metadata], ...start + result.drafts.length + 1 < values.length ? { next: { after: value.metadata.draft, token } } : {} }
      if (!fits(next)) break
      result.drafts.push(value.metadata)
    }
    if (start < values.length && !result.drafts.length) throw new Error('client-production-metadata-too-large')
    if (start + result.drafts.length < values.length) result.next = { after: result.drafts.at(-1)!.draft, token }
    if (!fits(result)) throw new Error('client-production-metadata-too-large')
    guard(); return result
  }
  const selected = values.filter(value => value.metadata.draft === action.draft)
  if (selected.length !== 1) throw new Error('client-production-drafts-changed')
  const candidate = selected[0]!.candidate
  if (action.type === 'production-drafts.read') return authoringDraftFragment({ text: JSON.stringify({ kind: candidate.metadata.kind, stepId: candidate.metadata.stepId, ...candidate.metadata.field ? { field: candidate.metadata.field } : {}, value: candidate.value }),
    base: { type: action.type, family: 'production', draft: action.draft, format: 'presmium-production-draft-json-v1' }, offset: action.offset, maxChars: action.maxChars }, guard, fits)
  const result: AuthoringClientActionResult = { type: action.type, family: 'production', draft: action.draft, discarded: true }
  if (!fits(result)) throw new Error('client-production-result-too-large')
  guard(); candidate.discard(); signal.throwIfAborted(); owned()
  return result
}
