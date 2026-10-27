import { randomBytes, randomUUID } from 'node:crypto'
import { closeSync, constants, cpSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, renameSync, rmdirSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DOCUMENT_ENTRY, validateDocument } from '@lincyaw/kernel'
import type { DocumentFileChange, DocumentFiles } from '@lincyaw/kernel'
import { isWithin, rewriteLinks } from '../domain/paths.ts'
import { isDocumentDir, listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { findTemplate } from './templates.ts'

const NOT_COPIED = new Set(['node_modules', 'dist', '.git'])
export const DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES = 16_384
export const DOCUMENT_OPERATION_MAX_BACKUP_BYTES = 512 << 20

export class FilesError extends Error {}
export class DocumentCheckpointRefusal extends FilesError {
  readonly status: number
  readonly detail?: Record<string, unknown>
  constructor(status: number, code: string, detail?: Record<string, unknown>) { super(code); this.status = status; this.detail = detail }
}

export interface DocumentCheckpoint {
  documents: string[]
  readonly recovery: { directory: string }
  restore(): Promise<void>
  dispose(): void
}

export interface DocumentWriter extends DocumentFiles {
  create(path: string, content: Uint8Array, outside?: boolean): Promise<void>
  template(dir: string, template: string, title: string, documentId?: string): Promise<void>
  copy(from: string, to: string, documentId?: string, title?: string): Promise<void>
  relink(from: string, to: string): Promise<string[]>
  empty(dir: string): Promise<void>
  checkpoint(dirs: string[], relink?: { from: string, to: string }, files?: string[]): Promise<DocumentCheckpoint>
}

function partsOf(path: unknown): string[] {
  if (typeof path !== 'string' || !path || path.includes('\0') || path.startsWith('/')) throw new FilesError(`not a path in the workspace: ${JSON.stringify(path)}`)
  const parts = path.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) throw new FilesError(`not a plain path: ${path}`)
  if (parts.some(part => part.toLowerCase() === '.git')) throw new FilesError(`a path in a git directory: ${path}`)
  return parts
}

function stat(path: string): Stats | undefined {
  try {
    return lstatSync(path)
  } catch {
    return undefined
  }
}

function realDirectory(root: string, dir: string): boolean {
  let current = root
  for (const part of dir ? dir.split('/') : []) {
    current = join(current, part)
    if (!stat(current)?.isDirectory()) return false
  }
  return stat(current)?.isDirectory() ?? false
}

export function documentDirOf(config: WorkspaceConfig, path: string, entries?: ReadonlySet<string>): string | undefined {
  const parts = path.split('/'), parent = parts.slice(0, -1).join('/')
  // An explicit entry can create a new document before it owns ordinary files.
  if (parts.at(-1) === DOCUMENT_ENTRY && isDocumentDir(config, parent)) return parent
  let prospective: string | undefined
  for (let i = parts.length - 1; i >= 0; i--) {
    const dir = parts.slice(0, i).join('/')
    if (!isDocumentDir(config, dir)) continue
    prospective ??= dir
    if (entries?.has(dir) || stat(join(config.root, dir, DOCUMENT_ENTRY))?.isFile()) return dir
  }
  return prospective
}

function assertDocumentDir(config: WorkspaceConfig, dir: string): void {
  if (dir !== '') partsOf(dir)
  if (!isDocumentDir(config, dir)) throw new FilesError(`${dir || '.'} is not a document directory of this workspace`)
  if (!realDirectory(config.root, dir)) throw new FilesError(`the document directory ${dir || '.'} is not there`)
}

export function makeDocumentDir(root: string, dir: string): void {
  const path = join(root, dir)
  mkdirSync(dirname(path), { recursive: true })
  mkdirSync(path)
}

