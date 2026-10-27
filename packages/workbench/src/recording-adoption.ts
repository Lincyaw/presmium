import type { DocumentAnswer, DocumentRecordingAdoption, TeachingDocument, VoiceSource } from '@lincyaw/kernel'

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => same(value, b[index]))
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>, keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]))
}
function source(document: TeachingDocument, stepId: string): VoiceSource | undefined {
  const step = document.steps[stepId]
  return step && (document.production.stepOverrides[stepId]?.voiceSource ?? document.production.sectionOverrides?.[step.sectionId]?.voiceSource ?? document.production.defaults.voiceSource)
}

/** Accept only the submitted recording delta; later author input remains the sole local draft. */
export function reconcileRecordingAdoption(request: DocumentRecordingAdoption, before: TeachingDocument, answer: DocumentAnswer, current: TeachingDocument): TeachingDocument | undefined {
  if (before.id !== request.source.documentId || current.id !== before.id || answer.content.id !== before.id) return
  const step = before.steps[request.stepId], asset = before.assets[request.assetId]
  if (!step || asset?.kind !== 'audio') return
  const expected = structuredClone(before)
  expected.assets[asset.id]!.fingerprint = `sha256:${request.sha256}`
  expected.production.stepOverrides[step.id] = { ...expected.production.stepOverrides[step.id], voiceSource: { type: 'recording', assetId: asset.id } }
  if (!same(expected, answer.content)) return
  const content = structuredClone(current), localAsset = content.assets[asset.id]
  const assetUnchanged = same(localAsset, asset) || same(localAsset, expected.assets[asset.id])
  if (assetUnchanged) content.assets[asset.id]!.fingerprint = `sha256:${request.sha256}`
  const own = (document: TeachingDocument) => document.production.stepOverrides[step.id]?.voiceSource
  if (assetUnchanged && content.steps[step.id] && same(own(current), own(before)) && same(source(current, step.id), source(before, step.id))) {
    content.production.stepOverrides[step.id] = { ...content.production.stepOverrides[step.id], voiceSource: { type: 'recording', assetId: asset.id } }
  }
  return content
}
