import { currentLocale } from '@lincyaw/host'
import type { IRBlock, MarkdownNode } from '@lincyaw/kernel'
import type { ElementContent, Properties, RootContent } from 'hast'
import { find, html as schema } from 'property-information'
import type { ComponentType, ReactNode } from 'react'
import { useContext } from 'react'
import { useStore } from '@lincyaw/host'
import { h } from '../element.ts'
import { itemVisible } from '../../domain/index.ts'
import { CodeView } from '../code/code-view.ts'
import { VIEWER } from '../viewer-state.ts'
import { asViewerNode, markdownToHast, viewerLinks } from './handlers.ts'
import type { ViewerNode } from './handlers.ts'
import { PmMath } from './math.ts'
import { PmMermaid } from './mermaid.ts'
import { PmRoleMark } from './role-mark.ts'
import { tabEntries, TabSetView } from './tabs.ts'
import { cachedTree } from './tree-cache.ts'

function attributes(properties: Properties): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined || value === false) continue
    const info = find(schema, key)
    attrs[info.attribute] = value === true ? (info.boolean ? true : '') : Array.isArray(value) ? value.join(info.commaSeparated ? ', ' : ' ') : value
  }
  return attrs
}

function viewerComponent(node: ViewerNode): [ComponentType<any>, Record<string, unknown>] {
  switch (node.type) {
    case 'pmMath': return [PmMath, { tex: node.tex, display: node.display, html: node.html }]
    case 'pmMermaid': return [PmMermaid, { code: node.code }]
    case 'pmCode': return [CodeView, { lang: node.lang, value: node.code }]
    case 'pmRole': return [PmRoleMark, { mark: node.mark }]
  }
}

export interface HastRenderContext {
  hidden?(item: number): boolean
}

const RAW_TEXT = new Set(['script', 'style'])

export function hastToVNodes(nodes: readonly (RootContent | ElementContent)[], ctx: HastRenderContext): ReactNode[] {
  return nodes.map((node): ReactNode => {
    const own = asViewerNode(node)
    if (own) {
      const [component, props] = viewerComponent(own)
      return h(component, props)
    }
    if (node.type === 'text') return node.value
    if (node.type !== 'element') return null
    const attrs = attributes(node.properties)
    const item = node.properties.dataPmItem
    if (typeof item === 'number' && ctx.hidden?.(item)) attrs.class = [attrs.class, 'pm-hidden']
    if (RAW_TEXT.has(node.tagName)) return h(node.tagName, { ...attrs, innerHTML: node.children.map(c => (c.type === 'text' ? c.value : '')).join('') })
    if (node.properties.dataPmTabs !== undefined) {
      return h(TabSetView, { class: attrs.class, tabs: tabEntries(node, children => hastToVNodes(children, ctx)) })
    }
    return h(node.tagName, attrs, hastToVNodes(node.children, ctx))
  })
}

export function MarkdownView(props: { block: IRBlock, step: number, expanded?: boolean, prefix?: string }) {
  const viewer = useContext(VIEWER)
  const doc = useStore(viewer?.doc)
  const links = viewerLinks(viewer)
  const node = props.block.node as MarkdownNode
  const tree = viewer && doc ? cachedTree(viewer, doc, node.mdast, props.prefix ?? '', links, currentLocale()) : markdownToHast(node.mdast, props.prefix ?? '', links)
  const hidden = node.reveal === 'items' && !props.expanded ? (k: number) => !itemVisible(props.block, k, props.step) : undefined
  return h('div', { className: 'pm-markdown' }, hastToVNodes(tree.children, { hidden }))
}
