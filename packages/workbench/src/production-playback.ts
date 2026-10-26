import type { PreviewReport, ProductionBinding, ProductionPlaybackCommand, ProductionPlaybackState } from '@lincyaw/kernel'
import { sameProductionBinding } from '@lincyaw/kernel'
import type { PreviewSink } from './workbench.ts'

interface Context {
  document?: string
  scope: number
  binding?: ProductionBinding
  ready: boolean
  sinks: ReadonlySet<PreviewSink>
}
interface Pending {
  request: number
  document: string
  scope: number
  sink: PreviewSink
  generation?: number
  binding: ProductionBinding
  finish(state?: ProductionPlaybackState, error?: string): void
}

/** Owns command acknowledgements from one live frame; reported positions always come from its lecture clock. */
export class ProductionPlayback {
  readonly #context: () => Context
  readonly #publish: (state: ProductionPlaybackState | undefined) => void
  #pending?: Pending
  #owner?: { sink: PreviewSink, generation?: number, binding: ProductionBinding }
  #sequence = 0

  constructor(context: () => Context, publish: (state: ProductionPlaybackState | undefined) => void) {
    this.#context = context; this.#publish = publish
  }

  control(control: ProductionPlaybackCommand, signal?: AbortSignal): Promise<ProductionPlaybackState> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    const context = this.#context(), sink = [...context.sinks].find(value => value.capabilities?.includes('production-playback'))
    if (context.document === undefined || !context.ready || !context.binding || !sameProductionBinding(context.binding, control.binding)) return Promise.reject(new Error('production-source-changed'))
    if (!sink) return Promise.reject(new Error('production-playback-unavailable'))
    this.#pending?.finish(undefined, 'production-request-superseded')
    const request = ++this.#sequence
    this.#owner = { sink, generation: sink.generation, binding: control.binding }
    return new Promise((resolve, reject) => {
      const cancel = () => finish(undefined, 'production-request-cancelled')
      const timer = setTimeout(() => finish(undefined, 'production-playback-timeout'), 15000)
      const finish = (state?: ProductionPlaybackState, error?: string) => {
        if (this.#pending?.request !== request) return
        this.#pending = undefined
        clearTimeout(timer); signal?.removeEventListener('abort', cancel)
        if (error || !state) { this.#release(); reject(new Error(error ?? 'production-playback-unavailable')) }
        else { this.#publish(state); resolve(state) }
      }
      this.#pending = { request, document: context.document!, scope: context.scope, sink, generation: sink.generation, binding: control.binding, finish }
      signal?.addEventListener('abort', cancel, { once: true })
      try { sink.send({ type: 'production-playback', request, control }) }
      catch { finish(undefined, 'production-playback-unavailable') }
    })
  }

  report(document: string, report: PreviewReport, sink?: PreviewSink): void {
    if (report.type !== 'production-playback-state' && report.type !== 'production-playback-result') return
    const context = this.#context(), owner = this.#owner
    if (!sink || !owner || document !== context.document || !context.ready || !context.binding || !context.sinks.has(sink)
      || owner.sink !== sink || owner.generation !== sink.generation || !sameProductionBinding(owner.binding, context.binding)) return
    if (report.type === 'production-playback-state') {
      // An older state event cannot move a newer pending seek's playhead before its acknowledgement.
      if (!this.#pending && sameProductionBinding(report.state.binding, owner.binding)) this.#publish(report.state)
      return
    }
    const pending = this.#pending
    if (!pending || pending.request !== report.request || pending.scope !== context.scope || pending.document !== document || pending.sink !== sink
      || pending.generation !== sink.generation || !sameProductionBinding(pending.binding, report.binding)) return
    if (report.state && !sameProductionBinding(report.state.binding, pending.binding)) pending.finish(undefined, 'production-source-changed')
    else pending.finish(report.state, report.error)
  }

  /** Source edits or a replaced plan invalidate pending work before any old callback can be published. */
  changed(): boolean {
    const context = this.#context()
    if (!this.#owner || context.ready && context.binding && sameProductionBinding(context.binding, this.#owner.binding)) return false
    this.reset(); return true
  }

  detach(sink: PreviewSink): void { if (this.#owner?.sink === sink) this.reset() }

  reset(): void {
    if (this.#pending) { this.#pending.finish(undefined, 'production-source-changed'); return }
    this.#release()
  }

  #release(): void {
    const owner = this.#owner
    this.#owner = undefined
    // Cancelling a parent request also supersedes its asynchronous work in the child.
    if (owner) {
      try { owner.sink.send({ type: 'production-playback', request: ++this.#sequence, control: { binding: owner.binding, action: 'pause' } }) } catch {}
    }
    this.#publish(undefined)
  }
}
