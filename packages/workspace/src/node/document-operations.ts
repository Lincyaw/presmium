import { existsSync, mkdirSync, renameSync, rmdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DocumentOperation, Member, OperationAnswer, RevisionOperation } from '@lincyaw/kernel'
import { hasRole } from '@lincyaw/kernel'
import type { CommitOrigin } from '../domain/commit-message.ts'
import { invalidDocumentDir, isWithin } from '../domain/paths.ts'
import { isDocumentDir, listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { RequestError } from './errors.ts'
import type { Git } from './git.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import { DEFAULT_TEMPLATE, listTemplates } from './templates.ts'
import { DocumentCheckpointRefusal, makeDocumentDir } from './writer.ts'
import type { DocumentWriter } from './writer.ts'

export interface DocumentsChange {
  removed: string[]
  added: string[]
}

export function documentsDiff(before: string[], after: string[]): DocumentsChange {
  return { removed: before.filter(dir => !after.includes(dir)), added: after.filter(dir => !before.includes(dir)) }
}

export interface DocumentOperationsOptions {
  config: WorkspaceConfig
  git: Git
  revisions: Revisions
  writer: DocumentWriter
  changed?: (change: DocumentsChange) => void | Promise<void>
  locks?: DocumentLocks
}

function touched(operation: DocumentOperation): string[] {
  return operation.op === 'create' || operation.op === 'delete' ? [operation.dir] : [operation.dir, operation.to]
}

/** Creating, renaming, copying and deleting a document, each under the document locks and as one commit. */
export class DocumentOperations {
  readonly #config: WorkspaceConfig
  readonly #revisions: Revisions
  readonly #writer: DocumentWriter
  readonly #changed: (change: DocumentsChange) => void | Promise<void>
  readonly #locks?: DocumentLocks

  constructor(options: DocumentOperationsOptions) {
    this.#config = options.config
    this.#revisions = options.revisions
    this.#writer = options.writer
    this.#changed = options.changed ?? (() => {})
    this.#locks = options.locks
  }

  async apply(operation: DocumentOperation, member: Member): Promise<OperationAnswer> {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'document operations need the role editor')
    if (this.#config.singleDeck) throw new RequestError(409, 'this workspace is a single deck: it has no document operations')
    if (operation.op !== 'create' && operation.dir === '') throw new RequestError(409, 'project-root-operation-unavailable')
    let release: (() => void) | undefined, committedError: RequestError | undefined, cleanupError: unknown
    try {
      const answer = await this.#revisions.transaction(async () => {
        const head = await this.#revisions.head()
        const before = await this.#writer.checkpoint(touched(operation), operation.op === 'rename' ? { from: operation.dir, to: operation.to } : undefined).catch(error => {
          if (error instanceof DocumentCheckpointRefusal) throw new RequestError(error.status, error.message, error.detail)
          throw error
        })
        let discardCheckpoint = true
        try {
          const claimed = this.#locks?.claimAll(before.documents, `document:${operation.op}`)
          if (claimed && 'holder' in claimed) throw lockedError(claimed.document, claimed.holder)
          release = claimed?.release
          let mutationStarted = false
          try {
            const result = await this.#apply(operation, member, () => { mutationStarted = true; discardCheckpoint = false })
            discardCheckpoint = true
            return result
          }
          catch (error) {
            if (!mutationStarted) throw error
            let after: string | undefined
            try { after = await this.#revisions.head() }
            catch { throw new RequestError(500, 'project-commit-state-unavailable', { committed: 'unknown', recovery: before.recovery }) }
            if (after === undefined) throw new RequestError(500, 'project-commit-state-unavailable', { committed: 'unknown', recovery: before.recovery })
            if (after !== head) { discardCheckpoint = true; committedError = new RequestError(409, 'project-readback-changed', { committed: true, snapshot: after }); return undefined }
            try { await before.restore() }
            catch { throw new RequestError(500, 'project-rollback-failed', { committed: false, recovery: before.recovery }) }
            discardCheckpoint = true
            throw error
          }
        } finally { if (discardCheckpoint) try { before.dispose() } catch (error) { cleanupError = error } }
      })
      if (committedError) throw committedError
      if (!answer) throw new RequestError(409, 'project-result-unavailable')
      if (cleanupError) throw new RequestError(500, 'project-checkpoint-cleanup-failed', { committed: Boolean(answer.revision), snapshot: await this.#revisions.head() })
      const added = operation.op === 'delete' ? [] : [answer.dir!]
      const removed = operation.op === 'rename' || operation.op === 'delete' ? [operation.dir] : []
      await this.#changed({ removed, added })
      return answer
    } finally {
      release?.()
    }
  }

  async #fill(dir: string, fill: () => Promise<void>): Promise<void> {
    makeDocumentDir(this.#config.root, dir)
    try {
      await fill()
    } catch (error) {
      await this.#remove(dir).catch(() => undefined)
      throw error
    }
  }

  async #remove(dir: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      await this.#writer.empty(dir)
      try {
        rmdirSync(join(this.#config.root, dir))
        return
      } catch (error) {
        if (attempt > 0 || (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw new RequestError(409, `${dir} could not be removed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  async #apply(operation: DocumentOperation, member: Member, beforeWrite: () => void): Promise<OperationAnswer> {
    const config = this.#config
    const origin = (done: RevisionOperation): CommitOrigin => ({ kind: 'document', member, operation: done })
    const commit = (paths: string[], summary: string, body: string, done: RevisionOperation) => this.#revisions.commitWhileLocked({ paths, summary, body, origin: origin(done) })
    const known = listDocuments(config).map(doc => doc.dir)
    const existing = (dir: string) => {
      if (!known.includes(dir)) throw new RequestError(404, `no document ${JSON.stringify(dir)}`)
      return dir
    }
    const fresh = (dir: string) => {
      const invalid = invalidDocumentDir(dir)
      if (invalid) throw new RequestError(400, invalid)
      if (!isDocumentDir(config, dir)) throw new RequestError(400, `"${dir}" is not where the workspace configuration's documents are (${config.documents.join(', ')})`)
      const holder = known.find(doc => doc !== '' && (isWithin(dir, doc) || isWithin(doc, dir)))
      if (holder !== undefined) throw new RequestError(409, `${dir} would hold or be inside the document ${holder}`)
      if (existsSync(join(config.root, dir))) throw new RequestError(409, `${dir} exists already`)
      return dir
    }
    switch (operation.op) {
      case 'create': {
        const dir = fresh(operation.dir)
        const templates = listTemplates(config)
        const name = operation.template ?? (templates.includes(DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : templates[0])
        if (!name || !templates.includes(name)) throw new RequestError(400, `no document template ${JSON.stringify(name ?? '')}`)
        const title = operation.title?.trim() || dir.split('/').at(-1)!
        beforeWrite()
        await this.#fill(dir, () => this.#writer.template(dir, name, title))
        const revision = await commit([dir], `Create document ${dir}`, `Title: ${title}\nTemplate: ${name}`, { op: 'create', dir })
        return { revision, dir }
      }
      case 'rename': {
        const from = existing(operation.dir)
        const to = fresh(operation.to)
        beforeWrite()
        mkdirSync(dirname(join(config.root, to)), { recursive: true })
        renameSync(join(config.root, from), join(config.root, to))
        const rewritten = (await this.#writer.relink(from, to)).filter(path => !isWithin(path, to))
        const revision = await commit([from, to, ...rewritten], `Rename document ${from} to ${to}`, rewritten.length ? `Links rewritten in: ${rewritten.join(', ')}` : '', { op: 'rename', dir: from, to })
        return { revision, dir: to }
      }
      case 'copy': {
        const from = existing(operation.dir)
        const to = fresh(operation.to)
        beforeWrite()
        await this.#fill(to, () => this.#writer.copy(from, to))
        const revision = await commit([to], `Copy document ${from} to ${to}`, '', { op: 'copy', dir: from, to })
        return { revision, dir: to }
      }
      case 'delete': {
        const dir = existing(operation.dir)
        beforeWrite()
        await this.#remove(dir)
        const revision = await commit([dir], `Delete document ${dir}`, '', { op: 'delete', dir })
        return { revision }
      }
    }
  }
}
