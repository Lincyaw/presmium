import { OPERATIONS, PLAYBACK_CONTROL, STEP_CLOCK, useMessages, useServer, useService, useStore } from '@lincyaw/host'
import type { Operations, StepClock } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import { flushSync } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { audioSegments, LECTURE_ID, LECTURE_MESSAGES, SCRIPT_TRACK, timedEvents, trackDuration } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'
import type { ClockMedia, TrackClock } from './clock.ts'
import { MediaClock, SilentClock } from './clock.ts'
import { LecturePlayer } from './player.ts'
import type { LectureSource } from './source.ts'
import { lectureSource } from './source.ts'
import { exporting, play, playing, useViewer } from './state.ts'

async function createClock(track: LectureTrack, source: LectureSource): Promise<TrackClock> {
  const length = trackDuration(track)
  const segments = audioSegments(track)
  if (!segments.length) return new SilentClock(length)
  const loaded = await Promise.allSettled(segments.map(async (segment): Promise<ClockMedia> => ({ url: await source.media(track.id, segment.src), start: segment.start, duration: segment.duration })))
  const media = loaded.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const failed = loaded.find(result => result.status === 'rejected')
  if (failed) { for (const { url } of media) if (url.startsWith('blob:')) URL.revokeObjectURL(url); throw failed.reason }
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
  const id = useStore(playing)
  const server = useServer()
  const operations = useService(OPERATIONS)
  const stepClock = useService(STEP_CLOCK)
  const playback = useService(PLAYBACK_CONTROL)
  const t = useMessages(LECTURE_MESSAGES)
  const [player, setPlayer] = useState<LecturePlayer>()
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'failed'>()
  const [failure, setFailure] = useState<string>()
  const [language, setLanguage] = useState<string>()
  const current = useRef<LecturePlayer>()
  const generation = useRef(0)
  const releaseClock = useRef<() => void>(() => {})
  const start = async (track: LectureTrack, source: LectureSource, ops: Operations, load: number, at = 0) => {
    const clock = await createClock(track, source)
    if (load !== generation.current) return clock.dispose()
    current.current?.dispose(); releaseClock.current()
    const next = new LecturePlayer(track, doc, ops, clock, playback)
    current.current = next
    releaseClock.current = stepClock?.drive({ elapsed: next.stepTime, recording: exporting }) ?? (() => {})
    setPlayer(next); setLanguage(old => old ?? track.lang); setStatus('ready'); next.seek(at)
    if (exporting) installExportHook(next, stepClock)
  }
  useEffect(() => {
    const load = ++generation.current
    current.current?.dispose(); current.current = undefined; releaseClock.current(); setPlayer(undefined); setFailure(undefined)
    if (!id || !operations) { setStatus(undefined); return }
    setStatus('loading')
    const source = lectureSource(server, doc.config.presmium[LECTURE_ID])
    void source.track(id).then(async track => {
      if (load !== generation.current) return
      if (!track) { setStatus('missing'); return }
      // A word-count estimate is not a prepared audio timeline. Without any
      // actual clip, presentation keeps its canonical step-caption surface.
      if (!exporting && track.id === SCRIPT_TRACK && track.utterances.length > 0 && track.utterances.every(utterance => Boolean(utterance.unsaid)) && audioSegments(track).length === 0) { play(undefined); return }
      const position = viewer.position.getSnapshot()
      const at = exporting ? 0 : timedEvents(track).find(event => event.type === 'go' && event.data.section === position.section && Number(event.data.step ?? 0) === position.step)?.t ?? 0
      await start(track, source, operations, load, at)
    }).catch(error => { if (load === generation.current) { setFailure(errorMessage(error)); setStatus('failed') } })
    return () => { generation.current++; current.current?.dispose(); current.current = undefined; releaseClock.current() }
  }, [id, operations, doc, stepClock, playback, server.available])
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
