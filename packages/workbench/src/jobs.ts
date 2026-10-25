import { errorMessage } from '@lincyaw/kernel'
import type { CompileJob } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench.ts'
import type { WorkspaceClient } from './workspace-client.ts'

/** Of two copies of a job (an event and an answer cross on the way), the one of the later change. */
function newer(known: CompileJob | undefined, job: CompileJob): CompileJob {
  return known && known.sequence > job.sequence ? known : job
}

/**
 * The open document's builds and exports: what it can be made into, and its jobs as the workspace server runs them,
 * whoever started them (the author here, or the AI), followed as they change.
 */
export class DocumentJobs {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  #unsubscribe?: () => void
  #scope = 0

  constructor(client: WorkspaceClient, store: WorkbenchStore) {
    this.#client = client
    this.#store = store
  }

  subscribe(dir: string): void {
    const scope = ++this.#scope
    const current = () => scope === this.#scope && this.#store.state.document === dir
    this.#unsubscribe = this.#client.subscribeJobs(dir, (job) => {
      if (current()) this.#merge(job)
    }, () => {
      // Reconnected: what changed meanwhile is read again.
      if (current()) void this.#read(dir, current)
    })
    void this.#read(dir, current)
  }

  async #read(dir: string, current: () => boolean): Promise<void> {
    try {
      const answer = await this.#client.readJobs(dir)
      if (!current()) return
      // The events that arrived meanwhile may be newer than the list read.
      const known = new Map((this.#store.state.jobs?.jobs ?? []).map(job => [job.id, job]))
      const read = new Set(answer.jobs.map(job => job.id))
      // A job started after the list was read is still running, and not in it.
      const started = [...known.values()].filter(job => !read.has(job.id) && (job.state === 'queued' || job.state === 'running'))
      const jobs = [...started, ...answer.jobs.map(job => newer(known.get(job.id), job))]
      this.#store.set({ jobs: { ...answer, jobs }, jobsFailure: undefined })
    } catch (error) {
      if (current()) this.#store.set({ jobsFailure: errorMessage(error) })
    }
  }

  /** A job as it is now, in its place among the document's (newest first): a copy older than the one known is left. */
  #merge(job: CompileJob): void {
    const known = this.#store.state.jobs
    if (!known) return
    const jobs = known.jobs.some(own => own.id === job.id) ? known.jobs.map(own => (own.id === job.id ? newer(own, job) : own)) : [job, ...known.jobs]
    this.#store.set({ jobs: { ...known, jobs } })
  }

  async start(target: string): Promise<void> {
    const dir = this.#store.state.document
    if (dir === undefined) return
    const scope = this.#scope
    const current = () => scope === this.#scope && this.#store.state.document === dir
    try {
      const job = await this.#client.startJob(dir, target)
      if (!current()) return
      this.#merge(job)
      this.#store.set({ jobsFailure: undefined })
    } catch (error) {
      if (current()) this.#store.set({ jobsFailure: errorMessage(error) })
    }
  }

  async cancel(id: string): Promise<void> {
    const dir = this.#store.state.document
    if (dir === undefined) return
    const scope = this.#scope
    const current = () => scope === this.#scope && this.#store.state.document === dir
    try {
      const job = await this.#client.cancelJob(dir, id)
      if (current()) this.#merge(job)
    } catch (error) {
      if (current()) this.#store.set({ jobsFailure: errorMessage(error) })
    }
  }

  stop(): void {
    this.#scope++
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
  }
}
