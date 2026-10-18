import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineService, errorMessage } from '@presmium/kernel'
import type { ChangeReviewService, DocumentFiles, Logger, Member, Revision, ReviewChange, ReviewStep } from '@presmium/kernel'
import { trailers } from '../../domain/revisions.ts'
import type { WorkspaceConfig } from '../config.ts'
import { listDocuments } from '../config.ts'
import { lockedError, RequestError } from '../documents.ts'
import type { DocumentLocks } from '../locks.ts'
import type { Revisions } from '../revisions.ts'
import { GIT_ENGINE, leftSessionReview, openGitReview, recoverGitReview, resumeGitReview } from './git-review.ts'
import type { GitReview } from './git-review.ts'

/** @experimental */
export const GIT_REVIEW = defineService<ChangeReviewService>('presmium.workspace.gitReview')

export const SESSION_TRAILER = 'Presmium-Session'
export const TURN_TRAILER = 'Presmium-Turn'

export interface ReviewView {
  id: string
  document: string
  engine: string
  session: string
  holder: string
  turns: { from: number, to: number }
  running: boolean
  mode: 'required' | 'auto'
  opened: string
  steps: ReviewStep[]
  changes: ReviewChange[]
}

export interface ReviewEnd {
  outcome: 'accepted' | 'rejected' | 'rolled-back' | 'empty'
  revision?: Revision
  files: string[]
}

export interface ReviewFollowed {
  document: string
  review?: ReviewView
  ended?: ReviewEnd
}

export type ReviewEvent =
  | { type: 'review', document: string, session: string, review?: ReviewView, ended?: ReviewEnd }
  | { type: 'reverted', session: string, documents: string[], turns?: string, revision: string, subject: string, revertedBy: string, files: string[] }

export interface ReviewsOptions {
  config: WorkspaceConfig
  revisions: Revisions
  locks: DocumentLocks
  files?: DocumentFiles
  log: Logger
}

interface Open {
  review: GitReview
  document: string
  session: string
  member: Member
  turns: { from: number, to: number }
  running: boolean
  opened: string
  release: () => void
  timer?: ReturnType<typeof setTimeout>
}

function reviewSettings(config: WorkspaceConfig): { mode: 'required' | 'auto', timeoutMs: number } {
  const settings = config.settings['presmium.assistant'] ?? {}
  const timeout = settings.reviewTimeoutMs
  return {
    mode: settings.review === 'auto' ? 'auto' : 'required',
    timeoutMs: typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0 ? timeout : 30 * 60_000,
  }
}

const holderOf = (session: string) => `agent:${session}`

const inGitDir = (path: string) => path.split('/').some(part => part.toLowerCase() === '.git')

function summaryOf(files: string[], lang: string | undefined): string {
  const zh = !lang || lang.startsWith('zh')
  const names = files.slice(0, 3).map(file => file.split('/').at(-1)!)
  const more = files.length - names.length
  return zh
    ? `AI 修改：${names.join('、')}${more > 0 ? ` 等 ${files.length} 个文件` : ''}`
    : `AI change: ${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}`
}

export class Reviews {
  readonly #options: ReviewsOptions
  readonly #open = new Map<string, Open>()
  readonly #queues = new Map<string, Promise<unknown>>()
  readonly #followers = new Map<string, Set<(event: ReviewFollowed) => void>>()
  readonly #listeners = new Set<(event: ReviewEvent) => void>()
  #closed = false

  constructor(options: ReviewsOptions) {
    this.#options = options
  }

