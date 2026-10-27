import { hasRole } from './access.ts'
import type { DocumentCommentAction, DocumentCommentContext, DocumentCommentEffect } from './contracts/document-comments.ts'
import type { DocumentComment, DocumentThread, InlineNode, JsonObject, ListItemNode, RichTextNode, TableCellNode, TableRowNode, TeachingDocument } from './contracts/document.ts'

export class DocumentCommentError extends Error {
  readonly status: number
  constructor(status: number, code: string) { super(code); this.status = status; this.name = 'DocumentCommentError' }
}
function fail(status: number, code: string): never { throw new DocumentCommentError(status, code) }

/** Canonical anchor v1 expands only nonempty styled-text links; other inline values are atoms. */
export function isDocumentTextLink(node: InlineNode): node is Extract<InlineNode, { type: 'link' }> & { children: Extract<InlineNode, { type: 'text' | 'break' }>[] } {
  return node.type === 'link' && node.children.length > 0 && node.children.every(child => child.type === 'text' || child.type === 'break')
}
function inlineText(nodes: readonly InlineNode[]): string {
  return nodes.map(node => node.type === 'text' ? node.text : node.type === 'break' ? '\n' : isDocumentTextLink(node) ? inlineText(node.children) : '\uFFFC').join('')
}

/** Only addressable canonical text identities, in native document order; opaque data is never traversed. */
export function documentCommentTargets(document: TeachingDocument): Map<string, { order: number, text: string }> {
  const targets = new Map<string, { order: number, text: string }>()
  const add = (id: string, text: string) => { targets.set(id, { order: targets.size, text }) }
  const rich = (node: RichTextNode): void => {
    if (node.type === 'paragraph' || node.type === 'heading') add(node.id, inlineText(node.children))
    else if (node.type === 'code') add(node.id, node.value)
    else if (node.type === 'list') for (const item of node.children) {
      const [first, ...rest] = item.children
      add(item.id, first?.type === 'paragraph' ? inlineText(first.children) : '')
      ;(first?.type === 'paragraph' ? rest : item.children).forEach(rich)
    }
    else if (node.type === 'blockquote') {
      const [first, ...rest] = node.children
      if (first?.type === 'paragraph') { add(node.id, inlineText(first.children)); rest.forEach(rich) }
      else node.children.forEach(rich)
    } else if (node.type === 'table') for (const row of node.children) for (const cell of row.children) add(cell.id, inlineText(cell.children))
  }
  const block = (id: string): void => {
    const value = document.blocks[id]
    if (value?.type === 'text') value.content.forEach(rich)
    else if (value?.type === 'code' && value.value !== undefined) add(id, value.value)
    else if (value?.type === 'container' || value?.type === 'component') value.children?.forEach(block)
  }
  for (const id of document.sectionOrder) { const page = document.sections[id]!; add(`page:${id}`, page.title); page.children.forEach(block) }
  return targets
}

/** No ordinal, offset clamping, surrogate splitting or guessed fallback identity. */
export function validateDocumentCommentAnchor(document: TeachingDocument, anchor: DocumentThread['anchor']): void {
  if (!anchor) return
  const targets = documentCommentTargets(document), a = targets.get(anchor.from.blockId), b = targets.get(anchor.to.blockId)
  if (!a || !b) fail(422, 'comment-anchor-target-unavailable')
  for (const [point, target] of [[anchor.from, a], [anchor.to, b]] as const) {
    const offset = point.offset
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > target.text.length
      || offset > 0 && offset < target.text.length && /[\uD800-\uDBFF]/.test(target.text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(target.text[offset]!)) fail(422, 'comment-anchor-offset-invalid')
  }
  if (a.order > b.order || a.order === b.order && anchor.from.offset >= anchor.to.offset) fail(422, 'comment-anchor-range-invalid')
}

