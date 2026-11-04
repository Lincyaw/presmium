import { useRef, useState } from 'react'
import type { Narration, NarrationNode, TeachingDocument } from '@lincyaw/kernel'
import { randomUUID } from '@lincyaw/kernel'
import { PmIconButton } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { isAgentChanging } from '../workbench.ts'
import { NarrationEditor } from './NarrationEditor.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { narrationFieldFocus, narrationsToNative, nativeToNarrations } from './narration.ts'
import type { NativeNarrationEditor } from './narration-schema.tsx'
import { StepProductionEditor } from '../StepProductionEditor.tsx'

/** Content ownership determines the page, even when the author is reading another page. */
export function documentBlockSection(document: TeachingDocument, blockId: string): string | undefined {
  const contains = (id: string): boolean => {
    if (id === blockId) return true
    const block = document.blocks[id]
    return (block?.type === 'container' || block?.type === 'component') && (block.children ?? []).some(contains)
  }
  return document.sectionOrder.find(id => document.sections[id]?.children.some(contains))
}

export function narrationDisplay(content: readonly NarrationNode[]): string {
  return content.map(node => node.type === 'text' ? node.text : node.type === 'pronunciation' ? node.display : '').join('')
}

function NarrationField({ identity, reset, blockId, stepId, content, readOnly, advanced, onPause }: {
  identity: string, reset: number, blockId?: string, stepId: string, content: Narration[], readOnly: boolean, advanced: boolean, onPause(): void,
}) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale)
  const [emptyId] = useState(() => randomUUID())
  const read = () => {
    const document = workbench.getDocument(identity), step = document?.steps[stepId]
    return step ? step.narrationIds.map(id => ({ id, content: document!.narrations[id]!.content })) : undefined
  }
  const registration = useRef<() => void>()
  const fieldEditor = useRef<NativeNarrationEditor>()
  const owner = `narration:${identity}:${reset}:${JSON.stringify(blockId ?? null)}:${stepId}`
  return <NarrationEditor identity={identity} reset={reset} fieldId={stepId} content={content} locale={locale} readOnly={readOnly} advanced={advanced} blockMenu
    getContent={read} toNative={value => narrationsToNative(value, emptyId)} fromNative={nativeToNarrations}
    cueOwners={() => {
      const document = workbench.getDocument(identity)
      const retained = new Set(Object.values(document?.steps ?? {}).filter(step => step.id !== stepId).flatMap(step => step.narrationIds))
      return new Map([...retained].flatMap(id => document!.narrations[id]!.content.flatMap(node => node.type === 'cue' ? [[node.id, id] as const] : [])))
    }}
    onCueCopy={(from, to) => workbench.copyNarrationCueTiming(from, to, identity)}
    onReady={editor => {
      registration.current?.()
      fieldEditor.current = editor
      registration.current = editor ? workbench.registerDocumentField({ identity, reset, blockId, stepId, focus: narrationFieldFocus(editor), editor }) : undefined
    }}
    onFocus={() => { workbench.documentInteraction(); if (fieldEditor.current) workbench.activateDocumentHistory(fieldEditor.current); onPause() }} onChange={value => workbench.setDocumentNarrations(stepId, value, identity)}
    onComposition={composing => workbench.documentComposition(composing, owner, identity)}
    onError={error => workbench.documentError(error)} />
}

/** Captions are a view of the current step's canonical narration, including unsaved input. */
export function DocumentStepNarration({ blockId, sectionId, stepId, expanded, advanced = false, showLabel = true, panelId, onPause }: {
  blockId?: string, sectionId: string, stepId: string, expanded: boolean, advanced?: boolean, showLabel?: boolean, panelId: string, onPause(): void,
}) {
  const workbench = useWorkbench(), source = useWorkbenchState(state => state.authoring)
  const locale = useWorkbenchState(state => state.locale), t = DOCUMENT_EDITOR_MESSAGES[locale]
  const readOnly = useWorkbenchState(state => workbench.client.capabilities?.readOnly === true || Boolean(state.authoring?.loading) || isAgentChanging(state))
  const timingStorageFailure = useWorkbenchState(state => state.documentTimingDraftStorageFailure)
  if (workbench.client.capabilities?.narration === false) return null
  const document = source?.content, section = document?.sections[sectionId], step = document?.steps[stepId]
  if (!source?.identity || !document || !section || !step) return null
  const index = section.stepOrder.indexOf(stepId), ids = step.narrationIds
  const label = t.narrationStep(index + 1, section.stepOrder.length, step.title ?? ''), fieldLabel = advanced ? t.stepNarration : t.stepCaptions
  const text = ids.map(id => narrationDisplay(document.narrations[id]?.content ?? [])).filter(Boolean).join('\n')
  const navigate = (offset: number) => {
    const id = section.stepOrder[index + offset]
    if (id) { onPause(); workbench.selectDocumentStep(sectionId, id) }
  }
  return <section className="pm-ui-block-preview__narration" aria-label={fieldLabel} data-step-narration={stepId}>
    <header className="pm-ui-block-preview__narration-header">
      <span className="pm-ui-block-preview__step-label">{label}</span>
      <span className="pm-ui-block-preview__actions">
        <PmIconButton small icon="chevron-left" label={t.previousStep} disabled={index <= 0} onClick={() => navigate(-1)} />
        <PmIconButton small icon="chevron-right" label={t.nextStep} disabled={index >= section.stepOrder.length - 1} onClick={() => navigate(1)} />
      </span>
    </header>
    {!expanded && text && <p className="pm-ui-block-preview__caption" data-step-caption={stepId}>{text}</p>}
    {expanded && <div id={panelId} className="pm-ui-block-preview__narration-fields">
      {showLabel && <span className="pm-ui-block-preview__step-label">{fieldLabel}</span>}
      <NarrationField key={`narration:${source.identity}:${source.reset}:${stepId}`}
        identity={source.identity!} reset={source.reset} blockId={blockId} stepId={stepId}
        content={ids.map(id => ({ id, content: document.narrations[id]!.content }))} readOnly={readOnly} advanced={advanced} onPause={onPause} />
      <StepProductionEditor key={`timing:${source.identity}:${source.reset}:${stepId}`} document={document} stepId={stepId} locale={locale} readOnly={readOnly} advanced={advanced}
        onPause={onPause} onInteraction={() => workbench.documentInteraction()}
        onChange={patch => workbench.setDocumentStepProduction(stepId, patch, source.identity)}
        drafts={{ minimumHoldMs: workbench.documentTimingDraft(stepId, 'minimumHoldMs', source.identity, source.reset), trailingPauseMs: workbench.documentTimingDraft(stepId, 'trailingPauseMs', source.identity, source.reset) }}
        draftStorageFailure={timingStorageFailure}
        onDraft={(key, draft) => workbench.setDocumentTimingDraft(stepId, key, draft, source.identity!, source.reset)}
        onComposition={(key, composing) => workbench.documentComposition(composing, `production:${source.identity}:${source.reset}:${blockId}:${stepId}:${key}`, source.identity)} />
    </div>}
  </section>
}
