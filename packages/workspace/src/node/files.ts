import { randomBytes } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, renameSync, rmdirSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DocumentFileChange, DocumentFiles } from '@presmium/kernel'
import { rewriteLinks, within } from '../domain/paths.ts'
import { listDocuments, namedByPatterns } from './config.ts'
import type { WorkspaceConfig } from './config.ts'

export const BUILTIN_TEMPLATES = fileURLToPath(new URL('../../templates/document', import.meta.url))

const NOT_SOURCE = new Set(['node_modules', 'dist', '.git'])

export class FilesError extends Error {}

export interface DocumentWriter extends DocumentFiles {
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
    if (namedByPatterns(config, dir)) return dir
  }
  return undefined
}

function documentDir(config: WorkspaceConfig, dir: string): string {
  if (dir !== '') partsOf(dir)
  if (!namedByPatterns(config, dir)) throw new FilesError(`${dir || '.'} is not a document directory of this workspace`)
  if (!realDirectory(config.root, dir)) throw new FilesError(`the document directory ${dir || '.'} is not there`)
  return dir
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
    if (dir !== undefined) documentDir(config, dir)
    return { change, base: dir ?? '' }
  })
  for (const { change, base } of targets) if ('remove' in change) apply(config.root, base, change)
  for (const { change, base } of targets) if (!('remove' in change)) apply(config.root, base, change)
}

const DECK_CONTENT = new Set(['freeze', 'drawings', 'assets', 'speech', 'speech.lock.json', 'anchors.lock.json'])

export function generatedPath(path: string): boolean {
  const parts = path.split('/')
  const at = parts.indexOf('.presmium')
  return at >= 0 && !DECK_CONTENT.has(parts[at + 1] ?? '')
}

function sourceEntries(dir: string): { path: string, link?: string, executable?: boolean }[] {
  const out: { path: string, link?: string, executable?: boolean }[] = []
  const walk = (current: string, rel: string) => {
    for (const name of readdirSync(current).sort()) {
      if (NOT_SOURCE.has(name)) continue
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

export function templatesDir(config: WorkspaceConfig): string {
  return config.templates ?? BUILTIN_TEMPLATES
}

export function templateOf(config: WorkspaceConfig, name: string): string | undefined {
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return undefined
  const dir = join(templatesDir(config), name)
  return existsSync(dir) && stat(dir)?.isDirectory() ? dir : undefined
}

export function fromTemplate(config: WorkspaceConfig, dir: string, template: string, title: string): void {
  documentDir(config, dir)
  const source = templateOf(config, template)
  if (!source) throw new FilesError(`no document template ${JSON.stringify(template)}`)
  const quoted = JSON.stringify(title).slice(1, -1)
  writeChanges(config, sourceEntries(source).filter(entry => entry.link === undefined).map(({ path, executable }) => {
    const content = readFileSync(join(source, path))
    return { path: `${dir}/${path}`, content: path.endsWith('.md') ? Buffer.from(content.toString('utf8').replaceAll('{{title}}', () => quoted)) : content, ...executable ? { executable } : {} }
  }))
}

export function copyDocument(config: WorkspaceConfig, from: string, to: string): void {
  documentDir(config, from)
  documentDir(config, to)
  writeChanges(config, sourceEntries(join(config.root, from)).map(({ path, link, executable }): DocumentFileChange => {
    if (link !== undefined) return { path: `${to}/${path}`, link }
    const content = readFileSync(join(config.root, from, path))
    if (path.endsWith('.md')) return { path: `${to}/${path}`, content: Buffer.from(rewriteLinks(content.toString('utf8'), `${to}/${path}`, `${from}/${path}`, from, to)) }
    return { path: `${to}/${path}`, content, ...executable ? { executable } : {} }
  }))
}

export function relinkDocuments(config: WorkspaceConfig, from: string, to: string): string[] {
  const changes: DocumentFileChange[] = []
  for (const doc of listDocuments(config)) {
    if (!realDirectory(config.root, doc.dir)) continue
    for (const entry of sourceEntries(join(config.root, doc.dir))) {
      if (entry.link !== undefined || !entry.path.endsWith('.md')) continue
      const path = doc.dir ? `${doc.dir}/${entry.path}` : entry.path
      const was = within(path, to) ? `${from}${path.slice(to.length)}` : path
      const text = readFileSync(join(config.root, path), 'utf8')
      const next = rewriteLinks(text, path, was, from, to)
      if (next !== text) changes.push({ path, content: Buffer.from(next) })
    }
  }
  writeChanges(config, changes)
  return changes.map(change => change.path)
}

export function emptyDocument(config: WorkspaceConfig, dir: string): void {
  documentDir(config, dir)
  const path = join(config.root, dir)
  for (const name of readdirSync(path)) rmSync(join(path, name), { recursive: true, force: true })
}

export function localWriter(config: WorkspaceConfig): DocumentWriter {
  return {
    write: async changes => writeChanges(config, changes),
    template: async (dir, template, title) => fromTemplate(config, dir, template, title),
    copy: async (from, to) => copyDocument(config, from, to),
    relink: async (from, to) => relinkDocuments(config, from, to),
    empty: async dir => emptyDocument(config, dir),
  }
}
