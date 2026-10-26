import { useRef, useState } from 'react'
import type { NarrationNode, TeachingDocument } from '@lincyaw/kernel'
import { PmIconButton } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { isAgentChanging } from '../workbench.ts'
import { NarrationEditor } from './NarrationEditor.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { narrationFieldFocus } from './narration.ts'

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

function NarrationField({ identity, reset, blockId, stepId, slot, narrationId, content, readOnly, onPause }: {
  identity: string, reset: number, blockId: string, stepId: string, slot: number, narrationId?: string, content: NarrationNode[], readOnly: boolean, onPause(): void,
}) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale)
  // Reserving an identity does not create an entity. The first actual input commits it.
  const [id] = useState(() => narrationId ?? workbench.pendingDocumentField(blockId, identity)?.narrationId ?? crypto.randomUUID())
  const registration = useRef<() => void>()
  const owner = `narration:${identity}:${stepId}:${id}`
  return <NarrationEditor identity={identity} reset={reset} narrationId={id} content={content} locale={locale} readOnly={readOnly}
    getContent={() => { const document = workbench.getDocument(identity); return document ? document.narrations[id]?.content ?? [] : undefined }}
    onReady={editor => {
      registration.current?.()
      registration.current = editor ? workbench.registerDocumentField({ identity, reset, blockId, stepId, narrationId: id, slot, focus: narrationFieldFocus(editor) }) : undefined
    }}
    onFocus={() => { workbench.documentInteraction(); onPause() }} onChange={value => workbench.setDocumentNarration(stepId, id, value, identity)}
    onComposition={composing => workbench.documentComposition(composing, owner, identity)}
    onError={error => workbench.documentError(error)} />
}

/** Captions are a view of the current step's canonical narration, including unsaved input. */
export function DocumentStepNarration({ blockId, sectionId, stepId, expanded, panelId, onPause }: {
  blockId: string, sectionId: string, stepId: string, expanded: boolean, panelId: string, onPause(): void,
}) {
  const workbench = useWorkbench(), source = useWorkbenchState(state => state.authoring)
  const locale = useWorkbenchState(state => state.locale), t = DOCUMENT_EDITOR_MESSAGES[locale]
  const readOnly = useWorkbenchState(isAgentChanging)
  const document = source?.content, section = document?.sections[sectionId], step = document?.steps[stepId]
  if (!source?.identity || !document || !section || !step) return null
  const index = section.stepOrder.indexOf(stepId), ids = step.narrationIds
  const label = t.narrationStep(index + 1, section.stepOrder.length, step.title ?? '')
  const text = ids.map(id => narrationDisplay(document.narrations[id]?.content ?? [])).filter(Boolean).join('\n')
  const navigate = (offset: number) => {
    const id = section.stepOrder[index + offset]
    if (id) { onPause(); workbench.observeDocumentStep(sectionId, id) }
  }
  return <section className="pm-ui-block-preview__narration" aria-label={t.stepNarration} data-step-narration={stepId}>
    <header className="pm-ui-block-preview__narration-header">
      <span className="pm-ui-block-preview__step-label">{label}</span>
      <span className="pm-ui-block-preview__actions">
        <PmIconButton small icon="chevron-left" label={t.previousStep} disabled={index <= 0} onClick={() => navigate(-1)} />
        <PmIconButton small icon="chevron-right" label={t.nextStep} disabled={index >= section.stepOrder.length - 1} onClick={() => navigate(1)} />
      </span>
    </header>
    {!expanded && text && <p className="pm-ui-block-preview__caption" data-step-caption={stepId}>{text}</p>}
    {expanded && <div id={panelId} className="pm-ui-block-preview__narration-fields">
      <span className="pm-ui-block-preview__step-label">{t.stepNarration}</span>
      {(ids.length ? ids : [undefined]).map((id, slot) => <NarrationField key={`${source.identity}:${source.reset}:${stepId}:${slot}`}
        identity={source.identity!} reset={source.reset} blockId={blockId} stepId={stepId} slot={slot} narrationId={id}
        content={id ? document.narrations[id]?.content ?? [] : []} readOnly={readOnly} onPause={onPause} />)}
      <p className="pm-ui-block-preview__narration-hint">{t.narrationHint}</p>
    </div>}
  </section>
}
