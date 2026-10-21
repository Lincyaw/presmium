import { currentLocale } from '@lincyaw/host'
import { roleMark } from '@lincyaw/kernel'
import type { IRBlock, IRDocument, MarkdownNode, MdastNode } from '@lincyaw/kernel'
import type { Element, ElementContent, Nodes, Properties, Root, RootContent } from 'hast'
import { raw } from 'hast-util-raw'
import type { Handler, Handlers, State } from 'mdast-util-to-hast'
import { defaultHandlers, toHast } from 'mdast-util-to-hast'
import { find, html as schema } from 'property-information'
import type { Component, PropType, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject } from 'vue'
import { cardHandlers, isButton, tabEntries, TabSetView } from './cards.ts'
import { CodeView } from './code.ts'
import { itemVisible } from './domain/index.ts'
import { messages } from './i18n.ts'
import { PmMath, PmMermaid, PmRoleMark } from './rich.ts'
import { footnoteId, VIEWER } from './viewer.ts'
import type { Viewer } from './viewer.ts'

export interface MarkdownLinks {
  footnoteHref?(identifier: string): string
  section?(id: string): { href: string, title: string } | undefined
}

export function viewerLinks(viewer: Viewer | undefined): MarkdownLinks {
  if (!viewer) return {}
  return {
    footnoteHref: viewer.footnoteHref,
    section(id) {
      const section = viewer.section(id)
      return section && { href: viewer.options.sectionHref?.(id) ?? `#${id}`, title: section.title }
    },
  }
}

function element(tagName: string, properties: Properties, children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children }
}

function text(value: string): ElementContent {
  return { type: 'text', value }
}

type ViewerNode =
  | { type: 'pmMath', tex: string, display: boolean, html?: string }
  | { type: 'pmMermaid', code: string }
  | { type: 'pmCode', lang: string, code: string }
  | { type: 'pmRole', mark: string }

const VIEWER_NODES: ViewerNode['type'][] = ['pmMath', 'pmMermaid', 'pmCode', 'pmRole']

function viewerNode(node: ViewerNode): ElementContent {
  return node as unknown as ElementContent
}

function asViewerNode(node: { type: string }): ViewerNode | undefined {
  return (VIEWER_NODES as string[]).includes(node.type) ? node as ViewerNode : undefined
}

const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dt', 'dd', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'iframe', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
])

function isBlock(node: ElementContent): boolean {
  const own = asViewerNode(node)
  if (own) return own.type === 'pmMermaid' || own.type === 'pmCode' || (own.type === 'pmMath' && own.display)
  return node.type === 'element' && BLOCK_ELEMENTS.has(node.tagName)
}

