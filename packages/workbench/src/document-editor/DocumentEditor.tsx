import { useMemo, useRef } from 'react'
import type { TeachingDocument } from '@lincyaw/kernel'
import type { Locale } from '../messages.ts'
import { BlockNoteSurface } from './BlockNoteSurface.tsx'
import { DocumentThreadStore } from './comments.ts'
import { createDocumentProjection, nativeDocumentToProduct, rememberDocumentStructure } from './projection.ts'
import { captureRichBaseline } from './rich-text.ts'
import { captureTableIdentities, seedTableIdentities } from './table-identities.ts'
import type { DocumentNodeViews, NativeDocumentEditor } from './schema.tsx'
import type { NativeDocumentSelection } from './selection.ts'

export interface DocumentEditorProps {
  identity: string
  document: TeachingDocument
  reset?: number
  locale: Locale
  readOnly?: boolean
  nodeViews?: DocumentNodeViews
  onChange(document: TeachingDocument): void
  onSelection?(selection: NativeDocumentSelection | undefined): void
  onReady?(editor: NativeDocumentEditor | undefined): void
  onComposition?(composing: boolean): void
  onError?(error: Error): void
  commentsPortal?: HTMLElement | null
}

/** A source version reset replaces the editor; its own save receipts never replace it. */
export function DocumentEditor(props: DocumentEditorProps) {
  const projection = useMemo(() => createDocumentProjection(props.document), [props.identity, props.reset])
  const comments = useMemo(() => new DocumentThreadStore(props.document.comments), [props.identity, props.reset])
  const current = useRef(props), editor = useRef<NativeDocumentEditor>(), unsubscribe = useRef<() => void>()
  current.current = props
  const emit = () => {
    if (!editor.current) return
    try {
      captureTableIdentities(editor.current, projection)
      const document = nativeDocumentToProduct(editor.current.document, projection)
      const threads = comments.snapshot(editor.current)
      if (Object.keys(threads).length) document.comments = threads
      else delete document.comments
      current.current.onChange(document)
    } catch (error) { current.current.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }
  return <BlockNoteSurface identity={props.identity} reset={props.reset} initialContent={projection.content} locale={props.locale} readOnly={props.readOnly}
    comments={comments} commentsPortal={props.commentsPortal} nodeViews={props.nodeViews} onComposition={props.onComposition} onSelection={props.onSelection}
    onChange={emit} onReady={value => {
      unsubscribe.current?.(); unsubscribe.current = undefined
      editor.current = undefined
      if (value) {
        seedTableIdentities(value, projection)
        captureTableIdentities(value, projection)
        captureRichBaseline(value.document, projection)
        rememberDocumentStructure(value.document, projection)
        comments.restoreAnchors(value)
        editor.current = value
        unsubscribe.current = comments.subscribe(emit)
      }
      current.current.onReady?.(value)
    }} />
}
