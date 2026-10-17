/**
 * Writing in a workspace's document directories (WP-91, docs/architecture.md
 * 10.7): the one way the workspace changes what is inside them. In LOCAL
 * mode this process writes; in SHARED mode agent-host does, as the
 * sandbox's uid (`DocumentWriter` over its `/v1/files`), so serve writes
 * nothing where the sandbox may write, and a link the sandbox planted leads
 * nowhere the sandbox could not write itself.
 *
 * A path is relative to the workspace root and lies in a document directory:
 * a directory the configuration's patterns name, there as a real directory
 * (no link on the way from the root); no part of it is `.git`. Inside the
 * document directory, a link or a file where a directory belongs is
 * replaced by the directory; a file is written beside its place and renamed
 * over it, so a link at its place is replaced rather than followed (a piece
 * written at a position goes into the file there, opened without following
 * a link; a link in its place becomes an empty file first). Copies and
 * templates take regular files and links, never what a link points to.
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, chownSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, renameSync, rmdirSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DocumentFileChange, DocumentFiles } from '@presmium/kernel'
import { rewriteLinks, within } from '../domain/paths.ts'
import { listDocuments, namedByPatterns } from './config.ts'
import type { WorkspaceConfig } from './config.ts'

/** The document templates installed with Presmium (`templates/document/<name>/`). */
export const BUILTIN_TEMPLATES = fileURLToPath(new URL('../../../../templates/document', import.meta.url))

/** Directories of a document that are not its source (outputs, caches, dependencies). */
const NOT_SOURCE = new Set(['node_modules', 'dist', '.git'])

/** A path the writer refuses: the request's fault. */
export class FilesError extends Error {}

/**
 * The writes of the workspace's document operations and reverts: the
 * changes of `DOCUMENT_FILES`, and a document made from a template, copied,
 * its Markdown's links following a move, or emptied.
 */
export interface DocumentWriter extends DocumentFiles {
  /** Fills the (empty) document directory `dir` from the template `template`, its title in its Markdown. */
  template(dir: string, template: string, title: string): Promise<void>
  /** Copies the source of document `from` into the (empty) document directory `to`; its relative links point where they did. */
  copy(from: string, to: string): Promise<void>
  /** Rewrites the relative links of every document's Markdown after `from` moved to `to`; returns the files changed. */
  relink(from: string, to: string): Promise<string[]>
  /** Removes everything in the document directory `dir`, which stays. */
  empty(dir: string): Promise<void>
}

/** The parts of a path relative to the root: no empty, `.` or `..` part, no `.git`, no NUL. */
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

/** Whether `dir` (relative to the root) is there as a directory, with no link on the way from the root. */
function realDirectory(root: string, dir: string): boolean {
  let current = root
  for (const part of dir ? dir.split('/') : []) {
    current = join(current, part)
    if (!stat(current)?.isDirectory()) return false
  }
  return stat(current)?.isDirectory() ?? false
}

/** The document directory a path lies in: the deepest of its directories the patterns name; undefined for none. */
export function documentDirOf(config: WorkspaceConfig, path: string): string | undefined {
  const parts = path.split('/')
  for (let i = parts.length - 1; i >= 0; i--) {
    const dir = parts.slice(0, i).join('/')
    if (namedByPatterns(config, dir)) return dir
  }
  return undefined
}

/** A document directory to write in: named by the patterns, there as a real directory. */
function documentDir(config: WorkspaceConfig, dir: string): string {
  if (dir !== '') partsOf(dir)
  if (!namedByPatterns(config, dir)) throw new FilesError(`${dir || '.'} is not a document directory of this workspace`)
  if (!realDirectory(config.root, dir)) throw new FilesError(`the document directory ${dir || '.'} is not there`)
  return dir
}

/** The directory a file of `parts` goes in, made inside `base` (relative to the root): what is in the way of a directory is replaced. */
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

/** The directory of a file of `parts` inside `base` when it is there as a real directory; undefined otherwise. */
function existingParent(root: string, base: string, parts: string[]): string | undefined {
  let current = join(root, base)
  const start = base ? base.split('/').length : 0
  for (const part of parts.slice(start, -1)) {
    current = join(current, part)
    if (!stat(current)?.isDirectory()) return undefined
  }
  return current
}

/** Puts `make` (which creates a new entry at the path it is given) at `target`: beside it first, then renamed over it. */
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

/** Removes the directories a removal left empty, from `from` up to (not including) the document directory. */
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

/** Applies one change inside `base` (a document directory, or in serve's own part of the workspace the root). */
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

/** Writes `content` at byte `at` of the file `target` (no gap): anything but a file in its place becomes an empty file first. */
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

/**
 * Writes changes of document directories (`DOCUMENT_FILES`). With
 * `outside`, a path in no document directory is written too, relative to the
 * root: serve's own files (a revert of an allowed write outside the
 * documents); never what agent-host is asked.
 */
