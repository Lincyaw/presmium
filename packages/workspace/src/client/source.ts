/**
 * The source editor's state in this window (P-124, docs/architecture.md
 * 5.11): the files of the page's scope, the files open (each with the text
 * it had on disk when it was opened or last saved, and that text's version),
 * the one shown, the cursor's line, and the changes not committed. A save
 * names the version it changes; the answers it may get keep the author's
 * text: the document is locked (an agent's change under review), or the file
 * changed on disk since (the author merges or reloads). A file not changed
 * in the editor follows the disk by itself. The editor (./editor.ts, loaded
 * with the source pane) holds the texts; it binds itself here.
 */
import { shallowRef, ref } from 'vue'
import type { ChangesAnswer, CommitAnswer, FilesAnswer, SavedAnswer, SourceAnswer, UncommittedFile } from '../domain/api.ts'
import { lockKind, WORKSPACE_FILE } from '../domain/api.ts'
import type { LockKind } from '../domain/api.ts'
import { mergeTexts } from '../domain/merge.ts'
import type { WorkspaceMessages } from '../domain/messages.ts'
import { call, documentsChanged, post, RouteError } from './routes.ts'

/** What the source pane says of a file. */
export type SourceNotice =
  | { kind: 'locked', by: LockKind }
  | { kind: 'changed', version: string, content: string }
  | { kind: 'merged', conflicts: number }
  | { kind: 'config' }
  | { kind: 'failed', message: string }

export interface OpenFile {
  /** Relative to the workspace root. */
  path: string
  /** The text on disk when it was opened, last saved or merged, and its version. */
  base: string
  version: string
  /** The editor's text differs from `base`. */
  dirty: boolean
  /** The editor's text while no editor holds it (edit mode left with the file changed). */
  draft?: string
  notice?: SourceNotice
}

/** Whether the page shows edit mode (the `EDIT_MODE` service's state); on the home page, the source editor. */
export const editing = ref(false)
/** The file a link asked to open (`?edit=<path in the document>`), once the pane is there. */
export const requested = ref<string>()
/** The files of this page's scope (`GET files`). */
export const listing = shallowRef<FilesAnswer>()
export const openFiles = ref<OpenFile[]>([])
export const activePath = ref<string>()
/** The line of the cursor in the file shown. */
export const cursorLine = ref(1)
/** Why a file did not open. */
export const openFailure = ref<string>()
/** This page's files with changes not committed. */
export const uncommitted = shallowRef<UncommittedFile[]>([])

/** A place to show in a file: the cursor goes there; `mark` marks the lines (a block picked in the preview). */
export interface Reveal {
  path: string
  line: number
  endLine?: number
  mark?: boolean
}
export const reveal = shallowRef<Reveal & { seq: number }>()
let revealed = 0

/** How the store reaches the editor's texts. */
export interface EditorBridge {
  text(path: string): string | undefined
  /** Replaces a file's text (an edit the author may undo, unless `fresh`: a text loaded anew). */
  replace(path: string, text: string, fresh: boolean): void
}
let bridge: EditorBridge | undefined

export function bindEditor(editor: EditorBridge): () => void {
  bridge = editor
  return () => {
    if (bridge === editor) bridge = undefined
  }
}

export const find = (path: string | undefined): OpenFile | undefined => openFiles.value.find(file => file.path === path)

/** A file's text as the author has it: the editor's, else the one kept while no editor held it. */
export function textOf(file: OpenFile): string {
  return bridge?.text(file.path) ?? file.draft ?? file.base
}

/** The editor's text of a file changed: whether it differs from the disk's. */
export function edited(path: string, text: string): void {
  const file = find(path)
  if (file) file.dirty = text !== file.base
}

/** The files of this page's scope, read once (again with `fresh`). */
export async function loadListing(fresh = false): Promise<FilesAnswer | undefined> {
  if (listing.value && !fresh) return listing.value
  try {
    listing.value = await call<FilesAnswer>('files')
  } catch {
    // The pane opens what it is asked to all the same.
  }
  return listing.value
}

/** A path of the deck (relative to the document, as the IR's positions name files) relative to the workspace root. */
export function workspacePath(document: string, file: string): string {
  return document ? `${document}/${file}` : file
}

/** A path of the workspace relative to the document; undefined outside it. */
export function deckPath(document: string, path: string): string | undefined {
  if (!document) return path
  return path.startsWith(`${document}/`) ? path.slice(document.length + 1) : undefined
}

