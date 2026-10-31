import { useEffect, useRef, useState } from 'react'
import { sameProductionBinding } from '@lincyaw/kernel'
import type { ProductionPlan, ProductionPlaybackPosition, VoiceoverJob } from '@lincyaw/kernel'
import { useWorkbench, useWorkbenchState } from './context.tsx'
import { prepareVoiceSnapshot, voiceSnapshotCurrent } from './voice-snapshot.ts'
import { voiceFailure } from './voice-messages.ts'
import type { Workbench, WorkbenchState } from './workbench.ts'
import { isAgentChanging } from './workbench.ts'

const running = (job: VoiceoverJob) => ['queued', 'running', 'cancelling'].includes(job.state)

/** Observes the existing owners; it has no media timer, task ledger, or source writer. */
function observeUntil<T>(workbench: Workbench, signal: AbortSignal, read: (state: WorkbenchState) => T | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    let stop = () => {}
    const finish = (error?: unknown, value?: T) => { stop(); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(value!) }
    const abort = () => finish(signal.reason ?? new DOMException('Cancelled', 'AbortError'))
    const check = () => { try { signal.throwIfAborted(); const value = read(workbench.getState()); if (value !== undefined) finish(undefined, value) } catch (error) { finish(error) } }
    stop = workbench.subscribe(check); signal.addEventListener('abort', abort, { once: true }); check()
  })
}

