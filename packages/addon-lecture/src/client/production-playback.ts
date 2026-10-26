import { createStore } from '@lincyaw/host'
import { sameProductionBinding } from '@lincyaw/kernel'
import { flushSync } from 'react-dom'
import type { ProductionPlayback, StepClock } from '@lincyaw/host'
import type { ProductionBinding, ProductionPlan, ProductionPlaybackCommand, ProductionPlaybackState } from '@lincyaw/kernel'
import type { LecturePlayer } from './player.ts'

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
interface Loader { load(binding: ProductionBinding, signal: AbortSignal): Promise<void>, current(binding: ProductionBinding): boolean }
interface Driver { plan: ProductionPlan, player: LecturePlayer, clock?: StepClock }

/** Let newly mounted pictures register their preparation, then await the real shared step clock. */
export async function settleProductionPlayback(clock?: StepClock, signal?: AbortSignal): Promise<void> {
  const frame = () => new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted()
    const abort = () => { cancelAnimationFrame(id); reject(signal?.reason ?? new DOMException('Playback cancelled', 'AbortError')) }
    const id = requestAnimationFrame(() => { signal?.removeEventListener('abort', abort); resolve() })
    signal?.addEventListener('abort', abort, { once: true })
  })
  await frame(); signal?.throwIfAborted()
  await clock?.settled(); signal?.throwIfAborted()
  await frame(); signal?.throwIfAborted()
}

/** A versioned handle to one existing LecturePlayer, with no scheduler or independent playback clock. */
export class ProductionPlaybackController implements ProductionPlayback {
  readonly version = 1 as const
  readonly state = createStore<ProductionPlaybackState | undefined>(undefined)
  readonly engaged = createStore(false)
  #loader?: Loader
  #driver?: Driver
  #request?: AbortController
  #command?: ProductionPlaybackCommand
  #generation = 0
  #stopped = false
  #waiting = new Set<() => void>()

