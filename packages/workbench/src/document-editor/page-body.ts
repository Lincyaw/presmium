import { createExtension } from '@blocknote/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'
import type { NativeDocumentEditor } from './schema.tsx'

// Pages are top-level blocks: doc > blockGroup > blockContainer > (content, children?).
function emptyParagraph(container: Node | null | undefined): boolean {
  return container?.childCount === 1 && container.firstChild!.type.name === 'paragraph' && container.firstChild!.content.size === 0
}

function pageEnds(doc: Node, placeholder: string): DecorationSet {
  const group = doc.firstChild, found: Decoration[] = []
  if (!group) return DecorationSet.empty
  group.forEach((container, offset, index) => {
    const next = index + 1 < group.childCount ? group.child(index + 1) : undefined
    if (!emptyParagraph(container) || next && next.firstChild?.type.name !== 'presmiumPage') return
    const start = 1 + offset + 1
    found.push(Decoration.node(start, start + container.firstChild!.nodeSize, { 'data-page-end': '', 'data-placeholder': placeholder }))
  })
  return DecorationSet.create(doc, found)
}

/**
 * A page's empty last paragraph shows the editor's placeholder even without the caret, so an empty body is visible;
 * Enter at the end of a title goes into that paragraph instead of adding another one before it.
 */
export const documentPageBodies = createExtension(({ editor }: { editor: NativeDocumentEditor }) => ({
  key: 'presmium-document-page-bodies',
  prosemirrorPlugins: [new Plugin<DecorationSet>({
    state: {
      init: (_, state: EditorState) => pageEnds(state.doc, editor.dictionary.placeholders.default ?? ''),
      apply: (transaction, value) => transaction.docChanged ? pageEnds(transaction.doc, editor.dictionary.placeholders.default ?? '') : value,
    },
    props: { decorations(state) { return editor.isEditable ? this.getState(state) : undefined } },
  })],
  keyboardShortcuts: {
    Enter: () => {
      const { selection } = editor.prosemirrorState, { $head } = selection
      if (!editor.isEditable || !selection.empty || $head.parent.type.name !== 'presmiumPage' || $head.parentOffset !== $head.parent.content.size) return false
      const after = $head.after($head.depth - 1)
      if (!emptyParagraph(editor.prosemirrorState.doc.resolve(after).nodeAfter)) return false
      editor.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, after + 2)).scrollIntoView())
      return true
    },
  },
}))

/** The caret at the end of the document: in its empty last paragraph, or in a new one after the last block. */
export function focusDocumentEnd(editor: NativeDocumentEditor): void {
  const last = editor.document.at(-1)
  if (!last) return
  editor.transact(transaction => {
    if (last.type === 'paragraph' && !last.children.length && !last.content.length) editor.setTextCursorPosition(last, 'end')
    else editor.setTextCursorPosition(editor.insertBlocks([{ type: 'paragraph' }], last, 'after')[0]!, 'start')
    transaction.scrollIntoView()
  })
  editor.focus()
}