/** A click grants one cancellable playback intent; missing clips use the shared voiceover job and cache. */
export function useProductionVoicePlayback() {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale)
  const plan = useWorkbenchState(state => state.productionPlan), playback = useWorkbenchState(state => state.productionPlayback)
  const source = useWorkbenchState(state => state.authoring), serviceVersion = useWorkbenchState(state => state.voiceServiceVersion)
  const navigation = useWorkbenchState(state => state.productionNavigationVersion)
  const blocked = useWorkbenchState(state => Boolean(state.hasDocumentTimingDrafts || state.documentTimingDraftStorageFailure || isAgentChanging(state)))
  const [busy, setBusy] = useState(false), [starting, setStarting] = useState(false), [failure, setFailure] = useState<string>(), [progress, setProgress] = useState<{ completed: number, total: number }>()
  const request = useRef<AbortController>(), startRequest = useRef<AbortController>(), intent = useRef(false), mounted = useRef(true), epoch = useRef(0)
  const stop = () => { epoch.current++; intent.current = false; startRequest.current?.abort(); startRequest.current = undefined; request.current?.abort(); request.current = undefined; if (mounted.current) { setBusy(false); setStarting(false); setProgress(undefined) } }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop() } }, [workbench])
  useEffect(() => { stop() }, [source?.identity, source?.version, source?.fingerprint, source?.projectRevision, serviceVersion, navigation])
  useEffect(() => { if (blocked || source?.dirty || source?.saving || source?.composing || source?.restored || source?.error) stop() }, [blocked, source?.dirty, source?.saving, source?.composing, source?.restored, source?.error])

  const generate = async (oldPlan: ProductionPlan, position: ProductionPlaybackPosition) => {
    if (request.current || !intent.current || !position.waitingFor) return
    const controller = new AbortController(); request.current = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)])
    const initial = workbench.getState(), directory = initial.document, navigation = initial.productionNavigationVersion, project = initial.authoring?.projectRevision
    let job: VoiceoverJob | undefined, settled = false, stopProgress = () => {}
    setBusy(true); setFailure(undefined); setProgress(undefined)
    try {
      const segment = oldPlan.tracks.find(track => track.kind === 'voice')?.segments.find(segment => segment.utteranceId === position.waitingFor)
      if (!segment || !position.stepId || !position.sectionId) throw new Error('voice-context-changed')
      const stepId = segment.sourceStepId ?? segment.stepId
      const snapshot = await prepareVoiceSnapshot(workbench, stepId, signal)
      if (directory === undefined || snapshot.directory !== directory || snapshot.source.version !== oldPlan.binding.source.version || snapshot.source.fingerprint !== oldPlan.binding.source.fingerprint) throw new Error('voice-context-changed')
      const status = await workbench.client.readVoiceover(directory, signal)
      if (!voiceSnapshotCurrent(workbench, snapshot) || status.revision !== snapshot.revision) throw new Error('voice-context-changed')
      const selected = status.steps.find(step => step.stepId === stepId)
      const unbound = status.unboundByPage?.find(page => page.section === segment.sectionId)
      const pageScope = (segment.stepIds?.length ?? 0) > 1 || Boolean(unbound?.utterances)
      const target = pageScope ? unbound : selected
      if (target?.state === 'blocked') throw new Error(target.reason ?? 'voice-unavailable')
      if (segment.status === 'blocked' && !target?.cached) throw new Error(target?.reason ?? 'voice-unset')
      const current = () => {
        signal.throwIfAborted(); const state = workbench.getState()
        if (!intent.current || !voiceSnapshotCurrent(workbench, snapshot) || state.productionNavigationVersion !== navigation || state.authoring?.projectRevision !== project || state.productionPlan?.binding.irRevision !== snapshot.revision) {
          controller.abort(); throw new Error('voice-context-changed')
        }
      }
      current()
      if (target?.state !== 'ready' && target?.state !== 'empty') {
        job = await workbench.client.startVoiceover(directory, { source: snapshot.source, revision: snapshot.revision, scope: pageScope ? { kind: 'page', section: segment.sectionId } : { kind: 'step', target: snapshot.target }, confirmed: true }, signal)
        current(); workbench.rememberVoiceoverJob(directory, job)
        stopProgress = workbench.subscribe(() => { const latest = workbench.getState().voiceoverJobs?.find(value => value.id === job?.id); if (latest && mounted.current) setProgress({ completed: latest.completed, total: latest.total }) })
        const finished = running(job) ? await observeUntil(workbench, signal, state => { current(); const latest = state.voiceoverJobs?.find(value => value.id === job!.id); return latest && !running(latest) ? latest : undefined }) : job
        settled = true
        if (finished.state !== 'done') throw new Error(finished.error ?? (finished.state === 'stale' ? 'voice-context-changed' : 'voice-generation-failed'))
      }
      current()
      // The ordinary job observer refreshes the plan in the mounted frame. A concurrent hit has no local job.
      if (!job) { await workbench.prepareProductionPlan(signal); current() }
      const refreshed = await observeUntil(workbench, signal, state => {
        current()
        const next = state.productionPlan, live = state.productionPlayback
        return next && next.binding.irRevision === snapshot.revision && next.binding.planId !== oldPlan.binding.planId && live?.status === 'ready' && sameProductionBinding(next.binding, live.binding) ? next : undefined
      })
      current()
      await workbench.controlProduction({ binding: refreshed.binding, action: 'step', sectionId: position.sectionId, stepId: position.stepId, utteranceId: position.waitingFor }, signal)
      current()
      if (position.rate !== 1) await workbench.controlProduction({ binding: refreshed.binding, action: 'rate', rate: position.rate }, signal)
      current()
      await workbench.controlProduction({ binding: refreshed.binding, action: 'play' }, signal)
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) { intent.current = false; setFailure(voiceFailure(error, locale)) }
    } finally {
      stopProgress()
      if (job && !settled) void workbench.client.cancelVoiceover(directory!, job.id, AbortSignal.timeout(5000)).catch(() => {})
      if (request.current === controller) { request.current = undefined; if (mounted.current) { setBusy(false); setProgress(undefined) } }
    }
  }
  useEffect(() => {
    if (intent.current && !busy && !starting && plan && playback?.position?.waitingFor && sameProductionBinding(plan.binding, playback.binding)) void generate(plan, playback.position)
  }, [plan, playback, busy, starting])

  const toggle = async () => {
    const state = workbench.getState(), current = state.productionPlan
    if (!current) return
    if (request.current || startRequest.current || state.productionPlayback?.position?.playing) {
      stop()
      try { await workbench.controlProduction({ binding: current.binding, action: 'pause' }) } catch { /* The cancelled binding may already have been replaced. */ }
      return
    }
    const controller = new AbortController(), owner = ++epoch.current
    startRequest.current = controller; intent.current = true; setStarting(true); setFailure(undefined)
    try { await workbench.controlProduction({ binding: current.binding, action: 'play' }, controller.signal) }
    catch (error) { if (owner === epoch.current && !controller.signal.aborted) { intent.current = false; if (mounted.current) setFailure(voiceFailure(error, locale)) } }
    finally { if (startRequest.current === controller) { startRequest.current = undefined; if (mounted.current) setStarting(false) } }
  }
  return { busy: busy || starting, failure, progress, stop, toggle }
}
