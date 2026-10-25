import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@lincyaw/kernel'
import { PmButton, PmField, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { animationDuration, readStepNarration } from '../narration.ts'
import type { StepNarrationDraft } from '../narration.ts'
import { isAgentChanging } from '../workbench.ts'

/** A step is the editing unit, whether selected on the document or while presenting. */
export function NarrationPanel() {
  const workbench = useWorkbench()
  const t = useMessages()
  const doc = useWorkbenchState(s => s.ir?.doc)
  const target = useWorkbenchState(s => s.narration)
  const busy = useWorkbenchState(isAgentChanging)
  const [draft, setDraft] = useState<StepNarrationDraft>()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'during' | 'after'>('during')
  const [failure, setFailure] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const dirty = draft !== undefined && (text !== draft.text || mode !== draft.mode)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => { workbench.markNarrationDirty(dirty) }, [dirty, workbench])
  useEffect(() => {
    if (!doc || !target || dirtyRef.current) return
    const section = doc.sections.find(s => s.id === target.section)
    if (!section) return
    let current = true
    setDraft(undefined)
    setFailure('')
    void readStepNarration(workbench.client, doc, section, target.step).then(value => {
      if (!current) return
      setDraft(value); setText(value.text); setMode(value.mode)
    }).catch(error => { if (current) setFailure(errorMessage(error)) })
    return () => { current = false }
  }, [doc, target?.section, target?.step, reload, workbench])
  if (!doc || !target) return null
  const selected = draft ?? target
  const section = doc.sections.find(s => s.id === selected.section)
  if (!section) return null
  const number = doc.sections.indexOf(section) + 1
  const pending = dirty && (draft?.section !== target.section || draft?.step !== target.step)
  const duration = animationDuration(section, selected.step)
  const reset = () => { dirtyRef.current = false; setDraft(undefined); setReload(n => n + 1) }
  const save = async () => {
    if (!draft) return
    setSaving(true); setFailure('')
    try { await workbench.saveNarration(draft, text, mode); reset() }
    catch (error) { setFailure(errorMessage(error)) }
    finally { setSaving(false) }
  }
  const close = () => { if (!dirty) workbench.closeNarration(); else setFailure(t.narrationPending) }
  return (
    <section className="pmw-narration pm-ui" aria-label={t.narration}>
      <header className="pmw-pane__header">
        <PmIcon name="captions" /><h2 className="pmw-pane__title">{t.narration}</h2>
        <PmIconButton small icon="close" label={t.close} onClick={close} />
      </header>
      <div className="pmw-narration__body">
        <p className="pmw-narration__place" title={section.title}><PmIcon name="slides" />{number}<PmIcon name="steps" />{selected.step + 1}<span>{section.title}</span></p>
        <div className="pmw-narration__steps" role="group" aria-label={t.narration}>
          {Array.from({ length: section.steps + 1 }, (_, step) => <button key={step} type="button" className="pm-ui-button pm-ui-button--small" aria-label={t.narrationStep(number, step + 1)} aria-pressed={selected.step === step} disabled={saving || dirty} onClick={() => workbench.selectNarration(section.id, step)}><PmIcon name="steps" />{step + 1}</button>)}
        </div>
        {failure && <PmNotice tone="danger">{failure === 'script-file' ? t.narrationScript : failure === 'multiple-files' ? t.narrationFiles : failure === 'formatted-narration' ? t.narrationFormatted : failure}</PmNotice>}
        {pending && <PmNotice tone="warn">{t.narrationPending}</PmNotice>}
        {draft ? <>
          <PmField label={t.narrationMode} group>
            <div className="pmw-narration__modes">
              {(['during', 'after'] as const).map(value => <button key={value} type="button" className="pm-ui-button pm-ui-button--small" aria-pressed={mode === value} disabled={saving || busy} onClick={() => setMode(value)}><PmIcon name={value === 'during' ? 'split' : 'timing'} />{value === 'during' ? t.narrationDuring : t.narrationAfter}</button>)}
            </div>
          </PmField>
          <div className="pmw-narration__timeline" data-mode={mode} role="img" aria-label={`${t.narrationTimeline}: ${mode === 'after' ? t.narrationAfter : t.narrationDuring}`}>
            <span className="pmw-narration__animation"><PmIcon name="play" />{t.narrationAnimation}{duration > 0 ? ` · ${duration / 1000}s` : ''}</span>
            <span className="pmw-narration__speech"><PmIcon name="captions" />{t.narrationSpeech}</span>
          </div>
          <PmField label={t.narrationText}><textarea className="pm-ui-textarea" value={text} placeholder={t.narrationPlaceholder} disabled={saving || busy} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save() } }} /></PmField>
          <div className="pmw-narration__actions"><PmButton small disabled={saving || !dirty} onClick={reset}>{t.cancel}</PmButton><PmButton small variant="primary" icon="save" disabled={saving || busy || !dirty} onClick={() => void save()}>{saving ? t.saving : t.save}</PmButton></div>
        </> : !failure && <p className="pmw-muted">{t.narrationLoading}</p>}
      </div>
    </section>
  )
}
