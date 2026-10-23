import { OPERATIONS, STEP_CLOCK, useServer, useService } from '@lincyaw/host'
import type { Operations, StepClock } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { audioSegments, LECTURE_ID, trackDuration } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'
import type { ClockMedia, TrackClock } from './clock.ts'
import { MediaClock, SilentClock } from './clock.ts'
import { LecturePlayer } from './player.ts'
import type { LectureSource } from './source.ts'
import { lectureSource } from './source.ts'
import { exporting, playing, useViewer } from './state.ts'

async function createClock(track: LectureTrack, source: LectureSource): Promise<TrackClock> {
  const length = trackDuration(track)
  const segments = audioSegments(track)
  if (!segments.length) return new SilentClock(length)
  const loaded = await Promise.allSettled(segments.map(async (segment): Promise<ClockMedia> => ({
    url: await source.media(track.id, segment.src), start: segment.start, duration: segment.duration,
  })))
  const media = loaded.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const failed = loaded.find(result => result.status === 'rejected')
  if (failed) {
    for (const { url } of media) if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    throw failed.reason
  }
  return new MediaClock(length, media)
}

function installExportHook(player: LecturePlayer, clock: StepClock | undefined): void {
  const frame = () => new Promise<void>(done => requestAnimationFrame(() => done()))
  Object.assign(window, {
    presmiumLecture: {
      duration: player.duration,
      async advance(at: number) {
        player.advanceTo(at)
        await nextTick()
        await clock?.settled()
        await frame()
        await frame()
      },
    },
  })
}

export function useLecturePlayback() {
  const viewer = useViewer()
  const server = useServer()
  const operations = useService(OPERATIONS)
  const stepClock = useService(STEP_CLOCK)
  const player = shallowRef<LecturePlayer>()
  const status = ref<'loading' | 'missing' | 'ready' | 'failed'>()
  const loadFailure = ref<string>()
  const failure = computed(() => loadFailure.value ?? player.value?.clock.error.value?.message)
  const language = ref<string>()
  const source = () => lectureSource(server, viewer.doc.value.config.presmium[LECTURE_ID])

  let loading = 0
  // The lecture's time drives the animations of the components: playing, seeking and each exported frame.
  let undrive = () => {}
  async function start(track: LectureTrack, from: LectureSource, ops: Operations, load: number, at = 0) {
    player.value?.pause()
    loadFailure.value = undefined
    if (!player.value) status.value = 'loading'
    try {
      const clock = await createClock(track, from)
      if (load !== loading) return clock.dispose()
      player.value?.dispose()
      player.value = new LecturePlayer(track, viewer.doc.value, ops, clock)
      undrive()
      undrive = stepClock.value?.drive({ elapsed: player.value.stepTime, recording: exporting }) ?? (() => {})
      language.value ??= track.lang
      status.value = 'ready'
      player.value.seek(at)
      if (exporting) installExportHook(player.value, stepClock.value)
    } catch (error) {
      if (load !== loading) return
      undrive()
      player.value?.dispose()
      player.value = undefined
      loadFailure.value = errorMessage(error)
      status.value = 'failed'
    }
  }

  watch([playing, operations], async ([id, ops]) => {
    const load = ++loading
    undrive()
    player.value?.dispose()
    player.value = undefined
    status.value = undefined
    loadFailure.value = undefined
    language.value = undefined
    if (!id || !ops) return
    status.value = 'loading'
    const from = source()
    try {
      const track = await from.track(id)
      if (load !== loading) return
      if (!track) {
        status.value = 'missing'
        return
      }
      await start(track, from, ops, load)
    } catch (error) {
      if (load !== loading) return
      status.value = 'failed'
      loadFailure.value = errorMessage(error)
    }
  }, { immediate: true })
  onBeforeUnmount(() => {
    loading++
    undrive()
    player.value?.dispose()
  })

  function reloadTrack(track: LectureTrack): void {
    const ops = operations.value
    if (!ops || track.id !== playing.value) return
    void start(track, source(), ops, ++loading, player.value?.time.value ?? 0)
  }

  return { player, status, failure, language, reloadTrack }
}
