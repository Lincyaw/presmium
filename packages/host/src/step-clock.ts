import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Unsubscribe } from '@lincyaw/kernel/contracts'
import type { Navigation, NavigationPosition, StepClock, StepClockDriver } from './contracts.ts'
import { useHost, usePrefersReducedMotion } from './host.ts'
import { createStore, observe, useStore } from './store.ts'
interface StepChange { slide: number, step: number, at: number, forward: boolean }
const driver = createStore<StepClockDriver | undefined>(undefined)
const change = createStore<StepChange | undefined>(undefined)
const now = createStore(0)
const live = new Set<() => boolean>()
let frame = 0
const clockNow = () => typeof performance === 'undefined' ? 0 : performance.now()
function tick() { frame = 0; now.set(clockNow()); if ([...live].some(running => running())) frame = requestAnimationFrame(tick) }
function ensureTicking() { if (frame || typeof requestAnimationFrame === 'undefined') return; now.set(clockNow()); frame = requestAnimationFrame(tick) }
function isForward(to: NavigationPosition, from: StepChange | undefined) { return !from || to.slide > from.slide || (to.slide === from.slide && to.step > from.step) }
const nextFrame = () => new Promise<void>(done => typeof requestAnimationFrame === 'undefined' ? setTimeout(done, 0) : requestAnimationFrame(() => done()))
function handOff(elapsed: number) { const at = change.getSnapshot(); if (at) change.set({ ...at, at: clockNow() - elapsed, forward: true }); ensureTicking() }
export function createStepClock(navigation: Navigation): { clock: StepClock, stop: Unsubscribe } {
  const pending = new Map<Promise<unknown>, number | undefined>()
  const preparations = new Map<number, Set<() => void | Promise<void>>>()
  const failures = new Map<number | undefined, unknown>()
  let stopped = false
  const matches = (slide: number | undefined, slides?: readonly number[]) => slide === undefined || slides === undefined || slides.includes(slide)
  const rethrow = (slides?: readonly number[]) => { for (const [slide, error] of failures) if (matches(slide, slides)) { failures.delete(slide); throw error } }
  const stop = observe(navigation.position, position => { const before = change.getSnapshot(); if (before && before.slide === position.slide && before.step === position.step) return; change.set({ slide: position.slide, step: position.step, at: clockNow(), forward: isForward(position, before) }); ensureTicking() }, true)
  let unfollow: Unsubscribe | undefined
  // A driver that comes while an exclusive one holds the clock waits for it, the latest one only.
  let waiting: StepClockDriver | undefined
  const activate = (next: StepClockDriver) => { unfollow?.(); driver.set(next); unfollow = observe(next.elapsed, (now, before) => { if (now === undefined && before !== undefined) handOff(before) }) }
  const clock: StepClock = {
    drive(next) {
      if (driver.getSnapshot()?.exclusive && !next.exclusive) waiting = next
      else activate(next)
      return () => {
        if (waiting === next) { waiting = undefined; return }
        if (driver.getSnapshot() !== next) return
        const last = next.elapsed.getSnapshot(); unfollow?.(); unfollow = undefined; driver.set(undefined)
        if (waiting) { const held = waiting; waiting = undefined; activate(held) } else if (last !== undefined) handOff(last)
      }
    },
    wait(work, slide) { if (!stopped) pending.set(work, slide); void work.catch(error => { if (!stopped && !failures.has(slide)) failures.set(slide, error) }).finally(() => pending.delete(work)) },
    registerPreparation(slide, prepare) {
      const callbacks = preparations.get(slide) ?? new Set()
      preparations.set(slide, callbacks); callbacks.add(prepare)
      return () => { callbacks.delete(prepare); if (!callbacks.size) preparations.delete(slide) }
    },
    async prepare(slides, options) {
      for (const slide of new Set(slides)) for (const prepare of preparations.get(slide) ?? []) clock.wait(Promise.resolve().then(prepare), slide)
      await nextFrame()
      if (options?.wait !== false) await clock.settled(slides)
    },
    async settled(slides) {
      const own = () => [...pending].filter(([, slide]) => matches(slide, slides)).map(([work]) => work)
      let waited = false
      for (let round = 0; round < 100; round++) {
        if (stopped) return
        if (!own().length) { if (waited) { waited = false; await nextFrame() } if (!own().length) return rethrow(slides) }
        await Promise.allSettled(own()); waited = true
      }
      throw new Error('the page kept preparing its picture: settled() stopped waiting after 100 rounds')
    },
  }
  return { clock, stop() { if (stopped) return; stopped = true; stop(); unfollow?.(); waiting = undefined; driver.set(undefined); change.set(undefined); pending.clear(); preparations.clear(); failures.clear() } }
}
export interface StepTimeOptions { until?: number }
const settle = (time: number, until: number | undefined) => until !== undefined && time >= until ? Infinity : Math.max(0, time)
export function useStepTime(options: StepTimeOptions = {}): number {
  const host = useHost(); const step = host.useStep(); const cursor = host.useCursor(); const reduced = usePrefersReducedMotion()
  const at = useStore(change); const player = useStore(driver); const elapsed = useStore(player?.elapsed); const currentTime = useStore(now)
  let time = Infinity
  if (Number.isFinite(step) && at && at.step === step && at.slide === cursor.slide) {
    if (player && elapsed !== undefined) time = reduced && !player.recording ? Infinity : settle(elapsed, options.until)
    else if (!reduced && at.forward) time = settle(currentTime - at.at, options.until)
  }
  const renderedTime = useRef(time); renderedTime.current = time
  useEffect(() => { const running = () => Number.isFinite(renderedTime.current) && driver.getSnapshot()?.elapsed.getSnapshot() === undefined; live.add(running); ensureTicking(); return () => { live.delete(running) } }, [step, cursor.slide, player, options.until, reduced])
  return time
}
const unobserved = () => () => {}
/** While the driver of the clock paces the steps it plays (a narrated lecture), the length it gives a step: `StepClockDriver.stepLength`. */
export function useDrivenStepLength(): StepClockDriver['stepLength'] {
  const player = useStore(driver)
  const playing = () => player?.elapsed.getSnapshot() !== undefined
  return useSyncExternalStore(player?.elapsed.subscribe ?? unobserved, playing, playing) ? player?.stepLength : undefined
}
