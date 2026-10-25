import { redoDepth, undoDepth } from 'prosemirror-history'
import { reportPreview } from '@lincyaw/kernel'
import type { Viewer } from '../viewer-state.ts'

interface BodyEditor {
  undo(): boolean
  redo(): boolean
  focus(): void
  readonly prosemirrorState: Parameters<typeof undoDepth>[0]
  onChange(listener: () => void): () => void
}
interface Entry { editor: BodyEditor, section: string }
interface History { entries: Map<BodyEditor, Entry>, active?: Entry }
const histories = new WeakMap<Viewer, History>()
function history(viewer: Viewer): History {
  let value = histories.get(viewer)
  if (!value) histories.set(viewer, value = { entries: new Map() })
  return value
}
function announce(viewer: Viewer): void {
  const active = history(viewer).active
  reportPreview({ type: 'document-history-state', ...(active ? { section: active.section } : {}), undo: Boolean(active && undoDepth(active.editor.prosemirrorState)), redo: Boolean(active && redoDepth(active.editor.prosemirrorState)) })
}

/** Uses the editor's own public undo stack, independently from saved source revisions. */
export function registerBodyEditor(viewer: Viewer, editor: BodyEditor, section: string): () => void {
  const state = history(viewer), entry = { editor, section }
  state.entries.set(editor, entry)
  const stop = editor.onChange(() => { if (state.active === entry) announce(viewer) })
  return () => {
    stop(); state.entries.delete(editor)
    if (state.active === entry) { state.active = undefined; announce(viewer) }
  }
}
export function activateBodyEditor(viewer: Viewer, editor: BodyEditor): void {
  const state = history(viewer), entry = state.entries.get(editor)
  if (!entry) return
  state.active = entry
  announce(viewer)
}
export function resetDocumentHistory(viewer: Viewer): void {
  history(viewer).active = undefined
  announce(viewer)
}
export function documentHistory(viewer: Viewer, action: 'undo' | 'redo'): boolean {
  const active = history(viewer).active
  if (!active) return false
  const available = action === 'undo' ? undoDepth(active.editor.prosemirrorState) : redoDepth(active.editor.prosemirrorState)
  if (!available) return false
  const handled = active.editor[action]()
  if (handled) active.editor.focus()
  announce(viewer)
  return handled
}
