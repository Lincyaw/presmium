import { errorMessage } from '@lincyaw/kernel'
import type { RevertResult, ReviewUpdate } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench.ts'
import type { WorkspaceClient } from './workspace-client.ts'

/**
 * The open document's version history: its revisions with the next undo and redo, the files changed elsewhere and not
 * yet in the history, and the AI's change in progress (followed while the document is open). Each action reads the
 * history again.
 */
export class DocumentHistory {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  #reads = 0
  #unsubscribeReview?: () => void

  constructor(client: WorkspaceClient, store: WorkbenchStore) {
    this.#client = client
    this.#store = store
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
      const [history, { files }] = await Promise.all([this.#client.readRevisions(dir), this.#client.readChanges(dir)])
      if (this.#store.state.document === dir && read === this.#reads) this.#store.set({ history, outside: files })
    } catch {
    }
  }

  #handleReviewUpdate(dir: string, event: ReviewUpdate): void {
    if (this.#store.state.document !== dir) return
    this.#store.set({ review: event.review })
    if (event.ended) void this.read(dir)
  }

  async #run(work: (dir: string) => Promise<RevertResult | unknown>): Promise<boolean> {
    const dir = this.#store.state.document
    if (dir === undefined || this.#store.state.isHistoryBusy) return false
    this.#store.set({ isHistoryBusy: true })
    try {
      const answer = await work(dir)
      if (isFailedRevert(answer)) throw new Error(answer.conflicts.join(', '))
      this.#store.set({ historyFailure: undefined })
      return true
    } catch (error) {
      this.#store.set({ historyFailure: errorMessage(error) })
      return false
    } finally {
      this.#store.set({ isHistoryBusy: false })
      await this.read(dir)
    }
  }

  undo(): Promise<boolean> {
    const expect = this.#store.state.history?.undo
    return this.#run(dir => this.#client.undo(dir, expect))
  }

  redo(): Promise<boolean> {
    const expect = this.#store.state.history?.redo
    return this.#run(dir => this.#client.redo(dir, expect))
  }

  /** Takes back one revision of the history, whether or not it is the latest. */
  revert(id: string): Promise<boolean> {
    return this.#run(dir => this.#client.revertRevision(dir, id))
  }

  acceptReview(): Promise<boolean> {
    return this.#run(dir => this.#client.acceptReview(dir, {}))
  }

  rejectReview(): Promise<boolean> {
    return this.#run(dir => this.#client.rejectReview(dir))
  }

  /** Makes the files changed elsewhere one revision of the history. */
  recordOutside(message: string): Promise<boolean> {
    return this.#run(dir => this.#client.commitChanges(dir, message))
  }
}

function isFailedRevert(answer: unknown): answer is Extract<RevertResult, { ok: false }> {
  return typeof answer === 'object' && answer !== null && (answer as { ok?: unknown }).ok === false
}