  readonly service: ChangeReviewService = {
    engine: GIT_ENGINE,
    open: ({ document, task }) => openGitReview({
      workspaceRoot: this.#options.config.root,
      deckDir: join(this.#options.config.root, document),
      task,
      files: this.#options.files,
      onRestore: paths => this.#options.log.warn(`task ${task}: the agent changed the git directory, put back: ${paths.join(', ')}`),
      warn: message => this.#options.log.warn(`task ${task}: ${message}`),
    }),
  }

  async recover(documents: string[], { resume = true } = {}): Promise<void> {
    const { config, log } = this.#options
    for (const document of documents) {
      const deckDir = join(config.root, document)
      if (!existsSync(deckDir)) continue
      try {
        const left = leftSessionReview(deckDir)
        if (left?.session) {
          if (resume) await this.#serial(document, () => this.#resume(document, left))
          continue
        }
        const found = await recoverGitReview({ workspaceRoot: config.root, deckDir, files: this.#options.files, onRestore: paths => log.warn(`the git directory as a change task found it, put back: ${paths.join(', ')}`) })
        if (found) log.warn(`task ${found.task} was waiting for its review when the server ended: rolled back (${found.paths.join(', ') || 'no change'})`)
      } catch (error) {
        log.warn(`the review left in ${document || '.'} was not taken up: ${errorMessage(error)}`)
      }
    }
  }

  async #resume(document: string, left: NonNullable<ReturnType<typeof leftSessionReview>>): Promise<void> {
    const { config, log } = this.#options
    const session = left.session!
    const release = this.#options.locks.claim(document, holderOf(session.session))
    if (!release) throw new Error(`its lock is ${this.#options.locks.holder(document)}'s`)
    try {
      const review = await resumeGitReview(left, { workspaceRoot: config.root, files: this.#options.files, onRestore: paths => log.warn(`session ${session.session}: the agent changed the git directory, put back: ${paths.join(', ')}`) })
      const open: Open = { review, document, session: session.session, member: session.member, turns: session.turns, running: false, opened: session.opened, release }
      this.#open.set(document, open)
      log.info(`the review of session ${session.session} in ${document || '.'} (turns ${session.turns.from}-${session.turns.to}) waits for its author again`)
      this.#arm(open)
    } catch (error) {
      release()
      throw error
    }
  }

  async view(document: string): Promise<ReviewView | undefined> {
    const open = this.#open.get(document)
    return open && await this.#view(open)
  }

  async #view(open: Open): Promise<ReviewView> {
    return {
      id: open.review.task,
      document: open.document,
      engine: GIT_ENGINE,
      session: open.session,
      holder: holderOf(open.session),
      turns: { ...open.turns },
      running: open.running,
      mode: reviewSettings(this.#options.config).mode,
      opened: open.opened,
      steps: [...open.review.steps()],
      changes: await open.review.diff(),
    }
  }

  follow(document: string, signal: AbortSignal): AsyncIterable<{ event: string, data: ReviewFollowed }> {
    const followers = this.#followers.get(document) ?? new Set()
    this.#followers.set(document, followers)
    return this.#stream(signal, (push) => {
      followers.add(push)
      void this.view(document).then(review => push({ document, ...review ? { review } : {} }), () => push({ document }))
      this.#rearm(document)
      return () => {
        followers.delete(push)
        this.#rearm(document)
      }
    }, 'review')
  }

  events(signal: AbortSignal): AsyncIterable<{ event: string, data: ReviewEvent }> {
    return this.#stream(signal, (push) => {
      this.#listeners.add(push)
      return () => this.#listeners.delete(push)
    }, undefined, data => data.type)
  }

