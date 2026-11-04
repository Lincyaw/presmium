import { useEffect, useMemo, useRef } from 'react'
import type { Transaction } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { allocateDocumentPage, randomUUID } from '@lincyaw/kernel'
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
import { nativeEditingCursor, nativeTextPoint, nativeTextPosition } from './selection.ts'
import type { NativeDocumentSelection, NativeTextPoint } from './selection.ts'
import { documentInsertionPlace } from './insertion-place.ts'
import type { DocumentInsertionPlace } from './insertion-place.ts'

export interface DocumentEditingPosition {
  nativeBlockId: string
  sectionId: string
  position: number
}
/** Who takes the slash menu's request for an animation where it was opened; while none is available the menu has no such item. */
export interface DocumentAnimationRequests {
  available(): boolean
  request(place: DocumentInsertionPlace): void
}
export interface DocumentEditorCommands {
  insertPage(after: string | undefined, title: string): NativePageCreation
  rememberComponentConfiguration(document: TeachingDocument): void
  handleAnimationRequests(requests: DocumentAnimationRequests | undefined): void
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
  onOpenComments?(): void
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
  const animationRequests = useRef<DocumentAnimationRequests>()
  const projectedDocument = useRef<NativeDocumentEditor['prosemirrorState']['doc']>()
  const pendingTransaction = useRef<Transaction>()
  const focusFrame = useRef<number>()
  const binding = useRef(projection)
  const active = useRef(projection)
  const editorIdentity = useRef(props.identity)
  const retainedSelection = useRef<{ from: NativeTextPoint, to: NativeTextPoint }>()
  const previous = editor.current
  if (binding.current !== projection && editorIdentity.current === props.identity && previous?.isFocused() && !previous.prosemirrorView.composing) {
    const from = nativeTextPoint(previous, previous.prosemirrorState.selection.anchor), to = nativeTextPoint(previous, previous.prosemirrorState.selection.head)
    if (from && to) retainedSelection.current = { from, to }
  }
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
      const threads = comments.snapshot(editor.current, document)
      if (Object.keys(threads).length) document.comments = threads
      else delete document.comments
      current.current.onChange(document)
      projectedDocument.current = editor.current.prosemirrorState.doc
      pendingTransaction.current = undefined
      cancelFocus()
      reportPosition()
    } catch (error) { current.current.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }
  return <BlockNoteSurface identity={props.identity} reset={props.reset} initialContent={projection.content} locale={props.locale} contentLang={props.document.metadata.lang || 'zh-CN'} readOnly={props.readOnly}
    resolveAssetURL={props.resolveAssetURL} uploadImage={props.uploadImage}
    comments={comments} commentsPortal={props.commentsPortal} onCommentDraftRestore={() => current.current.onCommentDraftRestore?.()} onOpenComments={() => current.current.onOpenComments?.()} nodeViews={props.nodeViews} onComposition={props.onComposition} onSelection={props.onSelection}
    animationRequest={{
      available: () => !current.current.readOnly && binding.current === projection && active.current === projection && Boolean(animationRequests.current?.available()),
      request: value => {
        if (value !== editor.current || binding.current !== projection || active.current !== projection) return
        const place = documentInsertionPlace(value, projection)
        if (place) animationRequests.current?.request(place)
      },
    }}
    onSectionLink={sectionId => {
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
        editorIdentity.current = props.identity
        projectedDocument.current = value.prosemirrorState.doc
        const selection = retainedSelection.current
        retainedSelection.current = undefined
        if (selection) {
          const from = nativeTextPosition(value, selection.from), to = nativeTextPosition(value, selection.to)
          if (from !== undefined && to !== undefined) {
            value.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, from, to)).setMeta('addToHistory', false))
            value.focus()
          }
        }
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
      const commands: DocumentEditorCommands | undefined = value ? { handleAnimationRequests: requests => { animationRequests.current = requests }, rememberComponentConfiguration: document => {
        if (editor.current === value && active.current === projection && binding.current === projection && !value.prosemirrorView.isDestroyed) rememberComponentConfiguration(projection, document)
      }, insertPage: (after, title) => {
        if (current.current.readOnly || editor.current !== value || active.current !== projection || binding.current !== projection || value.prosemirrorView.isDestroyed) throw new Error('page-context-changed')
        const blocks = value.document, index = after ? blocks.findIndex(block => block.type === 'presmiumPage' && block.props.sectionId === after) : blocks.length - 1
        if (index < 0) throw new Error('page-boundary')
        const next = after ? blocks.slice(index + 1).find(block => block.type === 'presmiumPage') : undefined
        const latest = current.current.getDocument ? current.current.getDocument() : current.current.document
        if (!latest) throw new Error('page-context-changed')
        const creation = allocateDocumentPage(latest, () => randomUUID())
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
