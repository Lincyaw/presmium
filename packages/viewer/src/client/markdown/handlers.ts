import { isButton, roleMark, safeDecodeURIComponent, urlSlug } from '@lincyaw/kernel'
import type { MdastNode } from '@lincyaw/kernel'
import type { Element, ElementContent, Nodes, Root } from 'hast'
import { raw } from 'hast-util-raw'
import type { Handler, Handlers, State } from 'mdast-util-to-hast'
import { defaultHandlers, toHast } from 'mdast-util-to-hast'
import { viewerMessages } from '../viewer-messages.ts'
import { footnoteId } from '../viewer-state.ts'
import type { Viewer } from '../viewer-state.ts'
import { classed, classes, element, text } from './hast.ts'
import { layoutHandlers } from './layout-handlers.ts'
import { tabHandlers } from './tabs.ts'

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

/** The nodes the viewer renders with its own components; they pass through the HAST tree untouched. */
export type ViewerNode =
  | { type: 'pmMath', tex: string, display: boolean, html?: string }
  | { type: 'pmMermaid', code: string }
  | { type: 'pmCode', lang: string, code: string }
  | { type: 'pmRole', mark: string }

const VIEWER_NODES: ViewerNode['type'][] = ['pmMath', 'pmMermaid', 'pmCode', 'pmRole']

function viewerNode(node: ViewerNode): ElementContent {
  return node as unknown as ElementContent
}

export function asViewerNode(node: { type: string }): ViewerNode | undefined {
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

function unknown(state: State, node: MdastNode): ElementContent | undefined {
  if (!node.children) return typeof node.value === 'string' ? text(node.value) : undefined
  const children = state.all(node as never)
  return element(children.some(isBlock) ? 'div' : 'span', {}, children)
}

function handlers(links: MarkdownLinks): Handlers {
  const footnoteHref = links.footnoteHref ?? ((identifier: string) => `#${footnoteId(identifier)}`)
  const wrap = (tagName: string, className?: string): Handler => (state, node) =>
    element(tagName, className ? { className: [className] } : {}, state.all(node))
  const value = (node: { value?: unknown }) => (typeof node.value === 'string' ? node.value : '')
  const identifier = (node: { identifier?: unknown, label?: unknown }) => String(node.identifier ?? node.label)
  const label = (node: { identifier?: unknown, label?: unknown }) => String(node.label ?? node.identifier)
  const footnoteMark = (node: { identifier?: unknown, label?: unknown, enumerator?: unknown }) => (node.enumerator !== undefined ? String(node.enumerator) : label(node))
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
      const names = viewerMessages().markdown.admonitions
      const extra = classes(node)
      const kind = typeof node.kind === 'string' ? node.kind : extra.find(c => c in names) ?? 'note'
      const children = state.all(node)
      const titled = (node.children as MdastNode[] | undefined)?.some(c => c.type === 'admonitionTitle')
      const title = titled ? [] : [element('p', { className: ['pm-admonition__title'] }, [text(names[kind] ?? kind)])]
      return element('aside', { className: [...new Set(['pm-admonition', `pm-admonition--${kind}`, ...extra])] }, [...title, ...children])
    },
    admonitionTitle: wrap('p', 'pm-admonition__title'),
    footnoteReference: (_, node) => element('sup', { className: ['pm-footnote-ref'] }, [
      element('a', { href: footnoteHref(identifier(node)), dataLabel: footnoteMark(node), ariaLabel: viewerMessages().markdown.footnote(footnoteMark(node)) }, []),
    ]),
    footnoteDefinition: (state, node) => element('div', { id: footnoteId(identifier(node)), className: ['pm-footnote'] }, [
      element('sup', { dataLabel: footnoteMark(node) }, []),
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
      return url.startsWith('#') ? reference(el, safeDecodeURIComponent(url.slice(1)), url.slice(1)) : reference(el, '', url)
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
    ...layoutHandlers(),
    ...tabHandlers(),
    presmiumRole(state, node) {
      const children = state.all(node)
      return children.length
        ? element('span', { className: ['pm-role'], dataRole: String(node.name ?? '') }, children)
        : viewerNode({ type: 'pmRole', mark: roleMark(node) })
    },
  }
  return custom as Handlers
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
    if (/^h[1-6]$/.test(child.tagName) && child.properties.id === undefined) child.properties.id = `${prefix}-${urlSlug(textOf(child))}`
    if (child.tagName !== 'ul' && child.tagName !== 'ol') continue
    for (const li of child.children) {
      if (li.type === 'element' && li.tagName === 'li') li.properties.dataPmItem = item++
    }
  }
  return tree
}
