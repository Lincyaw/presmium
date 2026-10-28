import { applyDocumentComponentAction, createDocumentParameterChanges, effectiveComponentParameters } from '@lincyaw/kernel'
import type { CanonicalSource, DocumentAnswer, DocumentComponentAction, JsonObject, TeachingDocument } from '@lincyaw/kernel'
import type { ComponentPropertyDraft } from './component-property-drafts.ts'

export const sameComponentSource = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
export const componentSource = (answer: Pick<DocumentAnswer, 'content' | 'version' | 'fingerprint'>): CanonicalSource => ({ documentId: answer.content.id, version: answer.version, fingerprint: answer.fingerprint })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function componentPropertyAction(draft: ComponentPropertyDraft): DocumentComponentAction | undefined {
  const { blockId, stepId } = draft.target
  if (stepId && draft.reset) return { type: 'component.step-parameters.reset', blockId, stepId }
  const changes = createDocumentParameterChanges(draft.baseline, draft.value)
  if (!changes.length) return
  return stepId ? { type: 'component.step-parameters.patch', blockId, stepId, changes } : { type: 'component.parameters.patch', blockId, changes }
}

/** A checked rebase borrows the same reducer as the service, preserving unrelated current data. */
export function rebaseComponentPropertyDraft(document: TeachingDocument, draft: ComponentPropertyDraft): JsonObject {
  const block = document.blocks[draft.target.blockId]
  if (block?.type !== 'component' || block.definitionId !== draft.definitionId) throw new Error('component-definition-changed')
  const action = componentPropertyAction(draft)
  const content = action ? applyDocumentComponentAction(document, action).content : document
  return effectiveComponentParameters(content, block.id, draft.target.stepId).parameters
}

/** An external acknowledgement owns its parameter paths, never a later body tree or sibling form. */
export function reconcileComponentAction(action: DocumentComponentAction, before: TeachingDocument, answer: DocumentAnswer, current: TeachingDocument): TeachingDocument | undefined {
  try {
    if (answer.content.id !== before.id || current.id !== before.id) return
    const expected = applyDocumentComponentAction(before, action).content
    if (!same(expected, answer.content)) return
    const original = before.blocks[action.blockId], actual = current.blocks[action.blockId]
    if (original?.type !== 'component') return
    // A later native deletion stays deleted. Its history is updated separately from the verified canonical reply.
    if (!actual) return current
    if (actual.type !== 'component' || actual.definitionId !== original.definitionId || !same(actual.parameters, original.parameters)
      || !same(before.definitions[original.definitionId], current.definitions[actual.definitionId])) return
    if ('stepId' in action) {
      const oldStep = before.steps[action.stepId], newStep = current.steps[action.stepId]
      if (!oldStep || !newStep || oldStep.sectionId !== newStep.sectionId || oldStep.inherits !== newStep.inherits
        || !same(effectiveComponentParameters(before, action.blockId, action.stepId), effectiveComponentParameters(current, action.blockId, action.stepId))) return
    }
    return applyDocumentComponentAction(current, action).content
  } catch { return }
}
