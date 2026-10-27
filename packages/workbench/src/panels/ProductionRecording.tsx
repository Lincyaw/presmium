import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Audition } from '../audition.ts'
import type { AuditionState } from '../audition.ts'
import { documentRecording, recordingUnavailable } from '../audio-recording.ts'
import { AUDIO_RECORDING_MESSAGES } from '../audio-recording-messages.ts'
import { PmButton, PmCard, PmDialog, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { mediaFailure } from '../media-messages.ts'

interface Props { identity: string, sectionId: string, stepId: string, active: boolean, disabled: boolean, onImported(assetId: string): void }
const elapsed = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

/** Video-only microphone material. The document actor and existing binary transaction still own every save. */
export function ProductionRecording({ identity, sectionId, stepId, active, disabled, onImported }: Props) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = AUDIO_RECORDING_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring)
  const [recording] = useState(() => documentRecording(workbench, identity))
  const state = useSyncExternalStore(recording.subscribe, recording.snapshot)
  const audition = useRef<Audition>(), request = useRef<AbortController>(), mounted = useRef(false)
  const [listening, setListening] = useState<AuditionState>({ status: 'idle' }), [saving, setSaving] = useState(false), [failure, setFailure] = useState<string>(), [discard, setDiscard] = useState(false)
  const [unavailable] = useState(recordingUnavailable)
  const current = () => mounted.current && workbench.getState().authoring?.identity === identity
  const candidate = state.candidate, capturing = ['requesting', 'recording', 'stopping'].includes(state.phase)
  const status = state.phase === 'requesting' ? t.requesting : state.phase === 'recording' ? t.recording : state.phase === 'stopping' ? t.stopping : candidate ? candidate.assetId ? t.imported : t.ready : undefined
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; request.current?.abort(); audition.current?.dispose(); audition.current = undefined; recording.stop() }
  }, [recording])
  useEffect(() => () => { recording.stop(); audition.current?.stop() }, [recording, sectionId, stepId, source?.version, active])
  useEffect(() => {
    if (!active) { recording.stop(); audition.current?.stop() }
    if (candidate?.assetId && source?.identity === identity && source.content && !source.content.assets[candidate.assetId]) recording.forgetImport(candidate.assetId)
  }, [active, candidate?.assetId, source?.content, source?.identity, identity, recording])
  const start = () => {
    setFailure(undefined)
    void recording.start(async () => {
      workbench.stopAuditions()
      await workbench.pausePlayback()
      if (!current() || !active) throw new Error('recording-failed')
      return workbench.registerAudioCapture(() => recording.stop())
    })
  }
  const listen = () => {
    if (!candidate) return
    if (!audition.current) {
      const player = audition.current = new Audition(workbench)
      player.subscribe(() => { if (current()) setListening(player.snapshot()) })
    }
    if (listening.status === 'playing' || listening.status === 'loading') audition.current.stop()
    else void audition.current.play(async () => ({ audio: candidate.file }))
  }
  const save = async () => {
    if (!candidate || saving || !current()) return
    const file = candidate.file, controller = new AbortController()
    request.current = controller; setSaving(true); setFailure(undefined)
    const owns = () => current() && !controller.signal.aborted && request.current === controller && recording.snapshot().candidate?.file === file
    try {
      await workbench.flushPendingEdits(controller.signal)
      if (!owns()) return
      const currentSource = workbench.getState().authoring
      if (!currentSource?.version || currentSource.identity !== identity || currentSource.dirty || currentSource.saving || currentSource.composing || currentSource.restored || currentSource.error) throw new Error('production-source-changed')
      const answer = await workbench.ensureDocumentAudio(file, { identity, version: currentSource.version }, controller.signal)
      if (!owns()) return
      recording.imported(file, answer.inspection.assetId); onImported(answer.inspection.assetId)
    } catch (error) {
      if (owns()) setFailure(`${t.saveFailed} ${mediaFailure(error, locale)}`)
    } finally {
      if (request.current === controller) { request.current = undefined; if (current()) setSaving(false) }
    }
  }
  return <PmCard className="pmw-audio-recording" data-recording={state.phase}>
    <strong>{t.title}</strong>
    {status && <span className="pm-ui-hint"><span role="status">{saving ? t.saving : status}</span>{state.phase === 'recording' && <span aria-hidden="true"> · {elapsed(state.elapsedMs)}</span>}</span>}
    {(state.error || unavailable) && <PmNotice tone="warn">{t.failures[state.error ?? unavailable!] ?? t.failures['recording-failed']}</PmNotice>}
    {failure && <PmNotice tone="danger">{failure}</PmNotice>}
    {listening.status === 'failed' && <PmNotice tone="warn">{t.failures[listening.error ?? 'audition-request'] ?? t.failures['audition-request']}</PmNotice>}
    <div className="pmw-voice__actions">
      {!capturing && !candidate && <PmButton small variant="primary" disabled={disabled || saving || !active || Boolean(unavailable)} onClick={start}>{t.start}</PmButton>}
      {state.phase === 'requesting' && <PmButton small onClick={() => recording.cancelTake()}>{t.cancel}</PmButton>}
      {state.phase === 'recording' && <><PmButton small onClick={() => recording.stop()}>{t.stop}</PmButton><PmButton small onClick={() => recording.cancelTake()}>{t.cancelTake}</PmButton></>}
      {candidate && !capturing && <PmButton small disabled={!active || saving} loading={listening.status === 'loading'} onClick={listen}>{listening.status === 'playing' ? t.stopAudition : t.audition}</PmButton>}
      {candidate && !candidate.assetId && !capturing && <PmButton small variant="primary" disabled={disabled || !active} loading={saving} onClick={() => void save()}>{failure ? t.retry : t.save}</PmButton>}
      {candidate && !capturing && <PmButton small disabled={disabled || saving || !active || Boolean(unavailable)} onClick={start}>{t.rerecord}</PmButton>}
      {saving && <PmButton small onClick={() => { request.current?.abort(); setSaving(false) }}>{t.cancelSave}</PmButton>}
      {candidate && !capturing && !saving && <PmButton small onClick={() => setDiscard(true)}>{t.discard}</PmButton>}
    </div>
    {discard && <PmDialog open label={t.discardTitle} closeLabel={t.cancel} description={t.discardHint} onClose={() => setDiscard(false)} actions={<><PmButton onClick={() => setDiscard(false)}>{t.keep}</PmButton><PmButton variant="danger" onClick={() => { audition.current?.stop(); recording.discard(); setFailure(undefined); setDiscard(false) }}>{t.discard}</PmButton></>} />}
  </PmCard>
}
