import { useEffect, useRef } from 'react'
import type { Unsubscribe } from '@lincyaw/kernel/contracts'
import type { Navigation, NavigationPosition, StepClock, StepClockDriver } from './contracts.ts'
import { useHost, usePrefersReducedMotion } from './host.ts'
import { createStore, observe, useStore } from './store.ts'
interface StepChange { slide: number, step: number, at: number, forward: boolean }
const driver = createStore<StepClockDriver | undefined>(undefined)
const change = createStore<StepChange | undefined>(undefined)
const now = createStore(0)
const live = new Set<() => boolean>()
const pending = new Set<Promise<unknown>>()
let failure: { error: unknown } | undefined
let frame = 0
const clockNow = () => typeof performance === 'undefined' ? 0 : performance.now()
function tick() { frame = 0; now.set(clockNow()); if ([...live].some(running => running())) frame = requestAnimationFrame(tick) }
function ensureTicking() { if (frame || typeof requestAnimationFrame === 'undefined') return; now.set(clockNow()); frame = requestAnimationFrame(tick) }
function isForward(to: NavigationPosition, from: StepChange | undefined) { return !from || to.slide > from.slide || (to.slide === from.slide && to.step > from.step) }
const nextFrame = () => new Promise<void>(done => typeof requestAnimationFrame === 'undefined' ? setTimeout(done, 0) : requestAnimationFrame(() => done()))
function handOff(elapsed: number) { const at = change.getSnapshot(); if (at) change.set({ ...at, at: clockNow() - elapsed, forward: true }); ensureTicking() }
function rethrow() { const failed = failure; failure = undefined; if (failed) throw failed.error }
export function createStepClock(navigation: Navigation): { clock: StepClock, stop: Unsubscribe } {
  const stop = observe(navigation.position, position => { const before = change.getSnapshot(); if (before && before.slide === position.slide && before.step === position.step) return; change.set({ slide: position.slide, step: position.step, at: clockNow(), forward: isForward(position, before) }); ensureTicking() }, true)
  let unfollow: Unsubscribe | undefined
  const clock: StepClock = {
    drive(next) {
      unfollow?.(); driver.set(next)
      unfollow = observe(next.elapsed, (now, before) => { if (now === undefined && before !== undefined) handOff(before) })
      return () => { if (driver.getSnapshot() !== next) return; const last = next.elapsed.getSnapshot(); unfollow?.(); unfollow = undefined; driver.set(undefined); if (last !== undefined) handOff(last) }
    },
    wait(work) { pending.add(work); void work.catch(error => { failure ??= { error } }).finally(() => pending.delete(work)) },
    async settled() { let waited = false; for (let round = 0; round < 100; round++) { if (!pending.size) { if (waited) { waited = false; await nextFrame() } if (!pending.size) return rethrow() } await Promise.allSettled([...pending]); waited = true } throw new Error('the page kept preparing its picture: settled() stopped waiting after 100 rounds') },
  }
  return { clock, stop() { stop(); unfollow?.(); driver.set(undefined); change.set(undefined); failure = undefined } }
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
