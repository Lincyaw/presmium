import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { WORKSPACE_CONFIG } from '@lincyaw/compiler'
import { DOCUMENT_ENTRY, validateDocument } from '@lincyaw/kernel'
import type { ConflictAnswer, DocumentFileChange, FilesAnswer, Member, Revision, SavedAnswer, SourceAnswer, SourceFile, SourceTransactionAnswer, SourceTransactionChange } from '@lincyaw/kernel'
import { isWithin } from '../domain/paths.ts'
import { listDocuments } from './config.ts'
import type { FoundDocument, WorkspaceConfig } from './config.ts'
import { RequestError } from './errors.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import { documentDirOf, FilesError, writeChanges } from './writer.ts'
import type { DocumentWriter } from './writer.ts'

export const MAX_SOURCE = 2 << 20
export const MAX_SOURCE_CHANGES = 16
const MAX_FILES = 2000
const HIDDEN_FROM_EDITOR = new Set(['node_modules', 'dist', '.git', '.presmium'])
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|pdf|wasm|zip|gz|tgz|bz2|xz|7z|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|ogg|oga|webm|mov|avi|mkv|bin|so|dylib|dll|exe|pyc|xlsx?|docx?|pptx?|parquet|npy|npz|pkl|db|sqlite)$/i

export function validateDocumentSource(path: string, content: string, before?: Uint8Array): void {
  if (path !== DOCUMENT_ENTRY && !path.endsWith(`/${DOCUMENT_ENTRY}`)) return
  let value: unknown
  try { value = JSON.parse(content) }
  catch { throw new RequestError(422, 'document-invalid', { issues: [{ path: '', code: 'json-syntax', message: 'The document is not valid JSON.', severity: 'error' }] }) }
  const checked = validateDocument(value)
  if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues })
  if (before) {
    let previous: unknown
    try { previous = JSON.parse(Buffer.from(before).toString('utf8')) } catch {}
    if (previous && typeof previous === 'object' && 'id' in previous && typeof previous.id === 'string' && previous.id !== checked.document.id) throw new RequestError(422, 'document-identity-changed')
  }
}

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

