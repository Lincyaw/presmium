import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import katex from 'katex'
import { TextSelection } from '@tiptap/pm/state'
import type { BlockNoteEditor } from '@blocknote/core'
import { createReactBlockSpec, createReactInlineContentSpec, SourceBlockWithPreview, SourceInlineContentWithPreview, useSourceBlockPreviewPopup, useSourceInlineContentPreviewPopup } from '@blocknote/react'
import type { Locale } from '../messages.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { MathEditorDialog, MathVisualButton } from './math-editor.tsx'
import { useInlineSourcePopupPlacement } from './popover.tsx'

export const DOCUMENT_EDITOR_LOCALE = createContext<Locale>('zh-CN')
/** Where the host serves the visual formula editor; without it formulas are edited as LaTeX only. */
export const MATH_EDITOR = createContext<string | undefined>(undefined)

/**
 * Edit Visually in a formula's open popup, and the dialog it opens; `write` puts the confirmed LaTeX into the formula.
 * After OK the caret goes past the formula (`leave`), so its popup does not open again; Cancel returns to the popup.
 */
function useVisualMath(editor: BlockNoteEditor<any, any, any>, source: string, write: (latex: string) => void, leave: () => void) {
  const base = useContext(MATH_EDITOR), locale = useContext(DOCUMENT_EDITOR_LOCALE)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [editing, setEditing] = useState(false)
  const confirmed = useRef(false)
  const controls = (open: boolean) => base && editor.isEditable ? <>
    <MathVisualButton anchor={anchor} open={open} locale={locale} onClick={() => { confirmed.current = false; setEditing(true) }} />
    {editing && <MathEditorDialog base={base} initial={source} locale={locale} onClose={() => setEditing(false)}
      onConfirm={latex => { confirmed.current = true; setEditing(false); if (latex !== source) write(latex) }}
      onCloseAutoFocus={event => { event.preventDefault(); if (confirmed.current && !editor.prosemirrorView?.isDestroyed) leave(); else editor.focus() }} />}
  </> : null
  return { anchor: setAnchor, controls }
}

// MathML needs no font assets in the workbench bundle; the viewer typesets the same TeX with the same library.
function typeset(source: string, display: boolean): { html?: string, error?: string } {
  if (!source) return {}
  try { return { html: katex.renderToString(source, { displayMode: display, throwOnError: true, output: 'mathml' }) } }
  catch (error) { return { error: error instanceof Error ? error.message : String(error) } }
}

function useMathPreview(source: string, display: boolean): { preview?: ReactNode, error?: ReactNode, empty: string, invalid: string, placeholder: string } {
  const t = DOCUMENT_EDITOR_MESSAGES[useContext(DOCUMENT_EDITOR_LOCALE)]
  const result = useMemo(() => typeset(source, display), [source, display])
  const lastGood = useRef<string>()
  if (result.html) lastGood.current = result.html
  const html = result.html ?? lastGood.current
  const Element = display ? 'div' : 'span'
  return {
    preview: html ? <Element className={`pm-document-editor__math pm-document-editor__math--${display ? 'display' : 'inline'}`} dangerouslySetInnerHTML={{ __html: html }} /> : undefined,
    error: result.error ? <><strong>{t.mathInvalid}</strong> {result.error}</> : undefined,
    empty: t.mathEmpty, invalid: t.mathInvalid, placeholder: t.mathPlaceholder,
  }
}

/** A typed formula block: its TeX is the block's plain content, edited in BlockNote's source popup. */
export const mathBlock = createReactBlockSpec({
  type: 'presmiumMath',
  propSchema: {},
  content: 'plain',
}, {
  meta: { hasPreview: true, code: true },
  render: function MathBlock({ block, editor, contentRef }) {
    const source = block.content.map(part => part.text).join('')
    const math = useMathPreview(source, true)
    const popup = useSourceBlockPreviewPopup({ editor, block })
    const visual = useVisualMath(editor, source, latex => editor.updateBlock(block.id, { content: latex }), () => {
      popup.close()
      if (!editor.getBlock(block.id)) return
      // The caret goes to the line after the formula; a formula that ends its page gets an empty line to type on.
      const document = editor as BlockNoteEditor<any, any, any>, next = document.getNextBlock(block.id)
      document.setTextCursorPosition(next && next.type !== 'presmiumPage' ? next.id : document.insertBlocks([{ type: 'paragraph' }], block.id, 'after')[0]!.id, 'start')
    })
    const sourceRef = useCallback((element: HTMLElement | null) => { visual.anchor(element); contentRef(element) }, [contentRef])
    return <>
      <SourceBlockWithPreview block={block} editor={editor} contentRef={sourceRef} source={source} preview={math.preview} error={math.error}
        emptySourcePlaceholder={math.empty} errorPreview={math.invalid} sourcePlaceholder={math.placeholder} />
      {visual.controls(popup.isOpen)}
    </>
  },
})()

/** An inline formula inside text; selecting it opens the same source popup. */
export const mathInline = createReactInlineContentSpec({
  type: 'presmiumMathInline',
  propSchema: {},
  content: 'plain',
}, {
  meta: { hasPreview: true, code: true },
  render: function MathInline({ inlineContent, editor, node, getPos, contentRef }) {
    const math = useMathPreview(inlineContent.content, false)
    const { isOpen } = useSourceInlineContentPreviewPopup({ editor, node, getPos })
    const visual = useVisualMath(editor, inlineContent.content, latex => editor.transact(transaction => {
      const position = getPos(), current = position === undefined ? undefined : transaction.doc.nodeAt(position)
      if (position === undefined || current?.type.name !== 'presmiumMathInline') return
      transaction.replaceWith(position + 1, position + current.nodeSize - 1, latex ? transaction.doc.type.schema.text(latex) : [])
    }), () => {
      editor.transact(transaction => {
        const position = getPos(), current = position === undefined ? undefined : transaction.doc.nodeAt(position)
        if (position !== undefined && current?.type.name === 'presmiumMathInline') transaction.setSelection(TextSelection.create(transaction.doc, position + current.nodeSize))
      })
      editor.focus()
    })
    const sourceElement = useRef<HTMLElement | null>(null)
    const sourceRef = useCallback((element: HTMLElement | null) => { sourceElement.current = element; visual.anchor(element); contentRef(element) }, [contentRef])
    useInlineSourcePopupPlacement(useCallback(() => sourceElement.current, []), isOpen)
    return <>
      <SourceInlineContentWithPreview editor={editor} node={node} getPos={getPos} contentRef={sourceRef} source={inlineContent.content} preview={math.preview} error={math.error}
        emptySourcePlaceholder={math.empty} errorPreview={math.invalid} sourcePlaceholder={math.placeholder} />
      {visual.controls(isOpen)}
    </>
  },
})
