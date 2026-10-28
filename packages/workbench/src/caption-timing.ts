import { applyDocumentCaptionTiming, captionSourceFingerprint } from '@lincyaw/kernel'
import type { DocumentAnswer, DocumentCaptionTimingAction, TeachingDocument } from '@lincyaw/kernel'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** The source actor adopts only this caption slot; later native body input remains owned by the editor. */
export function reconcileCaptionTiming(action: DocumentCaptionTimingAction, before: TeachingDocument, answer: DocumentAnswer, current: TeachingDocument): TeachingDocument | undefined {
  try {
    if (before.id !== answer.content.id || before.id !== current.id || !same(applyDocumentCaptionTiming(before, action).content, answer.content)) return
    if (!current.steps[action.stepId]) return current
    if (!same(before.production.captionTimings?.[action.stepId], current.production.captionTimings?.[action.stepId])
      || captionSourceFingerprint(before, action.stepId) !== captionSourceFingerprint(current, action.stepId)) return
    return applyDocumentCaptionTiming(current, action).content
  } catch { return }
}
