import type { DocumentThread, JsonObject, RichTextNode } from './document.ts'
import type { Member } from './server.ts'

/** Canonical comment intent; author identity, dates and new entity IDs are supplied by the adapter. */
export type DocumentCommentAction =
  | { type: 'comment.create', content: RichTextNode[], anchor?: DocumentThread['anchor'] | null, metadata?: JsonObject, commentMetadata?: JsonObject }
  | { type: 'comment.reply', threadId: string, content: RichTextNode[], metadata?: JsonObject }
  | { type: 'comment.update', threadId: string, commentId: string, content: RichTextNode[], metadata?: JsonObject }
  | { type: 'comment.react', threadId: string, commentId: string, emoji: string, active: boolean }
  | { type: 'comment.resolve' | 'comment.reopen', threadId: string }
  | { type: 'comment.delete', threadId: string, commentId?: string }

export interface DocumentCommentContext {
  member?: Member
  now: string
  allocate(): string
  /** MCP content IDs are only input placeholders; native projections retain their own stable rich IDs. */
  allocateContentIds?: boolean
}
export interface DocumentCommentEffect {
  threadId: string
  commentId?: string
  changed: boolean
  anchored: boolean
  /** The target thread’s prior anchor was invalid; the discussion remains explicitly unanchored. */
  anchorDetached?: boolean
  threadRemoved: boolean
  removedComments: number
  comments: number
  reactions: number
}
