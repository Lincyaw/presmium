import { useEffect, useState, useSyncExternalStore } from 'react'
import { PmButton, PmField, PmIcon, PmIconButton, PmNotice, PmSegmented, PmTextarea } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { animationDuration } from '../narration.ts'
import { narrationDraftKey, narrationDrafts } from '../narration-drafts.ts'
import { isAgentChanging } from '../workbench.ts'

/** Selection follows the shared position; each draft and acknowledgement stays bound to its original step. */
export function NarrationPanel() {
  const workbench = useWorkbench()
  const t = useMessages()
  const doc = useWorkbenchState(state => state.ir?.doc)
  const dir = useWorkbenchState(state => state.document)
  const target = useWorkbenchState(state => state.narration)
  const busy = useWorkbenchState(isAgentChanging)
  const session = narrationDrafts(workbench.client)
  const edits = useSyncExternalStore(session.subscribe, session.snapshot)
  const [composing, setComposing] = useState(false)
  const key = dir !== undefined && target ? narrationDraftKey(dir, target.section, target.step) : undefined
  const edit = key ? edits[key] : undefined
  useEffect(() => {
    if (!doc || dir === undefined || !target) return
    const section = doc.sections.find(section => section.id === target.section)
    if (section) void session.open(dir, doc, section, target.step)
  }, [doc, dir, target?.section, target?.step, session, edit === undefined])
  useEffect(() => {
    if (busy || composing || dir === undefined) return
    const timers = Object.entries(edits).filter(([, entry]) => entry.document === dir && entry.dirty && !entry.saving && !entry.failure).map(([id]) => setTimeout(() => {
      void session.save(id, (draft, text, mode) => workbench.saveNarration(draft, text, mode))
    }, 600))
    return () => { timers.forEach(clearTimeout) }
  }, [edits, dir, composing, busy, session, workbench])
  if (!doc || !target || dir === undefined || !key) return null
  const section = doc.sections.find(section => section.id === target.section)
  if (!section) return null
  const number = doc.sections.indexOf(section) + 1
  const duration = animationDuration(section, target.step)
  const mode = edit?.mode ?? 'during'
  const save = () => { if (!busy && !composing) void session.save(key, (draft, text, mode) => workbench.saveNarration(draft, text, mode)) }
  const failure = edit?.failure
  const message = failure === 'script-file' ? t.narrationScript : failure === 'multiple-files' ? t.narrationFiles : failure === 'formatted-narration' ? t.narrationFormatted : failure === 'narration-conflict' ? t.narrationChanged : failure
  return (
    <section className="pmw-narration pm-ui" aria-label={t.narration}>
      <header className="pmw-pane__header">
        <PmIcon name="captions" /><h2 className="pmw-pane__title">{t.narration}</h2>
        <PmIconButton small icon="close" label={t.close} onClick={() => workbench.closeNarration()} />
      </header>
      <div className="pmw-narration__body">
        <p className="pmw-narration__place" title={section.title}><PmIcon name="slides" />{number}<PmIcon name="steps" />{target.step + 1}<span>{section.title}</span></p>
        {section.steps > 0 && <div className="pmw-narration__steps" role="group" aria-label={t.narration}>
          {Array.from({ length: section.steps + 1 }, (_, step) => <PmButton key={step} small icon="steps" aria-label={t.narrationStep(number, step + 1)} aria-pressed={target.step === step} onClick={() => workbench.selectNarration(section.id, step)}>{step + 1}</PmButton>)}
        </div>}
        {message && <PmNotice tone="danger">{message}</PmNotice>}
        {edit?.recoveryFailed && edit.dirty && <PmNotice tone="warn">{t.narrationRecoveryUnavailable}</PmNotice>}
        {edit?.draft ? <>
          <PmField label={t.narrationMode} group>
            <PmSegmented label={t.narrationMode} value={mode} options={[
              { value: 'during', label: t.narrationDuring, icon: 'split' },
              { value: 'after', label: t.narrationAfter, icon: 'timing' },
            ]} disabled={busy} onChange={value => session.change(key, { mode: value as 'during' | 'after' })} />
          </PmField>
          <div className="pmw-narration__timeline" data-mode={mode} role="img" aria-label={`${t.narrationTimeline}: ${mode === 'after' ? t.narrationAfter : t.narrationDuring}`}>
            <span className="pmw-narration__animation"><PmIcon name="play" />{t.narrationAnimation}{duration > 0 ? ` · ${duration / 1000}s` : ''}</span>
            <span className="pmw-narration__speech"><PmIcon name="captions" />{t.narrationSpeech}</span>
          </div>
          <PmTextarea label={t.narrationText} value={edit.text} placeholder={t.narrationPlaceholder} disabled={busy} hint={t.narrationAutosave} error={edit.dirty ? message : undefined} autoGrow
            onChange={event => session.change(key, { text: event.target.value })}
            onFocus={() => workbench.selectNarration(section.id, target.step)} onBlur={save}
            onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
            onKeyDown={event => { if (!event.nativeEvent.isComposing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() } }} />
          <div className="pmw-narration__actions">
            <PmButton small disabled={edit.saving || !edit.dirty} onClick={() => session.discard(key)}>{t.narrationDiscard}</PmButton>
            <PmButton small variant="primary" icon="save" loading={edit.saving} disabled={busy || !edit.dirty || failure === 'narration-conflict'} onClick={save}>{t.save}</PmButton>
          </div>
        </> : !failure && <p className="pmw-muted">{t.narrationLoading}</p>}
      </div>
    </section>
  )
}
