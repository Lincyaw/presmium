/**
 * MyST mdast lowered to the standard Markdown that renderers write (K-18,
 * P-75, P-76): CommonMark, GFM tables and inline HTML, no MyST syntax. An
 * admonition or aside becomes a blockquote with a bold title, a list table a
 * GFM table, a dropdown `<details>`, a figure its image and caption, math `$`
 * and `$$`, roles such as {sub} and {kbd} inline HTML, a definition list a
 * list of bold terms. A node with no such form keeps its text and is listed
 * as degraded. Pure: no dependencies, the input is not changed.
 */
import type { MdastNode } from './ir.ts'

/** Nodes that hold a URL, which `LowerOptions.urls` maps. */
export type LinkedType = 'image' | 'link' | 'definition'

export interface LowerOptions {
  /**
   * The URL of a link to a MyST label within the deck (`[text](#label)`, a
   * `{ref}`, `{numref}` or `{eq}`); undefined, or no function, keeps only the
   * link's text.
   */
  links?: (label: string) => string | undefined
  /** The URL to write for the URL of an image, link or link definition (`type`); undefined keeps it. */
  urls?: (url: string, type: LinkedType) => string | undefined
  /** `gfm` keeps footnotes as GFM footnotes; `html` (default) writes `<sup>[n]</sup>`, with the footnote's `enumerator`. */
  footnotes?: 'gfm' | 'html'
  /** `element` writes an `{iframe}` as an `<iframe>`; `link` (default) as a link to the page, which is a degradation. */
  iframes?: 'element' | 'link'
}

export interface LoweredMarkdown {
  /** A root whose descendants are standard mdast nodes. */
  mdast: MdastNode
  /** MyST node types that have no standard form, e.g. an embed; what text they hold is kept. */
  degraded: string[]
}

/** Inline node types that must sit in a paragraph to be written as one. */
const PHRASING = new Set([
  'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'inlineMath', 'break', 'link', 'linkReference', 'image',
  'imageReference', 'footnoteReference', 'abbreviation', 'subscript', 'superscript', 'crossReference', 'cite', 'citeGroup',
  'underline', 'keyboard', 'smallcaps',
])

/** Standard nodes and the fields of each that plain Markdown writes; other fields could make a writer write MyST. */
const STANDARD: Record<string, string[]> = {
  root: [], paragraph: [], blockquote: [], thematicBreak: [], break: [], text: ['value'], html: ['value'],
  heading: ['depth'], list: ['ordered', 'start', 'spread'], listItem: ['spread', 'checked'],
  code: ['lang', 'value'], inlineCode: ['value'], emphasis: [], strong: [],
  link: ['url', 'title'], image: ['url', 'alt', 'title'], definition: ['identifier', 'label', 'url', 'title'],
  linkReference: ['identifier', 'label', 'referenceType'], imageReference: ['identifier', 'label', 'referenceType', 'alt'],
}

/**
 * GFM footnotes, kept with `footnotes: 'gfm'`, by identifier: it is unique
 * in the deck, whereas the label an author wrote may repeat in another
 * included file, and a writer writes the label where there is one.
 */
const FOOTNOTES: Record<string, string[]> = { footnoteReference: ['identifier'], footnoteDefinition: ['identifier'] }

/** Nodes whose URL `urls` maps. */
const LINKED = new Set<string>(['image', 'link', 'definition'] satisfies LinkedType[])

/** Inline HTML tags for MyST roles. */
const TAGS: Record<string, string> = { subscript: 'sub', superscript: 'sup', delete: 'del', underline: 'u', keyboard: 'kbd' }

/** What a figure, table or code container shows, as opposed to its caption and legend. */
const CONTENT = new Set(['image', 'table', 'code', 'iframe', 'mermaid'])

const text = (value: string): MdastNode => ({ type: 'text', value })
const html = (value: string): MdastNode => ({ type: 'html', value })
const paragraph = (children: MdastNode[]): MdastNode => ({ type: 'paragraph', children })
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

interface Lowering {
  options: LowerOptions
  degraded: Set<string>
}

export function lowerMyst(mdast: MdastNode, options: LowerOptions = {}): LoweredMarkdown {
  // A copy without undefined fields: the IR is JSON, and writers read some fields' presence.
  const tree = JSON.parse(JSON.stringify(mdast)) as MdastNode
  const ctx: Lowering = { options, degraded: new Set() }
  const top = tree.type === 'root' ? paragraphs(tree.children ?? []) : [tree]
  return { mdast: { type: 'root', children: top.flatMap(node => lower(node, ctx)) }, degraded: [...ctx.degraded] }
}

/** The text a node holds. */
function plain(node: MdastNode): string {
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(plain).join('')
}

