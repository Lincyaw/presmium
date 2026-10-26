import { useEffect, useId } from 'react'
import { PmEmpty, PmIconButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { DocumentStepNarration } from '../document-editor/DocumentStepNarration.tsx'

/** The same step-bound fields are available even when a page has no runtime block. */
export function DocumentNarrationPanel({ onClose }: { onClose(): void }) {
  const workbench = useWorkbench(), t = useMessages(), panelId = useId()
  const source = useWorkbenchState(state => state.authoring)
  const position = useWorkbenchState(state => state.position)
  const document = source?.content
  const sectionId = position && document?.sections[position.section] ? position.section : document?.sectionOrder[0]
  const section = sectionId ? document?.sections[sectionId] : undefined
  const stepId = section?.stepOrder[position && position.section === sectionId ? position.step : 0] ?? section?.stepOrder[0]
  const pause = () => {
    if (sectionId && stepId) workbench.pauseDocumentStep(sectionId, stepId)
    workbench.stopAuditions()
  }
  useEffect(() => { pause() }, [workbench, source?.identity])
  return <section className="pmw-pane" aria-labelledby={panelId}>
    <header className="pmw-pane__header"><h2 id={panelId} className="pmw-pane__title">{t.documentNarration}</h2><PmIconButton small icon="close" label={t.close} onClick={onClose} /></header>
    {section && sectionId && stepId ? <>
      <p className="pmw-pane__footer">{section.title}</p>
      <DocumentStepNarration sectionId={sectionId} stepId={stepId} expanded panelId={`${panelId}-fields`} onPause={pause} />
    </> : <PmEmpty icon="captions">{t.noSections}</PmEmpty>}
  </section>
}
