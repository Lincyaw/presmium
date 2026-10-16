/**
 * Document operations (P-121, docs/domain-model.md section 14): create from
 * a template, rename (the relative links of the other documents follow),
 * copy, delete. A document's identity is its directory; each operation is a
 * change of the source and one commit (`Presmium-Origin: document`).
 */
import { chmodSync, chownSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Member } from '@presmium/kernel'
import type { DocumentOperation, OperationAnswer, WorkspaceDocument } from '../domain/api.ts'
import { invalidDocumentDir, rewriteLinks, within } from '../domain/paths.ts'
import { listDocuments, namedByPatterns } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import type { Git } from './git.ts'
import type { Revisions } from './revisions.ts'

/** The document templates installed with Presmium (`templates/document/<name>/`). */
export const BUILTIN_TEMPLATES = fileURLToPath(new URL('../../../../templates/document', import.meta.url))
export const DEFAULT_TEMPLATE = 'default'

/** Directories of a document that are not its source (outputs, caches, dependencies). */
const NOT_SOURCE = new Set(['node_modules', 'dist', '.git'])

/** An error with the HTTP status of the answer. */
export class RequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Files under `dir` (absolute), relative to it, outputs and caches left out (the anchor lock of `.presmium/` stays). */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      const rel = relative(dir, path)
      if (NOT_SOURCE.has(name)) continue
      if (name === '.presmium' && current === dir) {
        const lock = join(path, 'anchors.lock.json')
        if (existsSync(lock)) out.push(relative(dir, lock))
        continue
      }
      if (statSync(path).isDirectory()) walk(path)
      else out.push(rel)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

const posix = (path: string) => path.split(sep).join('/')

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
 * A document directory the sandbox may write (the compose layout, docs/architecture.md
 * 10.5): its group the shared group, directories setgid and group-writable, files group-writable.
 */
function share(dir: string, gid: number): void {
  const walk = (path: string) => {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return
    chownSync(path, -1, gid)
    if (stat.isDirectory()) {
      chmodSync(path, 0o2775)
      for (const name of readdirSync(path)) walk(join(path, name))
    } else {
      chmodSync(path, (stat.mode & 0o777) | 0o660)
    }
  }
  walk(dir)
}

export class Documents {
  readonly config: WorkspaceConfig
  readonly #git: Git
  readonly #revisions: Revisions
  /** Called after an operation changed the documents (the server's sessions and the site follow). */
  readonly #changed: (change: { removed: string[], added: string[] }) => void | Promise<void>

  /** The group of the document directories (`PRESMIUM_DOCUMENTS_GROUP` in the compose layout), given to those it makes. */
  readonly #group?: number

  constructor(config: WorkspaceConfig, git: Git, revisions: Revisions, changed: (change: { removed: string[], added: string[] }) => void | Promise<void> = () => {}, group?: string) {
    this.config = config
    this.#git = git
    this.#revisions = revisions
    this.#changed = changed
    this.#group = group ? groupId(group) : undefined
  }

  /** A directory the operation made: shared with the document group when there is one. */
  #made(dir: string): void {
    if (this.#group !== undefined) share(join(this.config.root, dir), this.#group)
  }

  /** The documents now, as listed. */
  list(): WorkspaceDocument[] {
    return listDocuments(this.config).map(({ entry: _entry, ...document }) => document)
  }

  /** The directory of the templates: the workspace's `templates`, else Presmium's. */
  get templatesDir(): string {
    return this.config.templates ?? BUILTIN_TEMPLATES
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
    const answer = await this.#git.exclusive(() => this.#apply(operation, member))
    const added = operation.op === 'delete' ? [] : [answer.dir!]
    const removed = operation.op === 'rename' || operation.op === 'delete' ? [operation.dir] : []
    await this.#changed({ removed, added })
    return answer
  }

