import type { MdastNode } from '@lincyaw/kernel'
import type { Element } from 'hast'
import type { Handler, State } from 'mdast-util-to-hast'
import { element } from './hast.ts'

function sourceElement(state: State, node: MdastNode, result: Element): Element {
  if (typeof node.identifier === 'string') result.properties.id = node.identifier
  state.patch(node as never, result)
  return state.applyData(node as never, result)
}

/** Preserve the canonical logical table grid instead of GFM's first-row-only model. */
export const tableHandler: Handler = (state, node: MdastNode) => {
  const rows = node.children ?? []
  const headerRows = typeof node.headerRows === 'number' ? node.headerRows : Math.min(1, rows.length)
  const headerColumns = typeof node.headerColumns === 'number' ? node.headerColumns : 0
  let spans: { from: number, to: number, until: number }[] = []
  let crossesHeader = false
  const rendered = rows.map((row, rowIndex) => {
    spans = spans.filter(span => span.until > rowIndex).sort((a, b) => a.from - b.from)
    let column = 0, index = 0
    const added: typeof spans = []
    const cells = (row.children ?? []).map(cell => {
      const colspan = typeof cell.colspan === 'number' ? cell.colspan : 1
      const rowspan = typeof cell.rowspan === 'number' ? cell.rowspan : 1
      while (spans[index] && spans[index]!.from <= column) { column = Math.max(column, spans[index]!.to); index++ }
      const columnHeader = rowIndex < headerRows, rowHeader = column < headerColumns
      const result = sourceElement(state, cell, element(columnHeader || rowHeader ? 'th' : 'td', {
        ...colspan > 1 ? { colSpan: colspan } : {},
        ...rowspan > 1 ? { rowSpan: rowspan } : {},
        ...columnHeader ? { scope: colspan > 1 ? 'colgroup' : 'col' } : rowHeader ? { scope: rowspan > 1 ? 'rowgroup' : 'row' } : {},
      }, state.all(cell as never)))
      if (rowspan > 1) added.push({ from: column, to: column + colspan, until: rowIndex + rowspan })
      if (rowIndex < headerRows && rowIndex + rowspan > headerRows) crossesHeader = true
      column += colspan
      return result
    })
    spans.push(...added)
    return sourceElement(state, row, element('tr', {}, cells))
  })
  const widths = Array.isArray(node.columnWidths) ? node.columnWidths : []
  const columns = widths.length ? [element('colgroup', {}, widths.map(width => element('col', { style: `width:${Number(width)}px` })))] : []
  // HTML spans cannot cross row-group boundaries. Keep those tables in one group,
  // with each header cell's scope retaining the authored header semantics.
  const groups = headerRows > 0 && !crossesHeader
    ? [element('thead', {}, rendered.slice(0, headerRows)), ...rendered.length > headerRows ? [element('tbody', {}, rendered.slice(headerRows))] : []]
    : [element('tbody', {}, rendered)]
  return sourceElement(state, node, element('table', {}, [...columns, ...groups]))
}
