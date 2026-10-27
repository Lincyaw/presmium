import { CommentEditorSubmitExtension, CommentsExtension, DefaultThreadStoreAuth, ThreadStore, ThreadStoreAuth } from '@blocknote/core/comments'
import { createExtension, createUserStore } from '@blocknote/core'
import type { BlockNoteEditor } from '@blocknote/core'
import type { CommentData, ThreadData } from '@blocknote/core/comments'
import { AddMarkStep, RemoveMarkStep } from '@tiptap/pm/transform'
import { Plugin } from '@tiptap/pm/state'
import { applyDocumentCommentAction, hasRole, validateDocumentCommentAnchor } from '@lincyaw/kernel'
import type { DocumentComment, DocumentCommentAction, DocumentThread, Member, RichTextNode, TeachingDocument } from '@lincyaw/kernel'
import { createRichProjection, nativeRichTextToProduct, productRichTextToNative } from './rich-text.ts'
import type { RichProjection } from './rich-text.ts'
import type { Transaction } from '@tiptap/pm/state'
import type { DocumentEditorBlock, NativeDocumentEditor } from './schema.tsx'
import { commentEditorSchema } from './schema.tsx'
import { CommentDrafts, commentDraftBaseline } from './comment-drafts.ts'
import type { CommentDraftTarget } from './comment-drafts.ts'
import { nativeTextPoint, nativeTextPosition, nativeTextPositionInDocument } from './selection.ts'

type NewComment = { body: unknown, metadata?: unknown }
type Threads = NonNullable<TeachingDocument['comments']>
const date = (value: string) => new Date(value)
const jsonObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) as DocumentThread['metadata'] : undefined
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

type CommentEditor = BlockNoteEditor<any, any, any>
type EditorFailure = 'changed' | 'unavailable'
interface CommentEditing {
  threadId?: string
  commentId?: string
  baseline?: string
  body?: unknown
  editable: boolean
  closed: boolean
  failure?: EditorFailure
  listeners: Set<() => void>
}
export interface DocumentCommentEditorHandle {
  setEditable(value: boolean): void
  failure(): EditorFailure | undefined
  subscribe(listener: () => void): () => void
  close(): void
  target?: CommentDraftTarget
  restoreBaseline(baseline: string | undefined): void
}
const commentBase = (comment: DocumentComment) => JSON.stringify({ userId: comment.userId, content: comment.content })

