import { createExtension } from '@blocknote/core'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

function canCopyNativeText(view: EditorView): boolean {
  const selection = view.dom.ownerDocument.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1
    || !selection.anchorNode || !selection.focusNode
    || !view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) return false
  const range = selection.getRangeAt(0)
  let hasTextBlock = false
  for (const element of view.dom.querySelectorAll('[data-content-type]')) {
    if (!range.intersectsNode(element)) continue
    const type = element.getAttribute('data-content-type')
    if (type !== 'paragraph' && type !== 'bulletListItem') return false
    hasTextBlock = true
  }
  if (!hasTextBlock) return false
  for (const element of view.dom.querySelectorAll('[data-inline-content-type]:not([data-inline-content-type="text"]):not([data-inline-content-type="link"]), [data-bn-thread-id], [contenteditable="false"]')) {
    if (range.intersectsNode(element)) return false
  }
  return true
}

/** Plain native text uses the browser's current range; protected nodes keep BlockNote's serializer. */
export const nativeTextClipboard = createExtension({
  key: 'presmium-native-text-clipboard',
  tiptapExtensions: [Extension.create({
    name: 'presmium-native-text-clipboard',
    priority: 1000,
    addProseMirrorPlugins() {
      return [new Plugin({ props: { handleDOMEvents: {
        // Consuming the editor handler without preventDefault retains the browser's clipboard action.
        copy: canCopyNativeText,
        cut: view => view.editable && canCopyNativeText(view),
      } } })]
    },
  })],
})
