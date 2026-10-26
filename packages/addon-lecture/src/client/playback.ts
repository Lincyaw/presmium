import { OPERATIONS, PLAYBACK_CONTROL, PRODUCTION_PLAYBACK, STEP_CLOCK, useMessages, useServer, useService, useStore } from '@lincyaw/host'
import type { Operations, StepClock } from '@lincyaw/host'
import { errorMessage, PREVIEW_REVISION, sameProductionBinding } from '@lincyaw/kernel'
import type { ProductionBinding, ProductionPlan } from '@lincyaw/kernel'
import { flushSync } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { audioSegments, LECTURE_ID, LECTURE_MESSAGES, SCRIPT_TRACK, timedEvents, trackDuration } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'
import type { ClockMedia, TrackClock } from './clock.ts'
import { MediaClock, SilentClock } from './clock.ts'
import { LecturePlayer } from './player.ts'
import type { LectureSource } from './source.ts'
import { lectureSource } from './source.ts'
import { ProductionPlaybackController, settleProductionPlayback } from './production-playback.ts'
import { exporting, play, playing, useViewer } from './state.ts'

async function createClock(track: LectureTrack, source: LectureSource, signal?: AbortSignal): Promise<TrackClock> {
  const length = trackDuration(track)
  const segments = audioSegments(track)
  if (!segments.length) return new SilentClock(length)
  const loaded = await Promise.allSettled(segments.map(async (segment): Promise<ClockMedia> => {
    if (track.binding && source.productionMedia && !segment.clipId) throw new Error('production-clip-unavailable')
    const url = track.binding && source.productionMedia && segment.clipId ? await source.productionMedia(track.binding, segment.clipId, signal) : await source.media(track.id, segment.src)
    return { url, start: segment.start, duration: segment.duration }
  }))
  const media = loaded.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const failed = loaded.find(result => result.status === 'rejected')
  if (failed || signal?.aborted) { for (const { url } of media) if (url.startsWith('blob:')) URL.revokeObjectURL(url); if (failed) throw failed.reason; signal?.throwIfAborted() }
  return new MediaClock(length, media)
}
function installExportHook(player: LecturePlayer, clock: StepClock | undefined): void {
  const frame = () => new Promise<void>(done => requestAnimationFrame(() => done()))
  Object.assign(window, { presmiumLecture: { duration: player.duration, async advance(at: number) {
    flushSync(() => player.advanceTo(at)); await clock?.settled(); await frame(); await frame()
  } } })
}
export function useLecturePlayback() {
  const viewer = useViewer()
  const doc = useStore(viewer.doc)
  const server = useServer()
  const operations = useService(OPERATIONS)
  const stepClock = useService(STEP_CLOCK)
  const playback = useService(PLAYBACK_CONTROL)
  const provided = useService(PRODUCTION_PLAYBACK)
  const production = provided instanceof ProductionPlaybackController ? provided : undefined
  const t = useMessages(LECTURE_MESSAGES)
  const [player, setPlayer] = useState<LecturePlayer>()
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'failed' | 'estimated' | 'unavailable'>()
  const [failure, setFailure] = useState<string>()
  const [language, setLanguage] = useState<string>()
  const current = useRef<LecturePlayer>()
  const generation = useRef(0)
  const releaseClock = useRef<() => void>(() => {})
  const releaseProduction = useRef<() => void>(() => {})
  const clear = () => { releaseProduction.current(); releaseProduction.current = () => {}; current.current?.dispose(); current.current = undefined; releaseClock.current(); releaseClock.current = () => {} }
  const start = async (track: LectureTrack, source: LectureSource, ops: Operations, load: number, at = 0, plan?: ProductionPlan, signal?: AbortSignal, origin?: { section: string, step: number }) => {
    const clock = await createClock(track, source, signal)
    if (load !== generation.current || signal?.aborted) { clock.dispose(); signal?.throwIfAborted(); return }
    clear()
    const next = new LecturePlayer(track, doc, ops, clock, playback)
    current.current = next
    releaseClock.current = stepClock?.drive({ elapsed: next.stepTime, recording: exporting }) ?? (() => {})
    const seek = () => {
      if (origin && next.seekStep(origin.section, origin.step)) return
      if (origin && plan) { clear(); throw new Error('production-binding-stale') }
      next.seek(at)
    }
    if (plan) flushSync(seek)
    else seek()
    if (plan && production) {
      await settleProductionPlayback(stepClock, signal)
      if (load !== generation.current || signal?.aborted) { signal?.throwIfAborted(); return }
      releaseProduction.current = production.attach(plan, next, stepClock)
    }
    setPlayer(next); setLanguage(old => old ?? track.lang); setStatus('ready')
    if (exporting) installExportHook(next, stepClock)
  }
  useEffect(() => {
    clear(); setPlayer(undefined); setFailure(undefined)
    if (!operations) { setStatus(undefined); return }
    const source = lectureSource(server, doc.config.presmium[LECTURE_ID])
    const currentBinding = (binding: ProductionBinding) => viewer.doc.getSnapshot() === doc && doc.source?.documentId === binding.source.documentId && doc.source.version === binding.source.version && doc.source.fingerprint === binding.source.fingerprint && doc.meta[PREVIEW_REVISION] === binding.irRevision
    const loadTrack = async (id: string | undefined, binding?: ProductionBinding, signal?: AbortSignal) => {
      const load = ++generation.current
      const check = () => { signal?.throwIfAborted(); if (load !== generation.current || viewer.doc.getSnapshot() !== doc) throw new Error('production-binding-stale') }
      if (binding && !currentBinding(binding)) throw new Error('production-binding-stale')
      current.current?.pause(); setFailure(undefined)
      if (!id) { clear(); setPlayer(undefined); setStatus(undefined); return }
      setStatus('loading')
      let plan: ProductionPlan | undefined
      if (binding) {
        if (!source.plan || !production) throw new Error('production-playback-unavailable')
        plan = await source.plan({ source: binding.source, irRevision: binding.irRevision }, signal); check()
        if (!sameProductionBinding(plan.binding, binding)) throw new Error('production-binding-stale')
        clear(); setPlayer(undefined); production.loading(binding)
        if (!plan.canPreview) {
          releaseProduction.current = production.attach(plan)
          setStatus(plan.timing === 'estimated' ? 'estimated' : 'unavailable')
          return
        }
      }
      const track = await source.track(id, plan?.binding.planId, signal); check()
      if (!track) { clear(); setPlayer(undefined); setStatus('missing'); throw new Error('production-track-unavailable') }
      if (binding && (!track.binding || !sameProductionBinding(track.binding, binding))) throw new Error('production-binding-stale')
      // An estimate remains a caption fallback for ordinary readers; explicit production loads inspect its plan.
      if (!binding && !exporting && track.id === SCRIPT_TRACK && track.utterances.length > 0 && track.utterances.every(utterance => Boolean(utterance.unsaid)) && audioSegments(track).length === 0) { play(undefined); return }
      const position = viewer.position.getSnapshot()
      const at = exporting ? 0 : timedEvents(track).find(event => event.type === 'go' && event.data.section === position.section && Number(event.data.step ?? 0) === position.step)?.t ?? 0
      await start(track, source, operations, load, at, plan, signal, exporting ? undefined : position); check()
    }
    let selecting = false
    const select = () => {
      if (selecting) return
      const request = generation.current + 1
      void loadTrack(playing.getSnapshot()).catch(error => { if (generation.current === request) { setFailure(errorMessage(error)); setStatus('failed') } })
    }
    const stopSelect = playing.subscribe(select)
    const stopLoader = production?.register({ current: currentBinding, async load(binding, signal) {
      try {
        await loadTrack(SCRIPT_TRACK, binding, signal)
        selecting = true; play(SCRIPT_TRACK); selecting = false
      } catch (error) {
        if (!signal.aborted && currentBinding(binding)) { setFailure(errorMessage(error)); setStatus('failed') }
        throw error
      }
    } })
    select()
    return () => { generation.current++; stopSelect(); stopLoader?.(); clear() }
  }, [operations, doc, stepClock, playback, server.available, production])
  // Cancel permission synchronously when IR changes, before a late parent grant can run.
  useEffect(() => viewer.doc.subscribe(() => current.current?.pause()), [viewer])
  useEffect(() => () => { play(undefined) }, [])
  const clockError = useStore<Error | undefined>(player?.clock.error, undefined)
  function reloadTrack(track: LectureTrack): void {
    if (!operations || track.id !== playing.getSnapshot()) return
    void start(track, lectureSource(server, doc.config.presmium[LECTURE_ID]), operations, ++generation.current, current.current?.time.getSnapshot() ?? 0).catch(error => setFailure(errorMessage(error)))
  }
  const clockFailure = clockError?.message === 'playback-timeout' ? t.player.playbackTimeout : clockError?.message
  return { player, status, failure: failure ?? clockFailure, language, setLanguage, reloadTrack }
}
