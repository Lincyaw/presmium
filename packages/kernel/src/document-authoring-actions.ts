import { applyDocumentCaptionTiming } from './document-caption-timings.ts'
import { captionScale, changeDocumentCaptionScale } from './document-caption-scale.ts'
import { hasRole } from './access.ts'
import { applyDocumentCommentAction, degradeDocumentCommentAnchor, DocumentCommentError, validateDocumentCommentAnchor } from './document-comments.ts'
import { documentAnchorKey } from './document-places.ts'
import { changeDocumentVoice, documentVoiceStepIds, previewDocumentVoiceChange } from './document-voices.ts'
import { applyDocumentComponentAction } from './document-components.ts'
import type { DocumentAuthoringAction, DocumentAuthoringActionEffect } from './contracts/authoring-actions.ts'
import type { DocumentCommentContext } from './contracts/document-comments.ts'
import type { TeachingDocument } from './contracts/document.ts'

export function enableDocumentProduction(document: TeachingDocument): TeachingDocument {
  const plugins = [...new Set([...(document.metadata.plugins ?? []), '@lincyaw/addon-lecture', '@lincyaw/addon-speech'])]
  if (JSON.stringify(plugins) === JSON.stringify(document.metadata.plugins) && document.metadata.renderers?.lecture) return document
  return { ...document, metadata: { ...document.metadata, plugins, renderers: { ...document.metadata.renderers, lecture: document.metadata.renderers?.lecture ?? {} } } }
}

/** Fixed context is supplied by the owning adapter exactly once per semantic plan. */
export function applyDocumentAuthoringAction(document: TeachingDocument, action: DocumentAuthoringAction, context: DocumentCommentContext): { content: TeachingDocument, effect: DocumentAuthoringActionEffect } {
  if (!context.member || !hasRole(context.member, 'editor')) throw new DocumentCommentError(403, 'authoring-permission-denied')
  if (action.type === 'production.enable') {
    const content = enableDocumentProduction(document)
    return { content, effect: { kind: 'production', value: { enabled: true, changed: content !== document } } }
  }
  if (action.type === 'caption.scale.set') {
    const content = changeDocumentCaptionScale(document, action.scale)
    return { content, effect: { kind: 'caption-scale', value: { scale: captionScale(content.production), changed: content !== document } } }
  }
  if (action.type === 'component.parameters.patch' || action.type === 'component.step-parameters.patch' || action.type === 'component.step-parameters.reset' || action.type === 'component.definition.use') {
    const { content, effect } = applyDocumentComponentAction(document, action)
    return { content, effect: { kind: 'component', value: effect } }
  }
  if (action.type === 'caption.timing.set' || action.type === 'caption.timing.reset') {
    const result = applyDocumentCaptionTiming(document, action)
    return { content: result.content, effect: { kind: 'caption', value: result.effect } }
  }
  if (action.type === 'voice.set') {
    if (action.source !== null && action.source.type !== 'tts' && action.source.type !== 'none') throw new DocumentCommentError(422, 'voice-recording-requires-adoption')
    const content = changeDocumentVoice(document, action.scope, action.source, { replaceOverrides: action.replaceOverrides }), recordings = { preserved: 0, removed: 0 }
    const check = (before: typeof document.production.defaults.voiceSource, after: typeof before) => { if (before?.type === 'recording') { if (after?.type === 'recording' && before.assetId === after.assetId) recordings.preserved++; else recordings.removed++ } }
    if (action.scope.kind === 'document') check(document.production.defaults.voiceSource, content.production.defaults.voiceSource)
    const pages = action.scope.kind === 'document' ? document.sectionOrder : action.scope.kind === 'page' ? [action.scope.sectionId] : []
    for (const id of pages) check(document.production.sectionOverrides?.[id]?.voiceSource, content.production.sectionOverrides?.[id]?.voiceSource)
    for (const id of documentVoiceStepIds(document, action.scope)) check(document.production.stepOverrides[id]?.voiceSource, content.production.stepOverrides[id]?.voiceSource)
    return { content, effect: { kind: 'voice', scope: action.scope.kind, value: previewDocumentVoiceChange(document, action.scope, action.source, { replaceOverrides: action.replaceOverrides }), recordings } }
  }
  if (action.type === 'comment.create') validateDocumentCommentAnchor(document, action.anchor ?? undefined)
  let source = document.comments ?? {}, detached = false, degraded = false
  if (action.type !== 'comment.create' && Object.hasOwn(source, action.threadId)) {
    const thread = source[action.threadId]!
    const anchor = degradeDocumentCommentAnchor(document, thread.anchor)
    if (thread.anchor && !anchor) {
      const { anchor: _anchor, ...unanchored } = thread
      source = { ...source, [thread.id]: unanchored }; detached = true
    } else if (anchor && documentAnchorKey(anchor) !== documentAnchorKey(thread.anchor)) {
      source = { ...source, [thread.id]: { ...thread, anchor } }; degraded = true
    }
  }
  const { threads, effect } = applyDocumentCommentAction(source, action, context)
  if (detached) { effect.anchorDetached = true; effect.changed = true }
  else if (degraded) effect.changed = true
  const content = { ...document }
  if (Object.keys(threads).length) content.comments = threads
  else delete content.comments
  return { content, effect: { kind: 'comment', value: effect } }
}
