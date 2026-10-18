import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentFileChange, Member } from '@presmium/kernel'
import type { ConflictAnswer, FilesAnswer, SourceAnswer, SourceFile } from '../domain/api.ts'
import { WORKSPACE_FILE } from '../domain/api.ts'
import { within } from '../domain/paths.ts'
import { listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { lockedError, RequestError } from './documents.ts'
import { documentDirOf, writeChanges } from './files.ts'
import type { DocumentWriter } from './files.ts'
import type { DocumentLocks } from './locks.ts'

export const MAX_SOURCE = 2 << 20
const MAX_FILES = 2000
const NOT_SOURCE = new Set(['node_modules', 'dist', '.git', '.presmium'])
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|pdf|wasm|zip|gz|tgz|bz2|xz|7z|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|ogg|oga|webm|mov|avi|mkv|bin|so|dylib|dll|exe|pyc|xlsx?|docx?|pptx?|parquet|npy|npz|pkl|db|sqlite)$/i

export function versionOf(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 20)
}

export interface SourceOptions {
  config: WorkspaceConfig
  writer: DocumentWriter
  locks?: DocumentLocks
}

interface Scope {
  document: string
  home: boolean
}

export class SourceFiles {
  readonly #config: WorkspaceConfig
  readonly #writer: DocumentWriter
  readonly #locks?: DocumentLocks

  constructor(options: SourceOptions) {
    this.#config = options.config
    this.#writer = options.writer
    this.#locks = options.locks
  }

  scope(document: string): Scope {
    return { document, home: document === '' && !this.#config.single }
  }

  roots(scope: Scope): string[] {
    if (!scope.home) return [scope.document]
    return [...listDocuments(this.#config).map(doc => doc.dir), WORKSPACE_FILE]
  }

  allows(scope: Scope, path: string, member: Member): boolean {
    if (path === WORKSPACE_FILE) return (scope.home || (this.#config.single && scope.document === '')) && member.roles.includes('owner')
    const dir = documentDirOf(this.#config, path)
    if (dir === undefined) return false
    return scope.home ? listDocuments(this.#config).some(doc => doc.dir === dir) : dir === scope.document
  }

  files(scope: Scope, member: Member): FilesAnswer {
    const files: SourceFile[] = []
    let truncated = false
    const walk = (dir: string, owner: string) => {
      let names: string[]
      try {
        names = readdirSync(join(this.#config.root, dir)).sort()
      } catch {
        return
      }
      for (const name of names) {
        if (NOT_SOURCE.has(name) || name.startsWith('.')) continue
        const path = dir ? `${dir}/${name}` : name
        const found = lstatSync(join(this.#config.root, path), { throwIfNoEntry: false })
        if (!found || found.isSymbolicLink()) continue
        if (found.isDirectory() && documentDirOf(this.#config, `${path}/x`) === owner) {
          walk(path, owner)
        } else if (found.isFile() && this.allows(scope, path, member)) {
          if (files.length >= MAX_FILES) {
            truncated = true
            return
          }
          files.push({ path, ...BINARY.test(name) ? { binary: true as const } : {} })
        }
      }
    }
    for (const root of this.roots(scope)) {
      if (root !== WORKSPACE_FILE) walk(root, root)
      else if (this.allows(scope, root, member) && lstatSync(join(this.#config.root, root), { throwIfNoEntry: false })?.isFile()) files.push({ path: root })
    }
    const documents = scope.home ? listDocuments(this.#config).map(doc => doc.dir) : undefined
    return { document: scope.document, home: scope.home, ...documents ? { documents } : {}, files, ...truncated ? { truncated: true as const } : {} }
  }

  #bytes(scope: Scope, path: string, member: Member): Buffer {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\0') || path.split('/').some(part => part === '' || part === '.' || part === '..' || NOT_SOURCE.has(part))) throw new RequestError(400, `not a source path: ${JSON.stringify(path)}`)
    if (!this.allows(scope, path, member)) throw new RequestError(403, `${path} is not a file this page edits`)
    const file = join(this.#config.root, path)
    let real: string
    try {
      real = realpathSync(file)
    } catch {
      throw new RequestError(404, `no file ${path}`)
    }
    if (real !== file || !lstatSync(file).isFile()) throw new RequestError(403, `${path} is not a regular file of the workspace`)
    const bytes = readFileSync(file)
    if (bytes.byteLength > MAX_SOURCE) throw new RequestError(413, `${path} is larger than the editor opens (${MAX_SOURCE} bytes)`)
    return bytes
  }

  read(scope: Scope, path: string, member: Member): SourceAnswer {
    const bytes = this.#bytes(scope, path, member)
    if (BINARY.test(path) || bytes.includes(0)) throw new RequestError(415, `${path} is not a text file`)
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new RequestError(415, `${path} is not UTF-8 text`)
    }
    return { path, content, version: versionOf(bytes) }
  }

  async save(scope: Scope, path: string, content: string, base: string, member: Member): Promise<string> {
    const document = documentDirOf(this.#config, path)
    const outside = document === undefined
    const release = outside || !this.#locks ? () => {} : this.#locks.claim(document, 'editor:save')
    if (!release) throw lockedError(document!, this.#locks!.holder(document!) ?? '')
    try {
      const bytes = this.#bytes(scope, path, member)
      const now = versionOf(bytes)
      if (now !== base) {
        const conflict: Omit<ConflictAnswer, 'error'> = { conflict: { version: now, content: bytes.toString('utf8') } }
        throw new RequestError(409, `${path} changed since it was opened`, conflict)
      }
      const written = Buffer.from(content, 'utf8')
      if (written.byteLength > MAX_SOURCE) throw new RequestError(413, `the text is larger than the editor saves (${MAX_SOURCE} bytes)`)
      const change: DocumentFileChange = { path, content: written, ...(lstatSync(join(this.#config.root, path)).mode & 0o111) !== 0 ? { executable: true } : {} }
      if (outside) writeChanges(this.#config, [change], true)
      else await this.#writer.write([change])
      return versionOf(written)
    } finally {
      release()
    }
  }

  inScope(scope: Scope, path: string): boolean {
    return this.roots(scope).some(root => root === WORKSPACE_FILE ? path === root : within(path, root))
  }
}
