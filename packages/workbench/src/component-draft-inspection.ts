import type { AuthoringClientAction, AuthoringClientActionResult, CanonicalSource, ClientComponentDraftMetadata } from '@lincyaw/kernel'
import { authoringDraftFragment, draftContentHash } from './authoring-draft-fragment.ts'
import type { ComponentPropertyAgentCandidate, ComponentPropertyDrafts } from './component-property-drafts.ts'

export const componentDraftReference = ({ record, token }: ComponentPropertyAgentCandidate) => ({ id: record.id, revision: record.revision, token, blockId: record.target.blockId, ...record.target.stepId !== undefined ? { stepId: record.target.stepId } : {} })
/** Metadata is an explicit whitelist: neither baseline/value nor trusted scope identities are spread. */
export function componentDraftMetadata(value: ComponentPropertyAgentCandidate, source: CanonicalSource): ClientComponentDraftMetadata {
  const { record } = value
  return { draft: componentDraftReference(value), current: value.current, definitionId: record.definitionId, storage: value.storage, status: value.status, updatedAt: Date.parse(record.updatedAt), baseVersion: record.source.version,
    sourceCurrent: record.source.documentId === source.documentId && record.source.version === source.version && record.source.fingerprint === source.fingerprint, composing: record.composing, reset: record.reset }
}

export async function inspectComponentDrafts(drafts: ComponentPropertyDrafts, context: { identity: string, memberId: string, source: CanonicalSource }, action: Extract<AuthoringClientAction, { type: 'component-drafts.inspect' | 'component-drafts.read' }>, signal: AbortSignal, fits: (result: AuthoringClientActionResult) => boolean): Promise<AuthoringClientActionResult> {
  const read = await drafts.readForAgent(context, signal, action.type === 'component-drafts.read' ? action.draft : undefined)
  const current = () => { signal.throwIfAborted(); if (!drafts.readable(context.identity, context.memberId) || drafts.revision(context.identity, context.memberId) !== read.revision) throw new Error('client-component-drafts-changed') }
  if (action.type === 'component-drafts.inspect') {
    const values = read.candidates.map(value => componentDraftMetadata(value, context.source)), token = await draftContentHash(JSON.stringify({ values, coverage: read.coverage, skippedInvalid: read.skippedInvalid }))
    current()
    if (action.cursor && action.cursor.token !== token) throw new Error('client-component-drafts-changed')
    const start = action.cursor ? values.findIndex(value => value.draft.token === action.cursor!.after) + 1 : 0
    if (action.cursor && start === 0) throw new Error('client-component-drafts-changed')
    const result: Extract<AuthoringClientActionResult, { type: 'component-drafts.inspect' }> = { type: action.type, family: 'component', coverage: read.coverage, skippedInvalid: read.skippedInvalid, token, drafts: [] }
    for (const value of values.slice(start, start + (action.limit ?? 10))) {
      const next = { ...result, drafts: [...result.drafts, value], ...start + result.drafts.length + 1 < values.length ? { next: { after: value.draft.token, token } } : {} }
      if (!fits(next)) break
      result.drafts.push(value)
    }
    if (start < values.length && !result.drafts.length) throw new Error('client-component-metadata-too-large')
    if (start + result.drafts.length < values.length) result.next = { after: result.drafts.at(-1)!.draft.token, token }
    if (!fits(result)) throw new Error('client-component-metadata-too-large')
    return result
  }
  const value = read.candidates[0]!
  return authoringDraftFragment({ text: JSON.stringify(value.record.value), base: { type: action.type, family: 'component', draft: componentDraftReference(value), storage: value.storage, format: 'presmium-component-parameters-json-v1' }, offset: action.offset, maxChars: action.maxChars }, current, fits)
}
