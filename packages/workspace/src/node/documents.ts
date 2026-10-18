import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Member } from '@presmium/kernel'
import type { DocumentOperation, LockedAnswer, OperationAnswer, WorkspaceDocument } from '../domain/api.ts'
import { invalidDocumentDir, within } from '../domain/paths.ts'
import type { CommitOrigin, RevisionOperation } from '../domain/revisions.ts'
import { listDocuments, namedByPatterns } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { templatesDir } from './files.ts'
import type { DocumentWriter } from './files.ts'
import type { Git } from './git.ts'
import { lockedMessage } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'

export { BUILTIN_TEMPLATES } from './files.ts'
export const DEFAULT_TEMPLATE = 'default'

export class RequestError extends Error {
  readonly status: number
  readonly detail?: Record<string, unknown>
  constructor(status: number, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

export function lockedError(document: string, holder: string): RequestError {
  return new RequestError(409, lockedMessage(document, holder), { locked: { document, holder } } satisfies Omit<LockedAnswer, 'error'>)
}

export function makeDocumentDir(root: string, dir: string): void {
  const path = join(root, dir)
  mkdirSync(dirname(path), { recursive: true })
  mkdirSync(path)
}

export interface DocumentsChange {
  removed: string[]
  added: string[]
}

export interface DocumentsOptions {
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

export class Documents {
  readonly config: WorkspaceConfig
  readonly #git: Git
  readonly #revisions: Revisions
  readonly #writer: DocumentWriter
  readonly #changed: (change: DocumentsChange) => void | Promise<void>
  readonly #locks?: DocumentLocks

  constructor(options: DocumentsOptions) {
    this.config = options.config
    this.#git = options.git
    this.#revisions = options.revisions
    this.#writer = options.writer
    this.#changed = options.changed ?? (() => {})
    this.#locks = options.locks
  }

  get writer(): DocumentWriter {
    return this.#writer
  }

  get locks(): DocumentLocks | undefined {
    return this.#locks
  }

  list(): WorkspaceDocument[] {
    return listDocuments(this.config).map(({ entry: _entry, ...document }) => document)
  }

  get templatesDir(): string {
    return templatesDir(this.config)
  }

  templates(): string[] {
    try {
      return readdirSync(this.templatesDir).filter(name => statSync(join(this.templatesDir, name)).isDirectory()).sort()
    } catch {
      return []
    }
  }

  async apply(operation: DocumentOperation, member: Member): Promise<OperationAnswer> {
    if (this.config.single) throw new RequestError(409, 'this workspace is a single deck: it has no document operations')
    const claimed = this.#locks?.claimAll(touched(operation), `document:${operation.op}`)
    if (claimed && 'holder' in claimed) throw lockedError(claimed.document, claimed.holder)
    try {
      const answer = await this.#git.exclusive(() => this.#apply(operation, member))
      const added = operation.op === 'delete' ? [] : [answer.dir!]
      const removed = operation.op === 'rename' || operation.op === 'delete' ? [operation.dir] : []
      await this.#changed({ removed, added })
      return answer
    } finally {
      claimed?.release()
    }
  }

  async #fill(dir: string, fill: () => Promise<void>): Promise<void> {
    makeDocumentDir(this.config.root, dir)
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
        rmdirSync(join(this.config.root, dir))
        return
      } catch (error) {
        if (attempt > 0 || (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw new RequestError(409, `${dir} could not be removed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  async #apply(operation: DocumentOperation, member: Member): Promise<OperationAnswer> {
    const origin = (done: RevisionOperation): CommitOrigin => ({ kind: 'document', member, operation: done })
    const known = listDocuments(this.config).map(doc => doc.dir)
    const existing = (dir: string) => {
      if (!known.includes(dir)) throw new RequestError(404, `no document ${JSON.stringify(dir)}`)
      return dir
    }
    const fresh = (dir: string) => {
      const invalid = invalidDocumentDir(dir)
      if (invalid) throw new RequestError(400, invalid)
      if (!namedByPatterns(this.config, dir)) throw new RequestError(400, `"${dir}" is not where the workspace configuration's documents are (${this.config.documents.join(', ')})`)
      const holder = known.find(doc => doc !== '' && (within(dir, doc) || within(doc, dir)))
      if (holder !== undefined) throw new RequestError(409, `${dir} would hold or be inside the document ${holder}`)
      if (existsSync(join(this.config.root, dir))) throw new RequestError(409, `${dir} exists already`)
      return dir
    }
    switch (operation.op) {
      case 'create': {
        const dir = fresh(operation.dir)
        const name = operation.template ?? (this.templates().includes(DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : this.templates()[0])
        if (!name || !this.templates().includes(name)) throw new RequestError(400, `no document template ${JSON.stringify(name ?? '')}`)
        const title = operation.title?.trim() || dir.split('/').at(-1)!
        await this.#fill(dir, () => this.#writer.template(dir, name, title))
        const revision = await this.#revisions.commitNow([dir], `Create document ${dir}`, `Title: ${title}\nTemplate: ${name}`, origin({ op: 'create', dir }))
        return { revision, dir }
      }
      case 'rename': {
        const from = existing(operation.dir)
        const to = fresh(operation.to)
        mkdirSync(dirname(join(this.config.root, to)), { recursive: true })
        renameSync(join(this.config.root, from), join(this.config.root, to))
        const rewritten = (await this.#writer.relink(from, to)).filter(path => !within(path, to))
        const revision = await this.#revisions.commitNow([from, to, ...rewritten], `Rename document ${from} to ${to}`, rewritten.length ? `Links rewritten in: ${rewritten.join(', ')}` : '', origin({ op: 'rename', dir: from, to }))
        return { revision, dir: to }
      }
      case 'copy': {
        const from = existing(operation.dir)
        const to = fresh(operation.to)
        await this.#fill(to, () => this.#writer.copy(from, to))
        const revision = await this.#revisions.commitNow([to], `Copy document ${from} to ${to}`, '', origin({ op: 'copy', dir: from, to }))
        return { revision, dir: to }
      }
      case 'delete': {
        const dir = existing(operation.dir)
        await this.#remove(dir)
        const revision = await this.#revisions.commitNow([dir], `Delete document ${dir}`, '', origin({ op: 'delete', dir }))
        return { revision }
      }
    }
  }
}