/** Runs of inline nodes at the top level, wrapped in paragraphs. */
function paragraphs(nodes: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = []
  let run: MdastNode[] | undefined
  for (const node of nodes) {
    if (!PHRASING.has(node.type)) {
      out.push(node)
      run = undefined
      continue
    }
    if (!run) out.push(paragraph(run = []))
    run.push(node)
  }
  return out
}

/** A link to a label in the deck: a link where `links` gives a URL, else the text alone. */
function labelLink(labels: unknown[], children: MdastNode[], ctx: Lowering): MdastNode[] {
  const url = labels.map(label => typeof label === 'string' && label ? ctx.options.links?.(label) : undefined).find(Boolean)
  return url ? [{ type: 'link', url, children }] : children
}

/**
 * Text with `$` as text and escaped dollars: Jupyter and Slidev read two `$`
 * in a paragraph as math. The escape is written as HTML, which writers keep
 * as it is.
 */
function dollars(value: string): MdastNode[] {
  return value.split('$').flatMap((part, i) => [...i > 0 ? [html('\\$')] : [], ...part ? [text(part)] : []])
}

/** `node` as standard nodes; MyST nodes without a standard form are added to `degraded`. */
function lower(node: MdastNode, ctx: Lowering): MdastNode[] {
  const { options, degraded } = ctx
  const all = (nodes: MdastNode[] = []) => nodes.flatMap(child => lower(child, ctx))
  const children = () => all(node.children)
  if (node.type === 'link' && String(node.url).startsWith('#')) {
    const label = String(node.url).slice(1)
    return labelLink([label], node.children?.length ? children() : [text(label)], ctx)
  }
  if (node.type === 'text' && typeof node.value === 'string' && node.value.includes('$')) return dollars(node.value)
  const fields = STANDARD[node.type] ?? (options.footnotes === 'gfm' ? FOOTNOTES[node.type] : undefined)
  if (fields) {
    const own: Record<string, unknown> = Object.fromEntries(fields.filter(key => node[key] != null).map(key => [key, node[key]]))
    if (LINKED.has(node.type) && typeof own.url === 'string') own.url = options.urls?.(own.url, node.type as LinkedType) ?? own.url
    return [{ type: node.type, ...own, ...node.children ? { children: children() } : {} }]
  }
  switch (node.type) {
    case 'math':
      return [html(`$$\n${node.value ?? ''}\n$$`)]
    case 'inlineMath':
      return [html(`$${node.value ?? ''}$`)]
    case 'admonition':
    case 'aside': {
      // A blockquote that opens with the title in bold: the given one, else the kind (Note, Warning, ...).
      const title = node.children?.find(child => child.type === 'admonitionTitle')
      const heading = title ? all(title.children) : typeof node.kind === 'string' ? [text(capitalized(node.kind))] : []
      const body = all(node.children?.filter(child => child !== title))
      return [{ type: 'blockquote', children: [...heading.length ? [paragraph([{ type: 'strong', children: heading }])] : [], ...body] }]
    }
    case 'container':
      return container(node, ctx)
    case 'table':
      return [table(node, ctx)]
    case 'details': {
      const summary = node.children?.find(child => child.type === 'summary')
      const body = all(node.children?.filter(child => child !== summary))
      return [html(`<details>\n<summary>${escape(summary ? plain(summary) : '')}</summary>`), ...body, html('</details>')]
    }
    case 'definitionList':
      return [definitions(node, ctx)]
    case 'footnoteDefinition': {
      const [first, ...rest] = children()
      const mark = html(`<sup>[${escape(footnoteNumber(node))}]</sup> `)
      return first?.type === 'paragraph' ? [paragraph([mark, ...first.children ?? []]), ...rest] : [paragraph([mark]), ...first ? [first] : [], ...rest]
    }
    case 'footnoteReference':
      return [html(`<sup>[${escape(footnoteNumber(node))}]</sup>`)]
    case 'crossReference':
      // A reference shows its text, linked to its target where `links` knows it.
      return labelLink([node.identifier, node.label], node.children?.length ? children() : [text(String(node.label ?? node.identifier ?? ''))], ctx)
    case 'abbreviation':
      return [html(`<abbr title="${escape(String(node.title ?? ''))}">`), ...children(), html('</abbr>')]
    case 'subscript':
    case 'superscript':
    case 'delete':
    case 'underline':
    case 'keyboard':
      return [html(`<${TAGS[node.type]}>`), ...children(), html(`</${TAGS[node.type]}>`)]
    case 'cite':
      return [text(`[${node.label}]`)]
    case 'citeGroup':
      return [text(`[${(node.children ?? []).map(child => child.label).join(', ')}]`)]
    case 'mermaid':
      // JupyterLab draws Mermaid fences; other front ends show the source.
      return [{ type: 'code', lang: 'mermaid', value: node.value ?? '' }]
    case 'raw':
      if (node.lang === 'html') return [html(String(node.value ?? ''))]
      break
    case 'iframe': {
      const src = String(node.src ?? '')
      if (options.iframes === 'element') {
        const attrs = (['width', 'height'] as const).filter(key => node[key] != null && node[key] !== '').map(key => ` ${key}="${escape(String(node[key]))}"`).join('')
        return [html(`<iframe src="${escape(src)}"${attrs} loading="lazy"></iframe>`)]
      }
      // The embedded page becomes a link to it.
      degraded.add(node.type)
      return [paragraph([{ type: 'link', url: src, children: [text(src)] }])]
    }
    case 'comment':
    case 'mystTarget':
      return []
    case 'caption':
    case 'legend':
    case 'glossary':
    case 'smallcaps':
    case 'block':
    case 'div':
    case 'span':
      return children()
  }
  degraded.add(node.type)
  return node.children ? children() : typeof node.value === 'string' && node.value ? [text(node.value)] : []
}

