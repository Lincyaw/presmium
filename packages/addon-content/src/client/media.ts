import { PLAYBACK_CONTROL, useService, useStep, useStepState, useViewRole } from '@lincyaw/host'
import { createContext, useContext, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
export const MEDIA_ACTIVE = createContext(true)
export function useMediaActive(): boolean { const active = useContext(MEDIA_ACTIVE), role = useViewRole(), state = useStepState({ from: 0 }); return active && (role === 'reader' || state.active) }

/** Native controls retain their clock; the runtime lease only authorizes starts. */
export function useMediaPlayback(figure: RefObject<HTMLElement>, source: string): boolean {
  const control = useService(PLAYBACK_CONTROL), active = useMediaActive(), step = useStep()
  const [failed, setFailed] = useState(false)
  useLayoutEffect(() => {
    const media = [...figure.current?.querySelectorAll<HTMLMediaElement>('video,audio') ?? []]
    setFailed(false)
    if (!media.length) return
    let disposed = false, generation = 0
    let current: { element: HTMLMediaElement, generation: number, phase: 'holding' | 'authorizing' | 'starting' | 'playing' } | undefined
    const pauses = new Map<HTMLMediaElement, (() => void)[]>()
    const pause = (element: HTMLMediaElement): Promise<void> => {
      if (element.paused) return Promise.resolve()
      return new Promise(resolve => {
        const pending = pauses.get(element) ?? []
        pending.push(resolve)
        pauses.set(element, pending)
        element.pause()
      })
    }
    const stop = () => {
      generation++
      current = undefined
      lease?.cancel()
      for (const element of media) void pause(element)
    }
    const lease = control?.register(stop)
    const valid = (request: NonNullable<typeof current>) => !disposed && active && current === request && generation === request.generation
    const start = async (element: HTMLMediaElement) => {
      lease?.cancel()
      const request: NonNullable<typeof current> = { element, generation: ++generation, phase: 'holding' }
      current = request
      setFailed(false)
      try {
        // pause() queues a native event. Drain it before restoring playback so an
        // old internal pause cannot cancel the permission just granted.
        await pause(element)
        if (!valid(request)) return
        request.phase = 'authorizing'
        const allowed = lease ? await lease.requestStart() : true
        if (!valid(request) || !allowed) return
        request.phase = 'starting'
        await element.play()
      } catch (error) {
        if (!valid(request)) return
        stop()
        if (!(error instanceof Error && error.name === 'AbortError')) setFailed(true)
      }
    }
    const onPlay = (event: Event) => {
      const element = event.currentTarget as HTMLMediaElement
      if (disposed || !active) { stop(); return }
      if (current?.element === element && current.phase === 'starting') {
        if (element.paused) stop()
        else current.phase = 'playing'
        return
      }
      if (element.paused) return // A play event queued before a newer pause.
      void start(element)
    }
    const onPause = (event: Event) => {
      const element = event.currentTarget as HTMLMediaElement, pending = pauses.get(element)
      if (pending?.length) { pending.shift()!(); if (!pending.length) pauses.delete(element); return }
      if (current?.element !== element || !element.paused) return
      // During authorization the element is deliberately paused. A native
      // control cannot pause it again; external cancellation calls stop().
      if (current.phase === 'authorizing' || current.phase === 'holding' || current.phase === 'starting') return
      stop()
    }
    const onStop = () => stop()
    const onSeek = () => {
      // Seeking during an authorization invalidates that start. Once playing,
      // native scrubbing and loop seeks keep their existing lease and clock.
      if (current && current.phase !== 'playing') stop()
    }
    const onError = () => { stop(); if (!disposed) setFailed(true) }
    for (const element of media) {
      element.addEventListener('play', onPlay)
      element.addEventListener('pause', onPause)
      element.addEventListener('ended', onStop)
      element.addEventListener('seeking', onSeek)
      element.addEventListener('error', onError)
    }
    if (!active) stop()
    return () => {
      disposed = true
      stop()
      lease?.dispose()
      for (const element of media) {
        element.removeEventListener('play', onPlay)
        element.removeEventListener('pause', onPause)
        element.removeEventListener('ended', onStop)
        element.removeEventListener('seeking', onSeek)
        element.removeEventListener('error', onError)
      }
      for (const pending of pauses.values()) for (const resolve of pending) resolve()
      pauses.clear()
    }
  }, [figure, control, active, step, source])
  return failed
}
