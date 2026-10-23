import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { WORKSPACE_CONFIG } from '@lincyaw/compiler'
import type { ConflictAnswer, DocumentFileChange, FilesAnswer, Member, Revision, SavedAnswer, SourceAnswer, SourceFile } from '@lincyaw/kernel'
import { isWithin } from '../domain/paths.ts'
import { listDocuments } from './config.ts'
import type { FoundDocument, WorkspaceConfig } from './config.ts'
import { RequestError } from './errors.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import { documentDirOf, FilesError, writeChanges } from './writer.ts'
import type { DocumentWriter } from './writer.ts'

export const MAX_SOURCE = 2 << 20
const MAX_FILES = 2000
const HIDDEN_FROM_EDITOR = new Set(['node_modules', 'dist', '.git', '.presmium'])
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|pdf|wasm|zip|gz|tgz|bz2|xz|7z|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|ogg|oga|webm|mov|avi|mkv|bin|so|dylib|dll|exe|pyc|xlsx?|docx?|pptx?|parquet|npy|npz|pkl|db|sqlite)$/i

export function versionOf(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 20)
}

export interface SourceEditorOptions {
  config: WorkspaceConfig
  writer: DocumentWriter
  locks?: DocumentLocks
}

interface Scope {
  document: string
  home: boolean
}

/** The source files the browser's editor lists, opens, creates and saves, as far as the member and the page's document may. */
export class SourceEditor {
  readonly #config: WorkspaceConfig
  readonly #writer: DocumentWriter
  readonly #locks?: DocumentLocks

  constructor(options: SourceEditorOptions) {
    this.#config = options.config
    this.#writer = options.writer
    this.#locks = options.locks
  }

  scope(document: string): Scope {
    return { document, home: document === '' && !this.#config.singleDeck }
  }

  roots(scope: Scope): string[] {
    if (!scope.home) return [scope.document]
    return ['']
  }

  canEdit(scope: Scope, path: string, member: Member): boolean {
    if (path === WORKSPACE_CONFIG) return (scope.home || (this.#config.singleDeck && scope.document === '')) && member.roles.includes('owner')
    if (scope.home && member.roles.includes('owner')) return true
    const dir = documentDirOf(this.#config, path)
    if (dir === undefined) return scope.home && member.roles.includes('owner')
    return scope.home ? listDocuments(this.#config).some(doc => doc.dir === dir) : dir === scope.document
  }

  files(scope: Scope, member: Member): FilesAnswer {
    const files: SourceFile[] = []
    let truncated = false
    const walk = (dir: string, owner: string | undefined) => {
      let names: string[]
      try {
        names = readdirSync(join(this.#config.root, dir)).sort()
      } catch {
        return
      }
      for (const name of names) {
        if (HIDDEN_FROM_EDITOR.has(name) || name.startsWith('.')) continue
        const path = dir ? `${dir}/${name}` : name
        const found = lstatSync(join(this.#config.root, path), { throwIfNoEntry: false })
        if (!found || found.isSymbolicLink()) continue
        if (found.isDirectory() && (scope.home || documentDirOf(this.#config, `${path}/x`) === owner)) {
          walk(path, owner)
        } else if (found.isFile() && this.canEdit(scope, path, member)) {
          if (files.length >= MAX_FILES) {
            truncated = true
            return
          }
          files.push({ path, ...BINARY.test(name) ? { binary: true as const } : {} })
        }
      }
    }
    walk(scope.home ? '' : scope.document, scope.home ? undefined : scope.document)
    const documents = scope.home ? listDocuments(this.#config).map(doc => doc.dir) : undefined
    return { document: scope.document, home: scope.home, ...documents ? { documents } : {}, files, ...truncated ? { truncated: true as const } : {} }
  }

  #documentHolding(path: string): FoundDocument | undefined {
    return listDocuments(this.#config).sort((a, b) => b.dir.length - a.dir.length).find(doc => isWithin(path, doc.dir))
  }

  #assertEditable(scope: Scope, path: string, member: Member): void {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '' || part === '.' || part === '..' || HIDDEN_FROM_EDITOR.has(part))) throw new RequestError(400, `not a source path: ${JSON.stringify(path)}`)
    if (!this.canEdit(scope, path, member)) throw new RequestError(403, `${path} is not a file this page edits`)
  }

  #readBytes(scope: Scope, path: string, member: Member): Buffer {
    this.#assertEditable(scope, path, member)
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
    const bytes = this.#readBytes(scope, path, member)
    if (BINARY.test(path) || bytes.includes(0)) throw new RequestError(415, `${path} is not a text file`)
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new RequestError(415, `${path} is not UTF-8 text`)
    }
    return { path, content, version: versionOf(bytes) }
  }

  async create(scope: Scope, path: string, member: Member): Promise<SourceAnswer> {
    this.#assertEditable(scope, path, member)
    if (BINARY.test(path)) throw new RequestError(415, `${path} is not a text file`)
    const document = this.#documentHolding(path)?.dir
    const scopeDir = document ?? ''
    const release = this.#locks ? this.#locks.claim(scopeDir, 'editor:create') : () => {}
    if (!release) throw lockedError(scopeDir, this.#locks!.holder(scopeDir)!)
    try {
      await this.#writer.create(path, Buffer.alloc(0), document === undefined)
      return { path, content: '', version: versionOf('') }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new RequestError(409, `${path} already exists`, { exists: true })
      if (error instanceof FilesError) throw new RequestError(403, error.message)
      throw error
    } finally {
      release()
    }
  }

  /**
   * Writes the text over the version the editor opened. `commit` makes a change a revision while the document's lock
   * is still held; when it fails, the file is put back as it was and the save fails.
   */
  async save(scope: Scope, path: string, content: string, base: string, member: Member, commit?: (path: string, lang: string | undefined) => Promise<Revision | undefined>): Promise<SavedAnswer> {
    const document = this.#documentHolding(path)
    const outside = document === undefined
    const scopeDir = document?.dir ?? ''
    const release = this.#locks ? this.#locks.claim(scopeDir, 'editor:save') : () => {}
    if (!release) throw lockedError(scopeDir, this.#locks!.holder(scopeDir)!)
    try {
      const bytes = this.#readBytes(scope, path, member)
      const now = versionOf(bytes)
      if (now !== base) {
        const conflict: Omit<ConflictAnswer, 'error'> = { conflict: { version: now, content: bytes.toString('utf8') } }
        throw new RequestError(409, `${path} changed since it was opened`, conflict)
      }
      const written = Buffer.from(content, 'utf8')
      if (written.byteLength > MAX_SOURCE) throw new RequestError(413, `the text is larger than the editor saves (${MAX_SOURCE} bytes)`)
      const change: DocumentFileChange = { path, content: written, ...(lstatSync(join(this.#config.root, path)).mode & 0o111) !== 0 ? { executable: true } : {} }
      const write = async (next: DocumentFileChange) => (outside ? writeChanges(this.#config, [next], true) : await this.#writer.write([next]))
      await write(change)
      let revision: Revision | undefined
      if (commit && !written.equals(bytes)) {
        try {
          revision = await commit(path, document?.lang)
        } catch (error) {
          await write({ ...change, content: bytes })
          throw error
        }
      }
      return { version: versionOf(written), ...revision ? { revision } : {} }
    } finally {
      release()
    }
  }
}