/** The number a footnote shows: its `enumerator` (numbered by the compiler), else its label. */
function footnoteNumber(node: MdastNode): string {
  return String(node.enumerator ?? node.label ?? node.identifier)
}

/** A figure, table or quote: its content, then its caption (bold above a table, italic below a figure) and legend. */
function container(node: MdastNode, ctx: Lowering): MdastNode[] {
  const all = (nodes: MdastNode[] = []) => nodes.flatMap(child => lower(child, ctx))
  const items = node.children ?? []
  const given = items.find(child => child.type === 'caption')
  // Without a caption node, as the MyST figure transform does: the first paragraph is the caption, what follows the legend.
  const derived = !given && node.kind !== 'quote'
  const others = items.filter(child => !CONTENT.has(child.type))
  const content = derived ? items.filter(child => CONTENT.has(child.type)) : items.filter(child => child.type !== 'caption' && child.type !== 'legend')
  const caption = derived ? others.slice(0, 1) : given?.children ?? []
  const legend = derived ? others.slice(1) : items.find(child => child.type === 'legend')?.children ?? []
  const words = all(caption).flatMap(child => (child.type === 'paragraph' ? child.children ?? [] : [child]))
  const title = words.length ? [paragraph([{ type: node.kind === 'table' ? 'strong' : 'emphasis', children: words }])] : []
  const shown = all(content).map(child => (child.type === 'image' ? paragraph([child]) : child))
  return node.kind === 'table' ? [...title, ...shown, ...all(legend)] : [...shown, ...title, ...all(legend)]
}

/**
 * A GFM table. A cell holds one line: its inline content as it is, its
 * paragraphs and line breaks separated by `<br>`, other blocks as their text.
 */
function table(node: MdastNode, ctx: Lowering): MdastNode {
  const inline = (child: MdastNode) => PHRASING.has(child.type) || child.type === 'html'
  const line = (nodes: MdastNode[]) => nodes.map(child => (child.type === 'break' ? html('<br>') : child))
  const rows = (node.children ?? []).map(row => ({
    type: 'tableRow',
    children: (row.children ?? []).map((cell) => {
      const parts: MdastNode[][] = []
      let run: MdastNode[] | undefined
      for (const child of (cell.children ?? []).flatMap(c => lower(c, ctx))) {
        if (inline(child)) {
          if (!run) parts.push(run = [])
          run.push(...line([child]))
          continue
        }
        run = undefined
        parts.push(child.type === 'paragraph' ? line(child.children ?? []) : [text(plain(child))])
      }
      return { type: 'tableCell', children: parts.flatMap((part, i) => (i ? [html('<br>'), ...part] : part)) }
    }),
  }))
  const align = Array.isArray(node.align) ? node.align : node.children?.[0]?.children?.map(cell => cell.align ?? null)
  return { type: 'table', align, children: rows }
}

/** A definition list as a bullet list: each term in bold, its definitions below it. */
function definitions(node: MdastNode, ctx: Lowering): MdastNode {
  const items: MdastNode[] = []
  for (const child of node.children ?? []) {
    if (child.type === 'definitionTerm') {
      const term = (child.children ?? []).flatMap(c => lower(c, ctx))
      items.push({ type: 'listItem', spread: true, children: [paragraph([{ type: 'strong', children: term }])] })
    } else {
      if (!items.length) items.push({ type: 'listItem', spread: true, children: [] })
      items.at(-1)!.children!.push(...paragraphs(child.children ?? []).flatMap(c => lower(c, ctx)))
    }
  }
  return { type: 'list', ordered: false, spread: true, children: items }
}