export function decoded(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function unknown(state: State, node: MdastNode): ElementContent | undefined {
  if (!node.children) return typeof node.value === 'string' ? text(node.value) : undefined
  const children = state.all(node as never)
  return element(children.some(isBlock) ? 'div' : 'span', {}, children)
}

function classes(node: MdastNode): string[] {
  return typeof node.class === 'string' ? node.class.split(/\s+/).filter(Boolean) : []
}

function classed(node: MdastNode, properties: Properties = {}): Properties {
  const names = classes(node)
  return names.length ? { ...properties, className: names } : properties
}

function handlers(links: MarkdownLinks): Handlers {
  const footnoteHref = links.footnoteHref ?? ((identifier: string) => `#${footnoteId(identifier)}`)
  const wrap = (tagName: string, className?: string): Handler => (state, node) =>
    element(tagName, className ? { className: [className] } : {}, state.all(node))
  const value = (node: { value?: unknown }) => (typeof node.value === 'string' ? node.value : '')
  const identifier = (node: { identifier?: unknown, label?: unknown }) => String(node.identifier ?? node.label)
  const label = (node: { identifier?: unknown, label?: unknown }) => String(node.label ?? node.identifier)
  const mark = (node: { identifier?: unknown, label?: unknown, enumerator?: unknown }) => (node.enumerator !== undefined ? String(node.enumerator) : label(node))
  const math = (node: MdastNode, display: boolean) => viewerNode({ type: 'pmMath', tex: value(node), display, html: typeof node.html === 'string' ? node.html : undefined })
  const reference = (el: Element, id: string, fallback: string): Element => {
    const target = id ? links.section?.(id) : undefined
    if (target) el.properties.href = target.href
    if (el.children.length === 0) el.children = [text(target?.title ?? fallback)]
    return el
  }
  const custom: Record<string, Handler> = {
    math: (_, node) => math(node, true),
    inlineMath: (_, node) => math(node, false),
    mermaid: (_, node) => viewerNode({ type: 'pmMermaid', code: value(node) }),
    code: (_, node) => viewerNode({ type: 'pmCode', lang: typeof node.lang === 'string' ? node.lang : '', code: value(node) }),
    iframe: (_, node) => element('iframe', {
      src: typeof node.src === 'string' ? node.src : '',
      width: node.width == null || node.width === '' ? undefined : String(node.width),
      height: node.height == null || node.height === '' ? undefined : String(node.height),
      loading: 'lazy',
    }),
    admonition(state, node) {
      const names = messages().markdown.admonitions
      const extra = classes(node)
      const kind = typeof node.kind === 'string' ? node.kind : extra.find(c => c in names) ?? 'note'
      const children = state.all(node)
      const titled = (node.children as MdastNode[] | undefined)?.some(c => c.type === 'admonitionTitle')
      const title = titled ? [] : [element('p', { className: ['pm-admonition__title'] }, [text(names[kind] ?? kind)])]
      return element('aside', { className: [...new Set(['pm-admonition', `pm-admonition--${kind}`, ...extra])] }, [...title, ...children])
    },
    admonitionTitle: wrap('p', 'pm-admonition__title'),
    footnoteReference: (_, node) => element('sup', { className: ['pm-footnote-ref'] }, [
      element('a', { href: footnoteHref(identifier(node)), dataLabel: mark(node), ariaLabel: messages().markdown.footnote(mark(node)) }, []),
    ]),
    footnoteDefinition: (state, node) => element('div', { id: footnoteId(identifier(node)), className: ['pm-footnote'] }, [
      element('sup', { dataLabel: mark(node) }, []),
      ...state.all(node),
    ]),
    container: (state, node) => element('figure', { id: typeof node.identifier === 'string' ? node.identifier : undefined, className: ['pm-figure'] }, state.all(node)),
    caption: wrap('figcaption'),
    legend: wrap('div', 'pm-legend'),
    abbreviation: (state, node) => element('abbr', typeof node.title === 'string' ? { title: node.title } : {}, state.all(node)),
    crossReference: (state, node) => reference(element('a', { href: `#${identifier(node)}` }, state.all(node)), identifier(node), label(node)),
    link(state, node) {
      const el = defaultHandlers.link(state, node as never)
      if (isButton(node)) el.properties.className = ['pm-button']
      const url = typeof node.url === 'string' ? node.url : ''
      return url.startsWith('#') ? reference(el, decoded(url.slice(1)), url.slice(1)) : reference(el, '', url)
    },
    keyboard: wrap('kbd'),
    subscript: wrap('sub'),
    superscript: wrap('sup'),
    underline: wrap('u'),
    definitionList: wrap('dl'),
    definitionTerm: wrap('dt'),
    definitionDescription: wrap('dd'),
    details: (state, node) => element('details', classed(node, { open: node.open === true }), state.all(node)),
    summary: wrap('summary'),
    div: (state, node) => element('div', classed(node), state.all(node)),
    span: (state, node) => element('span', isButton(node) ? { className: ['pm-button'] } : classed(node), state.all(node)),
    ...cardHandlers(),
    presmiumRole(state, node) {
      const children = state.all(node)
      return children.length
        ? element('span', { className: ['pm-role'], dataRole: String(node.name ?? '') }, children)
        : viewerNode({ type: 'pmRole', mark: roleMark(node) })
    },
  }
  return custom as Handlers
}

function slug(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}

function textOf(node: ElementContent | Root): string {
  if (node.type === 'text') return node.value
  return 'children' in node ? node.children.map(c => textOf(c as ElementContent)).join('') : ''
}

export function markdownToHast(mdast: MdastNode, prefix: string, links: MarkdownLinks = {}): Root {
  const html = toHast(mdast as never, { allowDangerousHtml: true, handlers: handlers(links), unknownHandler: unknown as never }) as Nodes
  const tree = raw(html, { passThrough: VIEWER_NODES }) as Root
  let item = 0
  for (const child of tree.children) {
    if (child.type !== 'element') continue
    if (/^h[1-6]$/.test(child.tagName) && child.properties.id === undefined) child.properties.id = `${prefix}-${slug(textOf(child))}`
    if (child.tagName !== 'ul' && child.tagName !== 'ol') continue
    for (const li of child.children) {
      if (li.type === 'element' && li.tagName === 'li') li.properties.dataPmItem = item++
    }
  }
  return tree
}

interface CachedTree {
  node: MdastNode
  key: string
  tree: Root
  bytes: number
}

interface DocumentTrees {
  nodes: Map<MdastNode, Map<string, CachedTree>>
  recent: Map<CachedTree, true>
  bytes: number
}

const TREE_LIMIT = 256
const TREE_BYTES = 4 << 20
const viewerTrees = new WeakMap<Viewer, WeakMap<IRDocument, DocumentTrees>>()

function reusableTree(viewer: Viewer, doc: IRDocument, node: MdastNode, prefix: string, links: MarkdownLinks, locale: string): Root {
  const key = JSON.stringify([prefix, locale])
  let documentTrees = viewerTrees.get(viewer)
  if (!documentTrees) {
    documentTrees = new WeakMap()
    viewerTrees.set(viewer, documentTrees)
  }
  let cache = documentTrees.get(doc)
  const known = cache?.nodes.get(node)?.get(key)
  if (cache && known) {
    cache.recent.delete(known)
    cache.recent.set(known, true)
    return known.tree
  }
  const tree = markdownToHast(node, prefix, links)
  // Only immutable HAST survives component unmounts; no VNodes or mounted resources are retained.
  const bytes = JSON.stringify(tree).length * 2 // UTF-16 JSON size is a soft heap estimate.
  if (bytes > TREE_BYTES) return tree
  if (!cache) {
    cache = { nodes: new Map(), recent: new Map(), bytes: 0 }
    documentTrees.set(doc, cache)
  }
  const entry: CachedTree = { node, key, tree, bytes }
  const variants = cache.nodes.get(node) ?? new Map<string, CachedTree>()
  variants.set(key, entry)
  cache.nodes.set(node, variants)
  cache.recent.set(entry, true)
  cache.bytes += bytes
  while (cache.recent.size > TREE_LIMIT || cache.bytes > TREE_BYTES) {
    const first = cache.recent.keys().next().value!
    cache.recent.delete(first)
    cache.bytes -= first.bytes
    const old = cache.nodes.get(first.node)!
    old.delete(first.key)
    if (old.size === 0) cache.nodes.delete(first.node)
  }
  return tree
}

function attributes(properties: Properties): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined || value === false) continue
    const info = find(schema, key)
    attrs[info.attribute] = value === true ? (info.boolean ? true : '') : Array.isArray(value) ? value.join(info.commaSeparated ? ', ' : ' ') : value
  }
  return attrs
}

function viewerComponent(node: ViewerNode): [Component, Record<string, unknown>] {
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

export function hastToVNodes(nodes: readonly (RootContent | ElementContent)[], ctx: HastRenderContext): VNodeChild[] {
  return nodes.map((node): VNodeChild => {
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

export const MarkdownView = defineComponent({
  name: 'PmMarkdown',
  props: {
    block: { type: Object as PropType<IRBlock>, required: true },
    step: { type: Number, required: true },
    expanded: Boolean,
    prefix: { type: String, default: '' },
  },
  setup(props) {
    const viewer = inject(VIEWER, undefined)
    const links = viewerLinks(viewer)
    const tree = computed(() => {
      const node = (props.block.node as MarkdownNode).mdast
      return viewer
        ? reusableTree(viewer, viewer.doc.value, node, props.prefix, links, currentLocale())
        : markdownToHast(node, props.prefix, links)
    })
    return () => {
      const node = props.block.node as MarkdownNode
      const hidden = node.reveal === 'items' && !props.expanded ? (k: number) => !itemVisible(props.block, k, props.step) : undefined
      return hastToVNodes(tree.value.children, { hidden })
    }
  },
})
