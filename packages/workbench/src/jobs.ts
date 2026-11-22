import { errorMessage } from '@lincyaw/kernel'
import type { CompileJob, JobSource } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench-state.ts'
import type { WorkspaceClient } from './workspace-client.ts'

/** Of two copies of a job (an event and an answer cross on the way), the one of the later change. */
function newer(known: CompileJob | undefined, job: CompileJob): CompileJob {
  return known && known.sequence > job.sequence ? known : job
}

/**
 * The open document's builds and exports: what it can be made into, and its jobs as the workspace server runs them,
 * whoever started them (the author here, or the AI), followed as they change.
 */
const ended = (job: CompileJob) => job.state === 'done' || job.state === 'failed' || job.state === 'cancelled'

export class DocumentJobs {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  // The jobs someone here waits for (`awaitEnd`), each told once when it is seen ended.
  readonly #awaited = new Map<string, (job: CompileJob) => void>()
  #unsubscribe?: () => void
  #scope = 0
  #readTicket = 0
  #baselineChanged = false

  constructor(client: WorkspaceClient, store: WorkbenchStore) {
    this.#client = client
    this.#store = store
  }

  subscribe(dir: string): void {
    this.#unsubscribe?.()
    const scope = ++this.#scope
    this.#baselineChanged = false
    const current = () => scope === this.#scope && this.#store.state.document === dir
    this.#unsubscribe = this.#client.subscribeJobs(dir, (job) => {
      if (current()) {
        if (!this.#store.state.jobs) this.#baselineChanged = true
        this.#merge(job)
      }
    }, () => {
      // A failed carrier may have missed changes.
      if (current()) void this.#read(dir, current)
    }, () => {
      // Subscribe before reading: the first list and a reconnect can race a job.
      if (current()) void this.#read(dir, current)
    })
    void this.#read(dir, current)
  }

  async #read(dir: string, current: () => boolean): Promise<void> {
    const ticket = ++this.#readTicket
    const startedWith = new Map((this.#store.state.jobs?.jobs ?? []).map(job => [job.id, job.sequence]))
    const owns = () => current() && ticket === this.#readTicket
    try {
      const answer = await this.#client.readJobs(dir)
      if (!owns()) return
      // The events that arrived meanwhile may be newer than the list read.
      const known = new Map((this.#store.state.jobs?.jobs ?? []).map(job => [job.id, job]))
      const read = new Set(answer.jobs.map(job => job.id))
      // Keep only observations made after this read began, including a job that already finished.
      const observed = [...known.values()].filter(job => !read.has(job.id) && (!startedWith.has(job.id) || job.sequence > startedWith.get(job.id)!))
      const jobs = [...observed, ...answer.jobs.map(job => newer(known.get(job.id), job))]
      this.#store.set({ jobs: { ...answer, jobs }, jobsFailure: undefined })
      for (const job of jobs) this.#tellEnded(job)
      if (this.#baselineChanged && owns()) {
        this.#baselineChanged = false
        void this.#read(dir, current)
      }
    } catch (error) {
      if (owns()) this.#store.set({ jobsFailure: errorMessage(error) })
    }
  }

  /** A job as it is now, in its place among the document's (newest first): a copy older than the one known is left. */
  #merge(job: CompileJob): void {
    const known = this.#store.state.jobs
    if (!known) return
    const jobs = known.jobs.some(own => own.id === job.id) ? known.jobs.map(own => (own.id === job.id ? newer(own, job) : own)) : [job, ...known.jobs]
    this.#store.set({ jobs: { ...known, jobs } })
    this.#tellEnded(job)
  }

  #tellEnded(job: CompileJob): void {
    const told = this.#awaited.get(job.id)
    if (!told || !ended(job)) return
    this.#awaited.delete(job.id)
    told(job)
  }

  /** Tells `ended` the job once it has ended (at once when it has); forgotten when the document's jobs stop. */
  awaitEnd(job: CompileJob, then: (job: CompileJob) => void): void {
    if (ended(job)) return then(job)
    this.#awaited.set(job.id, then)
  }

  /** The job started (or the one already made from this source), unless it failed to start or the document changed. */
  async start(dir: string, target: string, source: JobSource): Promise<CompileJob | undefined> {
    const scope = this.#scope
    const current = () => scope === this.#scope && this.#store.state.document === dir
    try {
      const job = await this.#client.startJob(dir, target, source)
      if (!current()) return undefined
      this.#merge(job)
      this.#store.set({ jobsFailure: undefined })
      return this.#store.state.jobs?.jobs.find(own => own.id === job.id) ?? job
    } catch (error) {
      if (current()) this.#store.set({ jobsFailure: errorMessage(error) })
      return undefined
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
    this.#awaited.clear()
    this.#scope++
    this.#baselineChanged = false
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
  }
}

/** The address that downloads a file of a job, saved under the document's title when it has one. */
export function downloadUrl(job: CompileJob, path: string, title?: string): string {
  return `${job.url}${path}?download${title ? `=${encodeURIComponent(title)}` : ''}`
}

/** The file to take away from a finished job: a site's archive, else its main file unless that is a page to open. */
export function downloadableFile(job: CompileJob): string | undefined {
  if (job.archive) return job.archive
  const type = job.files.find(file => file.path === job.main)?.type
  return job.main && type !== 'text/html' ? job.main : undefined
}
