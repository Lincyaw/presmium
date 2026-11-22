import { useEffect, useState } from 'react'
import { PmButton, PmField } from '../components.tsx'
import { useInheritedFrom, useWorkbench, useWorkbenchState } from '../context.tsx'
import { resolveDocumentStepVoice } from '../document-voices.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { useVoiceNames } from '../voice-catalog.ts'
import { voiceTitle } from '../voice-names.ts'
import { isAgentChanging } from '../workbench-state.ts'
import { DocumentVoiceDialog } from './DocumentVoiceDialog.tsx'
import { effectiveOf } from '../effective-settings.ts'

/** The document's voice with its plain name, the one-step choice for the whole document, and generating all of it. */
export function DocumentVoiceField({ stepId, disabled = false, onGenerate, onChanged }: { stepId: string, disabled?: boolean, onGenerate?(): void, onChanged?(): void }) {
  const workbench = useWorkbench()
  const source = useWorkbenchState(state => state.authoring)
  const locale = useWorkbenchState(state => state.locale)
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const [open, setOpen] = useState<'document' | 'step'>()
  const inheritedFrom = useInheritedFrom('production.defaults.voiceSource')
  useEffect(() => { setOpen(undefined) }, [source?.identity, stepId])
  const document = source?.content, step = document?.steps[stepId], p = PRODUCTION_MESSAGES[locale]
  const effective = effectiveOf(document, source?.inherited)
  const voice = effective && step ? resolveDocumentStepVoice(effective, stepId) : undefined
  const tts = voice?.value?.type === 'tts' ? voice.value.voice : undefined
  const names = useVoiceNames(tts ? source?.directory : undefined, tts ? [tts.engine] : [], effective?.metadata.lang ?? 'zh-CN')
  if (!document || !step || !source?.identity || !voice) return null
  const recording = voice.value?.type === 'recording' ? document.assets[voice.value.assetId] : undefined
  const label = voice.value?.type === 'tts' ? voiceTitle(voice.value.voice.voice, names.find(info => info.id === tts?.voice), locale)
    : voice.value?.type === 'none' ? p.none
      : voice.value?.type === 'recording' ? recording?.title || p.recording : p.unset
  const choose = (mode: 'document' | 'step') => { workbench.pauseDocumentStep(step.sectionId, stepId); workbench.stopAuditions(); setOpen(mode) }
  return <>
    <PmField group label={p.voice} hint={voice.inheritedFrom === 'document' && !document.production.defaults.voiceSource && source.inherited?.production?.defaults?.voiceSource && inheritedFrom || p.inherited[voice.inheritedFrom]}>
      <span>{label}</span>
      <div className="pmw-voice__actions">
        <PmButton small icon="audio" disabled={disabled || blocked} onClick={() => choose('document')}>{voice.value ? p.change : p.choose}</PmButton>
        {onGenerate && <PmButton small variant={voice.value ? 'primary' : 'default'} icon="refresh" disabled={disabled || blocked} onClick={onGenerate}>{p.generate}</PmButton>}
      </div>
      <div className="pmw-voice__actions">
        <PmButton small variant="text" disabled={disabled || blocked} onClick={() => choose('step')}>{p.stepVoice}</PmButton>
        {workbench.client.openSpeechSettings && <PmButton small variant="ghost" icon="sliders" onClick={() => { workbench.stopAuditions(); void workbench.pausePlayback(true).catch(() => {}); workbench.client.openSpeechSettings?.() }}>{p.serviceSettings}</PmButton>}
      </div>
    </PmField>
    {open && <DocumentVoiceDialog key={`${source.identity}:${stepId}:${open}`} stepId={stepId} mode={open} onClose={() => setOpen(undefined)} onApplied={onChanged} />}
  </>
}
