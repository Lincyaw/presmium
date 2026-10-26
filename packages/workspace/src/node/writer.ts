import { randomBytes, randomUUID } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, renameSync, rmdirSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { dirname, join } from 'node:path'
import { DOCUMENT_ENTRY, validateDocument } from '@lincyaw/kernel'
import type { DocumentFileChange, DocumentFiles } from '@lincyaw/kernel'
import { isWithin, rewriteLinks } from '../domain/paths.ts'
import { isDocumentDir, listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { findTemplate } from './templates.ts'

const NOT_COPIED = new Set(['node_modules', 'dist', '.git'])

export class FilesError extends Error {}

export interface DocumentWriter extends DocumentFiles {
  create(path: string, content: Uint8Array, outside?: boolean): Promise<void>
  template(dir: string, template: string, title: string): Promise<void>
  copy(from: string, to: string): Promise<void>
  relink(from: string, to: string): Promise<string[]>
  empty(dir: string): Promise<void>
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

export function documentDirOf(config: WorkspaceConfig, path: string): string | undefined {
  const parts = path.split('/')
  for (let i = parts.length - 1; i >= 0; i--) {
    const dir = parts.slice(0, i).join('/')
    if (isDocumentDir(config, dir)) return dir
  }
  return undefined
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
  const targets = changes.map((change) => {
    const parts = partsOf(change.path)
    const dir = documentDirOf(config, parts.join('/'))
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

function sourceEntries(dir: string): { path: string, link?: string, executable?: boolean }[] {
  const out: { path: string, link?: string, executable?: boolean }[] = []
  const walk = (current: string, rel: string) => {
    for (const name of readdirSync(current).sort()) {
      if (NOT_COPIED.has(name)) continue
      if (rel === '.presmium' && !DECK_CONTENT.has(name)) continue
      const path = join(current, name)
      const entry = rel ? `${rel}/${name}` : name
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

function writeTemplate(config: WorkspaceConfig, dir: string, template: string, title: string): void {
  assertDocumentDir(config, dir)
  const source = findTemplate(config, template)
  if (!source) throw new FilesError(`no document template ${JSON.stringify(template)}`)
  const entries = sourceEntries(source).filter(entry => entry.link === undefined)
  if (!entries.some(entry => entry.path === DOCUMENT_ENTRY)) throw new FilesError(`The document template must contain ${DOCUMENT_ENTRY}.`)
  writeChanges(config, entries.map(({ path, executable }) => {
    const content = readFileSync(join(source, path))
    return { path: `${dir}/${path}`, content: path === DOCUMENT_ENTRY ? freshDocument(content, title) : content, ...executable ? { executable } : {} }
  }))
}

/** A copy is a new document; block/section identities remain inside its new namespace. */
function freshDocument(content: Uint8Array, title?: string): Buffer {
  let value: unknown
  try { value = JSON.parse(Buffer.from(content).toString('utf8')) }
  catch { throw new FilesError(`Invalid ${DOCUMENT_ENTRY}: expected a JSON teaching document.`) }
  const validated = validateDocument(value)
  if (!validated.document) throw new FilesError(`Invalid ${DOCUMENT_ENTRY}: ${validated.issues[0]?.message ?? 'document validation failed'}`)
  const document = validated.document
  document.id = randomUUID()
  if (title !== undefined) document.metadata.title = title
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`)
}

function copyDocument(config: WorkspaceConfig, from: string, to: string): void {
  assertDocumentDir(config, from)
  assertDocumentDir(config, to)
  const entries = sourceEntries(join(config.root, from))
  if (!entries.some(entry => entry.path === DOCUMENT_ENTRY)) throw new FilesError(`The copied document must contain ${DOCUMENT_ENTRY}.`)
  writeChanges(config, entries.map(({ path, link, executable }): DocumentFileChange => {
    if (link !== undefined) {
      if (path === DOCUMENT_ENTRY) throw new FilesError('The canonical document entry cannot be a symbolic link when copied.')
      return { path: `${to}/${path}`, link }
    }
    const content = readFileSync(join(config.root, from, path))
    if (path === DOCUMENT_ENTRY) return { path: `${to}/${path}`, content: freshDocument(content) }
    if (path.endsWith('.md')) return { path: `${to}/${path}`, content: Buffer.from(rewriteLinks(content.toString('utf8'), `${to}/${path}`, `${from}/${path}`, from, to)) }
    return { path: `${to}/${path}`, content, ...executable ? { executable } : {} }
  }))
}

function relinkDocuments(config: WorkspaceConfig, from: string, to: string): string[] {
  const changes: DocumentFileChange[] = []
  for (const doc of listDocuments(config)) {
    if (!realDirectory(config.root, doc.dir)) continue
    for (const entry of sourceEntries(join(config.root, doc.dir))) {
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

export function localWriter(config: WorkspaceConfig): DocumentWriter {
  return {
    create: async (path, content, outside) => createFile(config, path, content, outside),
    write: async changes => writeChanges(config, changes),
    template: async (dir, template, title) => writeTemplate(config, dir, template, title),
    copy: async (from, to) => copyDocument(config, from, to),
    relink: async (from, to) => relinkDocuments(config, from, to),
    empty: async dir => emptyDocument(config, dir),
  }
}
