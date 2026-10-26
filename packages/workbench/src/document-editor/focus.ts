import type { EditorState, SelectionBookmark, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

interface NativeFieldEditor {
  readonly prosemirrorState: EditorState
  readonly prosemirrorView: EditorView
  transact<T>(callback: (transaction: Transaction) => T): T
  focus(): void
}
export interface DocumentFieldBookmark { content: string, document: unknown, selection: SelectionBookmark }
export interface DocumentFieldFocus {
  capture(): DocumentFieldBookmark | undefined
  restore(bookmark: DocumentFieldBookmark): boolean
}
export interface DocumentFieldRegistration {
  identity: string
  reset: number
  blockId: string
  stepId: string
  narrationId: string
  slot: number
  focus: DocumentFieldFocus
}

/** Only transient native state is carried across a source structure reset, never persisted. */
export function nativeFieldFocus(editor: NativeFieldEditor, content: () => string): DocumentFieldFocus {
  return {
    capture: () => {
      if (!editor.prosemirrorView.hasFocus()) return undefined
      const state = editor.prosemirrorState
      return { content: content(), document: state.doc.toJSON(), selection: state.selection.getBookmark() }
    },
    restore: bookmark => {
      if (bookmark.content !== content()) return false
      const document = editor.prosemirrorState.schema.nodeFromJSON(bookmark.document)
      editor.transact(transaction => {
        transaction.replaceWith(0, transaction.doc.content.size, document.content)
        transaction.setSelection(bookmark.selection.resolve(transaction.doc))
        transaction.setMeta('addToHistory', false)
      })
      editor.focus()
      return true
    },
  }
}
