import type { InlineNode, ListItemNode, RichTextNode, TableNode } from '@lincyaw/kernel'
import type { TableCellProps } from '@blocknote/core'
import { nativeInlineToProduct, nativeTextStyleToProduct, productInlineToNative, productTextStyleToNative } from './inline.ts'
import type { InlineProjectionContext, NativeInline } from './inline.ts'
import type { DocumentEditorBlock, DocumentEditorInput } from './schema.tsx'
import { fallbackText } from './DocumentBlockFallback.tsx'

interface RichIdentity {
  original?: RichTextNode
  listId?: string
  itemId?: string
  paragraphId?: string
}
export interface RichProjection extends InlineProjectionContext {
  rich: Map<string, RichIdentity>
  baseline: Map<string, string>
  tables: Map<string, { id: string, cells: string[] }[]>
}
export function createRichProjection(): RichProjection {
  return { rich: new Map(), baseline: new Map(), tables: new Map(), opaqueInline: new Map(), newInlineId: () => crypto.randomUUID() }
}
export function captureRichBaseline(blocks: readonly DocumentEditorBlock[], context: RichProjection): void {
  for (const block of blocks) { context.baseline.set(block.id, JSON.stringify(block)); captureRichBaseline(block.children, context) }
}
const id = () => crypto.randomUUID()
const atom = (node: RichTextNode): DocumentEditorInput => ({ id: node.id, type: 'presmiumAtom', props: { entityId: node.id, kind: `rich:${node.type}`, label: node.type === 'math' ? node.value : node.type === 'extension' ? fallbackText(node.fallback) : fallbackText(node) } })

/** The projection records structural identities; the saved document owns all content. */
export function productRichTextToNative(nodes: readonly RichTextNode[], context: RichProjection): DocumentEditorInput[] {
  return nodes.flatMap((node): DocumentEditorInput[] => {
    context.rich.set(node.id, { original: structuredClone(node) })
    if (node.type === 'paragraph' || node.type === 'heading') return [{ id: node.id, type: node.type, props: { ...productTextStyleToNative(node.style), ...node.type === 'heading' ? { level: node.level } : {} }, content: productInlineToNative(node.children, context) } as DocumentEditorInput]
    if (node.type === 'code') return [{ id: node.id, type: 'codeBlock', props: { language: node.language }, content: node.value }]
    if (node.type === 'math' || node.type === 'extension') return [atom(node)]
    if (node.type === 'blockquote') {
      const [first, ...rest] = node.children
      if (!first || first.type !== 'paragraph') return [{ ...atom(node), children: productRichTextToNative(node.children, context) }]
      context.rich.set(node.id, { original: structuredClone(node), paragraphId: first.id })
      return [{ id: node.id, type: 'quote', props: productTextStyleToNative(first.style), content: productInlineToNative(first.children, context), children: productRichTextToNative(rest, context) }]
    }
    if (node.type === 'list') return node.children.map((item, index) => {
      const [first, ...rest] = item.children
      const paragraph = first?.type === 'paragraph' ? first : undefined
      context.rich.set(item.id, { listId: node.id, itemId: item.id, paragraphId: paragraph?.id })
      return {
        id: item.id, type: item.checked !== undefined ? 'checkListItem' : node.ordered ? 'numberedListItem' : 'bulletListItem',
        props: { ...productTextStyleToNative(paragraph?.style), ...item.checked !== undefined ? { checked: item.checked } : {}, ...node.ordered && index === 0 && node.start !== undefined ? { start: node.start } : {} },
        content: productInlineToNative(paragraph?.children ?? [], context), children: productRichTextToNative(paragraph ? rest : item.children, context),
      } as DocumentEditorInput
    })
    return [{ id: node.id, type: 'table', content: {
      type: 'tableContent', columnWidths: node.columnWidths ?? [], headerRows: node.headerRows, headerCols: node.headerColumns,
      rows: node.children.map(row => ({ cells: row.children.map(cell => ({ type: 'tableCell' as const, props: { ...productTextStyleToNative(cell.style), colspan: cell.colspan, rowspan: cell.rowspan }, content: productInlineToNative(cell.children, context) })) })),
    } }]
  })
}

function inline(block: DocumentEditorBlock, context: RichProjection): InlineNode[] {
  return Array.isArray(block.content) ? nativeInlineToProduct(block.content as NativeInline[], context) : []
}
function paragraph(block: DocumentEditorBlock, context: RichProjection, paragraphId = block.id): RichTextNode {
  const style = nativeTextStyleToProduct('textAlignment' in block.props ? block.props : {})
  return { id: paragraphId, type: 'paragraph', children: inline(block, context), ...style ? { style } : {} }
}
function listType(block: DocumentEditorBlock): boolean { return block.type === 'bulletListItem' || block.type === 'numberedListItem' || block.type === 'checkListItem' }