/** Shared native/editor permissions: editors may delete any discussion, but edit their own comment; a document owner may manage earlier authors. */
export function applyDocumentCommentAction(source: NonNullable<TeachingDocument['comments']>, action: DocumentCommentAction, context: DocumentCommentContext): { threads: NonNullable<TeachingDocument['comments']>, effect: DocumentCommentEffect } {
  const member = context.member
  if (!member?.id || !hasRole(member, 'editor')) fail(403, 'comment-permission-denied')
  if (!Number.isFinite(Date.parse(context.now))) fail(422, 'comment-clock-invalid')
  const allocate = () => { const id = context.allocate(); if (!id || id.length > 200 || ['__proto__', 'prototype', 'constructor'].includes(id)) fail(422, 'comment-id-invalid'); return id }
  const content = (value: RichTextNode[]): RichTextNode[] => {
    const result = structuredClone(value)
    const fresh = (node: RichTextNode | ListItemNode | TableCellNode | TableRowNode): void => {
      node.id = allocate()
      if (node.type === 'list' || node.type === 'listItem' || node.type === 'blockquote' || node.type === 'table' || node.type === 'tableRow') node.children.forEach(fresh)
      else if (node.type === 'extension') node.fallback.forEach(fresh)
    }
    if (context.allocateContentIds) result.forEach(fresh)
    return result
  }
  const create = (value: RichTextNode[], metadata?: JsonObject): DocumentComment => ({ id: allocate(), type: 'comment', userId: member.id, createdAt: context.now, updatedAt: context.now, content: content(value), reactions: [], ...metadata ? { metadata: structuredClone(metadata) } : {} })
  let thread: DocumentThread, commentId: string | undefined, changed = true
  if (action.type === 'comment.create') {
    const first = create(action.content, action.commentMetadata)
    thread = { id: allocate(), type: 'thread', createdAt: context.now, updatedAt: context.now, resolved: false, comments: [first], ...action.anchor ? { anchor: structuredClone(action.anchor) } : {}, ...action.metadata ? { metadata: structuredClone(action.metadata) } : {} }
    if (Object.hasOwn(source, thread.id)) fail(409, 'comment-id-repeated')
    commentId = first.id
  } else {
    if (!Object.hasOwn(source, action.threadId)) fail(404, 'document-thread-missing')
    if (source[action.threadId]!.deletedAt) fail(409, 'document-thread-deleted')
    thread = structuredClone(source[action.threadId]!)
    const find = (id: string) => { const comment = thread.comments.find(value => value.id === id); if (!comment) return fail(404, 'document-comment-missing'); if (comment.deletedAt) return fail(409, 'document-comment-deleted'); return comment }
    switch (action.type) {
      case 'comment.reply': { const comment = create(action.content, action.metadata); thread.comments.push(comment); commentId = comment.id; break }
      case 'comment.update': {
        const comment = find(action.commentId); if (comment.userId !== member.id && !hasRole(member, 'owner')) fail(403, 'comment-author-required')
        commentId = comment.id; comment.content = content(action.content); comment.updatedAt = context.now
        if (action.metadata) comment.metadata = structuredClone(action.metadata)
        break
      }
      case 'comment.react': {
        const comment = find(action.commentId), reaction = comment.reactions.find(value => value.emoji === action.emoji)
        if (!action.emoji || action.emoji.length > 32) fail(422, 'comment-reaction-invalid')
        commentId = comment.id; changed = Boolean(reaction?.userIds.includes(member.id)) !== action.active
        if (changed && action.active) { if (reaction) reaction.userIds.push(member.id); else comment.reactions.push({ emoji: action.emoji, createdAt: context.now, userIds: [member.id] }) }
        else if (changed && reaction) { reaction.userIds = reaction.userIds.filter(id => id !== member.id); comment.reactions = comment.reactions.filter(value => value.userIds.length) }
        break
      }
      case 'comment.resolve': case 'comment.reopen':
        changed = thread.resolved !== (action.type === 'comment.resolve')
        if (changed) { thread.resolved = action.type === 'comment.resolve'; thread.resolvedBy = member.id; thread.resolvedUpdatedAt = context.now }
        break
      case 'comment.delete':
        if (action.commentId) { find(action.commentId); commentId = action.commentId; thread.comments = thread.comments.filter(value => value.id !== commentId) }
        else thread.comments = []
        break
    }
    if (changed) thread.updatedAt = context.now
  }
  const threads = changed ? { ...source } : source, removed = !thread.comments.length
  if (changed) { if (removed) delete threads[thread.id]; else Object.defineProperty(threads, thread.id, { value: thread, enumerable: true, configurable: true, writable: true }) }
  return { threads, effect: { threadId: thread.id, ...commentId ? { commentId } : {}, changed, anchored: !removed && Boolean(thread.anchor), threadRemoved: removed, removedComments: Math.max(0, (source[thread.id]?.comments.length ?? 0) - thread.comments.length), comments: thread.comments.length, reactions: thread.comments.reduce((sum, comment) => sum + comment.reactions.length, 0) } }
}
