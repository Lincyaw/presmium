import { useEffect, useState } from 'react'
import { PmButton, PmField } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { resolveDocumentStepVoice } from '../document-voices.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { isAgentChanging } from '../workbench.ts'
import { DocumentVoiceDialog } from './DocumentVoiceDialog.tsx'

/** One current voice and selector, shared by document captions and production. */
export function DocumentVoiceField({ stepId, disabled = false, onGenerate }: { stepId: string, disabled?: boolean, onGenerate?(): void }) {
  const workbench = useWorkbench()
  const source = useWorkbenchState(state => state.authoring)
  const locale = useWorkbenchState(state => state.locale)
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [source?.identity, stepId])
  const document = source?.content, step = document?.steps[stepId], p = PRODUCTION_MESSAGES[locale]
  if (!document || !step || !source?.identity) return null
  const voice = resolveDocumentStepVoice(document, stepId)
  const recording = voice.value?.type === 'recording' ? document.assets[voice.value.assetId] : undefined
  const label = voice.value?.type === 'tts' ? voice.value.voice.voice
    : voice.value?.type === 'none' ? p.none
      : voice.value?.type === 'recording' ? recording?.title || p.recording : p.unset
  return <>
    <PmField group label={p.voice} hint={p.inherited[voice.inheritedFrom]}>
      <span>{label}</span>
      <div className="pmw-voice__actions">
        <PmButton small icon="audio" disabled={disabled || blocked} onClick={() => { workbench.pauseDocumentStep(step.sectionId, stepId); workbench.stopAuditions(); setOpen(true) }}>{p.choose}</PmButton>
        {onGenerate && <PmButton small icon="refresh" disabled={disabled || blocked} onClick={onGenerate}>{p.generate}</PmButton>}
        {workbench.client.openSpeechSettings && <PmButton small variant="ghost" icon="sliders" onClick={() => { workbench.stopAuditions(); void workbench.pausePlayback(true).catch(() => {}); workbench.client.openSpeechSettings?.() }}>{p.serviceSettings}</PmButton>}
      </div>
    </PmField>
    {open && <DocumentVoiceDialog key={`${source.identity}:${stepId}`} stepId={stepId} onClose={() => setOpen(false)} />}
  </>
}
