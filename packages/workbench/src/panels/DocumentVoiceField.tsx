import { useEffect, useState } from 'react'
import type { VoiceInfo } from '@lincyaw/kernel'
import { PmButton, PmField } from '../components.tsx'
import { useInheritedFrom, useWorkbench, useWorkbenchState } from '../context.tsx'
import { resolveDocumentStepVoice } from '../document-voices.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { voiceTitle } from '../voice-names.ts'
import { isAgentChanging } from '../workbench-state.ts'
import { DocumentVoiceDialog } from './DocumentVoiceDialog.tsx'
import { effectiveOf } from '../effective-settings.ts'

const catalogs = new Map<string, Promise<VoiceInfo[]>>()

/** The catalogue entry of a saved voice, for its name; one read per document, engine and service change. */
function useVoiceInfo(directory: string | undefined, engine: string | undefined, voice: string | undefined): VoiceInfo | undefined {
  // A failed read is not kept: the next saved version of the document asks again.
  const workbench = useWorkbench(), serviceVersion = useWorkbenchState(state => state.voiceServiceVersion), version = useWorkbenchState(state => state.authoring?.version)
  const [info, setInfo] = useState<VoiceInfo>()
  useEffect(() => {
    if (directory === undefined || !voice) { setInfo(undefined); return }
    const key = JSON.stringify([directory, engine ?? '', serviceVersion ?? 0])
    let list = catalogs.get(key)
    if (!list) {
      list = workbench.client.readVoiceCatalog(directory, engine).then(answer => answer.catalog.voices, () => { catalogs.delete(key); return [] })
      catalogs.set(key, list)
    }
    let live = true
    void list.then(voices => { if (live) setInfo(voices.find(value => value.id === voice)) })
    return () => { live = false }
  }, [workbench, directory, engine, voice, serviceVersion, version])
  return info
}

/** The document's voice with its plain name, the one-step choice for the whole document, and generating all of it. */
export function DocumentVoiceField({ stepId, disabled = false, onGenerate }: { stepId: string, disabled?: boolean, onGenerate?(): void }) {
  const workbench = useWorkbench()
  const source = useWorkbenchState(state => state.authoring)
  const locale = useWorkbenchState(state => state.locale)
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const [open, setOpen] = useState<'document' | 'step'>()
  const inheritedFrom = useInheritedFrom('production.defaults.voiceSource')
  useEffect(() => { setOpen(undefined) }, [source?.identity, stepId])
  const document = source?.content, step = document?.steps[stepId], p = PRODUCTION_MESSAGES[locale]
  const voice = document && step ? resolveDocumentStepVoice(effectiveOf(document, source?.inherited), stepId) : undefined
  const info = useVoiceInfo(source?.directory, voice?.value?.type === 'tts' ? voice.value.voice.engine : undefined, voice?.value?.type === 'tts' ? voice.value.voice.voice : undefined)
  if (!document || !step || !source?.identity || !voice) return null
  const recording = voice.value?.type === 'recording' ? document.assets[voice.value.assetId] : undefined
  const label = voice.value?.type === 'tts' ? voiceTitle(voice.value.voice.voice, info, locale)
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
    {open && <DocumentVoiceDialog key={`${source.identity}:${stepId}:${open}`} stepId={stepId} mode={open} onClose={() => setOpen(undefined)} />}
  </>
}
