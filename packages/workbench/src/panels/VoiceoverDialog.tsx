import { useEffect, useMemo, useRef, useState } from 'react'
import { speechEngineId } from '@lincyaw/kernel'
import type { TeachingDocument, VoiceoverJob, VoiceoverSnapshot, VoiceScope } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmField, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { documentVoiceStepIds, resolveDocumentStepVoice } from '../document-voices.ts'
import type { DocumentVoiceScope } from '../document-voices.ts'
import { VOICE_MESSAGES, voiceFailure } from '../voice-messages.ts'
import { prepareVoiceSnapshot, runtimeVoiceScope, voiceSnapshotCurrent } from '../voice-snapshot.ts'
import type { VoiceSnapshot } from '../voice-snapshot.ts'
import { isAgentChanging } from '../workbench.ts'
import { VoiceScopeField } from './VoiceScopeField.tsx'

interface CheckedVoice { snapshot: VoiceSnapshot, document: TeachingDocument }
interface OwnedJob { directory: string, cached: number }
const active = (job: VoiceoverJob) => ['queued', 'running', 'cancelling'].includes(job.state)
const sameSource = (a: VoiceoverSnapshot['source'], b: VoiceoverSnapshot['source']) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
function cachedInScope(status: VoiceoverSnapshot, scope: VoiceScope): number {
  const targets = scope.kind === 'step' ? [scope.target] : scope.kind === 'steps' ? scope.targets : undefined
  const steps = status.steps.filter(step => scope.kind === 'document' || scope.kind === 'page' && step.target.section === scope.section || targets?.some(target => target.section === step.target.section && target.step === step.target.step && target.binding === step.target.binding))
  const unbound = scope.kind === 'document' ? status.unboundByPage ?? [] : scope.kind === 'page' ? (status.unboundByPage ?? []).filter(page => page.section === scope.section) : []
  return [...steps, ...unbound].reduce((sum, unit) => sum + unit.cached, 0)
}