/** Opens a file (or shows it, when it is open), at a place in it. */
export async function openFile(path: string, at?: Omit<Reveal, 'path'>): Promise<boolean> {
  openFailure.value = undefined
  if (!find(path)) {
    try {
      const answer = await call<SourceAnswer>(`source?path=${encodeURIComponent(path)}`)
      if (!find(path)) openFiles.value.push({ path, base: answer.content, version: answer.version, dirty: false })
    } catch (error) {
      openFailure.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }
  activePath.value = path
  if (at) reveal.value = { path, ...at, seq: ++revealed }
  return true
}

export function closeFile(path: string): void {
  const index = openFiles.value.findIndex(file => file.path === path)
  if (index < 0) return
  openFiles.value.splice(index, 1)
  if (activePath.value === path) activePath.value = openFiles.value[Math.min(index, openFiles.value.length - 1)]?.path
}

/** Paths being saved: the disk is not compared with them meanwhile. */
const saving = new Set<string>()

export async function saveFile(path = activePath.value): Promise<void> {
  const file = find(path)
  if (!file || saving.has(file.path)) return
  const text = textOf(file)
  saving.add(file.path)
  try {
    const { version } = await post<SavedAnswer>('source', { path: file.path, content: text, base: file.version })
    file.base = text
    file.version = version
    file.dirty = textOf(file) !== text
    file.notice = file.path === WORKSPACE_FILE ? { kind: 'config' } : undefined
    // The changes not committed, the history and the git status follow.
    documentsChanged()
  } catch (error) {
    if (error instanceof RouteError && error.locked) file.notice = { kind: 'locked', by: lockKind(error.locked.holder) }
    else if (error instanceof RouteError && error.conflict) file.notice = { kind: 'changed', ...error.conflict }
    else file.notice = { kind: 'failed', message: error instanceof Error ? error.message : String(error) }
  } finally {
    saving.delete(file.path)
  }
}

/** Takes the disk's text of a file changed there, dropping the editor's. */
export function reloadFile(path: string): void {
  const file = find(path)
  if (file?.notice?.kind !== 'changed') return
  const { content, version } = file.notice
  file.base = content
  file.version = version
  file.dirty = false
  file.draft = undefined
  file.notice = undefined
  bridge?.replace(path, content, true)
}

/** Merges the editor's text with the disk's (git's three-way merge from the text both started from); saving writes it. */
export function mergeFile(path: string, t: WorkspaceMessages): void {
  const file = find(path)
  if (file?.notice?.kind !== 'changed') return
  const { content, version } = file.notice
  const merged = mergeTexts(textOf(file), file.base, content, { mine: t.mergeMine, theirs: t.mergeTheirs })
  file.base = content
  file.version = version
  file.notice = { kind: 'merged', conflicts: merged.conflicts }
  if (bridge) bridge.replace(path, merged.text, false)
  else file.draft = merged.text
  file.dirty = merged.text !== content
}

/**
 * Compares the open files with the disk (after a compilation, when the window
 * comes back, after a commit or a discard): one not changed in the editor
 * takes the disk's text; one changed there says so, for a merge or a reload.
 */
export async function checkDisk(): Promise<void> {
  for (const file of [...openFiles.value]) {
    if (saving.has(file.path)) continue
    const known = file.version
    let answer: SourceAnswer
    try {
      answer = await call<SourceAnswer>(`source?path=${encodeURIComponent(file.path)}`)
    } catch {
      continue
    }
    // Saved or merged meanwhile: the answer may be older than what the file knows.
    if (answer.version === file.version || file.version !== known || saving.has(file.path)) continue
    if (!file.dirty) {
      file.base = answer.content
      file.version = answer.version
      file.draft = undefined
      if (file.notice?.kind !== 'config') file.notice = undefined
      bridge?.replace(file.path, answer.content, true)
    } else if (file.notice?.kind !== 'locked' && (file.notice?.kind !== 'changed' || file.notice.version !== answer.version)) {
      // While the document is locked the notice says to save later; saving again finds the change then.
      file.notice = { kind: 'changed', version: answer.version, content: answer.content }
    }
  }
}

export async function loadUncommitted(): Promise<void> {
  try {
    uncommitted.value = (await call<ChangesAnswer>('changes')).files
  } catch {
    uncommitted.value = []
  }
}

/** Commits this page's changes not committed with the author's message (one commit, `Presmium-Origin: editor`). */
export async function commitChanges(message: string, paths?: string[]): Promise<CommitAnswer> {
  const answer = await post<CommitAnswer>('changes/commit', { message, ...paths ? { paths } : {} })
  documentsChanged()
  return answer
}

/** Writes this page's changes not committed back as committed. */
export async function discardChanges(paths?: string[]): Promise<CommitAnswer> {
  const answer = await post<CommitAnswer>('changes/discard', paths ? { paths } : {})
  documentsChanged()
  await checkDisk()
  return answer
}
