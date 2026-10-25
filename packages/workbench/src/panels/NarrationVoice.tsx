import { useEffect, useState } from 'react'
import type { VoiceSettingsAnswer } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmField, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { VOICE_MESSAGES, voiceFailure } from '../voice-messages.ts'
import { VoiceDialog } from './VoiceDialog.tsx'
import { VoiceoverDialog } from './VoiceoverDialog.tsx'

/** A step's current configuration stays distinct from its generated audio's availability. */
export function NarrationVoice({ section, step }: { section: string, step: number }) {
  const workbench = useWorkbench()
  const document = useWorkbenchState(state => state.document)
  const revision = useWorkbenchState(state => state.ir?.revision)
  const locale = useWorkbenchState(state => state.locale), t = VOICE_MESSAGES[locale]
  const busy = useWorkbenchState(state => Boolean(state.isEditingPage || state.isEditingVoice))
  const status = useWorkbenchState(state => state.voiceover?.revision === state.ir?.revision ? state.voiceover?.steps.find(item => item.target.section === section && item.target.step === step)?.state : undefined)
  const [answer, setAnswer] = useState<VoiceSettingsAnswer>()
  const [workspace, setWorkspace] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [refresh, setRefresh] = useState(0)
  const [dialog, setDialog] = useState<{ kind: 'settings' | 'generation', answer: VoiceSettingsAnswer, workspace: string }>()
  useEffect(() => { setDialog(undefined); setNotice(undefined) }, [document, section, step])
  useEffect(() => {
    if (document === undefined) return
    const request = new AbortController()
    setAnswer(undefined); setFailure(undefined)
    void Promise.all([workbench.client.readVoiceSettings(document, section, step, request.signal), workbench.client.readWorkbenchInfo()]).then(([next, info]) => {
      if (!request.signal.aborted) { setAnswer(next); setWorkspace(info.root) }
    }, error => { if (!request.signal.aborted) setFailure(voiceFailure(error, locale)) })
    return () => request.abort()
  }, [workbench, document, revision, section, step, refresh, locale])
  const selected = answer?.selected
  return <>
    <PmField label={t.voice} group>
      {!answer && !failure && <span role="status">{t.loading}</span>}
      {selected && <div className="pmw-voice__summary"><span>{selected.voice?.voice ?? t.unset}</span><PmBadge>{t.inherited[selected.inheritedFrom]}</PmBadge>{status && <PmBadge tone={status === 'ready' ? 'ok' : 'neutral'}>{t.statuses[status]}</PmBadge>}</div>}
      {failure && <PmNotice tone="danger">{failure}<PmButton small onClick={() => setRefresh(value => value + 1)}>{t.retry}</PmButton></PmNotice>}
      {notice && <PmNotice tone="ok">{notice}</PmNotice>}
      <div className="pmw-operation__actions">
        <PmButton small icon="sliders" disabled={busy || !selected || !workspace} onClick={() => { if (answer && workspace) setDialog({ kind: 'settings', answer, workspace }) }}>{t.settings}</PmButton>
        <PmButton small icon="play" disabled={busy || !selected || !workspace || !answer?.capabilities?.voiceover} onClick={() => { if (answer && workspace) setDialog({ kind: 'generation', answer, workspace }) }}>{t.generate}</PmButton>
      </div>
    </PmField>
    {document !== undefined && dialog?.answer.selected && dialog.kind === 'settings' && <VoiceDialog key={JSON.stringify([document, section, step])} document={document} workspace={dialog.workspace} target={dialog.answer.selected.target} initial={dialog.answer} onClose={() => setDialog(undefined)} onApplied={() => { setNotice(t.saved); setRefresh(value => value + 1); workbench.readVoiceover() }} />}
    {document !== undefined && dialog?.answer.selected && dialog.kind === 'generation' && <VoiceoverDialog document={document} target={dialog.answer.selected.target} initial={dialog.answer} onClose={() => setDialog(undefined)} />}
  </>
}
