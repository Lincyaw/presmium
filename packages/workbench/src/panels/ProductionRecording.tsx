import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRecordingAdoption } from '../use-recording-adoption.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { Audition } from '../audition.ts'
import type { AuditionState } from '../audition.ts'
import { documentRecording, recordingUnavailable } from '../audio-recording.ts'
import { AUDIO_RECORDING_MESSAGES } from '../audio-recording-messages.ts'
import { PmButton, PmCard, PmDialog, PmNotice, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { mediaFailure } from '../media-messages.ts'
import type { AuthoringClientActionType } from '@lincyaw/kernel'
import { ProductionRecordingRange } from './ProductionRecordingRange.tsx'

interface Props { identity: string, sectionId: string, stepId: string, active: boolean, available: boolean, disabled: boolean, onReveal(): void, onImportStarted(): number, onImported(assetId: string, selection: number): void, onAdopted(): void }
const elapsed = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

/** Video-only microphone material. The document actor and existing binary transaction still own every save. */
export function ProductionRecording({ identity, sectionId, stepId, active, available, disabled, onReveal, onImportStarted, onImported, onAdopted }: Props) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = AUDIO_RECORDING_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring)
  const [recording] = useState(() => documentRecording(workbench, identity))
  const state = useSyncExternalStore(recording.subscribe, recording.snapshot)
  const audition = useRef<Audition>(), request = useRef<AbortController>(), mounted = useRef(false)
  const [listening, setListening] = useState<AuditionState>({ status: 'idle' }), [saving, setSaving] = useState(false), [failure, setFailure] = useState<string>(), [discard, setDiscard] = useState(false)
  const [unavailable] = useState(recordingUnavailable)
  const current = () => mounted.current && workbench.getState().authoring?.identity === identity
  const candidate = state.candidate
  const adoption = useRecordingAdoption({ identity, sectionId, stepId, active, disabled, candidateAssetId: candidate?.assetId, onAdopted })
  const capturing = ['requesting', 'recording', 'stopping'].includes(state.phase)
  const status = state.phase === 'requesting' ? t.requesting : state.phase === 'recording' ? t.recording : state.phase === 'stopping' ? t.stopping : candidate ? candidate.assetId ? t.imported : t.ready : undefined
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; request.current?.abort(); audition.current?.dispose(); audition.current = undefined; recording.stop() }
  }, [recording])
  useEffect(() => () => { recording.stop(); audition.current?.stop() }, [recording, sectionId, stepId, active])
  useEffect(() => {
    if (!active) { recording.stop(); audition.current?.stop() }
    if (candidate?.assetId && source?.identity === identity && source.content && !source.content.assets[candidate.assetId]) recording.forgetImport(candidate.assetId)
  }, [active, candidate?.assetId, source?.content, source?.identity, identity, recording])
  const start = (signal?: AbortSignal) => {
    setFailure(undefined)
    return recording.start(async signal => {
      workbench.stopAuditions()
      await workbench.pausePlayback(true)
      signal.throwIfAborted()
      if (!current() || !active) throw new Error('recording-failed')
      return workbench.registerAudioCapture(() => recording.stop())
    }, signal)
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
  const save = async (signal?: AbortSignal) => {
    if (!candidate || saving || !current()) return
    const file = candidate.file, selection = adoption.revision(), transcriptionSelection = onImportStarted(), controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    request.current = controller; setSaving(true); setFailure(undefined)
    const owns = () => current() && !controller.signal.aborted && request.current === controller && recording.snapshot().candidate?.file === file
    try {
      await workbench.flushPendingEdits(controller.signal)
      if (!owns()) return
      const currentSource = workbench.getState().authoring
      if (!currentSource?.version || currentSource.identity !== identity || currentSource.dirty || currentSource.saving || currentSource.composing || currentSource.restored || currentSource.error) throw new Error('production-source-changed')
      const answer = await workbench.production.ensureAudio(file, { identity, version: currentSource.version }, controller.signal)
      if (!owns()) return
      recording.imported(file, answer.inspection.assetId); adoption.imported(answer.inspection.assetId, selection); onImported(answer.inspection.assetId, transcriptionSelection)
    } catch (error) {
      if (owns()) setFailure(`${t.saveFailed} ${mediaFailure(error, locale)}`)
    } finally {
      signal?.removeEventListener('abort', abort)
      if (request.current === controller) { request.current = undefined; if (current()) setSaving(false) }
    }
  }
  const controls = useRef({ start, save, disabled, saving, active, available, onReveal })
  controls.current = { start, save, disabled, saving, active, available, onReveal }
  useEffect(() => {
    if (!available) return
    const owns = () => current() && controls.current.available && workbench.getState().authoring?.identity === identity
    return workbench.registerAuthoringClientControls({ identity,
      actions: () => {
        if (!owns()) return []
        const actual = recording.snapshot(), take = actual.candidate, player = audition.current?.snapshot()
        const capturing = ['requesting', 'recording', 'stopping'].includes(actual.phase)
        const source = workbench.getState().authoring, clean = source && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.error
        const actions: AuthoringClientActionType[] = []
        if (capturing) actions.push('recording.cancel', 'recording.stop')
        if (player?.status === 'playing' || player?.status === 'loading') actions.push('recording.pause')
        if (!controls.current.disabled && !controls.current.saving && clean) {
          if (!capturing && !recordingUnavailable()) actions.push('recording.start')
          if (take && !capturing) actions.push('recording.discard', 'recording.listen', ...!take.assetId ? ['recording.save' as const] : [])
        }
        return actions
      },
      snapshot: () => {
        const actual = recording.snapshot(), take = actual.candidate, player = audition.current?.snapshot()
        return { recording: { phase: actual.phase, elapsedMs: actual.elapsedMs,
          ...take ? { candidate: { byteLength: take.file.size, mime: take.file.type, ...take.assetId ? { assetId: take.assetId } : {} } } : {},
          ...actual.error ? { error: actual.error } : {}, audition: player?.status ?? 'idle' } }
      },
      execute: async (action, _source, signal) => {
        const owned = () => { signal.throwIfAborted(); if (!owns()) throw new Error('client-recording-unavailable') }
        owned()
        if (!controls.current.active) {
          controls.current.onReveal()
          await workbench.waitForAuthoringClientState(() => { owned(); return controls.current.active }, signal)
        }
        if (action.type === 'recording.start') {
          await controls.current.start(signal); owned()
          if (recording.snapshot().phase !== 'recording') throw new Error(`client-${recording.snapshot().error ?? 'recording-unavailable'}`)
          return
        }
        if (action.type === 'recording.stop' || action.type === 'recording.cancel') {
          action.type === 'recording.cancel' ? recording.cancelTake() : recording.stop()
          await workbench.waitForAuthoringClientState(() => { owned(); return !['requesting', 'recording', 'stopping'].includes(recording.snapshot().phase) }, signal)
          return
        }
        if (action.type === 'recording.discard') {
          audition.current?.stop(); recording.discard(); setFailure(undefined)
          return
        }
        if (action.type === 'recording.pause') { audition.current?.stop(); return }
        const take = recording.snapshot().candidate
        if (!take) throw new Error('client-recording-unavailable')
        if (action.type === 'recording.save') {
          await controls.current.save(signal); owned()
          if (recording.snapshot().candidate?.file !== take.file || !recording.snapshot().candidate?.assetId) throw new Error('client-recording-save-unverified')
          return
        }
        if (action.type === 'recording.listen') {
          if (!audition.current) {
            const player = audition.current = new Audition(workbench)
            player.subscribe(() => { if (current()) setListening(player.snapshot()) })
          }
          const player = audition.current, stop = () => player.stop()
          signal.addEventListener('abort', stop, { once: true })
          try { await player.play(async () => ({ audio: take.file })); owned(); if (player.snapshot().status !== 'playing') throw new Error('client-recording-listen-unverified') }
          finally { signal.removeEventListener('abort', stop) }
          return
        }
        throw new Error('client-action-unavailable')
      },
    })
  }, [workbench, identity, available, recording])
  useEffect(() => workbench.refreshAuthoringClientControls(), [workbench, state.phase, state.error, candidate?.file, candidate?.assetId, saving, disabled, active, available, listening.status])
  return <PmCard className="pmw-audio-recording" data-recording={state.phase}>
    <strong>{t.title}</strong>
    {status && !(status === t.imported && adoption.adopted && candidate?.assetId === adoption.selected) && <span className="pm-ui-hint"><span role="status">{saving ? t.saving : status}</span>{state.phase === 'recording' && <span aria-hidden="true"> · {elapsed(state.elapsedMs)}</span>}</span>}
    {(state.error || unavailable) && <PmNotice tone="warn">{t.failures[state.error ?? unavailable!] ?? t.failures['recording-failed']}</PmNotice>}
    {failure && <PmNotice tone="danger">{failure}</PmNotice>}
    {listening.status === 'failed' && <PmNotice tone="warn">{t.failures[listening.error ?? 'audition-request'] ?? t.failures['audition-request']}</PmNotice>}
    <div className="pmw-voice__actions">
      {!capturing && !candidate && <PmButton small variant="primary" disabled={disabled || saving || !active || Boolean(unavailable)} onClick={() => void start()}>{t.start}</PmButton>}
      {state.phase === 'requesting' && <PmButton small onClick={() => recording.cancelTake()}>{t.cancel}</PmButton>}
      {state.phase === 'recording' && <><PmButton small onClick={() => recording.stop()}>{t.stop}</PmButton><PmButton small onClick={() => recording.cancelTake()}>{t.cancelTake}</PmButton></>}
      {candidate && !capturing && <PmButton small disabled={!active || saving} loading={listening.status === 'loading'} onClick={listen}>{listening.status === 'playing' ? t.stopAudition : t.audition}</PmButton>}
      {candidate && !candidate.assetId && !capturing && <PmButton small variant="primary" disabled={disabled || !active} loading={saving} onClick={() => void save()}>{failure ? t.retry : t.save}</PmButton>}
      {candidate && !capturing && <PmButton small disabled={disabled || saving || !active || Boolean(unavailable)} onClick={() => void start()}>{t.rerecord}</PmButton>}
      {saving && <PmButton small onClick={() => { request.current?.abort(); setSaving(false) }}>{t.cancelSave}</PmButton>}
      {candidate && !capturing && !saving && <PmButton small onClick={() => setDiscard(true)}>{t.discard}</PmButton>}
    </div>
    {(adoption.assets.length > 0 || adoption.selected) && <>
      <PmSelect label={t.source} value={adoption.selected} disabled={disabled || !active || saving} onChange={event => adoption.choose(event.target.value)}>
        <option value="">{t.choose}</option>{adoption.selected && !adoption.assets.some(asset => asset.id === adoption.selected) && <option value={adoption.selected} disabled>{t.removedAudio}</option>}{adoption.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.title || asset.location.split('/').at(-1) || asset.id}</option>)}
      </PmSelect>
      <div className="pmw-voice__actions">
        <PmButton small variant="primary" disabled={disabled || !active || saving || capturing || !adoption.assets.some(asset => asset.id === adoption.selected) || adoption.adopted} loading={adoption.busy} onClick={() => void adoption.adopt()}>{adoption.adopted ? t.adopted : adoption.failure ? t.retryAdoption : t.adopt}</PmButton>
        {adoption.busy && <PmButton small onClick={adoption.cancel}>{t.cancelAdoption}</PmButton>}
      </div>
      {adoption.failure && <PmNotice tone="danger">{['production-source-changed', 'document-version-changed'].includes(adoption.failure) ? t.adoptionSourceChanged
        : adoption.failure === 'recording-cue-unsupported' || adoption.failure === 'recording-start-conflict' ? (PRODUCTION_MESSAGES[locale].diagnostics as Record<string, string>)[`production.${adoption.failure}`]
        : adoption.failure.startsWith('production.asset-') || adoption.failure === 'production-audio-unavailable' ? mediaFailure(adoption.failure, locale) : t.adoptionFailed}</PmNotice>}
    </>}
    <ProductionRecordingRange identity={identity} sectionId={sectionId} stepId={stepId} active={active} disabled={disabled || capturing || saving} onChanged={onAdopted} />
    {discard && <PmDialog open label={t.discardTitle} closeLabel={t.cancel} description={t.discardHint} onClose={() => setDiscard(false)} actions={<><PmButton onClick={() => setDiscard(false)}>{t.keep}</PmButton><PmButton variant="danger" onClick={() => { audition.current?.stop(); recording.discard(); setFailure(undefined); setDiscard(false) }}>{t.discard}</PmButton></>} />}
  </PmCard>
}
