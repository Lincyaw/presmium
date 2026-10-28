import { createContext, useContext, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import katex from 'katex'
import { createReactBlockSpec, createReactInlineContentSpec, SourceBlockWithPreview, SourceInlineContentWithPreview } from '@blocknote/react'
import type { Locale } from '../messages.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'

export const DOCUMENT_EDITOR_LOCALE = createContext<Locale>('zh-CN')

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
    return <SourceBlockWithPreview block={block} editor={editor} contentRef={contentRef} source={source} preview={math.preview} error={math.error}
      emptySourcePlaceholder={math.empty} errorPreview={math.invalid} sourcePlaceholder={math.placeholder} />
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
    return <SourceInlineContentWithPreview editor={editor} node={node} getPos={getPos} contentRef={contentRef} source={inlineContent.content} preview={math.preview} error={math.error}
      emptySourcePlaceholder={math.empty} errorPreview={math.invalid} sourcePlaceholder={math.placeholder} />
  },
})