/** Native visibility and the shared reducer enforce the same trusted member policy. */
class DocumentThreadAuth extends ThreadStoreAuth {
  readonly #member?: Member
  readonly #native: DefaultThreadStoreAuth
  constructor(member?: Member) { super(); this.#member = member; this.#native = new DefaultThreadStoreAuth(member?.id ?? '', 'editor') }
  #editable = () => Boolean(this.#member?.id && hasRole(this.#member, 'editor'))
  canCreateThread = () => this.#editable()
  canAddComment = () => this.#editable()
  canUpdateComment = (comment: CommentData) => this.#editable() && (hasRole(this.#member!, 'owner') || this.#native.canUpdateComment(comment))
  canDeleteComment = (comment: CommentData) => this.#editable() && this.#native.canDeleteComment(comment)
  canDeleteThread = () => this.#editable()
  canResolveThread = () => this.#editable()
  canUnresolveThread = () => this.#editable()
  canAddReaction = (comment: CommentData, emoji?: string) => this.#editable() && this.#native.canAddReaction(comment, emoji)
  canDeleteReaction = (comment: CommentData, emoji?: string) => this.#editable() && this.#native.canDeleteReaction(comment, emoji)
}

/** Native actions resolve immediately so BlockNote attaches their marks to its own selection. */
export class DocumentThreadStore extends ThreadStore {
  addThreadToDocument: ThreadStore['addThreadToDocument'] = undefined
  beforeAction?: () => void
  readonly member?: Member
  readonly drafts?: CommentDrafts
  readonly #ownsDrafts: boolean
  #threads = new Map<string, ThreadData>()
  #canonical: Threads = {}
  #version?: string
  #document: TeachingDocument
  #synchronizing = false
  readonly #edits = new Map<string, CommentEditing>()
  #submitting?: CommentEditing
  readonly #listeners = new Set<(threads: Map<string, ThreadData>) => void>()
  readonly #rich: RichProjection = createRichProjection()
  readonly #anchors = new Map<string, DocumentThread['anchor']>()
  readonly #initialBodies = new Map<string, { body: unknown, content: RichTextNode[] }>()
  constructor(document: TeachingDocument, member?: Member, version?: string, identity?: string, drafts?: CommentDrafts) {
    super(new DocumentThreadAuth(member)); this.member = member; this.#version = version; this.#document = document; this.#replace(document.comments ?? {})
    this.#ownsDrafts = !drafts
    if (drafts || identity && member?.id) { this.drafts = drafts ?? new CommentDrafts(identity!, member!.id) }
  }
  get version(): string | undefined { return this.#version }
  threadSnapshot(threadId: string): DocumentThread | undefined { return this.#canonical[threadId] }
  refreshEditorCallbacks(): void { this.#publishView() }
  draftTargetState(target: CommentDraftTarget): 'current' | 'changed' | 'unavailable' {
    const thread = this.#canonical[target.threadId], comment = thread?.comments.find(value => value.id === target.commentId)
    if (!thread || thread.deletedAt || thread.createdAt !== target.threadCreatedAt || target.commentId && (!comment || comment.deletedAt || comment.createdAt !== target.commentCreatedAt)) return 'unavailable'
    return comment && target.baseline !== commentDraftBaseline(comment) ? 'changed' : 'current'
  }
  close(): void { if (this.#ownsDrafts) this.drafts?.close() }
  get synchronizing(): boolean { return this.#synchronizing }
  getThread = (threadId: string): ThreadData => { const thread = this.#threads.get(threadId); if (!thread) throw new Error('document-thread-missing'); return thread }
  getThreads = (): Map<string, ThreadData> => this.#threads
  subscribe = (listener: (threads: Map<string, ThreadData>) => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
  #notify(): void { for (const listener of this.#listeners) listener(this.#threads) }
  #replace(threads: Threads, nativeBody?: { id: string, body: unknown }, keepEditing = false): void {
    const previous = this.#canonical
    this.#canonical = structuredClone(threads)
    this.#anchors.clear()
    this.#threads = new Map(Object.values(threads).map(thread => {
      this.#anchors.set(thread.id, thread.anchor)
      const old = this.#threads.get(thread.id)
      return [thread.id, {
        ...thread, createdAt: date(thread.createdAt), updatedAt: date(thread.updatedAt),
        resolvedUpdatedAt: thread.resolvedUpdatedAt ? date(thread.resolvedUpdatedAt) : undefined,
        deletedAt: thread.deletedAt ? date(thread.deletedAt) : undefined,
        comments: thread.comments.map(comment => {
          const oldComment = old?.comments.find(value => value.id === comment.id), oldValue = previous[thread.id]?.comments.find(value => value.id === comment.id)
          const editing = keepEditing ? this.#edits.get(comment.id) : undefined
          if (editing && editing.baseline !== commentBase(comment)) this.#failEdit(editing, 'changed')
          const body = comment.deletedAt ? undefined : editing ? editing.body : nativeBody?.id === comment.id ? nativeBody.body
            : oldComment && same(oldValue?.content, comment.content) ? oldComment.body : productRichTextToNative(comment.content ?? [], this.#rich)
          this.#initialBodies.set(comment.id, { body, content: structuredClone(comment.content ?? []) })
          return { ...comment, createdAt: date(comment.createdAt), updatedAt: date(comment.updatedAt), deletedAt: comment.deletedAt ? date(comment.deletedAt) : undefined,
            body, reactions: comment.reactions.map(reaction => ({ ...reaction, createdAt: date(reaction.createdAt) })),
          } as CommentData
        }),
      } as ThreadData]
    }))
    for (const editing of this.#edits.values()) if (keepEditing && (!editing.threadId || !threads[editing.threadId]?.comments.some(comment => comment.id === editing.commentId && !comment.deletedAt))) this.#failEdit(editing, 'unavailable')
    const live = new Set(Object.values(threads).flatMap(thread => thread.comments.map(comment => comment.id)))
    for (const id of this.#initialBodies.keys()) if (!live.has(id)) this.#initialBodies.delete(id)
  }
  #content(comment: NewComment): RichTextNode[] { return nativeRichTextToProduct(comment.body as DocumentEditorBlock[], this.#rich) }
  #act(action: DocumentCommentAction, nativeBody?: unknown) {
    this.beforeAction?.()
    const answer = applyDocumentCommentAction(this.#canonical, action, { member: this.member, now: new Date().toISOString(), allocate: () => crypto.randomUUID() })
    if (answer.effect.changed) {
      this.#replace(answer.threads, answer.effect.commentId && nativeBody !== undefined ? { id: answer.effect.commentId, body: nativeBody } : undefined)
      this.#notify()
    }
    return answer.effect
  }
  createThread = async ({ initialComment, metadata }: { initialComment: NewComment, metadata?: unknown }): Promise<ThreadData> => {
    const effect = this.#act({ type: 'comment.create', content: this.#content(initialComment), metadata: jsonObject(metadata), commentMetadata: jsonObject(initialComment.metadata) }, initialComment.body)
    return this.getThread(effect.threadId)
  }
  addComment = async ({ threadId, comment }: { threadId: string, comment: NewComment }): Promise<CommentData> => {
    const effect = this.#act({ type: 'comment.reply', threadId, content: this.#content(comment), metadata: jsonObject(comment.metadata) }, comment.body)
    return this.getThread(threadId).comments.find(value => value.id === effect.commentId)!
  }
  updateComment = async ({ threadId, commentId, comment }: { threadId: string, commentId: string, comment: NewComment }): Promise<void> => {
    this.beforeAction?.()
    const editing = this.#submitting
    if (!editing || editing.threadId !== threadId || editing.commentId !== commentId || !this.#canSubmit(editing)) throw new Error('comment-editor-version-changed')
    this.#act({ type: 'comment.update', threadId, commentId, content: this.#content(comment), metadata: jsonObject(comment.metadata) }, comment.body)
  }
  deleteComment = async ({ threadId, commentId }: { threadId: string, commentId: string }): Promise<void> => { this.#act({ type: 'comment.delete', threadId, commentId }) }
  deleteThread = async ({ threadId }: { threadId: string }): Promise<void> => { this.#act({ type: 'comment.delete', threadId }) }
  resolveThread = async ({ threadId }: { threadId: string }): Promise<void> => { this.#act({ type: 'comment.resolve', threadId }) }
  unresolveThread = async ({ threadId }: { threadId: string }): Promise<void> => { this.#act({ type: 'comment.reopen', threadId }) }
  addReaction = async ({ threadId, commentId, emoji }: { threadId: string, commentId: string, emoji: string }): Promise<void> => { this.#act({ type: 'comment.react', threadId, commentId, emoji, active: true }) }
  deleteReaction = async ({ threadId, commentId, emoji }: { threadId: string, commentId: string, emoji: string }): Promise<void> => { this.#act({ type: 'comment.react', threadId, commentId, emoji, active: false }) }

  #failEdit(editing: CommentEditing, failure: EditorFailure): void {
    if (editing.failure === failure) return
    editing.failure = failure
    for (const listener of editing.listeners) listener()
  }
  #canSubmit(editing: CommentEditing): boolean {
    if (editing.closed || !editing.editable || !editing.threadId || !editing.commentId || editing.failure) return false
    const thread = this.#canonical[editing.threadId], comment = thread?.comments.find(value => value.id === editing.commentId)
    if (!thread || thread.deletedAt || !comment || comment.deletedAt) { this.#failEdit(editing, 'unavailable'); return false }
    if (editing.baseline !== commentBase(comment)) { this.#failEdit(editing, 'changed'); return false }
    return true
  }
  #publishView(): void {
    const synchronizing = this.#synchronizing
    this.#synchronizing = true
    try { this.#threads = new Map(this.#threads); this.#notify() } finally { this.#synchronizing = synchronizing }
  }
  /** Public comment-editor boundary: native callbacks carry no base revision themselves. */
  bindEditor(editor: CommentEditor, editable: boolean, threadId?: string): DocumentCommentEditorHandle {
    const ids = new Set(editor.document.map(block => block.id))
    const matches = Object.values(this.#canonical).filter(thread => thread.id === threadId).flatMap(thread => thread.comments.flatMap(comment => {
      const body = this.#initialBodies.get(comment.id)?.body
      return Array.isArray(body) && body.some(block => ids.has(block.id)) ? [{ thread, comment, body }] : []
    }))
    // A reply/create editor starts editable and has no existing-comment binding.
    const existing = !editable, target = matches.length === 1 ? matches[0] : undefined
    const editing: CommentEditing = { threadId: target?.thread.id, commentId: target?.comment.id, baseline: target ? commentBase(target.comment) : undefined, body: target?.body, editable: false, closed: false, listeners: new Set() }
    const original = existing ? editor.getExtension(CommentEditorSubmitExtension) : undefined
    let guarded: typeof original
    if (original) {
      editor.replaceExtension(original, CommentEditorSubmitExtension({ onSubmit: async () => {
        try { this.beforeAction?.() } catch { this.#failEdit(editing, 'unavailable'); return }
        if (!this.#canSubmit(editing)) { if (!editing.failure) this.#failEdit(editing, 'unavailable'); return }
        const previous = this.#submitting
        let result: Promise<void>
        try { this.#submitting = editing; result = original.submit() } finally { this.#submitting = previous }
        await result
      } }))
      guarded = editor.getExtension(CommentEditorSubmitExtension)
      // The parent Comment reads submit during render; publish a fresh view without a source edit.
      this.#publishView()
    }
    const setEditable = (value: boolean) => {
      if (!existing || editing.closed || value === editing.editable) return
      editing.editable = value
      if (value) {
        if (editing.commentId) this.#edits.set(editing.commentId, editing)
        if (!target) this.#failEdit(editing, 'unavailable')
      } else {
        if (editing.commentId && this.#edits.get(editing.commentId) === editing) this.#edits.delete(editing.commentId)
        const comment = editing.threadId ? this.#canonical[editing.threadId]?.comments.find(value => value.id === editing.commentId) : undefined
        if (comment && editing.failure) {
          this.#replace(this.#canonical, { id: comment.id, body: productRichTextToNative(comment.content ?? [], this.#rich) }, true)
          this.#publishView()
        }
      }
    }
    setEditable(editable)
    const thread = threadId ? this.#canonical[threadId] : undefined
    const draftTarget: CommentDraftTarget | undefined = thread && (!existing || target) ? { threadId: thread.id, threadCreatedAt: thread.createdAt, ...existing && target ? { commentId: target.comment.id, commentCreatedAt: target.comment.createdAt, baseline: commentBase(target.comment) } : {} } : undefined
    return {
      target: draftTarget,
      restoreBaseline: baseline => { if (existing && editing.editable && !editing.closed) { editing.baseline = baseline; if (!this.#canSubmit(editing) && !editing.failure) this.#failEdit(editing, 'unavailable') } },
      setEditable, failure: () => editing.failure,
      subscribe: listener => { editing.listeners.add(listener); return () => editing.listeners.delete(listener) },
      close: () => {
        if (editing.closed) return
        setEditable(false); editing.closed = true; editing.listeners.clear()
        if (original && guarded && !editor.prosemirrorView.isDestroyed && editor.getExtension(CommentEditorSubmitExtension) === guarded) editor.replaceExtension(guarded, original)
      },
    }
  }

  /** Source adoption is not another native edit; preserve selected thread and unchanged comment bodies. */
  synchronize(document: TeachingDocument, version: string | undefined, editor: NativeDocumentEditor, transaction?: Transaction): void {
    if (version === undefined || version === this.#version || this.#synchronizing) return
    this.#version = version
    this.#document = document
    this.drafts?.synchronize(document, version)
    const threads = document.comments
    if (same(threads ?? {}, this.#canonical)) return
    this.#synchronizing = true
    try {
      this.#replace(threads ?? {}, undefined, true)
      this.restoreAnchors(editor, transaction)
      this.#notify()
      const extension = editor.getExtension(CommentsExtension)!, selected = extension.store.state.selectedThreadId
      if (selected && (!this.#threads.has(selected) || this.#threads.get(selected)!.resolved || this.#threads.get(selected)!.deletedAt)) extension.selectThread(undefined, false)
    } finally { this.#synchronizing = false }
  }
  restoreAnchors(editor: NativeDocumentEditor, transaction?: Transaction): void {
    const extension = editor.getExtension(CommentsExtension)!, name = extension.tiptapExtensions[0].name
    const ranges = [...this.#anchors].flatMap(([threadId, anchor]) => {
      if (!anchor) return []
      try { validateDocumentCommentAnchor(this.#document, anchor) } catch { return [] }
      const position = (point: { blockId: string, offset: number }, association: number) => {
        if (!transaction) return nativeTextPosition(editor, point)
        const before = nativeTextPositionInDocument(transaction.before, point)
        return before === undefined ? undefined : transaction.mapping.map(before, association)
      }
      const from = position(anchor.from, 1), to = position(anchor.to, -1)
      return from !== undefined && to !== undefined && from < to ? [{ threadId, from, to, orphan: Boolean(this.#threads.get(threadId)?.resolved || this.#threads.get(threadId)?.deletedAt) }] : []
    })
    editor.transact(transaction => {
      const mark = transaction.doc.type.schema.marks[name]!
      transaction.removeMark(0, transaction.doc.content.size, mark)
      for (const { threadId, from, to, orphan } of ranges) transaction.addMark(from, to, mark.create({ threadId, orphan }))
      transaction.setMeta('addToHistory', false)
    })
  }
  snapshot(editor: NativeDocumentEditor): Threads {
    const positions = editor.getExtension(CommentsExtension)!.store.state.threadPositions
    const result = Object.fromEntries([...this.#threads.values()].map(thread => {
      const position = positions.get(thread.id)
      const from = position ? nativeTextPoint(editor, position.from) : undefined, to = position ? nativeTextPoint(editor, position.to) : undefined
      const anchor = from && to ? { from: { blockId: from.blockId, offset: from.offset }, to: { blockId: to.blockId, offset: to.offset } } : undefined
      const value: DocumentThread = {
        id: thread.id, type: 'thread', createdAt: thread.createdAt.toISOString(), updatedAt: thread.updatedAt.toISOString(), resolved: thread.resolved,
        ...thread.resolvedUpdatedAt ? { resolvedUpdatedAt: thread.resolvedUpdatedAt.toISOString() } : {}, ...thread.resolvedBy ? { resolvedBy: thread.resolvedBy } : {},
        ...thread.deletedAt ? { deletedAt: thread.deletedAt.toISOString() } : {}, ...jsonObject(thread.metadata) ? { metadata: jsonObject(thread.metadata) } : {}, ...anchor ? { anchor } : {},
        comments: thread.comments.map(comment => ({
          id: comment.id, type: 'comment', userId: comment.userId, createdAt: comment.createdAt.toISOString(), updatedAt: comment.updatedAt.toISOString(),
          ...comment.deletedAt ? { deletedAt: comment.deletedAt.toISOString() } : { content: this.#initialBodies.get(comment.id)?.body === comment.body ? structuredClone(this.#initialBodies.get(comment.id)!.content) : nativeRichTextToProduct(comment.body as DocumentEditorBlock[], this.#rich) },
          ...jsonObject(comment.metadata) ? { metadata: jsonObject(comment.metadata) } : {}, reactions: comment.reactions.map(reaction => ({ ...reaction, createdAt: reaction.createdAt.toISOString() })),
        } satisfies DocumentComment)),
      }
      return [value.id, value]
    }))
    this.#canonical = result
    return result
  }
}

export function nativeComments(store: DocumentThreadStore, username: string) {
  const resolve = (ids: string[]) => ids.map(id => ({ id, username: id === 'local-author' ? username : id === store.member?.id ? store.member.name ?? username : id, avatarUrl: '' }))
  const users = createUserStore(async ids => resolve(ids)), identities = new Set<string>(store.member ? [store.member.id] : [])
  for (const thread of store.getThreads().values()) {
    if (thread.resolvedBy) identities.add(thread.resolvedBy)
    for (const comment of thread.comments) {
      identities.add(comment.userId)
      for (const reaction of comment.reactions) for (const id of reaction.userIds) identities.add(id)
    }
  }
  users.setUser(resolve([...identities]))
  return CommentsExtension({ threadStore: store, schema: commentEditorSchema, resolveUsers: users })
}

/** Select the thread before the browser places its native mouse caret. */
export const nativeCommentSelection = createExtension(({ editor }: { editor: NativeDocumentEditor }) => {
  let pressed: string | undefined
  const cancel = () => { pressed = undefined; return false }
  return {
    key: 'presmium-native-comment-selection',
    runsBefore: ['comments'],
    mount: () => { cancel(); return () => { cancel() } },
    prosemirrorPlugins: [new Plugin({ props: {
      handleDOMEvents: {
        mousedown(view, event) {
          cancel()
          const comments = editor.getExtension(CommentsExtension)
          if (event.button !== 0 || event.defaultPrevented || !view.editable || view.composing || !comments || comments.store.state.pendingComment) return false
          const mark = event.target instanceof Element ? event.target.closest('[data-bn-thread-id]') : null
          if (!mark || !view.dom.contains(mark) || mark.hasAttribute('data-orphan')) return false
          const id = mark.getAttribute('data-bn-thread-id'), thread = id ? comments.threadStore.getThreads().get(id) : undefined
          if (id && thread && !thread.resolved && !thread.deletedAt && comments.store.state.threadPositions.has(id) && comments.store.state.selectedThreadId !== id) {
            pressed = id
            comments.selectThread(id, false)
          }
          return false
        },
        pointercancel: cancel, dragstart: cancel, blur: cancel, keydown: cancel,
      },
      handleClick(view, position, event) {
        const id = pressed, comments = editor.getExtension(CommentsExtension)
        cancel()
        // Native comments consumes the first thread click before following links.
        return Boolean(id && comments?.store.state.selectedThreadId === id && event.button === 0 && !event.defaultPrevented && view.editable && !view.composing
          && view.state.doc.nodeAt(position)?.marks.some(mark => mark.type.name === comments.tiptapExtensions[0].name && mark.attrs.threadId === id && mark.attrs.orphan !== true))
      },
    } })],
  }
})

/** Thread entities own their state; pure comment marks must not consume body undo. */
export function excludeCommentMarkHistory(editor: NativeDocumentEditor): () => void {
  const name = editor.getExtension(CommentsExtension)!.tiptapExtensions[0].name
  return editor.onBeforeChange(({ tr }) => {
    if (tr.steps.length && tr.steps.every(step => (step instanceof AddMarkStep || step instanceof RemoveMarkStep) && step.mark.type.name === name)) tr.setMeta('addToHistory', false)
  })
}
