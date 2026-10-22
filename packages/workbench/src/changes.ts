import { errorMessage } from '@lincyaw/kernel'
import type { ReviewUpdate } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench.ts'
import type { WorkspaceClient } from './workspace-client.ts'

/**
 * The open document's changes: the agent's change under review (followed while the document is open), the
 * uncommitted files and the history of revisions, and the actions on them. Each action reads the changes and the
 * workspace's git status (`readStatus`) again.
 */
export class DocumentChanges {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  readonly #readStatus: (dir: string) => Promise<void>
  #reads = 0
  #unsubscribeReview?: () => void

  constructor(client: WorkspaceClient, store: WorkbenchStore, readStatus: (dir: string) => Promise<void>) {
    this.#client = client
    this.#store = store
    this.#readStatus = readStatus
  }

  subscribeReview(dir: string): void {
    this.#unsubscribeReview = this.#client.subscribeReview(dir, event => this.#handleReviewUpdate(dir, event))
  }

  stop(): void {
    this.#unsubscribeReview?.()
    this.#unsubscribeReview = undefined
  }

  async read(dir: string): Promise<void> {
    const read = ++this.#reads
    try {
      const [{ files }, { revisions }] = await Promise.all([this.#client.readChanges(dir), this.#client.readRevisions(dir)])
      if (this.#store.state.document === dir && read === this.#reads) this.#store.set({ uncommitted: files, revisions })
    } catch {
    }
  }

  #handleReviewUpdate(dir: string, event: ReviewUpdate): void {
    if (this.#store.state.document !== dir) return
    this.#store.set({ review: event.review })
    if (event.ended) {
      void this.read(dir)
      void this.#readStatus(dir)
    }
  }

  async #run(work: (dir: string) => Promise<unknown>): Promise<boolean> {
    const dir = this.#store.state.document
    if (dir === undefined) return false
    try {
      await work(dir)
      this.#store.set({ changesFailure: undefined })
      return true
    } catch (error) {
      this.#store.set({ changesFailure: errorMessage(error) })
      return false
    } finally {
      void this.read(dir)
      void this.#readStatus(dir)
    }
  }

  acceptReview(message?: string): Promise<boolean> {
    return this.#run(dir => this.#client.acceptReview(dir, message ? { message } : {}))
  }

  rejectReview(paths?: string[]): Promise<boolean> {
    return this.#run(dir => this.#client.rejectReview(dir, paths))
  }

  restoreReview(step: string): Promise<boolean> {
    return this.#run(dir => this.#client.restoreReview(dir, step))
  }

  commit(message: string): Promise<boolean> {
    return this.#run(dir => this.#client.commitChanges(dir, message))
  }

  discard(): Promise<boolean> {
    return this.#run(dir => this.#client.discardChanges(dir))
  }

  revertRevision(id: string): Promise<boolean> {
    return this.#run(async (dir) => {
      const answer = await this.#client.revertRevision(dir, id)
      if (!answer.ok) throw new Error(answer.conflicts.join(', '))
    })
  }
}