/** Visible author jobs use acknowledged source versions; polling never starts generation. */
export function VoiceoverDialog({ stepId, onClose }: { stepId: string, onClose(): void }) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = VOICE_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring)
  const readOnly = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const [scope, setScope] = useState<DocumentVoiceScope>({ kind: 'step', stepId })
  const [checked, setChecked] = useState<CheckedVoice>(), [status, setStatus] = useState<VoiceoverSnapshot>(), [jobs, setJobs] = useState<VoiceoverJob[]>([])
  const [loading, setLoading] = useState(true), [submitting, setSubmitting] = useState(false), [cancelling, setCancelling] = useState<string>()
  const [changed, setChanged] = useState(false), [error, setError] = useState<string>(), [attempt, setAttempt] = useState(0), [paused, setPaused] = useState(false)
  const life = useRef<AbortController>(), read = useRef<AbortController>(), mutation = useRef<AbortController>(), generation = useRef(0), starting = useRef(false)
  const checkedRef = useRef<CheckedVoice>(), jobsRef = useRef<VoiceoverJob[]>([]), owned = useRef(new Map<string, OwnedJob>()), settled = useRef(new Set<string>()), closing = useRef(false), directoryRef = useRef(workbench.getState().document)

  const cancelOwned = () => {
    for (const [id, { directory }] of owned.current) {
      const job = jobsRef.current.find(value => value.id === id)
      if (!job || active(job)) void workbench.client.cancelVoiceover(directory, id, AbortSignal.timeout(5000)).catch(() => {})
    }
    owned.current.clear()
  }
  useEffect(() => {
    life.current = new AbortController(); closing.current = false
    directoryRef.current = workbench.getState().document
    setScope({ kind: 'step', stepId }); setJobs([]); jobsRef.current = []
    return () => { closing.current = true; generation.current++; life.current?.abort(); read.current?.abort(); mutation.current?.abort(); cancelOwned() }
  }, [workbench, stepId])

  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current
    read.current?.abort(); read.current = controller
    const signal = AbortSignal.any([controller.signal, life.current!.signal])
    checkedRef.current = undefined; setChecked(undefined); setStatus(undefined); setLoading(true); setError(undefined); setPaused(false)
    void (async () => {
      try {
        workbench.stopAuditions()
        const snapshot = await prepareVoiceSnapshot(workbench, stepId, signal)
        const document = workbench.getDocument(snapshot.identity)
        if (!document) throw new Error('voice-context-changed')
        const answer = await workbench.client.readVoiceover(snapshot.directory, signal)
        signal.throwIfAborted()
        if (generation.current !== version || closing.current) return
        if (!voiceSnapshotCurrent(workbench, snapshot) || answer.revision !== snapshot.revision || !sameSource(answer.source, snapshot.source)) throw new Error('voice-context-changed')
        const value = { snapshot, document }
        checkedRef.current = value; jobsRef.current = answer.jobs
        setChecked(value); setStatus(answer); setJobs(answer.jobs); setChanged(false)
      } catch (failure) {
        if (generation.current === version && !signal.aborted && !closing.current) setError(voiceFailure(failure, locale))
      } finally { if (generation.current === version && !signal.aborted && !closing.current) setLoading(false) }
    })()
    return () => controller.abort()
  }, [workbench, stepId, attempt])

  useEffect(() => workbench.subscribe(() => {
    const value = checkedRef.current
    if (!value || voiceSnapshotCurrent(workbench, value.snapshot)) return
    mutation.current?.abort(); starting.current = false; setSubmitting(false); setChanged(true)
  }), [workbench])

  const hasActive = jobs.some(active), directory = checked?.snapshot.directory
  useEffect(() => {
    if (!hasActive || directory === undefined) return
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, life.current!.signal])
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const answer = await workbench.client.readVoiceover(directory, signal)
        signal.throwIfAborted()
        if (closing.current) return
        const value = checkedRef.current
        const current = value && voiceSnapshotCurrent(workbench, value.snapshot) && answer.revision === value.snapshot.revision && sameSource(answer.source, value.snapshot.source)
        const finished = answer.jobs.filter(job => owned.current.has(job.id) && !active(job) && !settled.current.has(job.id))
        const refresh = current ? finished.filter(job => job.completed > 0 && sameSource(job.source, value.snapshot.source) && job.revision === value.snapshot.revision && cachedInScope(answer, job.scope) > owned.current.get(job.id)!.cached) : []
        if (refresh.length && value) {
          workbench.stopAuditions()
          await workbench.pausePlayback(); signal.throwIfAborted()
          if (closing.current || !voiceSnapshotCurrent(workbench, value.snapshot)) return
          for (const job of refresh) workbench.refreshVoicePlayback(job.source, job.revision)
          setPaused(true); setError(undefined)
        }
        finished.forEach(job => settled.current.add(job.id))
        jobsRef.current = answer.jobs; setJobs(answer.jobs)
        if (current) setStatus(answer)
        else setChanged(true)
      } catch (failure) { if (!signal.aborted && !closing.current) setError(voiceFailure(failure, locale)) }
      finally { if (!signal.aborted && !closing.current) timer = setTimeout(() => void poll(), 1000) }
    }
    timer = setTimeout(() => void poll(), 500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [workbench, hasActive, directory])

  const selection = useMemo(() => {
    if (!checked || !status) return undefined
    try {
      const ids = documentVoiceStepIds(checked.document, scope), wanted = new Set(ids)
      const steps = status.steps.filter(value => {
        const page = checked.snapshot.ir.sections.find(page => page.id === value.target.section)
        return page?.stepIds?.[value.target.step] !== undefined && wanted.has(page.stepIds[value.target.step]!)
      })
      const pages = new Set(ids.map(id => checked.document.steps[id]!.sectionId))
      const unbound = scope.kind === 'page' || scope.kind === 'document' ? (status.unboundByPage ?? []).filter(value => pages.has(value.section)) : []
      const units = [...steps, ...unbound]
      const cached = units.reduce((sum, value) => sum + value.cached, 0)
      const missing = units.filter(value => value.state === 'missing').reduce((sum, value) => sum + value.utterances - value.cached, 0)
      const blocked = units.filter(value => value.state === 'blocked').reduce((sum, value) => sum + value.utterances - value.cached, 0)
      const providers = status.capability.providers.filter(provider => ids.some(id => {
        const value = resolveDocumentStepVoice(checked.document, id).value
        return value?.type === 'tts' && provider.id === speechEngineId(value.voice.engine ?? status.capability.defaultEngine ?? '')
      }))
      const text = ids.flatMap(id => checked.document.steps[id]!.narrationIds.map(narrationId => checked.document.narrations[narrationId]!.content.map(node => node.type === 'text' ? node.text : node.type === 'pronunciation' ? node.spoken : '').join(''))).join('\n\n')
      const voices = [...new Map(ids.flatMap(id => { const value = resolveDocumentStepVoice(checked.document, id).value; return value?.type === 'tts' ? [[JSON.stringify(value.voice), value.voice] as const] : [] })).values()]
      const silent = ids.filter(id => resolveDocumentStepVoice(checked.document, id).value?.type === 'none').length
      const unset = ids.some(id => resolveDocumentStepVoice(checked.document, id).value === undefined)
      const reasons = [...new Set(units.filter(value => value.state === 'blocked').flatMap(value => value.reason && !(value.reason === 'voice-unset' && silent && !unset) ? [value.reason] : []))]
      return { cached, missing, blocked, providers, voices, silent, reasons, text, hasUnbound: !unbound.length && (status.unboundByPage ?? []).some(value => pages.has(value.section) && value.utterances > 0) }
    } catch { return undefined }
  }, [checked, status, scope])
  const chooseScope = (value: DocumentVoiceScope) => { mutation.current?.abort(); starting.current = false; setSubmitting(false); setScope(value); setError(undefined) }
  const close = () => {
    if (closing.current) return
    closing.current = true; generation.current++; life.current?.abort(); read.current?.abort(); mutation.current?.abort(); cancelOwned(); onClose()
  }
  const start = async () => {
    const value = checkedRef.current
    if (!value || !selection?.missing || !selection.providers.length || starting.current || changed || readOnly || closing.current || !voiceSnapshotCurrent(workbench, value.snapshot)) return
    const controller = new AbortController(), version = generation.current
    mutation.current?.abort(); mutation.current = controller
    const signal = AbortSignal.any([controller.signal, life.current!.signal])
    starting.current = true; setSubmitting(true); setError(undefined)
    try {
      workbench.stopAuditions()
      await workbench.pausePlayback(); signal.throwIfAborted()
      if (!voiceSnapshotCurrent(workbench, value.snapshot)) throw new Error('voice-context-changed')
      const runtimeScope = runtimeVoiceScope(value.snapshot, scope), cached = status ? cachedInScope(status, runtimeScope) : 0
      const job = await workbench.client.startVoiceover(value.snapshot.directory, { revision: value.snapshot.revision, source: value.snapshot.source, scope: runtimeScope, confirmed: true }, signal)
      if (closing.current || signal.aborted || generation.current !== version) { if (active(job)) void workbench.client.cancelVoiceover(value.snapshot.directory, job.id, AbortSignal.timeout(5000)).catch(() => {}); return }
      if (!sameSource(job.source, value.snapshot.source) || job.revision !== value.snapshot.revision || !voiceSnapshotCurrent(workbench, value.snapshot)) throw new Error('voice-context-changed')
      owned.current.set(job.id, { directory: value.snapshot.directory, cached })
      jobsRef.current = [...jobsRef.current.filter(previous => previous.id !== job.id), job]; setJobs(jobsRef.current)
    } catch (failure) { if (!signal.aborted && !closing.current && generation.current === version) setError(voiceFailure(failure, locale)) }
    finally { if (mutation.current === controller) { starting.current = false; if (!closing.current) setSubmitting(false) } }
  }
  const cancel = async (job: VoiceoverJob) => {
    const directory = owned.current.get(job.id)?.directory ?? checkedRef.current?.snapshot.directory ?? directoryRef.current
    if (directory === undefined || cancelling || closing.current) return
    const signal = life.current!.signal
    setCancelling(job.id); setError(undefined)
    try {
      const answer = await workbench.client.cancelVoiceover(directory, job.id, signal)
      signal.throwIfAborted()
      if (closing.current) return
      jobsRef.current = jobsRef.current.map(previous => previous.id === answer.id ? answer : previous); setJobs(jobsRef.current)
    } catch (failure) { if (!signal.aborted && !closing.current) setError(voiceFailure(failure, locale)) }
    finally { if (!signal.aborted && !closing.current) setCancelling(undefined) }
  }
  const unavailable = !status?.capability.available && (!selection?.cached || Boolean(selection.missing || selection.blocked))
  return <PmDialog open label={t.generation} description={t.generationHint} closeLabel={t.close} onClose={close} footer={<>
    <PmButton small onClick={close}>{t.close}</PmButton>
    <PmButton small loading={loading} disabled={submitting} onClick={() => setAttempt(value => value + 1)}>{changed ? t.recheck : t.refresh}</PmButton>
    <PmButton small variant="accent" loading={submitting} disabled={loading || changed || readOnly || hasActive || !selection?.missing || !selection.providers.length || !status?.capability.available} onClick={() => void start()}>{t.confirmGenerate}</PmButton>
  </>}>
    <div className="pmw-operation">
    {(source?.content || checked?.document) && <VoiceScopeField document={checked?.document ?? source!.content!} stepId={stepId} value={scope} disabled={loading || submitting || readOnly} onChange={chooseScope} />}
    {loading && <PmNotice>{t.refreshing}</PmNotice>}
    {changed && <PmNotice tone="warn">{t.changed}</PmNotice>}
    {error && <PmNotice tone="danger">{error}</PmNotice>}
    {status && selection && <>
      <PmNotice>{t.generationSummary(selection.cached, selection.missing, selection.blocked)}</PmNotice>
      {unavailable && selection.voices.length > 0 && <PmNotice tone="warn">{status.capability.reason === 'speech-unavailable' || status.capability.reason === 'not-configured' ? t.noService : voiceFailure(new Error(status.capability.reason), locale)}</PmNotice>}
      {!selection.missing && !selection.blocked && selection.cached > 0 && <PmNotice tone="ok">{t.cacheReady}</PmNotice>}
      {selection.cached > 0 && selection.blocked > 0 && <PmNotice>{t.partialCache}</PmNotice>}
      {!selection.missing && !selection.cached && !selection.blocked && <PmNotice>{t.noScript}</PmNotice>}
      {selection.hasUnbound && <PmNotice tone="warn">{t.unboundScript}</PmNotice>}
      {selection.silent > 0 && <PmNotice>{t.silentScope(selection.silent)}</PmNotice>}
      {selection.reasons.map(reason => <PmNotice tone="warn" key={reason}>{voiceFailure(new Error(reason), locale)}</PmNotice>)}
      {selection.voices.map(voice => <PmField key={JSON.stringify(voice)} label={t.currentVoice}><span>{voice.voice}{voice.engine ? ` · ${voice.engine}` : ''}{voice.rate !== undefined ? ` · ${t.rate}: ${voice.rate}` : ''}{voice.style ? ` · ${t.style}: ${voice.style}` : ''}</span></PmField>)}
      {selection.missing > 0 && selection.providers.map(provider => <PmNotice key={provider.id}>{t.disclosure(provider.provider, provider.local)}</PmNotice>)}
      {selection.text && <PmField label={t.generationScript}><p className="pmw-voice__sample">{selection.text}</p></PmField>}
      {selection.missing > 0 && <PmNotice>{t.noPrice}</PmNotice>}
    </>}
    <PmNotice>{t.generationSourceHint}</PmNotice>
    {paused && <PmNotice tone="accent">{t.generationPaused}</PmNotice>}
    {jobs.map(job => <div className="pmw-voice__status" key={job.id}>
      <span>{t.scopes[job.scope.kind]} · {t.jobs[job.state]} · {t.progress(job.completed, job.total, job.failed)}{source?.version !== job.source.version || source?.fingerprint !== job.source.fingerprint ? ` · ${t.oldVersion}` : ''}</span>
      {active(job) && <PmButton small loading={cancelling === job.id} disabled={job.state === 'cancelling'} onClick={() => void cancel(job)}>{t.cancelJob}</PmButton>}
      {job.error && <span>{voiceFailure(new Error(job.error), locale)}</span>}
    </div>)}
    </div>
  </PmDialog>
}
