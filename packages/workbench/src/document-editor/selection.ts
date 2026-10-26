import { getBlockInfoFromNode, getBlockInfoNearPos, getNodeId } from '@blocknote/core'
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

export function nativeTextPoint(editor: NativeDocumentEditor, position: number): NativeTextPoint | undefined {
  const state = editor.prosemirrorState, resolved = state.doc.resolve(position)
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth)
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && typeof node.attrs[TABLE_ENTITY_ATTRIBUTE] === 'string') {
      const start = resolved.start(depth) + 1
      return { blockId: node.attrs[TABLE_ENTITY_ATTRIBUTE] as string, offset: Math.max(0, Math.min(position - start, node.firstChild?.content.size ?? 0)), contentKind: 'table' }
    }
  }
  const info = getBlockInfoNearPos(state, position)
  if (!info.hasContent || info.contentKind === 'none') return undefined
  return { blockId: getNodeId(info.block.node, state.doc), offset: Math.max(0, Math.min(position - info.contentStart, info.contentEnd - info.contentStart)), contentKind: info.contentKind }
}

export function nativeTextPosition(editor: NativeDocumentEditor, point: { blockId: string, offset: number }): number | undefined {
  let position: number | undefined
  editor.prosemirrorState.doc.descendants((node, beforePos) => {
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.attrs[TABLE_ENTITY_ATTRIBUTE] === point.blockId) {
      position = beforePos + 2 + Math.max(0, Math.min(point.offset, node.firstChild?.content.size ?? 0))
      return false
    }
    if (node.attrs.id !== point.blockId) return
    const info = getBlockInfoFromNode(node, beforePos)
    if (info.hasContent) position = info.contentStart + Math.max(0, Math.min(point.offset, info.contentEnd - info.contentStart))
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
