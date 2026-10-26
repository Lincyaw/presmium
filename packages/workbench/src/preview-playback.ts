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
  readonly #documents = new Set<() => Promise<void>>()
  readonly #stoppingDocuments = new Set<Promise<void>>()
  #activation = 0
  #sequence = Date.now()

  constructor(context: () => PlaybackContext) { this.#context = context }

  registerAudition(stop: () => void): () => void {
    this.stopAuditions()
    this.#auditions.add(stop)
    return () => { this.#auditions.delete(stop) }
  }

  stopAuditions(): void {
    this.#activation++
    for (const stop of [...this.#auditions]) stop()
    void this.#stopDocuments().catch(() => {})
  }

  #stopDocuments(): Promise<void> {
    const pending = [...this.#stoppingDocuments]
    for (const stop of [...this.#documents]) {
      let work: Promise<void>
      try { work = stop() } catch (error) { work = Promise.reject(error) }
      this.#stoppingDocuments.add(work)
      void work.then(() => this.#stoppingDocuments.delete(work), () => this.#stoppingDocuments.delete(work))
      pending.push(work)
    }
    return Promise.all(pending).then(() => {})
  }

  /** A new local player waits until every previous iframe confirms it has stopped. */
  async startDocumentPlayback(stop: () => Promise<void>): Promise<() => void> {
    const activation = ++this.#activation
    for (const audition of [...this.#auditions]) audition()
    await this.#stopDocuments()
    if (activation !== this.#activation) throw new DOMException('Playback cancelled', 'AbortError')
    this.#documents.add(stop)
    return () => { this.#documents.delete(stop) }
  }

  pause(): Promise<void> {
    this.#activation++
    const documents = this.#stopDocuments()
    const { document, scope, sinks } = this.#context()
    const sink = [...sinks].find(sink => sink.capabilities?.includes('pause-playback') && sink.capabilities.includes('playback-granted'))
    if (document === undefined || !sink) return documents
    const request = ++this.#sequence
    const preview = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish('preview-playback-timeout'), 5000)
      const finish = (error?: string) => {
        if (!this.#pauses.delete(request)) return
        clearTimeout(timer)
        error ? reject(new Error(error)) : resolve()
      }
      this.#pauses.set(request, { document, scope, sink, generation: sink.generation, finish })
      try { sink.send({ type: 'pause-playback', request }) } catch { finish('preview-playback-unavailable') }
    })
    return Promise.all([documents, preview]).then(() => {})
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
      const activation = ++this.#activation, generation = sink.generation
      for (const audition of [...this.#auditions]) audition()
      void this.#stopDocuments().then(() => {
        const current = this.#context()
        if (activation === this.#activation && current.document === context.document && current.scope === context.scope && current.sinks.has(sink) && sink.generation === generation)
          sink.send({ type: 'playback-granted', request: report.request })
      }).catch(() => {})
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
