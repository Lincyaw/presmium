import { useEffect, useMemo, useRef } from 'react'
import type { Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { allocateDocumentPage } from '@lincyaw/kernel'
import type { Member, TeachingDocument } from '@lincyaw/kernel'
import type { Locale } from '../messages.ts'
import { BlockNoteSurface } from './BlockNoteSurface.tsx'
import type { CommentDrafts } from './comment-drafts.ts'
import { DocumentThreadStore } from './comments.ts'
import { createDocumentProjection, nativeDocumentToProduct, nativePage, pageId, rememberComponentConfiguration, rememberDocumentStructure } from './projection.ts'
import type { NativePageCreation } from './projection.ts'
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
export interface DocumentEditorCommands {
  insertPage(after: string | undefined, title: string): NativePageCreation
  rememberComponentConfiguration(document: TeachingDocument): void
}

export interface DocumentEditorProps {
  identity: string
  document: TeachingDocument
  version?: string
  member?: Member
  commentDrafts?: CommentDrafts
  /** The latest actor version, including before the next React render. */
  getDocumentVersion?(): string | undefined
  /** Only a clean source snapshot confirms a submitted comment backup. */
  acknowledged?: boolean
  getDocumentAcknowledged?(): boolean
  /** Read sibling field edits before their React render has committed. */
  getDocument?(): TeachingDocument | undefined
  /** Ownership of a deferred native focus notification. */
  getPositionToken?(): string
  /** Display-only URL resolution; native block URLs keep their canonical source locations. */
  resolveAssetURL?(location: string): Promise<string>
  uploadImage?(file: File, signal: AbortSignal): Promise<string>
  reset?: number
  locale: Locale
  readOnly?: boolean
  nodeViews?: DocumentNodeViews
  onChange(document: TeachingDocument): void
  onSelection?(selection: NativeDocumentSelection | undefined): void
  onEditingPosition?(position: DocumentEditingPosition, editor: NativeDocumentEditor): void
  onReady?(editor: NativeDocumentEditor | undefined, commands?: DocumentEditorCommands): void
  onComposition?(composing: boolean): void
  onSectionLink?(sectionId: string): boolean
  onError?(error: Error): void
  commentsPortal?: HTMLElement | null
  onCommentDraftRestore?(): void
}

/** A source version reset replaces the editor; its own save receipts never replace it. */
export function DocumentEditor(props: DocumentEditorProps) {
  const projection = useMemo(() => createDocumentProjection(props.document), [props.identity, props.reset])
  useEffect(() => rememberComponentConfiguration(projection, props.document), [projection, props.version])
  const comments = useMemo(() => new DocumentThreadStore(props.document, props.member, props.version, props.identity, props.commentDrafts), [props.identity, props.reset])
  useEffect(() => {
    const latest = current.current, document = latest.getDocument ? latest.getDocument() : latest.document
    const version = latest.getDocumentVersion ? latest.getDocumentVersion() : latest.version
    if (document && version !== undefined) {
      comments.drafts?.synchronize(document, version, latest.getDocumentAcknowledged ? latest.getDocumentAcknowledged() : latest.acknowledged ?? false)
      comments.drafts?.start()
    }
    return () => comments.close()
  }, [comments])
  const current = useRef(props), editor = useRef<NativeDocumentEditor>(), unsubscribe = useRef<() => void>()
  const projectedDocument = useRef<NativeDocumentEditor['prosemirrorState']['doc']>()
  const pendingTransaction = useRef<Transaction>()
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
  const syncComments = () => {
    const value = editor.current, latest = current.current.getDocument ? current.current.getDocument() : current.current.document
    const version = current.current.getDocumentVersion ? current.current.getDocumentVersion() : current.current.version
    if (!value || !latest || binding.current !== projection || active.current !== projection || value.prosemirrorView.isDestroyed) return
    const transaction = pendingTransaction.current
    comments.synchronize(latest, version, value, transaction?.doc === value.prosemirrorState.doc && transaction.before === projectedDocument.current ? transaction : undefined, current.current.getDocumentAcknowledged ? current.current.getDocumentAcknowledged() : current.current.acknowledged ?? false)
    if (version !== undefined) comments.drafts?.start()
    projectedDocument.current = value.prosemirrorState.doc
  }
  comments.beforeAction = () => { if (current.current.getDocumentVersion && current.current.getDocumentVersion() === undefined) throw new Error('document-context-changed'); syncComments() }
  useEffect(syncComments, [props.version, props.document.comments, props.acknowledged, comments])
  const emit = () => {
    if (!editor.current || binding.current !== projection || comments.synchronizing) return
    try {
      captureTableIdentities(editor.current, projection)
      if (projection !== active.current) return
      const latest = current.current.getDocument ? current.current.getDocument() : current.current.document
      if (!latest || current.current.getDocumentVersion && current.current.getDocumentVersion() === undefined) return
      syncComments()
      const document = nativeDocumentToProduct(editor.current.document, projection, latest)
      const threads = comments.snapshot(editor.current)
      if (Object.keys(threads).length) document.comments = threads
      else delete document.comments
      current.current.onChange(document)
      projectedDocument.current = editor.current.prosemirrorState.doc
      pendingTransaction.current = undefined
      cancelFocus()
      reportPosition()
    } catch (error) { current.current.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }
  return <BlockNoteSurface identity={props.identity} reset={props.reset} initialContent={projection.content} locale={props.locale} readOnly={props.readOnly}
    resolveAssetURL={props.resolveAssetURL} uploadImage={props.uploadImage}
    comments={comments} commentsPortal={props.commentsPortal} onCommentDraftRestore={() => current.current.onCommentDraftRestore?.()} nodeViews={props.nodeViews} onComposition={props.onComposition} onSelection={props.onSelection} onSectionLink={sectionId => {
      if (!current.current.onSectionLink?.(sectionId)) return false
      // The click placed the caret in the link; it follows the reader to the page they asked for.
      const value = editor.current
      if (value && !value.prosemirrorView.isDestroyed && value.getBlock(pageId(sectionId))) value.setTextCursorPosition(pageId(sectionId), 'start')
      return true
    }}
    onChange={emit} onReady={value => {
      if (projection !== active.current) return
      unsubscribe.current?.(); unsubscribe.current = undefined
      cancelFocus()
      editor.current = undefined
      projectedDocument.current = undefined
      pendingTransaction.current = undefined
      if (value) {
        seedTableIdentities(value, projection)
        captureTableIdentities(value, projection)
        captureRichBaseline(value.document, projection)
        rememberDocumentStructure(value.document, projection)
        comments.restoreAnchors(value)
        binding.current = projection
        editor.current = value
        projectedDocument.current = value.prosemirrorState.doc
        const stopBefore = value.onBeforeChange(({ tr }) => { if (!comments.synchronizing && tr.docChanged) pendingTransaction.current = tr })
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
        unsubscribe.current = () => { stopBefore(); stopComments(); stopSelection(); stopFocus(); cancelFocus() }
      }
      const commands: DocumentEditorCommands | undefined = value ? { rememberComponentConfiguration: document => {
        if (editor.current === value && active.current === projection && binding.current === projection && !value.prosemirrorView.isDestroyed) rememberComponentConfiguration(projection, document)
      }, insertPage: (after, title) => {
        if (current.current.readOnly || editor.current !== value || active.current !== projection || binding.current !== projection || value.prosemirrorView.isDestroyed) throw new Error('page-context-changed')
        const blocks = value.document, index = after ? blocks.findIndex(block => block.type === 'presmiumPage' && block.props.sectionId === after) : blocks.length - 1
        if (index < 0) throw new Error('page-boundary')
        const next = after ? blocks.slice(index + 1).find(block => block.type === 'presmiumPage') : undefined
        const latest = current.current.getDocument ? current.current.getDocument() : current.current.document
        if (!latest) throw new Error('page-context-changed')
        const creation = allocateDocumentPage(latest, () => crypto.randomUUID())
        projection.createdPages.set(creation.sectionId, creation)
        try {
          value.transact(transaction => {
            closeHistory(transaction)
            value.insertBlocks([nativePage(creation.sectionId, title), { id: creation.nodeId, type: 'paragraph', content: [] }], next ?? blocks.at(-1)!, next ? 'before' : 'after')
          })
          // The first keystroke belongs to its own native history event.
          value.transact(transaction => closeHistory(transaction))
          return creation
        } catch (error) {
          if (!value.getBlock(`page:${creation.sectionId}`)) projection.createdPages.delete(creation.sectionId)
          throw error
        }
      } } : undefined
      current.current.onReady?.(value, commands)
      if (value) reportPosition()
    }} getPositionToken={() => current.current.getPositionToken?.()} />
}