export function writeChanges(config: WorkspaceConfig, changes: DocumentFileChange[], outside = false): void {
  // Every path is checked before anything is written.
  const targets = changes.map((change) => {
    const parts = partsOf(change.path)
    const dir = documentDirOf(config, parts.join('/'))
    if (dir === undefined && !outside) throw new FilesError(`${change.path} is in no document directory`)
    if (dir !== undefined) documentDir(config, dir)
    return { change, base: dir ?? '' }
  })
  // Removals first: a link or directory that goes may stand where a written file's directory comes.
  for (const { change, base } of targets) if ('remove' in change) apply(config.root, base, change)
  for (const { change, base } of targets) if (!('remove' in change)) apply(config.root, base, change)
}

/** The source files of a directory (absolute), relative to it: regular files and links, outputs and caches left out (the anchor lock of `.presmium/` stays). */
function sourceEntries(dir: string): { path: string, link?: string, executable?: boolean }[] {
  const out: { path: string, link?: string, executable?: boolean }[] = []
  const walk = (current: string, rel: string) => {
    for (const name of readdirSync(current).sort()) {
      if (NOT_SOURCE.has(name)) continue
      const path = join(current, name)
      const entry = rel ? `${rel}/${name}` : name
      const found = stat(path)
      if (!found) continue
      if (name === '.presmium' && !rel) {
        if (stat(join(path, 'anchors.lock.json'))?.isFile()) out.push({ path: `${name}/anchors.lock.json` })
        continue
      }
      if (found.isSymbolicLink()) out.push({ path: entry, link: readlinkSync(path) })
      else if (found.isDirectory()) walk(path, entry)
      else if (found.isFile()) out.push({ path: entry, executable: (found.mode & 0o111) !== 0 })
    }
  }
  if (stat(dir)?.isDirectory()) walk(dir, '')
  return out
}

/** The directory of the templates: the workspace's `templates`, else Presmium's. */
export function templatesDir(config: WorkspaceConfig): string {
  return config.templates ?? BUILTIN_TEMPLATES
}

/** The template directory of a name; undefined for a name that is no template. */
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
    return { path: `${dir}/${path}`, content: path.endsWith('.md') ? Buffer.from(content.toString('utf8').replaceAll('{{title}}', quoted)) : content, ...executable ? { executable } : {} }
  }))
}

export function copyDocument(config: WorkspaceConfig, from: string, to: string): void {
  documentDir(config, from)
  documentDir(config, to)
  writeChanges(config, sourceEntries(join(config.root, from)).map(({ path, link, executable }): DocumentFileChange => {
    if (link !== undefined) return { path: `${to}/${path}`, link }
    const content = readFileSync(join(config.root, from, path))
    // Links out of the copy point where they pointed from the original.
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

/**
 * The files and directories under `dir` that this process owns, given the
 * group of `dir` and made readable and writable for it (directories setgid
 * too), links not followed: agent-host's agent writes some files for its
 * owner alone (DeepSeek Harness's atomic writes, made elsewhere and renamed
 * in), which serve, in the documents' group, must read to review and commit
 * them (the compose layout, docs/architecture.md 10.5).
 */
export function shareTree(dir: string): void {
  const uid = process.getuid?.()
  const gid = stat(dir)?.gid
  if (gid === undefined) return
  const visit = (path: string, top: boolean) => {
    const found = stat(path)
    if (!found || found.isSymbolicLink()) return
    const mine = found.uid === uid
    try {
      if (mine && !top && (found.isDirectory() || found.isFile())) {
        if (found.gid !== gid) chownSync(path, -1, gid)
        const wanted = found.isDirectory() ? 0o2070 : 0o060
        if ((found.mode & wanted) !== wanted) chmodSync(path, (found.mode & 0o7777) | wanted)
      }
      if (found.isDirectory()) for (const name of readdirSync(path)) if (name !== '.git') visit(join(path, name), false)
    } catch {
      // Gone meanwhile, or not ours to change: the next time.
    }
  }
  visit(dir, true)
}

/** The writer in this process (LOCAL mode, and agent-host's own). */
export function localWriter(config: WorkspaceConfig): DocumentWriter {
  return {
    write: async changes => writeChanges(config, changes),
    template: async (dir, template, title) => fromTemplate(config, dir, template, title),
    copy: async (from, to) => copyDocument(config, from, to),
    relink: async (from, to) => relinkDocuments(config, from, to),
    empty: async dir => emptyDocument(config, dir),
  }
}

/** A change as JSON (`/v1/files`): the content in base64. */
export type WireChange = { path: string, content: string, executable?: boolean, at?: number } | { path: string, link: string } | { path: string, remove: true }

export function toWire(change: DocumentFileChange): WireChange {
  if ('content' in change) return { path: change.path, content: Buffer.from(change.content).toString('base64'), ...change.executable ? { executable: true } : {}, ...change.at !== undefined ? { at: change.at } : {} }
  return change
}

export function fromWire(value: unknown): DocumentFileChange {
  const change = value as Record<string, unknown> | null
  if (!change || typeof change !== 'object' || typeof change.path !== 'string') throw new FilesError('a change: { path, content | link | remove }')
  if (change.remove === true) return { path: change.path, remove: true }
  if (typeof change.link === 'string') return { path: change.path, link: change.link }
  if (typeof change.content === 'string') return { path: change.path, content: Buffer.from(change.content, 'base64'), ...change.executable === true ? { executable: true } : {}, ...typeof change.at === 'number' ? { at: change.at } : {} }
  throw new FilesError(`a change of ${change.path} without content, link or remove`)
}
