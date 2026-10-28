import type { AuthoringClientAction, AuthoringClientActionResult, CanonicalSource, ClientComponentDraftReference } from '@lincyaw/kernel'
import { draftContentHash } from './authoring-draft-fragment.ts'
import { componentDraftMetadata, componentDraftReference } from './component-draft-inspection.ts'
import type { ComponentPropertyDraft, ComponentPropertyDrafts } from './component-property-drafts.ts'

export const sameComponentDraftReference = (a: ClientComponentDraftReference | null, b: ClientComponentDraftReference | null): boolean => a === null || b === null ? a === b
  : a.id === b.id && a.revision === b.revision && a.token === b.token && a.blockId === b.blockId && a.stepId === b.stepId

/** Explicit form actions reuse the human bank; they never apply parameters to lecture.json. */
export async function mutateComponentDrafts(bank: ComponentPropertyDrafts, context: { identity: string, memberId: string, source: CanonicalSource }, action: Extract<AuthoringClientAction, { type: 'component-drafts.restore' | 'component-drafts.discard' }>, signal: AbortSignal, owned: (draft?: ComponentPropertyDraft) => void, fits: (result: AuthoringClientActionResult) => boolean): Promise<AuthoringClientActionResult> {
  const read = await bank.readForAgent(context, signal, action.draft)
  owned()
  const candidate = read.candidates[0]!, target = candidate.record.target, previous = bank.get(target)
  owned(candidate.record)
  const unchanged = () => { signal.throwIfAborted(); owned(candidate.record); if (bank.get(target) !== previous) throw new Error('client-component-drafts-changed') }
  if (action.type === 'component-drafts.discard') {
    if (candidate.current && (!previous || previous.id !== candidate.record.id || previous.revision !== candidate.record.revision)) throw new Error('client-component-drafts-changed')
    if (candidate.current !== action.current) throw new Error('client-component-drafts-changed')
    if (candidate.current && (candidate.storage !== 'durable' || candidate.status !== 'available' || candidate.record.composing || bank.status(target) !== 'available')) throw new Error('client-component-draft-needs-human')
    const result: AuthoringClientActionResult = { type: action.type, family: 'component', draft: action.draft, current: action.current, discarded: true }
    if (!fits(result)) throw new Error('client-component-result-too-large')
    unchanged()
    const discarded = candidate.current ? await bank.clear(previous!, { preserveOrigins: true }) : await bank.discard(candidate, signal, unchanged)
    signal.throwIfAborted(); owned()
    if (!discarded) throw new Error('client-component-drafts-changed')
    return result
  }
  if (candidate.current || candidate.record.composing) throw new Error('client-component-draft-needs-human')
  if (previous) {
    if (!action.expectedCurrent || action.expectedCurrent.blockId !== target.blockId || action.expectedCurrent.stepId !== target.stepId) throw new Error('client-component-drafts-changed')
    const current = await bank.readForAgent(context, signal, action.expectedCurrent)
    unchanged()
    const value = current.candidates[0]!
    if (!value.current || !sameComponentDraftReference(componentDraftReference(value), action.expectedCurrent)) throw new Error('client-component-drafts-changed')
    if (value.storage !== 'durable' || value.status !== 'available' || value.record.composing || bank.status(target) !== 'available') throw new Error('client-component-draft-needs-human')
  } else if (action.expectedCurrent !== null) throw new Error('client-component-drafts-changed')
  unchanged()
  if (!bank.canKeep(target)) throw new Error('client-component-drafts-limit')
  const projected = { ...candidate.record, id: '0'.repeat(36), revision: 1, composing: false, updatedAt: new Date().toISOString() }
  if (!fits({ type: action.type, family: 'component', draft: action.draft,
    restored: componentDraftMetadata({ ...candidate, record: projected, token: '0'.repeat(64), current: true, storage: 'durable', status: 'available' }, context.source), preservedCurrent: action.expectedCurrent })) throw new Error('client-component-result-too-large')
  const restored = await bank.recover(candidate, previous, signal, unchanged)
  signal.throwIfAborted(); owned()
  if (!restored) throw new Error('client-component-drafts-changed')
  const record = bank.get(target)
  if (!record || record.id === candidate.record.id || record.id === previous?.id || record.composing || bank.status(target) !== 'available') throw new Error('client-component-drafts-changed')
  const token = await draftContentHash(JSON.stringify(record))
  signal.throwIfAborted(); owned()
  if (bank.get(target) !== record) throw new Error('client-component-drafts-changed')
  const result: AuthoringClientActionResult = { type: action.type, family: 'component', draft: action.draft,
    restored: componentDraftMetadata({ record, token, key: candidate.key, current: true, storage: 'durable', status: 'available' }, context.source), preservedCurrent: action.expectedCurrent }
  if (!fits(result)) throw new Error('client-component-result-too-large')
  return result
}
