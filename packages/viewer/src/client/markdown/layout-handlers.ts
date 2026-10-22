import type { MdastNode } from '@lincyaw/kernel'
import type { ElementContent } from 'hast'
import type { Handler, State } from 'mdast-util-to-hast'
import { classes, element } from './hast.ts'

const WIDTHS = ['xs', 'sm', 'md', 'lg'] as const

function gridColumns(node: MdastNode): number[] {
  const given = Array.isArray(node.columns) ? node.columns.map(Number).filter(n => Number.isInteger(n) && n >= 1) : []
  return WIDTHS.map((_, i) => given[Math.min(i, given.length - 1)] ?? 1)
}

const style = (values: Record<string, number>) => Object.entries(values).map(([key, value]) => `${key}: ${value}`).join('; ')

const grid: Handler = (state, node: MdastNode) => {
  const columns = gridColumns(node)
  const children = state.all(node as never).map((child) => {
    const twelfths = child.type === 'element' ? Number(child.properties.dataPmColumns) : Number.NaN
    if (child.type !== 'element' || !(twelfths >= 1)) return child
    const spans = Object.fromEntries(WIDTHS.map((width, i) => [`--pm-span-${width}`, Math.min(columns[i]!, Math.max(1, Math.round(twelfths * columns[i]! / 12)))]))
    return { ...child, properties: { ...child.properties, style: style(spans) } }
  })
  const widths = Object.fromEntries(WIDTHS.map((width, i) => [`--pm-grid-${width}`, columns[i]!]))
  return element('div', { className: ['pm-grid', ...classes(node)], style: style(widths) }, children)
}

const gridItem: Handler = (state, node: MdastNode) =>
  element('div', { className: ['pm-grid__item', ...classes(node)], dataPmColumns: typeof node.columns === 'number' ? node.columns : undefined }, state.all(node as never))

const card: Handler = (state: State, node: MdastNode) => {
  const items = node.children ?? []
  const part = (type: string) => items.find(child => child.type === type)
  const url = typeof node.url === 'string' && node.url ? node.url : undefined
  const header = part('header')
  const footer = part('footer')
  const title = part('cardTitle')
  const content: ElementContent[] = []
  if (header) content.push(element('header', { className: ['pm-card__header'] }, state.all(header as never)))
  if (title || url) {
    const words: MdastNode[] = title?.children?.length ? title.children : [{ type: 'text', value: url ?? '' }]
    const inner = url ? [state.one({ type: 'link', url, children: words } as never, node as never) as ElementContent] : state.all({ type: 'paragraph', children: words } as never)
    content.push(element('p', { className: ['pm-card__title'] }, inner))
  }
  const body = items.filter(child => child !== header && child !== title && child !== footer)
  content.push(element('div', { className: ['pm-card__body'] }, state.all({ type: 'root', children: body } as never)))
  if (footer) content.push(element('footer', { className: ['pm-card__footer'] }, state.all(footer as never)))
  return element('div', { className: ['pm-card', ...url ? ['pm-card--link'] : [], ...classes(node)] }, content)
}

/** The handlers of MyST's grids and cards. */
export function layoutHandlers(): Record<string, Handler> {
  return {
    'grid': grid,
    'grid-item': gridItem,
    'card': card,
  }
}
