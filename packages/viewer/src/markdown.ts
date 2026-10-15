/**
 * `markdown` nodes: mdast to hast (mdast-util-to-hast, with handlers for the
 * MyST nodes), then hast to Vue virtual nodes. Math, diagrams and code inside
 * prose become the viewer's own components.
 */
import type { IRBlock, MarkdownNode, MdastNode } from '@presmium/kernel'
import type { Element, ElementContent, Properties, Root, RootContent } from 'hast'
import { toHtml } from 'hast-util-to-html'
import type { Handler, Handlers, State } from 'mdast-util-to-hast'
import { defaultHandlers, toHast } from 'mdast-util-to-hast'
import { find, html as schema } from 'property-information'
import type { Component, PropType, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject } from 'vue'
import { CodeView } from './code.ts'
import { itemVisible } from './domain/index.ts'
import { messages } from './i18n.ts'
import { PmMath, PmMermaid } from './rich.ts'
import { footnoteId, VIEWER } from './viewer.ts'
import type { Viewer } from './viewer.ts'

/** How links in prose resolve: footnotes, and sections by id (cross-references and `[](#id)` links). */
export interface MarkdownLinks {
  /** Link to a footnote definition; default: on the same page. */
  footnoteHref?(identifier: string): string
  /** Link to and title of the section with this id; undefined when there is none. */
  section?(id: string): { href: string, title: string } | undefined
}

/** Links of a viewer's document: footnotes and sections, wherever their page is. */
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

/** Elements that cannot be inside a paragraph. */
const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dt', 'dd', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
  'pm-code', 'pm-mermaid',
])

function isBlock(node: ElementContent): boolean {
  return node.type === 'element' && (BLOCK_ELEMENTS.has(node.tagName) || (node.tagName === 'pm-math' && node.properties.pmDisplay === true))
}

/**
 * A node without a handler: its text, or its children in a `span` (a `div`
 * when they hold block content), so inline content never breaks a paragraph.
 */
function unknown(state: State, node: MdastNode): ElementContent | undefined {
  if (!node.children) return typeof node.value === 'string' ? text(node.value) : undefined
  const children = state.all(node as never)
  return element(children.some(isBlock) ? 'div' : 'span', {}, children)
}

function classes(node: MdastNode): string[] {
  return typeof node.class === 'string' ? node.class.split(/\s+/).filter(Boolean) : []
}

/** The `class` option of a directive as hast properties. */
function classed(node: MdastNode, properties: Properties = {}): Properties {
  const names = classes(node)
  return names.length ? { ...properties, className: names } : properties
}

