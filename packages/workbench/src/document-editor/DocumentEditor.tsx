import { useMemo, useRef } from 'react'
import type { TeachingDocument } from '@lincyaw/kernel'
import type { Locale } from '../messages.ts'
import { BlockNoteSurface } from './BlockNoteSurface.tsx'
import { DocumentThreadStore } from './comments.ts'
import { createDocumentProjection, nativeDocumentToProduct, rememberDocumentStructure } from './projection.ts'
import { captureRichBaseline } from './rich-text.ts'
import { captureTableIdentities, seedTableIdentities } from './table-identities.ts'
import type { DocumentNodeViews, NativeDocumentEditor } from './schema.tsx'
import { nativeEditingCursor } from './selection.ts'
import type { NativeDocumentSelection } from './selection.ts'

export interface DocumentEditingPosition {
  nativeBlockId: string
  sectionId: string
  position: number
}

export interface DocumentEditorProps {
  identity: string
  document: TeachingDocument
  /** Read sibling field edits before their React render has committed. */
  getDocument?(): TeachingDocument | undefined
  /** Ownership of a deferred native focus notification. */
  getPositionToken?(): string
  /** Display-only URL resolution; native block URLs keep their canonical source locations. */
  resolveAssetURL?(location: string): Promise<string>
  reset?: number
  locale: Locale
  readOnly?: boolean
  nodeViews?: DocumentNodeViews
  onChange(document: TeachingDocument): void
  onSelection?(selection: NativeDocumentSelection | undefined): void
  onEditingPosition?(position: DocumentEditingPosition, editor: NativeDocumentEditor): void
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
  const projectedDocument = useRef<NativeDocumentEditor['prosemirrorState']['doc']>()
  const focusFrame = useRef<number>()
  const binding = useRef(projection)
  const active = useRef(projection)
  active.current = projection
  current.current = props
  const cancelFocus = () => { if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current); focusFrame.current = undefined }
  const reportPosition = () => {
    const value = editor.current
    if (!value || current.current.readOnly || !current.current.onEditingPosition || binding.current !== projection || active.current !== projection || value.prosemirrorView.isDestroyed || value.prosemirrorState.doc !== projectedDocument.current) return
    try {
      const cursor = nativeEditingCursor(value)
      if (!cursor) return
      const owner = projection.owners.get(cursor.nativeBlockId)
      const sectionId = projection.pages.get(cursor.nativeBlockId) ?? (owner ? projection.blockSections.get(owner) : undefined)
      const latest = current.current.getDocument ? current.current.getDocument() : current.current.document
      if (sectionId && latest?.sections[sectionId]) current.current.onEditingPosition({ ...cursor, sectionId }, value)
    } catch (error) { current.current.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }
  const emit = () => {
    if (!editor.current || binding.current !== projection) return
    try {
      captureTableIdentities(editor.current, projection)
      if (projection !== active.current) return
      const latest = current.current.getDocument ? current.current.getDocument() : current.current.document
      if (!latest) return
      const document = nativeDocumentToProduct(editor.current.document, projection, latest)
      const threads = comments.snapshot(editor.current)
      if (Object.keys(threads).length) document.comments = threads
      else delete document.comments
      current.current.onChange(document)
      projectedDocument.current = editor.current.prosemirrorState.doc
      cancelFocus()
      reportPosition()
    } catch (error) { current.current.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }
  return <BlockNoteSurface identity={props.identity} reset={props.reset} initialContent={projection.content} locale={props.locale} readOnly={props.readOnly}
    resolveAssetURL={props.resolveAssetURL}
    comments={comments} commentsPortal={props.commentsPortal} nodeViews={props.nodeViews} onComposition={props.onComposition} onSelection={props.onSelection}
    onChange={emit} onReady={value => {
      if (projection !== active.current) return
      unsubscribe.current?.(); unsubscribe.current = undefined
      cancelFocus()
      editor.current = undefined
      projectedDocument.current = undefined
      if (value) {
        seedTableIdentities(value, projection)
        captureTableIdentities(value, projection)
        captureRichBaseline(value.document, projection)
        rememberDocumentStructure(value.document, projection)
        comments.restoreAnchors(value)
        binding.current = projection
        editor.current = value
        projectedDocument.current = value.prosemirrorState.doc
        const stopComments = comments.subscribe(emit)
        const stopSelection = value.onSelectionChange(() => { cancelFocus(); reportPosition() })
        const stopFocus = value.onFocusChange((_, { focused }) => {
          cancelFocus()
          if (!focused) return
          const token = current.current.getPositionToken?.()
          focusFrame.current = requestAnimationFrame(() => {
            focusFrame.current = undefined
            if (token === current.current.getPositionToken?.()) reportPosition()
          })
        })
        unsubscribe.current = () => { stopComments(); stopSelection(); stopFocus(); cancelFocus() }
      }
      current.current.onReady?.(value)
      if (value) reportPosition()
    }} />
}
