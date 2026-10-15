/**
 * `markdown` nodes: mdast to hast (mdast-util-to-hast, with handlers for the
 * MyST nodes), then hast to Vue virtual nodes. Math, diagrams and code inside
 * prose become the viewer's own components.
 */
import type { IRBlock, MarkdownNode, MdastNode } from '@presmium/kernel'
import type { Element, ElementContent, Properties, Root, RootContent } from 'hast'
import { toHtml } from 'hast-util-to-html'
import type { Handler, Handlers } from 'mdast-util-to-hast'
import { toHast } from 'mdast-util-to-hast'
import { find, html as schema } from 'property-information'
import type { Component, PropType, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject } from 'vue'
import { CodeView } from './code.ts'
import { itemVisible } from './domain/index.ts'
import { PmMath, PmMermaid } from './rich.ts'
import { footnoteId, VIEWER } from './viewer.ts'

const ADMONITIONS: Record<string, string> = {
  note: '注意',
  tip: '提示',
  hint: '提示',
  important: '重要',
  warning: '警告',
  caution: '小心',
  attention: '注意',
  danger: '危险',
  error: '错误',
  seealso: '另请参阅',
}

function element(tagName: string, properties: Properties, children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children }
}

function text(value: string): ElementContent {
  return { type: 'text', value }
}

/** Handlers for MyST nodes; footnote references link with `footnoteHref` (by default, on the same page). */
function handlers(footnoteHref: (identifier: string) => string = identifier => `#${footnoteId(identifier)}`): Handlers {
  const wrap = (tagName: string, className?: string): Handler => (state, node) =>
    element(tagName, className ? { className: [className] } : {}, state.all(node))
  const value = (node: { value?: unknown }) => (typeof node.value === 'string' ? node.value : '')
  const identifier = (node: { identifier?: unknown, label?: unknown }) => String(node.identifier ?? node.label)
  const label = (node: { identifier?: unknown, label?: unknown }) => String(node.label ?? node.identifier)
  const custom: Record<string, Handler> = {
    math: (_, node) => element('pm-math', { pmTex: value(node), pmDisplay: true }),
    inlineMath: (_, node) => element('pm-math', { pmTex: value(node), pmDisplay: false }),
    mermaid: (_, node) => element('pm-mermaid', { pmCode: value(node) }),
    code: (_, node) => element('pm-code', { pmLang: typeof node.lang === 'string' ? node.lang : '', pmCode: value(node) }),
    admonition(state, node) {
      const kind = typeof node.kind === 'string' ? node.kind : 'note'
      const children = state.all(node)
      const titled = (node.children as MdastNode[] | undefined)?.some(c => c.type === 'admonitionTitle')
      const title = titled ? [] : [element('p', { className: ['pm-admonition__title'] }, [text(ADMONITIONS[kind] ?? kind)])]
      return element('aside', { className: ['pm-admonition', `pm-admonition--${kind}`] }, [...title, ...children])
    },
    admonitionTitle: wrap('p', 'pm-admonition__title'),
    // Footnote marks are not text of the document (the IR has none, nor has the search index):
    // the label shows through CSS, from `data-label`, and names the link for assistive technology.
    footnoteReference: (_, node) => element('sup', { className: ['pm-footnote-ref'] }, [
      element('a', { href: footnoteHref(identifier(node)), dataLabel: label(node), ariaLabel: `脚注 ${label(node)}` }, []),
    ]),
    footnoteDefinition: (state, node) => element('div', { id: footnoteId(identifier(node)), className: ['pm-footnote'] }, [
      element('sup', { dataLabel: label(node) }, []),
      ...state.all(node),
    ]),
    container: wrap('figure', 'pm-figure'),
    caption: wrap('figcaption'),
    legend: wrap('div', 'pm-legend'),
    abbreviation: (state, node) => element('abbr', typeof node.title === 'string' ? { title: node.title } : {}, state.all(node)),
    crossReference: (state, node) => element('a', { href: `#${String(node.identifier ?? '')}` }, state.all(node)),
    div: wrap('div'),
    span: wrap('span'),
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
export function markdownToHast(mdast: MdastNode, prefix: string, footnoteHref?: (identifier: string) => string): Root {
  const tree = toHast(mdast as never, { allowDangerousHtml: true, handlers: handlers(footnoteHref) }) as Root
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
    const tree = computed(() => markdownToHast((props.block.node as MarkdownNode).mdast, props.prefix, viewer?.footnoteHref))
    return () => {
      const node = props.block.node as MarkdownNode
      const hidden = node.reveal === 'items' && !props.expanded ? (k: number) => !itemVisible(props.block, k, props.step) : undefined
      return hastToVNodes(tree.value.children, { hidden })
    }
  },
})
