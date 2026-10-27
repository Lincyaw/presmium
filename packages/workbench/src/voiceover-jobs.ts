import { errorMessage } from '@lincyaw/kernel'
import type { VoiceoverJob } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench.ts'
import type { WorkspaceClient } from './workspace-client.ts'

const active = (job: VoiceoverJob) => ['queued', 'running', 'cancelling'].includes(job.state)
const key = (job: VoiceoverJob) => `${job.id}:${job.sequence}`

/** One cheap task observer for the visible production UI, irrespective of who started a job. */
export class VoiceoverJobs {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  readonly #refresh: (job: VoiceoverJob, signal: AbortSignal) => Promise<boolean>
  readonly #observers = new Set<symbol>()
  readonly #settled = new Set<string>()
  readonly #acknowledged = new Map<string, number>()
  #localRevision = 0
  #document?: string
  #controller?: AbortController
  #timer?: ReturnType<typeof setTimeout>

  constructor(client: WorkspaceClient, store: WorkbenchStore, refresh: (job: VoiceoverJob, signal: AbortSignal) => Promise<boolean>) {
    this.#client = client; this.#store = store; this.#refresh = refresh
  }

  observe(document: string): () => void {
    if (this.#document !== document) this.stop()
    const token = Symbol('voiceover')
    this.#observers.add(token)
    if (!this.#controller) {
      this.#document = document
      const controller = new AbortController()
      this.#controller = controller
      void this.#poll(document, controller)
    }
    return () => { if (this.#observers.delete(token) && !this.#observers.size) this.stop() }
  }

  #current(document: string, controller: AbortController): boolean {
    return this.#controller === controller && !controller.signal.aborted && this.#store.state.document === document
  }

  /** An acknowledged local mutation cannot be replaced by an older in-flight list response. */
  remember(document: string, job: VoiceoverJob): void {
    if (this.#document !== document || this.#store.state.document !== document) return
    this.#acknowledged.set(job.id, ++this.#localRevision)
    this.#merge([job])
  }

  #merge(incoming: VoiceoverJob[], readRevision?: number): VoiceoverJob[] {
    const previous = this.#store.state.voiceoverJobs ?? [], known = new Map(previous.map(job => [job.id, job]))
    const present = new Set(incoming.map(job => job.id))
    // Only an ACK received after this read began may be absent from its authoritative list.
    const retained = previous.filter(job => !present.has(job.id) && (readRevision === undefined || (this.#acknowledged.get(job.id) ?? 0) > readRevision))
    const jobs = [...retained, ...incoming.map(job => { const old = known.get(job.id); return old && old.sequence > job.sequence ? old : job })]
    const changed = jobs.length !== previous.length || jobs.some((job, index) => key(job) !== key(previous[index]!))
    if (changed || this.#store.state.voiceoverJobsFailure) this.#store.set({ voiceoverJobs: changed ? jobs : previous, voiceoverJobsFailure: undefined })
    return jobs
  }

  async #poll(document: string, controller: AbortController): Promise<void> {
    const signal = controller.signal
    try {
      const readRevision = this.#localRevision, answer = await this.#client.readVoiceoverJobs(document, signal)
      if (!this.#current(document, controller)) return
      const jobs = this.#merge(answer.jobs, readRevision), keys = new Set(jobs.map(key))
      for (const settled of this.#settled) if (!keys.has(settled)) this.#settled.delete(settled)
      for (const [id, revision] of this.#acknowledged) if (revision <= readRevision) this.#acknowledged.delete(id)
      // Unsafe source/recording states leave this work pending; the next cheap read retries its guards.
      for (const job of jobs) {
        if (active(job) || job.completed <= 0 || this.#settled.has(key(job))) continue
        if (await this.#refresh(job, signal)) this.#settled.add(key(job))
        if (!this.#current(document, controller)) return
      }
    } catch (error) {
      if (this.#current(document, controller)) this.#store.set({ voiceoverJobsFailure: errorMessage(error) })
    } finally {
      if (this.#current(document, controller)) this.#timer = setTimeout(() => void this.#poll(document, controller), 1000)
    }
  }

  stop(): void {
    this.#controller?.abort(); this.#controller = undefined
    clearTimeout(this.#timer); this.#timer = undefined
    this.#document = undefined; this.#observers.clear(); this.#settled.clear(); this.#acknowledged.clear()
  }
}
