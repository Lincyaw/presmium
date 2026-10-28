import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DocumentTranscriptionRequest, TeachingDocument, TranscriptionCapabilities, TranscriptionListAnswer, TranscriptionRevision, TranscriptionTask } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmCard, PmDialog, PmField, PmIconButton, PmNotice, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { documentTranscriptionSession } from '../transcription-session.ts'
import { TRANSCRIPTION_MESSAGES, transcriptionFailure } from '../transcription-messages.ts'
import { TranscriptionAdoption } from './TranscriptionAdoption.tsx'

interface Props { identity: string, directory: string, document: TeachingDocument, sectionId: string, stepId: string, disabled: boolean, active: boolean, selectedAsset?: { id: string, revision: number }, onSelectAsset(): void }

/** ASR creates material; a separate, source-bound review is the only script write. */
export function ProductionTranscription({ identity, directory, document, sectionId, stepId, disabled, active, selectedAsset, onSelectAsset }: Props) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = TRANSCRIPTION_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring)
  const session = useMemo(() => documentTranscriptionSession(workbench.client, identity, directory, document.id), [workbench, identity, directory, document.id])
  const subscribe = useMemo(() => active ? session.subscribe : () => () => {}, [session, active])
  const state = useSyncExternalStore(subscribe, session.getState, session.getState)
  const assets = Object.values(document.assets).filter(asset => asset.kind === 'audio')
  const [assetId, setAssetId] = useState(selectedAsset?.id ?? state.request?.assetId ?? state.task?.audio.assetId ?? assets.at(-1)?.id ?? '')
  const receivedSelection = useRef<number>()
  const [capability, setCapability] = useState<TranscriptionCapabilities>(), [engine, setEngine] = useState(''), [refresh, setRefresh] = useState(0)
  const [candidate, setCandidate] = useState<TranscriptionRevision>(), [reading, setReading] = useState(false), [failure, setFailure] = useState<string>()
  const [records, setRecords] = useState<TranscriptionListAnswer>({ tasks: [], issues: [] })
  const [importing, setImporting] = useState(false), [inspecting, setInspecting] = useState(false), [cancel, setCancel] = useState(false), [cancelTarget, setCancelTarget] = useState<TranscriptionTask>(), [cancellingOther, setCancellingOther] = useState(false)
  const owner = useRef({ active: true }), file = useRef<HTMLInputElement>(null), importRequest = useRef<AbortController>(), inspectionRequest = useRef<AbortController>(), pendingFile = useRef<File>()
  const current = () => owner.current.active && workbench.getState().authoring?.identity === identity
  const sourceReady = Boolean(source?.identity === identity && source.version && source.fingerprint && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.error)
  const selectedBusy = state.sending || state.cancelling || Boolean(state.request) || Boolean(state.task && ['queued', 'running', 'cancelling'].includes(state.task.state)) || Boolean(session.intent && !state.verified && !state.failure)
  const otherTask = records.tasks.find(task => task.id !== state.task?.id && ['queued', 'running', 'cancelling'].includes(task.state))
  const busy = selectedBusy || Boolean(otherTask)
  useEffect(() => {
    if (selectedAsset && receivedSelection.current !== selectedAsset.revision && document.assets[selectedAsset.id]?.kind === 'audio') {
      receivedSelection.current = selectedAsset.revision
      inspectionRequest.current?.abort(); setAssetId(selectedAsset.id)
    }
  }, [selectedAsset, document.assets])
  useEffect(() => { owner.current.active = true; return () => { owner.current.active = false; importRequest.current?.abort(); inspectionRequest.current?.abort() } }, [])
  useEffect(() => { if (!active || disabled) inspectionRequest.current?.abort() }, [active, disabled])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      try {
        const answer = await workbench.client.readTranscriptions(directory, controller.signal)
        if (controller.signal.aborted || !current()) return
        setRecords(answer)
        if (!session.intent && !session.getState().failure && !session.getState().cancelled) {
          const task = answer.tasks.find(task => task.source.documentId === document.id && ['queued', 'running', 'cancelling'].includes(task.state)) ?? answer.tasks.find(task => task.source.documentId === document.id)
          if (task) session.select(task)
        }
      } catch (error) { if (!controller.signal.aborted && current()) setFailure(transcriptionFailure(error, locale)) }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void read(), 2000) }
    }
    void read()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [workbench, identity, directory, document.id, source?.version, active, refresh, locale, session])
  useEffect(() => {
    const controller = new AbortController()
    if (!active) return
    void workbench.client.readTranscriptionCapabilities(directory, controller.signal).then(answer => {
      if (!controller.signal.aborted && current()) {
        setCapability(answer)
        setEngine(previous => answer.engines.some(value => value.id === previous) ? previous : answer.engines[0]?.id ?? '')
      }
    }, error => { if (!controller.signal.aborted && current()) setFailure(transcriptionFailure(error, locale)) })
    return () => controller.abort()
  }, [workbench, identity, directory, source?.version, active, refresh, locale])
  useEffect(() => {
    const result = state.verified && state.task?.state === 'done' ? state.task.result : undefined, controller = new AbortController()
    if (!active || !result) { setReading(false); if (!result) setCandidate(undefined); return }
    setReading(true)
    void workbench.client.readTranscriptionResult(directory, result.transcriptionId, result.revision, controller.signal).then(answer => {
      if (!controller.signal.aborted && current() && answer.source.documentId === document.id && answer.transcriptionId === result.transcriptionId && answer.revision === result.revision) { setCandidate(answer); setFailure(undefined) }
    }, () => { if (!controller.signal.aborted && current()) setFailure(t.readFailed) }).finally(() => { if (!controller.signal.aborted && current()) setReading(false) })
    return () => controller.abort()
  }, [workbench, identity, directory, document.id, state.task?.result?.transcriptionId, state.task?.result?.revision, state.task?.state, state.verified, active, refresh, locale])
  const importAudio = async (value: File) => {
    const now = workbench.getState().authoring
    if (!current() || importRequest.current || disabled || !now?.version) return
    onSelectAsset()
    const controller = new AbortController(); importRequest.current = controller; setImporting(true); setFailure(undefined)
    pendingFile.current = value
    try {
      const answer = await workbench.ensureDocumentAudio(value, { identity, version: now.version }, controller.signal)
      if (current() && !controller.signal.aborted) { setAssetId(answer.inspection.assetId); pendingFile.current = undefined }
    } catch (error) { if (current() && !controller.signal.aborted) setFailure(transcriptionFailure(error, locale)) }
    finally { if (importRequest.current === controller) { importRequest.current = undefined; if (current()) setImporting(false) } }
  }
  const start = async () => {
    const now = workbench.getState().authoring
    if (!current() || inspectionRequest.current || disabled || !sourceReady || busy || !now?.version || !now.content || !now.fingerprint || !assetId || !engine || !capability?.available) return
    const controller = new AbortController(); inspectionRequest.current = controller; setInspecting(true)
    setFailure(undefined)
    try {
      const expected = { identity, version: now.version }, audio = await workbench.inspectDocumentAudio(assetId, expected, controller.signal)
      if (!current() || controller.signal.aborted) return
      const request: DocumentTranscriptionRequest = { intent: `transcription_${crypto.randomUUID()}`, source: { documentId: now.content.id, version: now.version, fingerprint: now.fingerprint }, assetId, audioSha256: audio.inspection.sha256, engine, lang: now.content.metadata.lang, confirmed: true }
      await session.start(request, () => workbench.startDocumentTranscription(request, expected))
    } catch (error) { if (current() && !controller.signal.aborted) setFailure(transcriptionFailure(error, locale)) }
    finally { if (inspectionRequest.current === controller) { inspectionRequest.current = undefined; if (current()) setInspecting(false) } }
  }
  const cancelJob = async (target?: TranscriptionTask) => {
    if (!target || target.id === state.task?.id) return session.cancel()
    setCancellingOther(true)
    try { await workbench.client.cancelTranscription(directory, { id: target.id }); if (current()) setRefresh(value => value + 1) }
    catch (error) { if (current()) setFailure(transcriptionFailure(error, locale)) }
    finally { if (current()) setCancellingOther(false) }
  }
  const requestCancel = (target?: TranscriptionTask) => { if (target?.state === 'running') { setCancelTarget(target); setCancel(true) } else void cancelJob(target) }
  const task = state.task, stale = task && (task.current === false || source?.version !== task.source.version || source?.fingerprint !== task.source.fingerprint)
  const currentRecords = records.tasks.filter(value => value.source.documentId === document.id), recorded = currentRecords.some(value => value.id === task?.id)
  const status = state.cancelled ? t.cancelled : state.sending || !task && state.request ? t.sending : task ? t[task.state] : undefined
  return <PmCard className="pmw-transcription" data-transcription="true">
    <div className="pmw-transcription__actions"><strong>{t.title}</strong><span className="pmw-spacer" />
      <PmButton small disabled={disabled || !sourceReady || importing} loading={importing} onClick={() => file.current?.click()}>{t.import}</PmButton>
      {pendingFile.current && failure && <PmButton small disabled={disabled || !sourceReady || importing} onClick={() => { if (pendingFile.current) void importAudio(pendingFile.current) }}>{t.retry}</PmButton>}
      <input ref={file} hidden type="file" accept="audio/*,.wav,.ogg,.mp3,.m4a,.webm" onChange={event => { const value = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (value) void importAudio(value) }} />
      <PmIconButton small icon="refresh" label={t.refresh} loading={state.checking && !busy} onClick={() => { setRefresh(value => value + 1); void session.refresh() }} />
    </div>
    {!assets.length ? <span>{t.noAudio}</span> : <>
      <PmSelect label={t.audio} value={document.assets[assetId]?.kind === 'audio' ? assetId : ''} disabled={disabled || importing} onChange={event => { onSelectAsset(); inspectionRequest.current?.abort(); setAssetId(event.target.value) }}><option value="">{t.none}</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.title ?? asset.location.split('/').at(-1) ?? asset.id}</option>)}</PmSelect>
      {capability?.engines.length ? <PmSelect label={t.service} value={engine} disabled={disabled || busy} onChange={event => { inspectionRequest.current?.abort(); setEngine(event.target.value) }}>{capability.engines.map(value => <option key={value.id} value={value.id}>{value.provider}{capability.engines.filter(other => other.provider === value.provider).length > 1 ? ` · ${value.id}` : ''}</option>)}</PmSelect> : capability ? <span>{capability.status === 'unknown' ? t.unresolved : t.unavailable}</span> : null}
      {capability && !capability.available && capability.engines.length > 0 && <span>{capability.reason === 'audio-unavailable' ? t.audioUnavailable : t.unresolved}</span>}
      <div className="pmw-transcription__actions">
        <PmButton small disabled={disabled || !sourceReady || busy || inspecting || !assetId || !engine || !capability?.available} loading={state.sending || inspecting} onClick={() => void start()}>{t.start}</PmButton>
        {(selectedBusy || session.intent && !state.verified && !state.cancelled) && <PmButton small loading={state.cancelling || task?.state === 'cancelling'} disabled={state.cancelling || task?.state === 'cancelling'} onClick={() => requestCancel(task)}>{t.cancel}</PmButton>}
        {status && <span role="status" aria-live="polite"><PmBadge tone={task?.state === 'done' ? 'ok' : task?.state === 'failed' ? 'danger' : 'neutral'}>{status}</PmBadge></span>}
        {stale && <PmBadge tone="warn">{t.stale}</PmBadge>}
      </div>
    </>}
    {currentRecords.length > 0 && (currentRecords.length > 1 || !recorded) && <PmSelect label={t.records} disabled={selectedBusy || inspecting} value={recorded ? task?.id : ''} onChange={event => { const selected = currentRecords.find(task => task.id === event.target.value); if (selected) session.select(selected) }}>{!recorded && <option value="">{t.show}</option>}{currentRecords.map(task => <option key={task.id} value={task.id}>{t[task.state]} · {new Date(task.createdAt).toLocaleTimeString(locale)} · {document.assets[task.audio.assetId]?.title ?? t.audio}</option>)}</PmSelect>}
    {otherTask && <div className="pmw-transcription__actions"><span>{t.other}</span>{otherTask.source.documentId === document.id && <PmButton small disabled={selectedBusy} onClick={() => session.select(otherTask)}>{t.show}</PmButton>}<PmButton small loading={cancellingOther} onClick={() => requestCancel(otherTask)}>{t.cancel}</PmButton></div>}
    {(records.issues.length > 0 || records.truncated) && <PmNotice tone="warn">{t.partial}</PmNotice>}
    {state.storageFailure && <PmNotice tone="warn">{t.storage}</PmNotice>}
    {(failure || state.failure || task?.error) && <PmNotice tone="danger">{failure ?? transcriptionFailure(new Error(state.failure ?? task?.error), locale)}</PmNotice>}
    {reading && <PmField label={t.text}><span aria-busy="true">{t.loading}</span></PmField>}
    {candidate && <TranscriptionAdoption key={`${identity}:${candidate.transcriptionId}:${candidate.revision}:${stepId}`} identity={identity} candidate={candidate} document={document} sectionId={sectionId} stepId={stepId} disabled={disabled} />}
    {cancel && <PmDialog open label={t.cancelTitle} closeLabel={t.close} onClose={() => setCancel(false)} actions={<><PmButton onClick={() => setCancel(false)}>{t.cancelKeep}</PmButton><PmButton variant="danger" onClick={() => { const target = cancelTarget; setCancel(false); setCancelTarget(undefined); void cancelJob(target) }}>{t.cancelConfirm}</PmButton></>} />}
  </PmCard>
}
