import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { errorMessage, pushStream } from '@lincyaw/kernel'
import type { DocumentFiles, Logger, Member, ReviewEnd, ReviewSnapshot, ReviewUpdate } from '@lincyaw/kernel'
import { trailers } from '../../domain/commit-message.ts'
import type { WorkspaceConfig } from '../config.ts'
import { listDocuments } from '../config.ts'
import { RequestError } from '../errors.ts'
import { lockedError } from '../locks.ts'
import type { DocumentLocks } from '../locks.ts'
import type { Revisions } from '../revisions.ts'
import { writeChanges } from '../writer.ts'
import { GIT_ENGINE, openGitReview, pendingAgentSessionReview, resumeGitReview } from './git-review.ts'
import type { GitReview } from './git-review.ts'
import { readRecord } from './record.ts'
import type { ReviewRecord } from './record.ts'
import { rollBackLeftTaskReview } from './task-reviews.ts'

export const AGENT_SESSION_TRAILER = 'Presmium-Session'
export const TURN_TRAILER = 'Presmium-Turn'

export type ReviewEvent =
  | { type: 'review', document: string, session: string, review?: ReviewSnapshot, ended?: ReviewEnd }
  | { type: 'reverted', session: string, documents: string[], turns?: string, revision: string, subject: string, revertedBy: string, files: string[] }

export interface AgentSessionReviewsOptions {
  config: WorkspaceConfig
  revisions: Revisions
  locks: DocumentLocks
  /** How a plugin's task writes, for rolling back the tasks a process left. */
  files?: DocumentFiles
  log: Logger
}

interface OpenReview {
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
    mode: settings.review === 'required' ? 'required' : 'auto',
    timeoutMs: typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0 ? timeout : 30 * 60_000,
  }
}

const lockHolder = (session: string) => `agent:${session}`

const isInGitDir = (path: string) => path.split('/').some(part => part.toLowerCase() === '.git')

function commitSummary(files: string[], lang: string | undefined): string {
  const zh = !lang || lang.startsWith('zh')
  const names = files.slice(0, 3).map(file => file.split('/').at(-1)!)
  const more = files.length - names.length
  return zh
    ? `AI 修改：${names.join('、')}${more > 0 ? ` 等 ${files.length} 个文件` : ''}`
    : `AI change: ${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}`
}

/**
 * The review of a dsh agent session's changes to the whole workspace: one at a time, under the workspace's lock,
 * across the session's turns. A review that no page watches rolls back after the configured time.
 */
export class AgentSessionReviews {
  readonly #options: AgentSessionReviewsOptions
  #open?: OpenReview
  #queue: Promise<unknown> = Promise.resolve()
  readonly #workspaceFiles: DocumentFiles
  readonly #watchers = new Set<(update: ReviewUpdate) => void>()
  readonly #listeners = new Set<(event: ReviewEvent) => void>()
  #closed = false

  constructor(options: AgentSessionReviewsOptions) {
    this.#options = options
    this.#workspaceFiles = { write: async changes => writeChanges(options.config, changes, true) }
  }

