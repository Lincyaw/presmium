import { getBlockInfoFromNode, getBlockInfoNearPos, getNodeId } from '@blocknote/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { NativeDocumentEditor } from './schema.tsx'
import { TABLE_ENTITY_ATTRIBUTE } from './table-identities.ts'

/** Ephemeral native coordinates, converted to product entity ranges by the document adapter. */
export interface NativeTextPoint {
  blockId: string
  offset: number
  contentKind: 'inline' | 'plain' | 'table'
}
export interface NativeDocumentSelection {
  blockIds: string[]
  text: string
  from: NativeTextPoint
  to: NativeTextPoint
}

export interface NativeEditingCursor {
  nativeBlockId: string
  position: number
  objectSelected: boolean
}

/** The active endpoint owns text ranges; an object selection owns the selected object. */
export function nativeEditingCursor(editor: NativeDocumentEditor): NativeEditingCursor | undefined {
  if (editor.prosemirrorView.isDestroyed || !editor.isFocused()) return undefined
  const state = editor.prosemirrorState
  const objectSelected = state.selection instanceof NodeSelection
  const position = objectSelected ? state.selection.from : state.selection.head
  const info = getBlockInfoNearPos(state, position)
  return { nativeBlockId: getNodeId(info.block.node, state.doc), position, objectSelected }
}

// Product text counts a character per text character and one per other inline node (a break, a formula, a
// component), as in the kernel's comment anchors. A native inline formula holds its source as content, so native
// positions after it are further along than product offsets.
function inlineLength(content: ProseMirrorNode): number {
  let length = 0
  content.forEach(child => { length += child.isText ? child.nodeSize : 1 })
  return length
}

function inlineOffset(content: ProseMirrorNode, position: number): number {
  let offset = 0, start = 0
  for (let index = 0; index < content.childCount; index++) {
    const child = content.child(index)
    if (child.isText && position <= start + child.nodeSize) return offset + Math.max(0, position - start)
    // Inside an inline node is its start.
    if (!child.isText && position < start + child.nodeSize) return offset
    offset += child.isText ? child.nodeSize : 1
    start += child.nodeSize
  }
  return offset
}

function inlinePosition(content: ProseMirrorNode, offset: number): number {
  let remaining = Math.max(0, offset), start = 0
  for (let index = 0; index < content.childCount; index++) {
    const child = content.child(index), length = child.isText ? child.nodeSize : 1
    if (remaining === 0 || child.isText && remaining <= length) return start + remaining
    remaining -= length
    start += child.nodeSize
  }
  return start
}

/** A native range as product text: breaks as line breaks, other inline nodes as one object character. */
export function nativeProductText(document: ProseMirrorNode, from: number, to: number): string {
  let text = '', started = false
  document.nodesBetween(from, to, (node, position) => {
    if (node.isTextblock) { if (started) text += '\n'; started = true; return true }
    if (node.isText) { text += node.text!.slice(Math.max(from, position) - position, to - position); return false }
    if (node.isInline) { if (position >= from) text += node.type.name === 'hardBreak' ? '\n' : '\uFFFC'; return false }
    return true
  })
  return text
}

// Native cells contain paragraphs; the product flattens their boundaries to one break.
function cellTextOffset(cell: ProseMirrorNode, position: number): number {
  let offset = 0, before = 0
  for (let index = 0; index < cell.childCount; index++) {
    const paragraph = cell.child(index), start = before + 1
    if (position <= start + paragraph.content.size) return offset + inlineOffset(paragraph, Math.max(0, position - start))
    offset += inlineLength(paragraph) + 1
    before += paragraph.nodeSize
  }
  return Math.max(0, offset - 1)
}

function cellTextPosition(cell: ProseMirrorNode, offset: number): number {
  let remaining = Math.max(0, offset), before = 0, end = 1
  for (let index = 0; index < cell.childCount; index++) {
    const paragraph = cell.child(index), start = before + 1, length = inlineLength(paragraph)
    end = start + paragraph.content.size
    if (remaining <= length) return start + inlinePosition(paragraph, remaining)
    remaining -= length + 1
    before += paragraph.nodeSize
  }
  return end
}

export function nativeTextPoint(editor: NativeDocumentEditor, position: number): NativeTextPoint | undefined {
  const state = editor.prosemirrorState, resolved = state.doc.resolve(position)
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth)
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && typeof node.attrs[TABLE_ENTITY_ATTRIBUTE] === 'string') {
      return { blockId: node.attrs[TABLE_ENTITY_ATTRIBUTE] as string, offset: cellTextOffset(node, position - resolved.start(depth)), contentKind: 'table' }
    }
  }
  const info = getBlockInfoNearPos(state, position)
  if (!info.hasContent || info.contentKind === 'none') return undefined
  const relative = Math.max(0, Math.min(position - info.contentStart, info.contentEnd - info.contentStart))
  return { blockId: getNodeId(info.block.node, state.doc), offset: info.contentKind === 'inline' ? inlineOffset(info.content.node, relative) : relative, contentKind: info.contentKind }
}

export function nativeTextPosition(editor: NativeDocumentEditor, point: { blockId: string, offset: number }): number | undefined {
  return nativeTextPositionInDocument(editor.prosemirrorState.doc, point)
}

/** Stable anchor lookup against a captured native transaction’s input document. */
export function nativeTextPositionInDocument(document: ProseMirrorNode, point: { blockId: string, offset: number }): number | undefined {
  let position: number | undefined
  document.descendants((node, beforePos) => {
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.attrs[TABLE_ENTITY_ATTRIBUTE] === point.blockId) {
      position = beforePos + 1 + cellTextPosition(node, point.offset)
      return false
    }
    if (node.attrs.id !== point.blockId) return
    const info = getBlockInfoFromNode(node, beforePos)
    if (info.hasContent) position = info.contentStart + (info.contentKind === 'inline' ? inlinePosition(info.content.node, point.offset) : Math.max(0, Math.min(point.offset, info.contentEnd - info.contentStart)))
    return false
  })
  return position
}

export function documentSelection(editor: NativeDocumentEditor): NativeDocumentSelection | undefined {
  const state = editor.prosemirrorState
  if (state.selection.empty) return undefined
  const selected = editor.getSelection()
  if (!selected?.blocks.length || !editor.getSelectedText().trim()) return undefined
  const from = nativeTextPoint(editor, state.selection.from), to = nativeTextPoint(editor, state.selection.to)
  if (!from || !to) return undefined
  return {
    blockIds: selected.blocks.map(block => block.id),
    text: state.doc.textBetween(state.selection.from, state.selection.to, '\n'),
    from,
    to,
  }
}