  register(loader: Loader): () => void {
    this.#loader = loader
    for (const ready of [...this.#waiting]) ready()
    return () => {
      if (this.#loader !== loader) return
      this.#loader = undefined; this.#request?.abort(); this.#driver?.player.pause()
      const before = this.state.getSnapshot()
      if (before) this.state.set({ binding: before.binding, status: 'unavailable', error: 'production-playback-unavailable' })
    }
  }

  loading(binding: ProductionBinding): void {
    this.state.set({ binding, status: 'loading' })
  }

  #publish(driver: Driver): void {
    if (this.#stopped || this.#driver !== driver || !this.#loader?.current(driver.plan.binding)) return
    const shown = this.state.getSnapshot()
    if (shown && !sameProductionBinding(shown.binding, driver.plan.binding)) return
    const { player, plan } = driver, error = player.clock.error.getSnapshot()
    const at = player.time.getSnapshot(), cursor = player.cursor.getSnapshot()
    const page = plan.pages.find(page => page.sectionId === cursor?.sectionId)
    const step = page?.steps.find(step => step.index === cursor?.step)
    this.state.set({ binding: plan.binding, status: error ? 'failed' : 'ready', position: {
      timeMs: at, durationMs: player.duration, stepTimeMs: player.stepTime.getSnapshot(),
      ...page ? { sectionId: page.sectionId } : {}, ...step ? { stepId: step.stepId } : {},
      playing: player.clock.playing.getSnapshot(), rate: player.clock.rate.getSnapshot(), trying: player.trying.getSnapshot(),
    }, ...error ? { error: 'production-playback-failed' } : {} })
  }

  attach(plan: ProductionPlan, player?: LecturePlayer, clock?: StepClock): () => void {
    if (!player) {
      this.#driver = undefined
      this.state.set({ binding: plan.binding, status: plan.timing === 'estimated' ? 'estimated' : 'unavailable', error: plan.canPreview ? undefined : 'production-plan-unavailable' })
      return () => {}
    }
    const driver = { plan, player, clock }
    this.#driver = driver
    let queued = false
    const report = () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; this.#publish(driver) }) } }
    const stops = [player.time.subscribe(report), player.stepTime.subscribe(report), player.cursor.subscribe(report), player.trying.subscribe(report), player.clock.playing.subscribe(report), player.clock.rate.subscribe(report), player.clock.error.subscribe(report)]
    this.#publish(driver)
    return () => {
      stops.forEach(stop => stop())
      if (this.#driver !== driver) return
      this.#driver = undefined
      this.state.set({ binding: plan.binding, status: 'unavailable', error: 'production-playback-unavailable' })
    }
  }

  async #ready(signal: AbortSignal): Promise<Loader> {
    if (this.#loader) return this.#loader
    return new Promise((resolve, reject) => {
      const finish = () => {
        if (!this.#waiting.delete(finish)) return
        signal.removeEventListener('abort', finish)
        signal.aborted || this.#stopped ? reject(new DOMException('Playback cancelled', 'AbortError')) : this.#loader ? resolve(this.#loader) : reject(new Error('production-playback-unavailable'))
      }
      this.#waiting.add(finish); signal.addEventListener('abort', finish, { once: true })
      if (signal.aborted || this.#stopped) finish()
    })
  }

  async control(command: ProductionPlaybackCommand, signal?: AbortSignal): Promise<ProductionPlaybackState> {
    signal?.throwIfAborted()
    if (this.#stopped) throw new Error('production-playback-unavailable')
    if (this.#loader && !this.#loader.current(command.binding)) throw new Error('production-binding-stale')
    const cancellingLoad = command.action === 'pause' && this.#request && this.#command?.action === 'load' && sameProductionBinding(this.#command.binding, command.binding)
    if (command.action !== 'load' && !cancellingLoad && !sameProductionBinding(this.state.getSnapshot()?.binding ?? command.binding, command.binding)) throw new Error('production-binding-stale')
    const request = new AbortController(), generation = ++this.#generation
    this.#request?.abort(); this.#request = request; this.#command = command
    const combined = signal ? AbortSignal.any([signal, request.signal]) : request.signal
    let driver = this.#driver
    const cancel = () => { if (driver && this.#driver === driver) driver.player.pause() }
    combined.addEventListener('abort', cancel, { once: true })
    const check = () => {
      combined.throwIfAborted()
      if (this.#stopped || generation !== this.#generation || !this.#loader?.current(command.binding)) throw new Error('production-binding-stale')
    }
    try {
      if (command.action === 'load' && driver && sameProductionBinding(driver.plan.binding, command.binding) && this.state.getSnapshot()?.status === 'ready') {
        this.engaged.set(true); driver.player.pause(); check(); this.#publish(driver)
        return this.state.getSnapshot()!
      }
      if (cancellingLoad || command.action === 'pause' && !this.#loader) {
        this.#driver?.player.pause()
        const state: ProductionPlaybackState = { binding: command.binding, status: 'unavailable', error: 'production-playback-cancelled' }
        this.state.set(state)
        return state
      }
      if (command.action === 'load') { this.engaged.set(true); this.loading(command.binding) }
      const loader = await this.#ready(combined)
      if (!loader.current(command.binding)) throw new Error('production-binding-stale')
      if (command.action === 'load') {
        await loader.load(command.binding, combined); check()
        if (!sameProductionBinding(this.state.getSnapshot()?.binding ?? command.binding, command.binding)) throw new Error('production-binding-stale')
      } else {
        check()
        driver = this.#driver
        if (driver && !sameProductionBinding(driver.plan.binding, command.binding)) throw new Error('production-binding-stale')
        if (command.action === 'pause') driver?.player.pause()
        else {
          if (!driver || !driver.plan.canPreview || this.state.getSnapshot()?.status !== 'ready') throw new Error('production-plan-unavailable')
          if (command.action === 'seek') {
            if (!Number.isFinite(command.timeMs) || command.timeMs < 0 || command.timeMs > driver.player.duration) throw new Error('production-playback-time')
            flushSync(() => driver!.player.seek(command.timeMs))
          } else if (command.action === 'step') {
            const step = driver.plan.pages.find(page => page.sectionId === command.sectionId)?.steps.find(step => step.stepId === command.stepId)
            if (!step || step.timing !== 'confirmed') throw new Error('production-binding-stale')
            let selected = false
            flushSync(() => { selected = driver!.player.seekStep(command.sectionId, step.index) })
            if (!selected) throw new Error('production-binding-stale')
          } else if (command.action === 'rate') {
            if (!PLAYBACK_RATES.some(rate => rate === command.rate)) throw new Error('production-playback-rate')
            driver.player.setRate(command.rate)
          } else if (!await driver.player.play()) throw new Error('production-playback-cancelled')
          await settleProductionPlayback(driver.clock, combined); check()
        }
        if (driver) this.#publish(driver)
      }
      check()
      const state = this.state.getSnapshot()
      if (!state || !sameProductionBinding(state.binding, command.binding)) throw new Error('production-playback-unavailable')
      return state
    } catch (error) {
      if (this.#request === request && command.action === 'load') this.state.set({ binding: command.binding, status: combined.aborted ? 'unavailable' : 'failed', error: combined.aborted ? 'production-playback-cancelled' : 'production-playback-failed' })
      throw error
    } finally {
      combined.removeEventListener('abort', cancel)
      if (this.#request === request) { this.#request = undefined; this.#command = undefined }
    }
  }

  dispose(): void {
    this.#stopped = true; this.#generation++; this.#request?.abort(); this.#driver?.player.pause()
    for (const ready of [...this.#waiting]) ready()
    this.#loader = undefined; this.#driver = undefined; this.engaged.set(false)
    this.state.set(undefined)
  }
}
