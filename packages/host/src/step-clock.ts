import type { Unsubscribe } from '@lincyaw/kernel/contracts'
import type { Ref } from 'vue'
import { computed, getCurrentScope, onScopeDispose, shallowRef, watch } from 'vue'
import type { Navigation, NavigationPosition, StepClock, StepClockDriver } from './contracts.ts'
import { useHost, usePrefersReducedMotion } from './host.ts'

interface StepChange {
  slide: number
  step: number
  at: number
  forward: boolean
}

const driver = shallowRef<StepClockDriver>()
const change = shallowRef<StepChange>()
const now = shallowRef(0)
const live = new Set<() => boolean>()
const pending = new Set<Promise<unknown>>()
// The first work that failed since the last settled(): the picture it was for cannot be drawn.
let failure: { error: unknown } | undefined
let frame = 0

const clockNow = () => (typeof performance === 'undefined' ? 0 : performance.now())

function tick(): void {
  frame = 0
  now.value = clockNow()
  if ([...live].some(running => running())) frame = requestAnimationFrame(tick)
}

function ensureTicking(): void {
  if (frame || typeof requestAnimationFrame === 'undefined') return
  now.value = clockNow()
  frame = requestAnimationFrame(tick)
}

function isForward(to: NavigationPosition, from: StepChange | undefined): boolean {
  return !from || to.slide > from.slide || (to.slide === from.slide && to.step > from.step)
}

function nextFrame(): Promise<void> {
  return new Promise(done => (typeof requestAnimationFrame === 'undefined' ? setTimeout(done, 0) : requestAnimationFrame(() => done())))
}

/** The page's time goes on from where a player left the step: it was `elapsed` ms into it. */
function handOff(elapsed: number): void {
  const at = change.value
  if (at) change.value = { ...at, at: clockNow() - elapsed, forward: true }
  ensureTicking()
}

function rethrow(): void {
  const failed = failure
  failure = undefined
  if (failed) throw failed.error
}

/** The host's step clock: the time since the navigation reached its step, or the time a player gives. */
export function createStepClock(navigation: Navigation): { clock: StepClock, stop: Unsubscribe } {
  const stop = watch(navigation.position, (position) => {
    const before = change.value
    if (before && before.slide === position.slide && before.step === position.step) return
    change.value = { slide: position.slide, step: position.step, at: clockNow(), forward: isForward(position, before) }
    ensureTicking()
  }, { immediate: true, flush: 'sync' })
  let unfollow: Unsubscribe | undefined
  const clock: StepClock = {
    drive(next) {
      unfollow?.()
      driver.value = next
      // When the player stops giving the time (the viewer tries the page out), the page's time takes over.
      unfollow = watch(next.elapsed, (now, before) => {
        if (now === undefined && before !== undefined) handOff(before)
      }, { flush: 'sync' })
      return () => {
        if (driver.value !== next) return
        const last = next.elapsed.value
        unfollow?.()
        unfollow = undefined
        driver.value = undefined
        if (last !== undefined) handOff(last)
      }
    },
    wait(work) {
      pending.add(work)
      void work.catch((error: unknown) => {
        failure ??= { error }
      }).finally(() => pending.delete(work))
    },
    async settled() {
      // After waiting for work, one frame more: what the work drew may mount components with work of their own.
      let waited = false
      for (let round = 0; round < 100; round++) {
        if (pending.size === 0) {
          if (waited) {
            waited = false
            await nextFrame()
          }
          if (pending.size === 0) return rethrow()
        }
        await Promise.allSettled([...pending])
        waited = true
      }
      throw new Error('the page kept preparing its picture: settled() stopped waiting after 100 rounds')
    },
  }
  return {
    clock,
    stop() {
      stop()
      unfollow?.()
      unfollow = undefined
      driver.value = undefined
      change.value = undefined
      failure = undefined
    },
  }
}

export interface StepTimeOptions {
  /** The length of the component's animation in a step (ms): from then on the time is `Infinity`, and the clock stops ticking for it. */
  until?: number
}

function settle(time: number, until: number | undefined): number {
  return until !== undefined && time >= until ? Infinity : Math.max(0, time)
}

/**
 * The time since the component's current step began (ms), `Infinity` when the step is settled: in the
 * expanded document view, under reduced motion, after going back, for a step other than the one
 * the navigation is at, and from `until` on. A player (the lecture) drives it instead of the page's
 * time; a component's look is a pure function of (step, time).
 */
export function useStepTime(options: StepTimeOptions = {}): Readonly<Ref<number>> {
  const host = useHost()
  const step = host.useStep()
  const cursor = host.useCursor()
  const reduced = usePrefersReducedMotion()
  const time = computed(() => {
    const current = step.value
    const at = change.value
    if (!Number.isFinite(current) || !at || at.step !== current || at.slide !== cursor.value.slide) return Infinity
    const player = driver.value
    const elapsed = player?.elapsed.value
    if (player && elapsed !== undefined) return reduced.value && !player.recording ? Infinity : settle(elapsed, options.until)
    if (reduced.value || !at.forward) return Infinity
    return settle(now.value - at.at, options.until)
  })
  const running = () => Number.isFinite(time.value) && driver.value?.elapsed.value === undefined
  live.add(running)
  ensureTicking()
  if (getCurrentScope()) onScopeDispose(() => live.delete(running))
  return time
}
