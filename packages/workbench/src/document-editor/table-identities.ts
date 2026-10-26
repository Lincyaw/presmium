import { createExtension, getBlockInfoNearPos, getNodeId } from '@blocknote/core'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { NativeDocumentEditor } from './schema.tsx'
import type { RichProjection } from './rich-text.ts'

export const TABLE_ENTITY_ATTRIBUTE = 'presmiumEntityId'
const ATTR = TABLE_ENTITY_ATTRIBUTE
const TYPES = ['tableRow', 'tableCell', 'tableHeader']

/** Public schema attributes give native table transactions stable product identities. */
export const tableIdentityExtension = createExtension({
  key: 'presmiumTableIdentities',
  tiptapExtensions: [Extension.create({
    name: 'presmiumTableEntityAttributes',
    addGlobalAttributes: () => [{ types: TYPES, attributes: {
      [ATTR]: { default: null, parseHTML: element => element.getAttribute('data-presmium-entity-id'), renderHTML: attributes => attributes[ATTR] ? { 'data-presmium-entity-id': attributes[ATTR] } : {} },
    } }],
  })],
  prosemirrorPlugins: [new Plugin({
    appendTransaction(transactions, _before, after) {
      if (!transactions.some(transaction => transaction.docChanged)) return
      const transaction = after.tr, used = new Set<string>()
      after.doc.descendants((node, position) => {
        if (!TYPES.includes(node.type.name)) return
        let id = node.attrs[ATTR] as string | null
        if (!id || used.has(id)) { id = crypto.randomUUID(); transaction.setNodeMarkup(position, undefined, { ...node.attrs, [ATTR]: id }) }
        used.add(id)
      })
      if (transaction.steps.length) return transaction.setMeta('addToHistory', false)
    },
  })],
})

export function seedTableIdentities(editor: NativeDocumentEditor, context: RichProjection): void {
  const state = editor.prosemirrorState, updates: { position: number, id: string }[] = []
  state.doc.descendants((node, position) => {
    if (node.type.name !== 'table') return
    const info = getBlockInfoNearPos(state, position), original = context.rich.get(getNodeId(info.block.node, state.doc))?.original
    if (original?.type !== 'table') return false
    node.forEach((row, rowOffset, rowIndex) => {
      const source = original.children[rowIndex]
      if (!source) return
      updates.push({ position: position + 1 + rowOffset, id: source.id })
      row.forEach((_cell, cellOffset, cellIndex) => { if (source.children[cellIndex]) updates.push({ position: position + 2 + rowOffset + cellOffset, id: source.children[cellIndex]!.id }) })
    })
    return false
  })
  if (!updates.length) return
  editor.transact(transaction => {
    for (const { position, id } of updates) { const node = transaction.doc.nodeAt(position)!; transaction.setNodeMarkup(position, undefined, { ...node.attrs, [ATTR]: id }) }
    transaction.setMeta('addToHistory', false)
  })
}

export function captureTableIdentities(editor: NativeDocumentEditor, context: RichProjection): void {
  const state = editor.prosemirrorState
  context.tables.clear()
  state.doc.descendants((node, position) => {
    if (node.type.name !== 'table') return
    const info = getBlockInfoNearPos(state, position), tableId = getNodeId(info.block.node, state.doc)
    const rows: { id: string, cells: string[] }[] = []
    node.forEach(row => { const cells: string[] = []; row.forEach(cell => cells.push(cell.attrs[ATTR] as string)); rows.push({ id: row.attrs[ATTR] as string, cells }) })
    context.tables.set(tableId, rows)
    return false
  })
}