  async #apply(operation: DocumentOperation, member: Member): Promise<OperationAnswer> {
    const origin = { kind: 'document' as const, member }
    const known = new Set(listDocuments(this.config).map(doc => doc.dir))
    const existing = (dir: string) => {
      if (!known.has(dir)) throw new RequestError(404, `no document ${JSON.stringify(dir)}`)
      return dir
    }
    const fresh = (dir: string) => {
      const invalid = invalidDocumentDir(dir)
      if (invalid) throw new RequestError(400, invalid)
      if (!namedByPatterns(this.config, dir)) throw new RequestError(400, `"${dir}" is not where the workspace configuration's documents are (${this.config.documents.join(', ')})`)
      if (existsSync(join(this.config.root, dir))) throw new RequestError(409, `${dir} exists already`)
      return dir
    }
    switch (operation.op) {
      case 'create': {
        const dir = fresh(operation.dir)
        const name = operation.template ?? (this.templates().includes(DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : this.templates()[0])
        const template = name ? join(this.templatesDir, name) : undefined
        if (!template || name!.includes('/') || name!.startsWith('.') || !existsSync(template)) throw new RequestError(400, `no document template ${JSON.stringify(name ?? '')}`)
        const title = operation.title?.trim() || dir.split('/').at(-1)!
        for (const file of sourceFiles(template)) {
          const target = join(this.config.root, dir, file)
          mkdirSync(dirname(target), { recursive: true })
          const content = readFileSync(join(template, file))
          writeFileSync(target, file.endsWith('.md') ? content.toString('utf8').replaceAll('{{title}}', JSON.stringify(title).slice(1, -1)) : content)
        }
        this.#made(dir)
        const revision = await this.#revisions.commitNow([dir], `Create document ${dir}`, `Title: ${title}\nTemplate: ${name}`, origin)
        return { revision, dir }
      }
      case 'rename': {
        const from = existing(operation.dir)
        const to = fresh(operation.to)
        mkdirSync(dirname(join(this.config.root, to)), { recursive: true })
        renameSync(join(this.config.root, from), join(this.config.root, to))
        this.#made(to)
        const rewritten = this.#rewrite(from, to)
        const revision = await this.#revisions.commitNow([from, to, ...rewritten], `Rename document ${from} to ${to}`, rewritten.length ? `Links rewritten in: ${rewritten.join(', ')}` : '', origin)
        return { revision, dir: to }
      }
      case 'copy': {
        const from = existing(operation.dir)
        const to = fresh(operation.to)
        for (const file of sourceFiles(join(this.config.root, from))) {
          const target = join(this.config.root, to, file)
          mkdirSync(dirname(target), { recursive: true })
          if (!file.endsWith('.md')) {
            cpSync(join(this.config.root, from, file), target)
            continue
          }
          // Links out of the copy point where they pointed from the original.
          const text = readFileSync(join(this.config.root, from, file), 'utf8')
          writeFileSync(target, rewriteLinks(text, posix(join(to, file)), posix(join(from, file)), from, to))
        }
        this.#made(to)
        const revision = await this.#revisions.commitNow([to], `Copy document ${from} to ${to}`, '', origin)
        return { revision, dir: to }
      }
      case 'delete': {
        const dir = existing(operation.dir)
        rmSync(join(this.config.root, dir), { recursive: true, force: true })
        const revision = await this.#revisions.commitNow([dir], `Delete document ${dir}`, '', origin)
        return { revision }
      }
    }
  }

  /** Rewrites the relative links of every document's Markdown after `from` moved to `to`; returns the files changed (relative to the root). */
  #rewrite(from: string, to: string): string[] {
    const changed: string[] = []
    for (const doc of listDocuments(this.config)) {
      const dir = join(this.config.root, doc.dir)
      for (const file of sourceFiles(dir).filter(name => name.endsWith('.md'))) {
        const path = posix(join(doc.dir, file))
        const was = within(path, to) ? `${from}${path.slice(to.length)}` : path
        const text = readFileSync(join(dir, file), 'utf8')
        const next = rewriteLinks(text, path, was, from, to)
        if (next === text) continue
        writeFileSync(join(dir, file), next)
        if (!within(path, to)) changed.push(path)
      }
    }
    return changed
  }
}