function rememberListIds(node: RichTextNode, used?: Set<string>): Set<string> | undefined {
  if (node.type === 'list') { used ??= new Set(); used.add(node.id); for (const item of node.children) for (const child of item.children) used = rememberListIds(child, used) }
  else if (node.type === 'blockquote') for (const child of node.children) used = rememberListIds(child, used)
  else if (node.type === 'extension') for (const child of node.fallback) used = rememberListIds(child, used)
  return used
}

/** Native text, table and list edits are read through BlockNote's public block API. */
export function nativeRichTextToProduct(blocks: readonly DocumentEditorBlock[], context: RichProjection, usedListIds?: Set<string>): RichTextNode[] {
  const result: RichTextNode[] = []
  let groupOrigin: string | undefined
  for (const block of blocks) {
    const identity = context.rich.get(block.id)
    if (identity?.original && context.baseline.get(block.id) === JSON.stringify(block)) { usedListIds = rememberListIds(identity.original, usedListIds); result.push(structuredClone(identity.original)); groupOrigin = undefined; continue }
    if (listType(block)) {
      usedListIds ??= new Set()
      const ordered = block.type === 'numberedListItem'
      const start = block.type === 'numberedListItem' ? block.props.start : undefined
      let previous = result.at(-1)
      if (previous?.type !== 'list' || previous.ordered !== ordered || identity?.listId && identity.listId !== groupOrigin) {
        const listId = identity?.listId && !usedListIds.has(identity.listId) ? identity.listId : id()
        groupOrigin = identity?.listId ?? listId
        previous = { id: listId, type: 'list', ordered, ...start !== undefined ? { start } : {}, children: [] }
        usedListIds.add(listId)
        result.push(previous)
      }
      const item: ListItemNode = {
        id: identity?.itemId ?? block.id, type: 'listItem',
        children: [paragraph(block, context, identity?.paragraphId ?? id()), ...nativeRichTextToProduct(block.children, context, usedListIds)],
        ...block.type === 'checkListItem' ? { checked: block.props.checked } : {},
      }
      previous.children.push(item)
      context.rich.set(block.id, { ...identity, original: undefined, listId: previous.id, itemId: item.id, paragraphId: item.children[0]!.id })
      continue
    }
    groupOrigin = undefined
    if (block.type === 'paragraph') result.push(paragraph(block, context))
    else if (block.type === 'heading') {
      const style = nativeTextStyleToProduct(block.props)
      result.push({ id: block.id, type: 'heading', level: Math.max(1, Math.min(6, block.props.level)) as 1 | 2 | 3 | 4 | 5 | 6, children: inline(block, context), ...style ? { style } : {} })
    } else if (block.type === 'quote') result.push({ id: block.id, type: 'blockquote', children: [paragraph(block, context, identity?.paragraphId ?? id()), ...nativeRichTextToProduct(block.children, context, usedListIds ??= new Set())] })
    else if (block.type === 'codeBlock') result.push({ id: block.id, type: 'code', language: block.props.language, value: block.content.map(part => part.text).join('') })
    else if (block.type === 'table') {
      const original = identity?.original?.type === 'table' ? identity.original : undefined
      const table: TableNode = {
        id: block.id, type: 'table', ...block.content.headerRows ? { headerRows: block.content.headerRows } : {},
        ...block.content.headerCols ? { headerColumns: block.content.headerCols } : {},
        ...block.content.columnWidths.length && block.content.columnWidths.every(width => typeof width === 'number' && Number.isFinite(width) && width > 0) ? { columnWidths: block.content.columnWidths as number[] } : {},
        children: block.content.rows.map((row, rowIndex) => ({
          id: context.tables.get(block.id)?.[rowIndex]?.id ?? original?.children[rowIndex]?.id ?? id(), type: 'tableRow', children: row.cells.map((cell, cellIndex) => {
            const props: Partial<TableCellProps> = Array.isArray(cell) ? {} : cell.props, style = nativeTextStyleToProduct(props)
            return { id: context.tables.get(block.id)?.[rowIndex]?.cells[cellIndex] ?? original?.children[rowIndex]?.children[cellIndex]?.id ?? id(), type: 'tableCell', children: nativeInlineToProduct(Array.isArray(cell) ? cell : cell.content, context), ...style ? { style } : {}, ...props.colspan && props.colspan !== 1 ? { colspan: props.colspan } : {}, ...props.rowspan && props.rowspan !== 1 ? { rowspan: props.rowspan } : {} }
          }),
        })),
      }
      context.rich.set(block.id, { original: structuredClone(table) })
      result.push(table)
    } else if (block.type === 'presmiumAtom' && block.props.kind.startsWith('rich:')) {
      if (!identity?.original) throw new Error('document-rich-reference')
      const original = structuredClone(identity.original)
      if (original.type === 'blockquote') original.children = nativeRichTextToProduct(block.children, context, usedListIds ??= new Set())
      else usedListIds = rememberListIds(original, usedListIds)
      result.push(original)
    } else throw new Error(`document-rich-block:${block.type}`)
    if (block.children.length && block.type !== 'quote' && block.type !== 'presmiumAtom') result.push(...nativeRichTextToProduct(block.children, context, usedListIds ??= new Set()))
  }
  return result
}