export interface SourceTransactionHistory {
  run<T>(work: () => Promise<T>): Promise<T>
  commit(paths: string[], lang: string | undefined): Promise<Revision | undefined>
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
      content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      throw new RequestError(415, `${path} is not UTF-8 text`)
    }
    return { path, content, version: versionOf(bytes) }
  }

  async create(scope: Scope, path: string, member: Member): Promise<SourceAnswer> {
    this.#assertEditable(scope, path, member)
    if (path === DOCUMENT_ENTRY || path.endsWith(`/${DOCUMENT_ENTRY}`)) throw new RequestError(422, 'create-a-document-with-valid-content')
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

  /** Saves related sources as one authoring change; any failed write or commit restores all preimages. */
  async transaction(scope: Scope, changes: SourceTransactionChange[], member: Member, history?: SourceTransactionHistory): Promise<SourceTransactionAnswer> {
    if (changes.length === 0 || changes.length > MAX_SOURCE_CHANGES) throw new RequestError(400, `a source transaction takes 1 to ${MAX_SOURCE_CHANGES} files`)
    const paths = new Set<string>()
    let bytes = 0
    const documents = changes.map(change => {
      this.#assertEditable(scope, change.path, member)
      if (paths.has(change.path)) throw new RequestError(400, `a source path occurs twice: ${change.path}`)
      paths.add(change.path)
      if (BINARY.test(change.path) || change.content.includes('\0')) throw new RequestError(415, `${change.path} is not a text file`)
      bytes += Buffer.byteLength(change.content, 'utf8')
      return this.#documentHolding(change.path)
    })
    if (bytes > MAX_SOURCE) throw new RequestError(413, `the transaction is larger than the editor saves (${MAX_SOURCE} bytes)`)
    for (const path of paths) if ([...paths].some(other => path !== other && path.startsWith(`${other}/`))) throw new RequestError(400, `a source file cannot also be a parent directory: ${path}`)
    const document = documents[0]
    if (!document || documents.some(found => found?.dir !== document.dir)) throw new RequestError(400, 'a source transaction must stay in one document')
    const scopeDir = document.dir
    const release = this.#locks ? this.#locks.claim(scopeDir, 'editor:transaction') : () => {}
    if (!release) throw lockedError(scopeDir, this.#locks!.holder(scopeDir)!)
    const work = async (): Promise<SourceTransactionAnswer> => {
      // Read every preimage before creating directories or writing any file.
      const snapshots = changes.map(change => {
        const written = Buffer.from(change.content, 'utf8')
        if (change.base !== null) {
          const before = this.#readBytes(scope, change.path, member)
          const version = versionOf(before)
          if (version !== change.base) throw new RequestError(409, `${change.path} changed since it was opened`, { conflict: { path: change.path, version, content: before.toString('utf8') } })
          if (BINARY.test(change.path) || before.includes(0)) throw new RequestError(415, `${change.path} is not a text file`)
          try { new TextDecoder('utf-8', { fatal: true }).decode(before) } catch { throw new RequestError(415, `${change.path} is not UTF-8 text`) }
          const executable = (lstatSync(join(this.#config.root, change.path)).mode & 0o111) !== 0
          return { path: change.path, before, written, executable }
        }
        const file = join(this.#config.root, change.path)
        let parent = this.#config.root
        for (const part of change.path.split('/').slice(0, -1)) {
          parent = join(parent, part)
          const found = lstatSync(parent, { throwIfNoEntry: false })
          if (found && (!found.isDirectory() || realpathSync(parent) !== parent)) throw new RequestError(403, `${change.path} has no regular workspace parent`)
          if (!found) break
        }
        if (lstatSync(file, { throwIfNoEntry: false })) throw new RequestError(409, `${change.path} already exists`, { exists: true })
        return { path: change.path, before: undefined, written, executable: false }
      })
      for (const snapshot of snapshots) validateDocumentSource(snapshot.path, snapshot.written.toString('utf8'), snapshot.before)
      const created: string[] = []
      const write = (next: DocumentFileChange[]) => this.#writer.write(next)
      try {
        // Exclusive creation prevents replacing a file created outside serve after validation.
        for (const snapshot of snapshots) if (!snapshot.before) {
          await this.#writer.create(snapshot.path, snapshot.written)
          created.push(snapshot.path)
        }
        const edited = snapshots.filter(snapshot => snapshot.before && !snapshot.written.equals(snapshot.before))
        if (edited.length) await write(edited.map(snapshot => ({ path: snapshot.path, content: snapshot.written, ...snapshot.executable ? { executable: true } : {} })))
        const touched = snapshots.filter(snapshot => !snapshot.before || !snapshot.written.equals(snapshot.before)).map(snapshot => snapshot.path)
        const revision = history && touched.length ? await history.commit(touched, document?.lang) : undefined
        return { versions: snapshots.map(snapshot => ({ path: snapshot.path, version: versionOf(snapshot.written) })), ...revision ? { revision } : {} }
      } catch (error) {
        try {
          await write([
            ...snapshots.flatMap(snapshot => snapshot.before ? [{ path: snapshot.path, content: snapshot.before, ...snapshot.executable ? { executable: true } : {} }] : []),
            ...created.map(path => ({ path, remove: true as const })),
          ])
        } catch (rollback) {
          throw new Error(`source transaction failed (${error instanceof Error ? error.message : String(error)}); restoring sources also failed (${rollback instanceof Error ? rollback.message : String(rollback)})`)
        }
        throw error
      }
    }
    try {
      return await (history ? history.run(work) : work())
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
      validateDocumentSource(path, content, bytes)
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
