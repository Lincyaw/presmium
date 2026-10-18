import { shallowRef, ref } from 'vue'
import type { ChangesAnswer, CommitAnswer, FilesAnswer, SavedAnswer, SourceAnswer, UncommittedFile } from '../domain/api.ts'
import { lockKind, WORKSPACE_FILE } from '../domain/api.ts'
import type { LockKind } from '../domain/api.ts'
import { mergeTexts } from '../domain/merge.ts'
import type { WorkspaceMessages } from '../domain/messages.ts'
import { call, documentsChanged, post, RouteError } from './routes.ts'

export type SourceNotice =
  | { kind: 'locked', by: LockKind }
  | { kind: 'changed', version: string, content: string }
  | { kind: 'merged', conflicts: number }
  | { kind: 'config' }
  | { kind: 'failed', message: string }

export interface OpenFile {
  path: string
  base: string
  version: string
  dirty: boolean
  draft?: string
  notice?: SourceNotice
}

export const editing = ref(false)
export const requested = ref<string>()
export const listing = shallowRef<FilesAnswer>()
export const openFiles = ref<OpenFile[]>([])
export const activePath = ref<string>()
export const cursorLine = ref(1)
export const openFailure = ref<string>()
export const uncommitted = shallowRef<UncommittedFile[]>([])

export interface Reveal {
  path: string
  line: number
  endLine?: number
  mark?: boolean
}
export const reveal = shallowRef<Reveal & { seq: number }>()
let revealed = 0

export interface EditorBridge {
  text(path: string): string | undefined
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

export function textOf(file: OpenFile): string {
  return bridge?.text(file.path) ?? file.draft ?? file.base
}

export function edited(path: string, text: string): void {
  const file = find(path)
  if (file) file.dirty = text !== file.base
}

export async function loadListing(fresh = false): Promise<FilesAnswer | undefined> {
  if (listing.value && !fresh) return listing.value
  try {
    listing.value = await call<FilesAnswer>('files')
  } catch {
  }
  return listing.value
}

export function workspacePath(document: string, file: string): string {
  return document ? `${document}/${file}` : file
}

export function deckPath(document: string, path: string): string | undefined {
  if (!document) return path
  return path.startsWith(`${document}/`) ? path.slice(document.length + 1) : undefined
}

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
    documentsChanged()
  } catch (error) {
    if (error instanceof RouteError && error.locked) file.notice = { kind: 'locked', by: lockKind(error.locked.holder) }
    else if (error instanceof RouteError && error.conflict) file.notice = { kind: 'changed', ...error.conflict }
    else file.notice = { kind: 'failed', message: error instanceof Error ? error.message : String(error) }
  } finally {
    saving.delete(file.path)
  }
}

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
    if (answer.version === file.version || file.version !== known || saving.has(file.path)) continue
    if (!file.dirty) {
      file.base = answer.content
      file.version = answer.version
      file.draft = undefined
      if (file.notice?.kind !== 'config') file.notice = undefined
      bridge?.replace(file.path, answer.content, true)
    } else if (file.notice?.kind !== 'locked' && (file.notice?.kind !== 'changed' || file.notice.version !== answer.version)) {
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

export async function commitChanges(message: string, paths?: string[]): Promise<CommitAnswer> {
  const answer = await post<CommitAnswer>('changes/commit', { message, ...paths ? { paths } : {} })
  documentsChanged()
  return answer
}

export async function discardChanges(paths?: string[]): Promise<CommitAnswer> {
  const answer = await post<CommitAnswer>('changes/discard', paths ? { paths } : {})
  documentsChanged()
  await checkDisk()
  return answer
}
