/**
 * `CHANGE_REVIEW` through deltabox (D12, docs/architecture.md 10.7): a review
 * is a cbcow-through session on the document directory, held by the helper.
 * The agent works in the session's view (`root`), so its writes reach the
 * document directory at once (the preview follows them) and are journaled.
 * Each step is a checkpoint and the changes since the previous one (at most
 * 100; later steps join the last); accepting commits everything, then the
 * rejected files go back to the snapshot taken when the review opened;
 * rejecting all aborts. Paths are relative to the workspace root here and to
 * the document directory in the helper.
 */
import { realpathSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { ChangeReview, ChangeReviewService, ReviewChange, ReviewStep } from '@presmium/kernel'
import type { Helper } from './client.ts'
import { messages } from './messages.ts'
import type { BoxChange, ReviewOpened } from './protocol.ts'

/** deltabox keeps at most 100 checkpoints. */
const MAX_STEPS = 100

const posix = (path: string) => path.split('\\').join('/')

export function deltaboxReviews(helper: Helper, workspaceRoot: string, lang?: string): ChangeReviewService {
  const t = messages(lang)
  return {
    engine: 'deltabox',
    async open({ document, task }) {
      const dir = resolve(workspaceRoot, document)
      let opened: ReviewOpened
      try {
        opened = await helper.call<ReviewOpened>('review.open', { project: dir, task })
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('busy:')) throw new Error(t.busy(document || '.'))
        throw error
      }
      const prefix = posix(relative(realpathSync(workspaceRoot), realpathSync(dir)))
      return new DeltaboxReview(helper, opened, prefix, t.ended)
    },
  }
}

class DeltaboxReview implements ChangeReview {
  readonly root: string
  readonly visibility: 'immediate' | 'on-commit'
  readonly #helper: Helper
  readonly #session: string
  /** The document directory, relative to the workspace root ('' when it is the root). */
  readonly #prefix: string
  readonly #ended: string
  readonly #steps: ReviewStep[] = []
  readonly #checkpoints: string[] = []
  #open = true

  constructor(helper: Helper, opened: ReviewOpened, prefix: string, ended: string) {
    this.#helper = helper
    this.#session = opened.session
    this.root = opened.root
    this.visibility = opened.visibility
    this.#prefix = prefix
    this.#ended = ended
  }

  #change(change: BoxChange): ReviewChange {
    return {
      path: this.#outer(change.path),
      kind: change.kind,
      binary: change.is_binary,
      added: change.is_binary ? 0 : change.added_lines,
      removed: change.is_binary ? 0 : change.removed_lines,
      ...change.text_diff !== undefined && !change.is_binary ? { diff: change.text_diff } : {},
    }
  }

  /** A path of the document directory, relative to the workspace root. */
  #outer(path: string): string {
    return this.#prefix ? `${this.#prefix}/${posix(path)}` : posix(path)
  }

  /** A path relative to the workspace root, relative to the document directory; undefined outside it. */
  #inner(path: string): string | undefined {
    const inner = this.#prefix ? (posix(path).startsWith(`${this.#prefix}/`) ? posix(path).slice(this.#prefix.length + 1) : undefined) : posix(path)
    return inner && !inner.split('/').includes('..') ? inner : undefined
  }

  #live(): void {
    if (!this.#open) throw new Error(this.#ended)
  }

  async step(label: string, tool?: string): Promise<ReviewStep> {
    this.#live()
    const full = this.#steps.length >= MAX_STEPS
    // A step past the limit joins the last one: its changes since the checkpoint before it.
    const from = full ? this.#checkpoints.at(-2) : this.#checkpoints.at(-1)
    const { changes, checkpoint } = await this.#helper.call<{ changes: BoxChange[], checkpoint?: string }>('review.step', { session: this.#session, from, checkpoint: !full, label })
    const at = new Date().toISOString()
    const step: ReviewStep = full
      ? { ...this.#steps.at(-1)!, at, changes: changes.map(c => this.#change(c)) }
      : { id: checkpoint!, label, ...tool !== undefined ? { tool } : {}, at, changes: changes.map(c => this.#change(c)) }
    if (full) {
      this.#steps[this.#steps.length - 1] = step
    } else {
      this.#steps.push(step)
      this.#checkpoints.push(checkpoint!)
    }
    return step
  }

  steps(): readonly ReviewStep[] {
    return this.#steps
  }

  async diff(): Promise<ReviewChange[]> {
    this.#live()
    const { changes } = await this.#helper.call<{ changes: BoxChange[] }>('review.diff', { session: this.#session })
    return changes.map(c => this.#change(c))
  }

  async accept(reject: string[] = []): Promise<string[]> {
    this.#live()
    const inner = reject.flatMap(path => this.#inner(path) ?? [])
    const { files } = await this.#helper.call<{ files: string[] }>('review.accept', { session: this.#session, reject: inner })
    this.#open = false
    return files.map(path => this.#outer(path))
  }

  async rollback(): Promise<void> {
    this.#live()
    await this.#helper.call('review.rollback', { session: this.#session })
    this.#open = false
  }

  async close(): Promise<void> {
    if (this.#open) await this.rollback()
  }
}
