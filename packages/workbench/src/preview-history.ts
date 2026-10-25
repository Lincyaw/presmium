import type { PreviewReport } from '@lincyaw/kernel'
import type { PreviewSink } from './workbench.ts'

export interface EditorHistoryState { section: string, undo: boolean, redo: boolean }
interface Context { document?: string, scope: number, sinks: ReadonlySet<PreviewSink> }
interface Origin { document: string, scope: number, sink: PreviewSink, generation?: number }

/** Editor transactions take precedence over saved revisions while the author is editing a body block. */
export class PreviewHistory {
  readonly #context: () => Context
  readonly #changed: (state: EditorHistoryState | undefined) => void
  readonly #pending = new Map<number, Origin & { finish(handled: boolean, error?: string): void }>()
  #active?: Origin & { state: EditorHistoryState }
  #sequence = Date.now()
  constructor(context: () => Context, changed: (state: EditorHistoryState | undefined) => void) { this.#context = context; this.#changed = changed }
  report(document: string, report: PreviewReport, sink?: PreviewSink): void {
    const context = this.#context()
    if (!sink || context.document !== document || !context.sinks.has(sink)) return
    if (report.type === 'document-history-state') {
      if (!report.section) { this.#active = undefined; this.#changed(undefined); return }
      const state = { section: report.section, undo: report.undo, redo: report.redo }
      this.#active = { document, scope: context.scope, sink, generation: sink.generation, state }
      this.#changed(state)
    } else if (report.type === 'document-history-result') {
      const pending = this.#pending.get(report.request)
      if (pending && pending.document === document && pending.scope === context.scope && pending.sink === sink)
        pending.finish(report.handled, pending.generation !== sink.generation ? 'document-history-changed' : report.error)
    } else if (report.type === 'ready') {
      if (this.#active?.sink === sink && this.#active.generation !== sink.generation) { this.#active = undefined; this.#changed(undefined) }
      for (const pending of this.#pending.values()) if (pending.sink === sink && pending.generation !== sink.generation) pending.finish(false, 'document-history-changed')
    }
  }
  perform(action: 'undo' | 'redo'): Promise<boolean> {
    const active = this.#active, context = this.#context()
    if (!active || !active.state[action] || active.document !== context.document || active.scope !== context.scope || !context.sinks.has(active.sink) || active.generation !== active.sink.generation || !active.sink.capabilities?.includes('document-history')) return Promise.resolve(false)
    const request = ++this.#sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(false, 'document-history-timeout'), 5000)
      const finish = (handled: boolean, error?: string) => {
        if (!this.#pending.delete(request)) return
        clearTimeout(timer)
        error ? reject(new Error(error)) : resolve(handled)
      }
      this.#pending.set(request, { ...active, finish })
      try { active.sink.send({ type: 'document-history', action, request }) } catch { finish(false, 'document-history-unavailable') }
    })
  }
  reset(): void {
    this.#active = undefined; this.#changed(undefined)
    for (const pending of this.#pending.values()) pending.finish(false, 'document-history-changed')
    for (const sink of this.#context().sinks) if (sink.capabilities?.includes('document-history')) sink.send({ type: 'document-history-reset' })
  }
  detach(sink: PreviewSink): void {
    if (this.#active?.sink === sink) { this.#active = undefined; this.#changed(undefined) }
    for (const pending of this.#pending.values()) if (pending.sink === sink) pending.finish(false, 'document-history-changed')
  }
}
