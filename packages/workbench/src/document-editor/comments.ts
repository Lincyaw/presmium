import { CommentsExtension, DefaultThreadStoreAuth, ThreadStore } from '@blocknote/core/comments'
import { createExtension, createUserStore } from '@blocknote/core'
import type { CommentData, ThreadData } from '@blocknote/core/comments'
import { AddMarkStep, RemoveMarkStep } from '@tiptap/pm/transform'
import { Plugin } from '@tiptap/pm/state'
import type { DocumentComment, DocumentThread, RichTextNode, TeachingDocument } from '@lincyaw/kernel'
import { createRichProjection, nativeRichTextToProduct, productRichTextToNative } from './rich-text.ts'
import type { RichProjection } from './rich-text.ts'
import type { DocumentEditorBlock, NativeDocumentEditor } from './schema.tsx'
import { commentEditorSchema } from './schema.tsx'
import { nativeTextPoint, nativeTextPosition } from './selection.ts'

const USER = 'local-author'
type NewComment = { body: unknown, metadata?: unknown }
const date = (value: string) => new Date(value)
const jsonObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) as DocumentThread['metadata'] : undefined

/** The native extension uses this public store; its only persistence is TeachingDocument. */
export class DocumentThreadStore extends ThreadStore {
  addThreadToDocument: ThreadStore['addThreadToDocument'] = undefined
  #threads = new Map<string, ThreadData>()
  readonly #listeners = new Set<(threads: Map<string, ThreadData>) => void>()
  readonly #rich: RichProjection = createRichProjection()
  readonly #anchors = new Map<string, DocumentThread['anchor']>()
  readonly #initialBodies = new Map<string, { body: unknown, content: RichTextNode[] }>()
  constructor(threads: TeachingDocument['comments']) {
    super(new DefaultThreadStoreAuth(USER, 'editor'))
    for (const thread of Object.values(threads ?? {})) {
      this.#anchors.set(thread.id, thread.anchor)
      this.#threads.set(thread.id, {
        ...thread, metadata: thread.metadata, createdAt: date(thread.createdAt), updatedAt: date(thread.updatedAt),
        resolvedUpdatedAt: thread.resolvedUpdatedAt ? date(thread.resolvedUpdatedAt) : undefined,
        deletedAt: thread.deletedAt ? date(thread.deletedAt) : undefined,
        comments: thread.comments.map(comment => {
          const body = comment.deletedAt ? undefined : productRichTextToNative(comment.content ?? [], this.#rich)
          this.#initialBodies.set(comment.id, { body, content: structuredClone(comment.content ?? []) })
          return {
          ...comment, createdAt: date(comment.createdAt), updatedAt: date(comment.updatedAt),
          deletedAt: comment.deletedAt ? date(comment.deletedAt) : undefined,
          body,
          reactions: comment.reactions.map(reaction => ({ ...reaction, createdAt: date(reaction.createdAt) })),
        } as CommentData }),
      })
    }
  }
  getThread = (threadId: string): ThreadData => { const thread = this.#threads.get(threadId); if (!thread) throw new Error('document-thread-missing'); return thread }
  getThreads = (): Map<string, ThreadData> => this.#threads
  subscribe = (listener: (threads: Map<string, ThreadData>) => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
  #notify(): void { this.#threads = new Map([...this.#threads].map(([id, thread]) => [id, { ...thread, comments: [...thread.comments] }])); for (const listener of this.#listeners) listener(this.#threads) }
  #comment(comment: NewComment): CommentData {
    const now = new Date()
    return { id: crypto.randomUUID(), type: 'comment', userId: USER, createdAt: now, updatedAt: now, body: comment.body, metadata: comment.metadata, reactions: [] }
  }
  #find(threadId: string, commentId: string): CommentData { const comment = this.getThread(threadId).comments.find(comment => comment.id === commentId); if (!comment) throw new Error('document-comment-missing'); return comment }
  #update(thread: ThreadData): void { thread.updatedAt = new Date(); this.#notify() }
  createThread = async ({ initialComment, metadata }: { initialComment: NewComment, metadata?: unknown }): Promise<ThreadData> => {
    const now = new Date(), thread: ThreadData = { id: crypto.randomUUID(), type: 'thread', createdAt: now, updatedAt: now, resolved: false, comments: [this.#comment(initialComment)], metadata }
    this.#threads.set(thread.id, thread); this.#notify(); return thread
  }
  addComment = async ({ threadId, comment }: { threadId: string, comment: NewComment }): Promise<CommentData> => {
    const thread = this.getThread(threadId), created = this.#comment(comment)
    thread.comments.push(created); this.#update(thread); return created
  }
  updateComment = async ({ threadId, commentId, comment }: { threadId: string, commentId: string, comment: NewComment }): Promise<void> => {
    Object.assign(this.#find(threadId, commentId), { body: comment.body, metadata: comment.metadata, updatedAt: new Date() }); this.#update(this.getThread(threadId))
  }
  deleteComment = async ({ threadId, commentId }: { threadId: string, commentId: string }): Promise<void> => {
    const thread = this.getThread(threadId); thread.comments = thread.comments.filter(comment => comment.id !== commentId)
    if (!thread.comments.length) this.#threads.delete(threadId)
    this.#update(thread)
  }
  deleteThread = async ({ threadId }: { threadId: string }): Promise<void> => { this.#threads.delete(threadId); this.#anchors.delete(threadId); this.#notify() }
  resolveThread = async ({ threadId }: { threadId: string }): Promise<void> => { const thread = this.getThread(threadId); Object.assign(thread, { resolved: true, resolvedBy: USER, resolvedUpdatedAt: new Date() }); this.#update(thread) }
  unresolveThread = async ({ threadId }: { threadId: string }): Promise<void> => { const thread = this.getThread(threadId); Object.assign(thread, { resolved: false, resolvedBy: USER, resolvedUpdatedAt: new Date() }); this.#update(thread) }
  addReaction = async ({ threadId, commentId, emoji }: { threadId: string, commentId: string, emoji: string }): Promise<void> => {
    const comment = this.#find(threadId, commentId), reaction = comment.reactions.find(item => item.emoji === emoji)
    if (reaction) { if (!reaction.userIds.includes(USER)) reaction.userIds.push(USER) }
    else comment.reactions.push({ emoji, createdAt: new Date(), userIds: [USER] })
    this.#update(this.getThread(threadId))
  }
  deleteReaction = async ({ threadId, commentId, emoji }: { threadId: string, commentId: string, emoji: string }): Promise<void> => {
    const comment = this.#find(threadId, commentId)
    comment.reactions = comment.reactions.map(reaction => reaction.emoji === emoji ? { ...reaction, userIds: reaction.userIds.filter(user => user !== USER) } : reaction).filter(reaction => reaction.userIds.length)
    this.#update(this.getThread(threadId))
  }

  restoreAnchors(editor: NativeDocumentEditor): void {
    const extension = editor.getExtension(CommentsExtension)!, name = extension.tiptapExtensions[0].name
    const ranges = [...this.#anchors].flatMap(([threadId, anchor]) => {
      if (!anchor) return []
      const from = nativeTextPosition(editor, anchor.from), to = nativeTextPosition(editor, anchor.to)
      return from !== undefined && to !== undefined && from < to ? [{ threadId, from, to }] : []
    })
    editor.transact(transaction => {
      const mark = transaction.doc.type.schema.marks[name]!
      for (const { threadId, from, to } of ranges) transaction.addMark(from, to, mark.create({ threadId, orphan: false }))
      transaction.setMeta('addToHistory', false)
    })
  }

  snapshot(editor: NativeDocumentEditor): NonNullable<TeachingDocument['comments']> {
    const positions = editor.getExtension(CommentsExtension)!.store.state.threadPositions
    return Object.fromEntries([...this.#threads.values()].map(thread => {
      const position = positions.get(thread.id)
      const from = position ? nativeTextPoint(editor, position.from) : undefined, to = position ? nativeTextPoint(editor, position.to) : undefined
      const anchor = from && to ? { from: { blockId: from.blockId, offset: from.offset }, to: { blockId: to.blockId, offset: to.offset } } : undefined
      const value: DocumentThread = {
        id: thread.id, type: 'thread', createdAt: thread.createdAt.toISOString(), updatedAt: thread.updatedAt.toISOString(), resolved: thread.resolved,
        ...thread.resolvedUpdatedAt ? { resolvedUpdatedAt: thread.resolvedUpdatedAt.toISOString() } : {}, ...thread.resolvedBy ? { resolvedBy: thread.resolvedBy } : {},
        ...thread.deletedAt ? { deletedAt: thread.deletedAt.toISOString() } : {}, ...jsonObject(thread.metadata) ? { metadata: jsonObject(thread.metadata) } : {},
        ...anchor ? { anchor } : {},
        comments: thread.comments.map(comment => ({
          id: comment.id, type: 'comment', userId: comment.userId, createdAt: comment.createdAt.toISOString(), updatedAt: comment.updatedAt.toISOString(),
          ...comment.deletedAt ? { deletedAt: comment.deletedAt.toISOString() } : { content: this.#initialBodies.get(comment.id)?.body === comment.body ? structuredClone(this.#initialBodies.get(comment.id)!.content) : nativeRichTextToProduct(comment.body as DocumentEditorBlock[], this.#rich) },
          ...jsonObject(comment.metadata) ? { metadata: jsonObject(comment.metadata) } : {},
          reactions: comment.reactions.map(reaction => ({ ...reaction, createdAt: reaction.createdAt.toISOString() })),
        } satisfies DocumentComment)),
      }
      return [value.id, value]
    }))
  }
}

export function nativeComments(store: DocumentThreadStore, username: string) {
  const resolve = (ids: string[]) => ids.map(id => ({ id, username: id === USER ? username : id, avatarUrl: '' }))
  const users = createUserStore(async ids => resolve(ids))
  const identities = new Set([USER])
  for (const thread of store.getThreads().values()) {
    if (thread.resolvedBy) identities.add(thread.resolvedBy)
    for (const comment of thread.comments) {
      identities.add(comment.userId)
      for (const reaction of comment.reactions) for (const id of reaction.userIds) identities.add(id)
    }
  }
  // Resolved-thread summaries read their resolver during the first render.
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