function madeParent(root: string, base: string, parts: string[]): string {
  let current = join(root, base)
  const start = base ? base.split('/').length : 0
  for (const part of parts.slice(start, -1)) {
    current = join(current, part)
    const found = stat(current)
    if (found?.isDirectory()) continue
    if (found) rmSync(current, { force: true })
    mkdirSync(current)
  }
  return current
}

function existingParent(root: string, base: string, parts: string[]): string | undefined {
  let current = join(root, base)
  const start = base ? base.split('/').length : 0
  for (const part of parts.slice(start, -1)) {
    current = join(current, part)
    if (!stat(current)?.isDirectory()) return undefined
  }
  return current
}

function replace(parent: string, target: string, make: (temporary: string) => void): void {
  const temporary = join(parent, `.presmium-write-${randomBytes(6).toString('hex')}`)
  make(temporary)
  try {
    const found = stat(target)
    if (found?.isDirectory()) rmSync(target, { recursive: true, force: true })
    renameSync(temporary, target)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

function prune(root: string, base: string, from: string): void {
  const top = join(root, base)
  for (let dir = from; dir !== top && dir.startsWith(`${top}/`); dir = join(dir, '..')) {
    try {
      if (readdirSync(dir).length > 0) return
      rmdirSync(dir)
    } catch {
      return
    }
  }
}

function apply(root: string, base: string, change: DocumentFileChange): void {
  const parts = partsOf(change.path)
  const name = parts.at(-1)!
  if ('remove' in change) {
    const parent = existingParent(root, base, parts)
    if (!parent || !stat(join(parent, name))) return
    rmSync(join(parent, name), { recursive: true, force: true })
    prune(root, base, parent)
    return
  }
  const parent = madeParent(root, base, parts)
  const target = join(parent, name)
  if ('link' in change) {
    if (typeof change.link !== 'string' || !change.link || change.link.includes('\0')) throw new FilesError(`not a link target: ${change.path}`)
    replace(parent, target, temporary => symlinkSync(change.link, temporary))
    return
  }
  if (change.at !== undefined) {
    writeAt(parent, target, change.content, change.at)
    return
  }
  replace(parent, target, temporary => writeFileSync(temporary, change.content, { flag: 'wx', mode: change.executable ? 0o777 : 0o666 }))
}

function writeAt(parent: string, target: string, content: Uint8Array, at: number): void {
  if (!Number.isSafeInteger(at) || at < 0) throw new FilesError(`not a position in a file: ${at}`)
  if (!stat(target)?.isFile()) replace(parent, target, temporary => writeFileSync(temporary, '', { flag: 'wx', mode: 0o666 }))
  const fd = openSync(target, constants.O_WRONLY | constants.O_NOFOLLOW)
  try {
    const size = fstatSync(fd).size
    if (at > size) throw new FilesError(`position ${at} is past the end of the file (${size} bytes)`)
    writeSync(fd, content, 0, content.byteLength, at)
  } finally {
    closeSync(fd)
  }
}

export function writeChanges(config: WorkspaceConfig, changes: DocumentFileChange[], outside = false): void {
  const prepared = changes.map(change => ({ change, parts: partsOf(change.path) }))
  const entries = new Set(prepared.filter(({ change, parts }) => 'content' in change && parts.at(-1) === DOCUMENT_ENTRY).map(({ parts }) => parts.slice(0, -1).join('/')))
  const targets = prepared.map(({ change, parts }) => {
    const dir = documentDirOf(config, parts.join('/'), entries)
    if (dir === undefined && !outside) throw new FilesError(`${change.path} is in no document directory`)
    if (!outside && dir !== undefined) assertDocumentDir(config, dir)
    return { change, base: outside ? '' : dir ?? '' }
  })
  for (const { change, base } of targets) if ('remove' in change) apply(config.root, base, change)
  for (const { change, base } of targets) if (!('remove' in change)) apply(config.root, base, change)
}

function createFile(config: WorkspaceConfig, path: string, content: Uint8Array, outside = false): void {
  const parts = partsOf(path)
  const dir = documentDirOf(config, path)
  if (dir === undefined && !outside) throw new FilesError(`${path} is in no document directory`)
  if (!outside && dir !== undefined) assertDocumentDir(config, dir)
  const base = outside ? '' : dir ?? ''
  let parent = join(config.root, base)
  for (const part of parts.slice(base ? base.split('/').length : 0, -1)) {
    parent = join(parent, part)
    const found = stat(parent)
    if (found && !found.isDirectory()) throw new FilesError(`${parent} is not a directory of the workspace`)
    if (!found) mkdirSync(parent)
  }
  writeFileSync(join(parent, parts.at(-1)!), content, { flag: 'wx' })
}

const DECK_CONTENT = new Set(['freeze', 'drawings', 'assets', 'speech', 'speech.lock.json', 'anchors.lock.json'])

export function isGeneratedPath(path: string): boolean {
  const parts = path.split('/')
  const at = parts.indexOf('.presmium')
  return at >= 0 && !DECK_CONTENT.has(parts[at + 1] ?? '')
}

export function documentSourceEntries(dir: string, onEntry?: () => void): { path: string, link?: string, executable?: boolean }[] {
  const out: { path: string, link?: string, executable?: boolean }[] = []
  const walk = (current: string, rel: string) => {
    for (const name of readdirSync(current).sort()) {
      if (NOT_COPIED.has(name)) continue
      if (rel === '.presmium' && !DECK_CONTENT.has(name)) continue
      const path = join(current, name)
      const entry = rel ? `${rel}/${name}` : name
      onEntry?.()
      const found = stat(path)
      if (!found) continue
      if (found.isSymbolicLink()) out.push({ path: entry, link: readlinkSync(path) })
      else if (found.isDirectory()) walk(path, entry)
      else if (found.isFile()) out.push({ path: entry, executable: (found.mode & 0o111) !== 0 })
    }
  }
  if (stat(dir)?.isDirectory()) walk(dir, '')
  return out
}

function writeTemplate(config: WorkspaceConfig, dir: string, template: string, title: string, documentId?: string): void {
  assertDocumentDir(config, dir)
  const source = findTemplate(config, template)
  if (!source) throw new FilesError(`no document template ${JSON.stringify(template)}`)
  const entries = documentSourceEntries(source).filter(entry => entry.link === undefined)
  if (!entries.some(entry => entry.path === DOCUMENT_ENTRY)) throw new FilesError(`The document template must contain ${DOCUMENT_ENTRY}.`)
  writeChanges(config, entries.map(({ path, executable }) => {
    const content = readFileSync(join(source, path))
    return { path: `${dir}/${path}`, content: path === DOCUMENT_ENTRY ? freshDocument(content, title, documentId) : content, ...executable ? { executable } : {} }
  }))
}

/** A copy is a new document; block/section identities remain inside its new namespace. */
function freshDocument(content: Uint8Array, title?: string, documentId?: string): Buffer {
  let value: unknown
  try { value = JSON.parse(Buffer.from(content).toString('utf8')) }
  catch { throw new FilesError(`Invalid ${DOCUMENT_ENTRY}: expected a JSON teaching document.`) }
  const validated = validateDocument(value)
  if (!validated.document) throw new FilesError(`Invalid ${DOCUMENT_ENTRY}: ${validated.issues[0]?.message ?? 'document validation failed'}`)
  const document = validated.document
  document.id = documentId ?? randomUUID()
  if (title !== undefined) {
    document.metadata.title = title
    for (const section of Object.values(document.sections)) if (section.title === '{{title}}') section.title = title
  }
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`)
}

function copyDocument(config: WorkspaceConfig, from: string, to: string, documentId?: string, title?: string): void {
  assertDocumentDir(config, from)
  assertDocumentDir(config, to)
  const entries = documentSourceEntries(join(config.root, from))
  if (!entries.some(entry => entry.path === DOCUMENT_ENTRY)) throw new FilesError(`The copied document must contain ${DOCUMENT_ENTRY}.`)
  writeChanges(config, entries.map(({ path, link, executable }): DocumentFileChange => {
    if (link !== undefined) {
      if (path === DOCUMENT_ENTRY) throw new FilesError('The canonical document entry cannot be a symbolic link when copied.')
      return { path: `${to}/${path}`, link }
    }
    const content = readFileSync(join(config.root, from, path))
    if (path === DOCUMENT_ENTRY) return { path: `${to}/${path}`, content: freshDocument(content, title, documentId) }
    if (path.endsWith('.md')) return { path: `${to}/${path}`, content: Buffer.from(rewriteLinks(content.toString('utf8'), `${to}/${path}`, `${from}/${path}`, from, to)) }
    return { path: `${to}/${path}`, content, ...executable ? { executable } : {} }
  }))
}

function relinkDocuments(config: WorkspaceConfig, from: string, to: string): string[] {
  const changes: DocumentFileChange[] = []
  for (const doc of listDocuments(config)) {
    if (!realDirectory(config.root, doc.dir)) continue
    for (const entry of documentSourceEntries(join(config.root, doc.dir))) {
      if (entry.link !== undefined || !entry.path.endsWith('.md')) continue
      const path = doc.dir ? `${doc.dir}/${entry.path}` : entry.path
      const was = isWithin(path, to) ? `${from}${path.slice(to.length)}` : path
      const text = readFileSync(join(config.root, path), 'utf8')
      const next = rewriteLinks(text, path, was, from, to)
      if (next !== text) changes.push({ path, content: Buffer.from(next) })
    }
  }
  writeChanges(config, changes)
  return changes.map(change => change.path)
}

function emptyDocument(config: WorkspaceConfig, dir: string): void {
  assertDocumentDir(config, dir)
  const path = join(config.root, dir)
  for (const name of readdirSync(path)) rmSync(join(path, name), { recursive: true, force: true })
}

/** Temporary filesystem preimages belong to this writer, never to the canonical document or git index. */
function checkpoint(config: WorkspaceConfig, dirs: string[], relink?: { from: string, to: string }, extraFiles: string[] = []): DocumentCheckpoint {
  const inspect = (path: string): Stats | undefined => {
    try { return lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  }
  const targets = new Set([...dirs, ...extraFiles])
  const tooLarge = () => new DocumentCheckpointRefusal(413, 'project-backup-limit', { maxBackupEntries: DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES, maxBackupBytes: DOCUMENT_OPERATION_MAX_BACKUP_BYTES })
  for (const dir of dirs) {
    try { partsOf(dir) } catch (error) { if (error instanceof FilesError) throw new DocumentCheckpointRefusal(400, 'project-directory-invalid'); throw error }
    let parent = config.root
    for (const part of dir.split('/')) {
      parent = join(parent, part)
      const found = inspect(parent)
      if (!found) break
      if (!found.isDirectory()) throw new DocumentCheckpointRefusal(409, 'project-directory-unavailable')
      if (inspect(join(parent, '.git'))) throw new DocumentCheckpointRefusal(409, 'project-nested-repository')
    }
  }
  for (const file of extraFiles) {
    const parts = partsOf(file); let parent = config.root
    for (const part of parts.slice(0, -1)) { parent = join(parent, part); const found = inspect(parent); if (!found) break; if (!found.isDirectory()) throw new DocumentCheckpointRefusal(409, 'project-directory-unavailable'); if (inspect(join(parent, '.git'))) throw new DocumentCheckpointRefusal(409, 'project-nested-repository') }
  }
  // Preserve the existing legacy link writer's exact affected files on a failed rename.
  if (relink) for (const doc of listDocuments(config)) {
    if (!realDirectory(config.root, doc.dir)) continue
    for (const entry of documentSourceEntries(join(config.root, doc.dir))) {
      const path = doc.dir ? `${doc.dir}/${entry.path}` : entry.path
      if (entry.link !== undefined || !path.endsWith('.md') || dirs.some(dir => isWithin(path, dir))) continue
      if ((inspect(join(config.root, path))?.size ?? 0) > DOCUMENT_OPERATION_MAX_BACKUP_BYTES) throw tooLarge()
      const text = readFileSync(join(config.root, path), 'utf8')
      if (rewriteLinks(text, path, path, relink.from, relink.to) !== text) targets.add(path)
    }
  }
  let files = 0, bytes = 0
  const measure = (path: string) => {
    const found = inspect(path)
    if (!found) return
    if (++files > DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES || (bytes += found.isDirectory() ? 0 : found.size) > DOCUMENT_OPERATION_MAX_BACKUP_BYTES) throw tooLarge()
    if (found.isDirectory()) for (const name of readdirSync(path)) {
      if (name === '.git') throw new DocumentCheckpointRefusal(409, 'project-nested-repository')
      measure(join(path, name))
    }
    else if (!found.isFile() && !found.isSymbolicLink()) throw new DocumentCheckpointRefusal(409, 'project-file-kind-unavailable')
  }
  for (const path of targets) measure(join(config.root, path))
  const backup = mkdtempSync(join(tmpdir(), 'presmium-document-checkpoint-'))
  const copy = (from: string, to: string) => cpSync(from, to, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true, mode: constants.COPYFILE_FICLONE })
  const entries: { path: string, saved?: string }[] = [], parents = new Set<string>()
  try {
    for (const path of targets) {
      const parts = partsOf(path)
      for (let i = 1; i < parts.length; i++) { const parent = parts.slice(0, i).join('/'); if (!inspect(join(config.root, parent))) parents.add(parent) }
      const saved = inspect(join(config.root, path)) ? join(backup, String(entries.length)) : undefined
      if (saved) copy(join(config.root, path), saved)
      entries.push({ path, saved })
    }
    writeFileSync(join(backup, 'recovery.json'), JSON.stringify({ workspace: config.root, entries: entries.map(({ path, saved }) => ({ path, saved: saved ? saved.slice(backup.length + 1) : null })) }) + '\n', { mode: 0o600 })
  } catch (error) { rmSync(backup, { recursive: true, force: true }); throw error }
  let restoreFailed = false
  return {
    documents: [...new Set([...dirs, ...[...targets].filter(path => !dirs.includes(path)).flatMap(path => documentDirOf(config, path) ?? [])])],
    recovery: { directory: backup },
    async restore() {
      try {
        for (const { path } of entries) rmSync(join(config.root, path), { recursive: true, force: true })
        for (const { path, saved } of entries) if (saved) {
          madeParent(config.root, '', partsOf(path))
          copy(saved, join(config.root, path))
        }
        for (const path of [...parents].sort((a, b) => b.split('/').length - a.split('/').length)) {
          try { rmdirSync(join(config.root, path)) } catch { /* A concurrently added external file is never removed. */ }
        }
      } catch (error) { restoreFailed = true; throw error }
    },
    dispose() { if (!restoreFailed) rmSync(backup, { recursive: true, force: true }) },
  }
}

export function localWriter(config: WorkspaceConfig): DocumentWriter {
  return {
    create: async (path, content, outside) => createFile(config, path, content, outside),
    write: async changes => writeChanges(config, changes),
    template: async (dir, template, title, documentId) => writeTemplate(config, dir, template, title, documentId),
    copy: async (from, to, documentId, title) => copyDocument(config, from, to, documentId, title),
    relink: async (from, to) => relinkDocuments(config, from, to),
    empty: async dir => emptyDocument(config, dir),
    checkpoint: async (dirs, relink, files) => checkpoint(config, dirs, relink, files),
  }
}