  #stream<T>(signal: AbortSignal, subscribe: (push: (data: T) => void) => () => void, name?: string, nameOf?: (data: T) => string): AsyncIterable<{ event: string, data: T }> {
    const waiting: T[] = []
    let wake: (() => void) | undefined
    const push = (data: T) => {
      waiting.push(data)
      wake?.()
    }
    const unsubscribe = subscribe(push)
    signal.addEventListener('abort', () => wake?.(), { once: true })
    return {
      async* [Symbol.asyncIterator]() {
        try {
          while (!signal.aborted) {
            const next = waiting.shift()
            if (next !== undefined) {
              yield { event: name ?? nameOf!(next), data: next }
              continue
            }
            await new Promise<void>(resolve => wake = resolve)
            wake = undefined
          }
        } finally {
          unsubscribe()
        }
      },
    }
  }

  open(document: string, body: { session: string, turn?: number }, member: Member): Promise<ReviewView> {
    return this.#serial(document, async () => {
      if (this.#closed) throw new RequestError(503, 'the workspace service is closing')
      let open = this.#open.get(document)
      if (open && open.session !== body.session) throw lockedError(document, holderOf(open.session))
      if (!open) {
        const release = this.#options.locks.claim(document, holderOf(body.session))
        if (!release) throw lockedError(document, this.#options.locks.holder(document) ?? '')
        const { config, log } = this.#options
        const turn = body.turn ?? 0
        const opened = new Date().toISOString()
        try {
          const review = await openGitReview({
            workspaceRoot: config.root,
            deckDir: join(config.root, document),
            task: randomUUID(),
            files: this.#options.files,
            onRestore: paths => log.warn(`session ${body.session}: the agent changed the git directory, put back: ${paths.join(', ')}`),
            warn: message => log.warn(`session ${body.session}: ${message}`),
            session: { session: body.session, document, member, turns: { from: turn, to: turn }, opened },
          })
          open = { review, document, session: body.session, member, turns: { from: turn, to: turn }, running: true, opened, release }
        } catch (error) {
          release()
          throw new RequestError(409, `the review of ${document || '.'} did not open: ${errorMessage(error)}`)
        }
        this.#open.set(document, open)
      }
      this.#turn(open, body.turn)
      open.running = true
      this.#rearm(document)
      return await this.#changed(open)
    })
  }

  step(document: string, body: { session: string, turn?: number, label?: string, tool?: string, end?: boolean }): Promise<ReviewView | undefined> {
    return this.#serial(document, async () => {
      const open = this.#mine(document, body.session)
      this.#turn(open, body.turn)
      if (body.label) await open.review.step(body.label, body.tool)
      if (!body.end) {
        open.running = true
        return await this.#changed(open)
      }
      open.running = false
      const changes = await open.review.diff()
      if (changes.length === 0) {
        await open.review.close()
        await this.#end(open, { outcome: 'empty', files: [] })
        return undefined
      }
      if (reviewSettings(this.#options.config).mode === 'auto') {
        await this.#accept(open, [], undefined)
        return undefined
      }
      this.#arm(open)
      return await this.#changed(open)
    })
  }

  accept(document: string, body: { reject?: string[], message?: string }): Promise<ReviewEnd> {
    return this.#serial(document, () => this.#accept(this.#any(document), body.reject ?? [], body.message))
  }

  async #accept(open: Open, reject: string[], message: string | undefined): Promise<ReviewEnd> {
    const rejected = new Set(reject)
    for (const change of await open.review.diff()) if (inGitDir(change.path)) rejected.add(change.path)
    const files = await open.review.accept([...rejected])
    const lang = listDocuments(this.#options.config).find(doc => doc.dir === open.document)?.lang
    const steps = open.review.steps().map(step => `- ${step.label}`).slice(0, 20)
    let revision: Revision | undefined
    try {
      revision = await this.#options.revisions.commit({
        files,
        message: `${message?.trim() || summaryOf(files, lang)}${steps.length ? `\n\n${steps.join('\n')}` : ''}`,
        origin: { kind: 'agent', task: open.review.task, member: open.member },
        trailers: [[SESSION_TRAILER, open.session], [TURN_TRAILER, `${open.turns.from}-${open.turns.to}`]],
      })
    } catch (error) {
      this.#options.log.warn(`the review of session ${open.session} in ${open.document || '.'} was accepted, but not committed: ${errorMessage(error)}`)
    }
    const ended: ReviewEnd = { outcome: 'accepted', ...revision ? { revision } : {}, files }
    await this.#end(open, ended)
    return ended
  }

  reject(document: string, body: { paths?: string[] }): Promise<ReviewFollowed> {
    return this.#serial(document, async () => {
      const open = this.#any(document)
      if (body.paths) {
        await open.review.restoreFiles(body.paths)
        if ((await open.review.diff()).length > 0) return { document, review: await this.#changed(open) }
      }
      const files = (await open.review.diff()).map(change => change.path)
      await open.review.rollback()
      const ended: ReviewEnd = { outcome: 'rejected', files }
      await this.#end(open, ended)
      return { document, ended }
    })
  }

  restore(document: string, body: { step: string }): Promise<ReviewView> {
    return this.#serial(document, async () => {
      const open = this.#any(document)
      try {
        await open.review.restoreTo!(body.step)
      } catch (error) {
        throw new RequestError(409, errorMessage(error))
      }
      return await this.#changed(open)
    })
  }

  async reverted(id: string, revertedBy: string): Promise<void> {
    if (this.#listeners.size === 0) return
    const { revisions } = this.#options
    const message = await revisions.messageOf(id)
    const found = message === undefined ? {} : trailers(message)
    const session = found[SESSION_TRAILER]?.[0]
    if (!session || message === undefined) return
    const files = await revisions.filesOf(id)
    this.#tell({ type: 'reverted', session, documents: await revisions.documentsOf(id), ...found[TURN_TRAILER]?.[0] ? { turns: found[TURN_TRAILER][0] } : {}, revision: id, subject: message.split('\n')[0] ?? '', revertedBy, files })
  }

  close(): void {
    this.#closed = true
    for (const open of this.#open.values()) {
      clearTimeout(open.timer)
      open.review.suspend()
      open.release()
    }
    this.#open.clear()
  }

  #mine(document: string, session: string): Open {
    const open = this.#any(document)
    if (open.session !== session) throw lockedError(document, holderOf(open.session))
    return open
  }

  #any(document: string): Open {
    const open = this.#open.get(document)
    if (!open) throw new RequestError(404, `no review of ${document || '.'} is open`)
    return open
  }

  #turn(open: Open, turn: number | undefined): void {
    if (turn === undefined || !Number.isInteger(turn) || turn < 0) return
    open.turns = { from: open.turns.from === 0 ? turn : Math.min(open.turns.from, turn), to: Math.max(open.turns.to, turn) }
    open.review.note({ session: open.session, document: open.document, member: open.member, turns: open.turns, opened: open.opened })
  }

  async #changed(open: Open): Promise<ReviewView> {
    const review = await this.#view(open)
    this.#follow(open.document, { document: open.document, review })
    this.#tell({ type: 'review', document: open.document, session: open.session, review })
    return review
  }

  async #end(open: Open, ended: ReviewEnd): Promise<void> {
    clearTimeout(open.timer)
    this.#open.delete(open.document)
    open.release()
    this.#follow(open.document, { document: open.document, ended })
    this.#tell({ type: 'review', document: open.document, session: open.session, ended })
  }

  #follow(document: string, event: ReviewFollowed): void {
    for (const push of this.#followers.get(document) ?? []) push(event)
  }

  #tell(event: ReviewEvent): void {
    for (const push of this.#listeners) push(event)
  }

  #rearm(document: string): void {
    const open = this.#open.get(document)
    if (open) this.#arm(open)
  }

  #arm(open: Open): void {
    clearTimeout(open.timer)
    open.timer = undefined
    if (open.running || (this.#followers.get(open.document)?.size ?? 0) > 0) return
    const { timeoutMs } = reviewSettings(this.#options.config)
    open.timer = setTimeout(() => {
      void this.#serial(open.document, async () => {
        if (this.#open.get(open.document) !== open || open.running || (this.#followers.get(open.document)?.size ?? 0) > 0) return
        const files = (await open.review.diff()).map(change => change.path)
        await open.review.rollback()
        this.#options.log.info(`the review of session ${open.session} in ${open.document || '.'}: no page followed it for ${Math.round(timeoutMs / 1000)} s: rolled back`)
        await this.#end(open, { outcome: 'rolled-back', files })
      }).catch((error: unknown) => this.#options.log.warn(`the review of session ${open.session} did not roll back: ${errorMessage(error)}`))
    }, timeoutMs)
    open.timer.unref?.()
  }

  #serial<T>(document: string, work: () => Promise<T>): Promise<T> {
    const next = (this.#queues.get(document) ?? Promise.resolve()).then(work, work)
    this.#queues.set(document, next.catch(() => undefined))
    return next
  }
}