  /** Takes up the reviews a process that has ended left: resumes its agent session's review, rolls back its tasks' reviews. */
  async recover(documents: string[]): Promise<void> {
    const { config, log } = this.#options
    const legacy = documents.filter(document => document !== '' && readRecord(join(config.root, document))?.session)
    if (legacy.length > 0) throw new Error(`Cannot restore document-scoped session reviews in ${legacy.join(', ')} as a workspace review. Use the previous Presmium version to accept or reject them first. Their review records and snapshots have been kept.`)
    for (const document of new Set([...documents, ''])) {
      const scopeDir = join(config.root, document)
      if (!existsSync(scopeDir)) continue
      try {
        const pending = pendingAgentSessionReview(scopeDir)
        if (pending?.session) {
          await this.#serial(() => this.#resume(pending))
          continue
        }
        await rollBackLeftTaskReview(this.#options, document)
      } catch (error) {
        log.warn(`the review left in ${document || '.'} was not taken up: ${errorMessage(error)}`)
      }
    }
  }

  async #resume(pending: ReviewRecord): Promise<void> {
    const { config, log } = this.#options
    const session = pending.session!
    const release = this.#options.locks.claim('', lockHolder(session.session))
    if (!release) throw new Error(`its lock is ${this.#options.locks.holder('')}'s`)
    try {
      const review = await resumeGitReview(pending, { workspaceRoot: config.root, files: this.#workspaceFiles, onRestore: paths => log.warn(`session ${session.session}: the agent changed the git directory, put back: ${paths.join(', ')}`) })
      const open: OpenReview = { review, document: session.document, session: session.session, member: session.member, turns: session.turns, running: false, opened: session.opened, release }
      this.#open = open
      log.info(`the review of session ${session.session} in ${session.document || '.'} (turns ${session.turns.from}-${session.turns.to}) waits for its author again`)
      this.#scheduleRollback(open)
    } catch (error) {
      release()
      throw error
    }
  }

  async snapshot(): Promise<ReviewSnapshot | undefined> {
    const open = this.#open
    return open && await this.#snapshotOf(open)
  }

  async #snapshotOf(open: OpenReview): Promise<ReviewSnapshot> {
    return {
      id: open.review.task,
      document: open.document,
      engine: GIT_ENGINE,
      session: open.session,
      holder: lockHolder(open.session),
      turns: { ...open.turns },
      running: open.running,
      mode: reviewSettings(this.#options.config).mode,
      opened: open.opened,
      steps: [...open.review.steps()],
      changes: await open.review.diff(),
    }
  }

  /** The review's updates for a page; while a page watches, the review does not time out. */
  watch(document: string, signal: AbortSignal): AsyncIterable<{ event: string, data: ReviewUpdate }> {
    return pushStream((push) => {
      const send = (update: ReviewUpdate) => push({ event: 'review', data: { ...update, document } })
      this.#watchers.add(send)
      void this.snapshot().then(review => send({ document, ...review ? { review } : {} }), () => send({ document }))
      this.#rescheduleRollback()
      return () => {
        this.#watchers.delete(send)
        this.#rescheduleRollback()
      }
    }, { signal })
  }

  events(signal: AbortSignal): AsyncIterable<{ event: string, data: ReviewEvent }> {
    return pushStream((push) => {
      const listener = (event: ReviewEvent) => push({ event: event.type, data: event })
      this.#listeners.add(listener)
      return () => this.#listeners.delete(listener)
    }, { signal })
  }

  open(document: string, body: { session: string, turn?: number }, member: Member): Promise<ReviewSnapshot> {
    return this.#serial(async () => {
      if (this.#closed) throw new RequestError(503, 'the workspace service is closing')
      let open = this.#open
      if (open && open.session !== body.session) throw lockedError(document, lockHolder(open.session))
      if (!open) {
        const release = this.#options.locks.claim('', lockHolder(body.session))
        if (!release) throw lockedError(document, this.#options.locks.holder('')!)
        const { config, log } = this.#options
        const turn = body.turn ?? 0
        const opened = new Date().toISOString()
        try {
          const review = await openGitReview({
            workspaceRoot: config.root,
            scopeDir: config.root,
            task: randomUUID(),
            files: this.#workspaceFiles,
            onRestore: paths => log.warn(`session ${body.session}: the agent changed the git directory, put back: ${paths.join(', ')}`),
            warn: message => log.warn(`session ${body.session}: ${message}`),
            session: { session: body.session, document, member, turns: { from: turn, to: turn }, opened },
          })
          open = { review, document, session: body.session, member, turns: { from: turn, to: turn }, running: true, opened, release }
        } catch (error) {
          release()
          throw new RequestError(409, `the review of ${document || '.'} did not open: ${errorMessage(error)}`)
        }
        this.#open = open
      }
      this.#noteTurn(open, body.turn)
      open.running = true
      this.#rescheduleRollback()
      return await this.#publish(open)
    })
  }

  step(document: string, body: { session: string, turn?: number, label?: string, tool?: string, end?: boolean }): Promise<ReviewSnapshot | undefined> {
    return this.#serial(async () => {
      const open = this.#requireSession(document, body.session)
      this.#noteTurn(open, body.turn)
      if (body.label) await open.review.step(body.label, body.tool)
      if (!body.end) {
        open.running = true
        return await this.#publish(open)
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
      this.#scheduleRollback(open)
      return await this.#publish(open)
    })
  }

  accept(document: string, body: { reject?: string[], message?: string }): Promise<ReviewEnd> {
    return this.#serial(() => this.#accept(this.#requireOpen(document), body.reject ?? [], body.message))
  }

  async #accept(open: OpenReview, reject: string[], message: string | undefined): Promise<ReviewEnd> {
    const rejected = new Set(reject)
    for (const change of await open.review.diff()) if (isInGitDir(change.path)) rejected.add(change.path)
    const files = await open.review.prepareAccept([...rejected])
    const lang = listDocuments(this.#options.config).find(doc => doc.dir === open.document)?.lang
    const steps = open.review.steps().map(step => `- ${step.label}`).slice(0, 20)
    const revision = await this.#options.revisions.commit({
      files,
      message: `${message?.trim() || commitSummary(files, lang)}${steps.length ? `\n\n${steps.join('\n')}` : ''}`,
      origin: { kind: 'agent', task: open.review.task, member: open.member },
      trailers: [[AGENT_SESSION_TRAILER, open.session], [TURN_TRAILER, `${open.turns.from}-${open.turns.to}`]],
    })
    open.review.finish()
    const ended: ReviewEnd = { outcome: 'accepted', ...revision ? { revision } : {}, files }
    await this.#end(open, ended)
    return ended
  }

  reject(document: string, body: { paths?: string[] }): Promise<ReviewUpdate> {
    return this.#serial(async () => {
      const open = this.#requireOpen(document)
      if (body.paths) {
        await open.review.restoreFiles(body.paths)
        if ((await open.review.diff()).length > 0) return { document, review: await this.#publish(open) }
      }
      const files = (await open.review.diff()).map(change => change.path)
      await open.review.rollback()
      const ended: ReviewEnd = { outcome: 'rejected', files }
      await this.#end(open, ended)
      return { document, ended }
    })
  }

  restore(document: string, body: { step: string }): Promise<ReviewSnapshot> {
    return this.#serial(async () => {
      const open = this.#requireOpen(document)
      try {
        await open.review.restoreTo!(body.step)
      } catch (error) {
        throw new RequestError(409, errorMessage(error))
      }
      return await this.#publish(open)
    })
  }

  async reverted(id: string, revertedBy: string): Promise<void> {
    if (this.#listeners.size === 0) return
    const { revisions } = this.#options
    const message = await revisions.messageOf(id)
    const found = message === undefined ? {} : trailers(message)
    const session = found[AGENT_SESSION_TRAILER]?.[0]
    if (!session || message === undefined) return
    const files = await revisions.filesOf(id)
    this.#emit({ type: 'reverted', session, documents: await revisions.documentsOf(id), ...found[TURN_TRAILER]?.[0] ? { turns: found[TURN_TRAILER][0] } : {}, revision: id, subject: message.split('\n')[0] ?? '', revertedBy, files })
  }

  close(): void {
    this.#closed = true
    const open = this.#open
    if (open) {
      clearTimeout(open.timer)
      open.review.suspend()
      open.release()
    }
    this.#open = undefined
  }

  #requireSession(document: string, session: string): OpenReview {
    const open = this.#requireOpen(document)
    if (open.session !== session) throw lockedError(document, lockHolder(open.session))
    return open
  }

  #requireOpen(document: string): OpenReview {
    const open = this.#open
    if (!open) throw new RequestError(404, `no review of ${document || '.'} is open`)
    return open
  }

  #noteTurn(open: OpenReview, turn: number | undefined): void {
    if (turn === undefined || !Number.isInteger(turn) || turn < 0) return
    open.turns = { from: open.turns.from === 0 ? turn : Math.min(open.turns.from, turn), to: Math.max(open.turns.to, turn) }
    open.review.noteSession({ session: open.session, document: open.document, member: open.member, turns: open.turns, opened: open.opened })
  }

  async #publish(open: OpenReview): Promise<ReviewSnapshot> {
    const review = await this.#snapshotOf(open)
    this.#sendToWatchers({ document: open.document, review })
    this.#emit({ type: 'review', document: open.document, session: open.session, review })
    return review
  }

  async #end(open: OpenReview, ended: ReviewEnd): Promise<void> {
    clearTimeout(open.timer)
    this.#open = undefined
    open.release()
    this.#sendToWatchers({ document: open.document, ended })
    this.#emit({ type: 'review', document: open.document, session: open.session, ended })
  }

  #sendToWatchers(update: ReviewUpdate): void {
    for (const send of this.#watchers) send(update)
  }

  #emit(event: ReviewEvent): void {
    for (const listener of this.#listeners) listener(event)
  }

  #rescheduleRollback(): void {
    const open = this.#open
    if (open) this.#scheduleRollback(open)
  }

  #scheduleRollback(open: OpenReview): void {
    clearTimeout(open.timer)
    open.timer = undefined
    if (open.running || this.#watchers.size > 0) return
    const { timeoutMs } = reviewSettings(this.#options.config)
    open.timer = setTimeout(() => {
      void this.#serial(async () => {
        if (this.#open !== open || open.running || this.#watchers.size > 0) return
        const files = (await open.review.diff()).map(change => change.path)
        await open.review.rollback()
        this.#options.log.info(`the review of session ${open.session} in ${open.document || '.'}: no page followed it for ${Math.round(timeoutMs / 1000)} s: rolled back`)
        await this.#end(open, { outcome: 'rolled-back', files })
      }).catch((error: unknown) => this.#options.log.warn(`the review of session ${open.session} did not roll back: ${errorMessage(error)}`))
    }, timeoutMs)
    open.timer.unref?.()
  }

  #serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work)
    this.#queue = next.catch(() => undefined)
    return next
  }
}
