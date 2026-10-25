import type { PreviewReport } from '@lincyaw/kernel'
import type { PreviewSink } from './workbench.ts'

interface PlaybackContext { document?: string, scope: number, sinks: ReadonlySet<PreviewSink> }
interface PendingPause {
  document: string
  scope: number
  sink: PreviewSink
  generation?: number
  finish(error?: string): void
}

/** Coordinates author auditions with the existing preview player; it never drives a second lecture clock. */
export class PreviewPlayback {
  readonly #context: () => PlaybackContext
  readonly #pauses = new Map<number, PendingPause>()
  readonly #auditions = new Set<() => void>()
  #sequence = Date.now()

  constructor(context: () => PlaybackContext) { this.#context = context }

  registerAudition(stop: () => void): () => void {
    this.stopAuditions()
    this.#auditions.add(stop)
    return () => { this.#auditions.delete(stop) }
  }

  stopAuditions(): void { for (const stop of [...this.#auditions]) stop() }

  pause(): Promise<void> {
    const { document, scope, sinks } = this.#context()
    const sink = [...sinks].find(sink => sink.capabilities?.includes('pause-playback') && sink.capabilities.includes('playback-granted'))
    if (document === undefined || !sink) return Promise.reject(new Error('preview-playback-unavailable'))
    const request = ++this.#sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish('preview-playback-timeout'), 5000)
      const finish = (error?: string) => {
        if (!this.#pauses.delete(request)) return
        clearTimeout(timer)
        error ? reject(new Error(error)) : resolve()
      }
      this.#pauses.set(request, { document, scope, sink, generation: sink.generation, finish })
      try { sink.send({ type: 'pause-playback', request }) } catch { finish('preview-playback-unavailable') }
    })
  }

  report(document: string, report: PreviewReport, sink?: PreviewSink): void {
    const context = this.#context()
    if (!sink || document !== context.document || !context.sinks.has(sink)) return
    if (report.type === 'playback-paused') {
      const pause = this.#pauses.get(report.request)
      if (!pause || pause.document !== document || pause.scope !== context.scope || pause.sink !== sink) return
      pause.finish(pause.generation !== sink.generation ? 'preview-playback-changed' : report.error ? 'preview-playback-unavailable' : undefined)
    } else if (report.type === 'playback-request' && sink.capabilities?.includes('playback-granted')) {
      // Stop and invalidate pending audition requests before granting the child's existing player.
      this.stopAuditions()
      sink.send({ type: 'playback-granted', request: report.request })
    } else if (report.type === 'ready') {
      for (const pause of this.#pauses.values()) if (pause.sink === sink && pause.generation !== sink.generation) pause.finish('preview-playback-changed')
      this.stopAuditions()
    }
  }

  detach(sink: PreviewSink): void {
    for (const pause of this.#pauses.values()) if (pause.sink === sink) pause.finish('preview-playback-changed')
    this.stopAuditions()
  }

  reset(): void {
    for (const pause of this.#pauses.values()) pause.finish('preview-playback-changed')
    this.stopAuditions()
  }
}
