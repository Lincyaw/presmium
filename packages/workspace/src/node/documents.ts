/**
 * Document operations (P-121, docs/domain-model.md section 14): create from
 * a template, rename (the relative links of the other documents follow),
 * copy, delete. A document's identity is its directory; each operation is a
 * change of the source and one commit whose origin names it
 * (`Presmium-Origin: document <op> <directories>`). An operation holds the
 * locks of the documents it touches (`DOCUMENT_LOCKS`, a copy's source too):
 * one an agent's change task holds is refused with 409 (F-09).
 *
 * What is inside a document directory is written by the document writer
 * (./files.ts): in SHARED mode agent-host, as the sandbox, since serve
 * writes nothing where the sandbox may write (WP-91). serve itself only
 * works in the directories around the documents, which are its own: it
 * makes a new document directory (empty, given the documents' group, which
 * the sandbox may then write), renames one, and removes one the writer
 * emptied.
 */
import { chmodSync, chownSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync } from 'node:fs'
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

/** An error with the HTTP status of the answer, and what the answer says beside its `error`. */
export class RequestError extends Error {
  readonly status: number
  readonly detail?: Record<string, unknown>
  constructor(status: number, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

/** The 409 of a document whose lock another writer holds (F-09): the text, and the lock for the panels (N-07). */
export function lockedError(document: string, holder: string): RequestError {
  return new RequestError(409, lockedMessage(document, holder), { locked: { document, holder } } satisfies Omit<LockedAnswer, 'error'>)
}

/** The id of a group named in /etc/group; undefined when there is none. */
export function groupId(name: string): number | undefined {
  if (/^\d+$/.test(name)) return Number(name)
  try {
    const line = readFileSync('/etc/group', 'utf8').split('\n').find(entry => entry.split(':')[0] === name)
    return line ? Number(line.split(':')[2]) : undefined
  } catch {
    return undefined
  }
}

/**
 * Makes a new, empty document directory: its parents are serve's (made as
 * they are needed); with the documents' group (the compose layout,
 * docs/architecture.md 10.5) it gets the group, setgid and group-writable,
 * so the sandbox may write in it, and serve writes nothing in it from here on.
 */
export function makeDocumentDir(root: string, dir: string, group?: number): void {
  const path = join(root, dir)
  mkdirSync(dirname(path), { recursive: true })
  mkdirSync(path)
  if (group !== undefined) {
    chownSync(path, -1, group)
    chmodSync(path, 0o2775)
  }
}

/** A change of the documents an operation or an undo made: those gone, and those there (again or new). */
export interface DocumentsChange {
  removed: string[]
  added: string[]
}

export interface DocumentsOptions {
  config: WorkspaceConfig
  git: Git
  revisions: Revisions
  writer: DocumentWriter
  /** Called after an operation changed the documents (the server's sessions and the site follow, C-7). */
  changed?: (change: DocumentsChange) => void | Promise<void>
  /** The group of the document directories (`PRESMIUM_DOCUMENTS_GROUP` in the compose layout), given to those it makes. */
  group?: number
  /** The documents' locks (`DOCUMENT_LOCKS`). */
  locks?: DocumentLocks
}

/** The directories an operation touches: the document, and where it goes. */
function touched(operation: DocumentOperation): string[] {
  return operation.op === 'create' || operation.op === 'delete' ? [operation.dir] : [operation.dir, operation.to]
}

export class Documents {
  readonly config: WorkspaceConfig
  readonly #git: Git
  readonly #revisions: Revisions
  readonly #writer: DocumentWriter
  readonly #changed: (change: DocumentsChange) => void | Promise<void>
  readonly #group?: number
  readonly #locks?: DocumentLocks

  constructor(options: DocumentsOptions) {
    this.config = options.config
    this.#git = options.git
    this.#revisions = options.revisions
    this.#writer = options.writer
    this.#changed = options.changed ?? (() => {})
    this.#group = options.group
    this.#locks = options.locks
  }

  /** The documents now, as listed. */
  list(): WorkspaceDocument[] {
    return listDocuments(this.config).map(({ entry: _entry, ...document }) => document)
  }

  /** The directory of the templates: the workspace's `templates`, else Presmium's. */
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

  /** A new document directory, made empty, then filled by the writer; on a failure it goes again. */
  async #fill(dir: string, fill: () => Promise<void>): Promise<void> {
    makeDocumentDir(this.config.root, dir, this.#group)
    try {
      await fill()
    } catch (error) {
      await this.#remove(dir).catch(() => undefined)
      throw error
    }
  }

  /** Removes a document directory: the writer empties it, then serve removes it (once more if something came meanwhile). */
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
        // The other documents' links (and the moved one's own) follow, written by the writer.
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
