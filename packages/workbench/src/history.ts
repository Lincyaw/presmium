import { errorMessage } from '@lincyaw/kernel'
import type { RevertResult, ReviewChange, ReviewSnapshot, ReviewUpdate } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench.ts'
import { WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'

/**
 * The open document's version history: its revisions with the next undo and redo, the files changed elsewhere and not
 * yet in the history, and the AI's change in progress (followed while the document is open). Each action reads the
 * history again. `changed` hears the AI's changes once each of its turns has made them: when the review waits for the
 * author, or was accepted.
 */
export class DocumentHistory {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  readonly #changed: (changes: ReviewChange[]) => void
  #reads = 0
  #offsets = [0]
  #page = 0
  #readFailure?: string
  #scope = 0
  #unsubscribeReview?: () => void
  #review?: ReviewSnapshot
  #told?: string

  constructor(client: WorkspaceClient, store: WorkbenchStore, changed: (changes: ReviewChange[]) => void = () => {}) {
    this.#client = client
    this.#store = store
    this.#changed = changed
  }

  subscribeReview(dir: string): void {
    const scope = this.#scope
    this.#unsubscribeReview = this.#client.subscribeReview(dir, event => { if (scope === this.#scope) this.#handleReviewUpdate(dir, event) })
  }

  stop(): void {
    this.#scope++
    this.#readFailure = undefined
    this.#unsubscribeReview?.()
    this.#unsubscribeReview = undefined
    this.#review = undefined
  }

  async read(dir: string): Promise<void> {
    this.#offsets = [0]
    this.#page = 0
    const read = ++this.#reads, scope = this.#scope
    const current = () => this.#store.state.document === dir && read === this.#reads && scope === this.#scope
    try {
      const [history, { files }] = await Promise.all([this.#client.readRevisions(dir), this.#client.readChanges(dir)])
      if (current()) {
        const historyFailure = this.#store.state.historyFailure
        this.#store.set({ history, outside: files, ...this.#readFailure === historyFailure ? { historyFailure: undefined } : {} })
        this.#readFailure = undefined
      }
    } catch (error) {
      if (current()) {
        this.#readFailure = errorMessage(error)
        const history = this.#store.state.history
        this.#store.set({ ...history ? { history: { ...history, loading: false } } : {}, historyFailure: this.#readFailure })
      }
    }
  }

  async page(offset: number): Promise<void> {
    const dir = this.#store.state.document, before = this.#store.state.history
    if (dir === undefined || !before?.historyBinding || before.loading || this.#store.state.isHistoryBusy || ![before.nextOffset, before.previousOffset].includes(offset)) return
    const read = ++this.#reads, scope = this.#scope
    const current = () => read === this.#reads && scope === this.#scope && this.#store.state.document === dir
    this.#store.set({ history: { ...before, loading: true } })
    try {
      const history = await this.#client.readRevisions(dir, { snapshot: before.historyBinding.snapshot, offset })
      if (!current()) return
      let index = this.#offsets.indexOf(offset)
      if (index < 0) { this.#offsets = [...this.#offsets.slice(0, this.#page + 1), offset]; index = this.#offsets.length - 1 }
      this.#page = index
      this.#readFailure = undefined
      this.#store.set({ history: { ...history, ...index > 0 ? { previousOffset: this.#offsets[index - 1] } : {} }, historyFailure: undefined })
    } catch (error) {
      if (!current()) return
      if (error instanceof WorkspaceServerError && error.status === 409) { await this.read(dir); return }
      this.#readFailure = errorMessage(error)
      this.#store.set({ history: { ...before, loading: false }, historyFailure: this.#readFailure })
    }
  }

  #handleReviewUpdate(dir: string, event: ReviewUpdate): void {
    if (this.#store.state.document !== dir) return
    this.#store.set({ review: event.review })
    if (event.review) this.#review = event.review
    const settled = event.review && !event.review.running ? event.review : event.ended?.outcome === 'accepted' ? this.#review : undefined
    // One review spans the turns until it is accepted; each turn's changes are told once.
    const turn = settled && `${settled.id}:${settled.turns.to}`
    if (settled && turn !== this.#told && settled.changes.length > 0) {
      this.#told = turn
      this.#changed(settled.changes)
    }
    if (event.ended) {
      this.#review = undefined
      void this.read(dir)
    }
  }

  async #run(work: (dir: string) => Promise<RevertResult | unknown>): Promise<boolean> {
    const dir = this.#store.state.document
    if (dir === undefined || this.#store.state.isHistoryBusy) return false
    const scope = this.#scope
    const current = () => scope === this.#scope && dir === this.#store.state.document
    this.#readFailure = undefined
    this.#store.set({ isHistoryBusy: true })
    try {
      const answer = await work(dir)
      if (!current()) return false
      if (isFailedRevert(answer)) throw new Error(answer.conflicts.join(', '))
      this.#store.set({ historyFailure: undefined })
      return true
    } catch (error) {
      if (current()) this.#store.set({ historyFailure: errorMessage(error) })
      return false
    } finally {
      if (current()) {
        this.#store.set({ isHistoryBusy: false })
        await this.read(dir)
      }
    }
  }

  #change(which: 'undo' | 'redo' | 'revertRevision', expect: string | undefined): Promise<boolean> {
    const binding = this.#store.state.history?.historyBinding
    if (!binding || !expect) return Promise.resolve(false)
    const request = { id: crypto.randomUUID(), ...binding, expect }
    return this.#run(dir => this.#client[which](dir, request))
  }

  undo(): Promise<boolean> {
    const expect = this.#store.state.history?.undo
    return this.#change('undo', expect)
  }

  redo(): Promise<boolean> {
    const expect = this.#store.state.history?.redo
    return this.#change('redo', expect)
  }

  /** Takes back one revision of the history, whether or not it is the latest. */
  revert(id: string): Promise<boolean> {
    return this.#change('revertRevision', id)
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