/** Handlers for MyST nodes. */
function handlers(links: MarkdownLinks): Handlers {
  const footnoteHref = links.footnoteHref ?? ((identifier: string) => `#${footnoteId(identifier)}`)
  const wrap = (tagName: string, className?: string): Handler => (state, node) =>
    element(tagName, className ? { className: [className] } : {}, state.all(node))
  const value = (node: { value?: unknown }) => (typeof node.value === 'string' ? node.value : '')
  const identifier = (node: { identifier?: unknown, label?: unknown }) => String(node.identifier ?? node.label)
  const label = (node: { identifier?: unknown, label?: unknown }) => String(node.label ?? node.identifier)
  /** A link to a section gets the section's page; one without text gets the section's title, else `fallback`. */
  const reference = (el: Element, id: string, fallback: string): Element => {
    const target = id ? links.section?.(id) : undefined
    if (target) el.properties.href = target.href
    if (el.children.length === 0) el.children = [text(target?.title ?? fallback)]
    return el
  }
  const custom: Record<string, Handler> = {
    math: (_, node) => element('pm-math', { pmTex: value(node), pmDisplay: true }),
    inlineMath: (_, node) => element('pm-math', { pmTex: value(node), pmDisplay: false }),
    mermaid: (_, node) => element('pm-mermaid', { pmCode: value(node) }),
    code: (_, node) => element('pm-code', { pmLang: typeof node.lang === 'string' ? node.lang : '', pmCode: value(node) }),
    admonition(state, node) {
      const names = messages().markdown.admonitions
      const extra = classes(node)
      // `{admonition}` takes its kind from its class, e.g. `:class: tip`.
      const kind = typeof node.kind === 'string' ? node.kind : extra.find(c => c in names) ?? 'note'
      const children = state.all(node)
      const titled = (node.children as MdastNode[] | undefined)?.some(c => c.type === 'admonitionTitle')
      const title = titled ? [] : [element('p', { className: ['pm-admonition__title'] }, [text(names[kind] ?? kind)])]
      return element('aside', { className: [...new Set(['pm-admonition', `pm-admonition--${kind}`, ...extra])] }, [...title, ...children])
    },
    admonitionTitle: wrap('p', 'pm-admonition__title'),
    // Footnote marks are not text of the document (the IR has none, nor has the search index):
    // the label shows through CSS, from `data-label`, and names the link for assistive technology.
    footnoteReference: (_, node) => element('sup', { className: ['pm-footnote-ref'] }, [
      element('a', { href: footnoteHref(identifier(node)), dataLabel: label(node), ariaLabel: messages().markdown.footnote(label(node)) }, []),
    ]),
    footnoteDefinition: (state, node) => element('div', { id: footnoteId(identifier(node)), className: ['pm-footnote'] }, [
      element('sup', { dataLabel: label(node) }, []),
      ...state.all(node),
    ]),
    container: (state, node) => element('figure', { id: typeof node.identifier === 'string' ? node.identifier : undefined, className: ['pm-figure'] }, state.all(node)),
    caption: wrap('figcaption'),
    legend: wrap('div', 'pm-legend'),
    abbreviation: (state, node) => element('abbr', typeof node.title === 'string' ? { title: node.title } : {}, state.all(node)),
    // The compiler fills a reference's text; one left empty shows its target's title, else its label.
    crossReference: (state, node) => reference(element('a', { href: `#${identifier(node)}` }, state.all(node)), identifier(node), label(node)),
    link(state, node) {
      const el = defaultHandlers.link(state, node as never)
      const url = typeof node.url === 'string' ? node.url : ''
      return url.startsWith('#') ? reference(el, decodeURIComponent(url.slice(1)), url.slice(1)) : reference(el, '', url)
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
    span: (state, node) => element('span', classed(node), state.all(node)),
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

/**
 * The hast tree of a markdown node. Headings get ids for the page outline,
 * starting with `prefix` (the section id) so they are unique on a page;
 * top-level list items get `data-pm-item` (their index, for `reveal: items`).
 */
export function markdownToHast(mdast: MdastNode, prefix: string, links: MarkdownLinks = {}): Root {
  const tree = toHast(mdast as never, { allowDangerousHtml: true, handlers: handlers(links), unknownHandler: unknown as never }) as Root
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

function attributes(properties: Properties): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined || value === false) continue
    const info = find(schema, key)
    attrs[info.attribute] = value === true ? (info.boolean ? true : '') : Array.isArray(value) ? value.join(info.commaSeparated ? ', ' : ' ') : value
  }
  return attrs
}

/** Elements the viewer renders with its own components. */
const COMPONENTS: Record<string, (p: Properties) => [Component, Record<string, unknown>]> = {
  'pm-math': p => [PmMath, { tex: String(p.pmTex ?? ''), display: p.pmDisplay === true }],
  'pm-mermaid': p => [PmMermaid, { code: String(p.pmCode ?? '') }],
  'pm-code': p => [CodeView, { lang: String(p.pmLang ?? ''), value: String(p.pmCode ?? '') }],
}

export interface HastRenderContext {
  /** Whether the top-level list item with this index is hidden at the current step. */
  hidden?(item: number): boolean
}

function raw(value: string, inline: boolean): VNodeChild {
  return h(inline ? 'span' : 'div', { class: 'pm-raw', innerHTML: value })
}

/** Converts hast to Vue virtual nodes. Raw HTML is set as `innerHTML` of its parent, so split tags stay balanced. */
export function hastToVNodes(nodes: readonly (RootContent | ElementContent)[], ctx: HastRenderContext, inline = false): VNodeChild[] {
  return nodes.map((node): VNodeChild => {
    if (node.type === 'text') return node.value
    if (node.type === 'raw') return raw(node.value, inline)
    if (node.type !== 'element') return null
    const custom = COMPONENTS[node.tagName]
    if (custom) {
      const [component, props] = custom(node.properties)
      return h(component, props)
    }
    const attrs = attributes(node.properties)
    const item = node.properties.dataPmItem
    if (typeof item === 'number' && ctx.hidden?.(item)) attrs.class = [attrs.class, 'pm-hidden']
    if (node.children.some(c => c.type === 'raw')) {
      return h(node.tagName, { ...attrs, innerHTML: toHtml({ type: 'root', children: node.children }, { allowDangerousHtml: true }) })
    }
    return h(node.tagName, attrs, hastToVNodes(node.children, ctx, true))
  })
}

/** An IR `markdown` node; list items of a `reveal: items` list appear one step after another. */
export const MarkdownView = defineComponent({
  name: 'PmMarkdown',
  props: {
    block: { type: Object as PropType<IRBlock>, required: true },
    step: { type: Number, required: true },
    expanded: Boolean,
    /** Prefix of generated ids, usually the section id. */
    prefix: { type: String, default: '' },
  },
  setup(props) {
    const viewer = inject(VIEWER, undefined)
    const links = viewerLinks(viewer)
    const tree = computed(() => markdownToHast((props.block.node as MarkdownNode).mdast, props.prefix, links))
    return () => {
      const node = props.block.node as MarkdownNode
      const hidden = node.reveal === 'items' && !props.expanded ? (k: number) => !itemVisible(props.block, k, props.step) : undefined
      return hastToVNodes(tree.value.children, { hidden })
    }
  },
})
