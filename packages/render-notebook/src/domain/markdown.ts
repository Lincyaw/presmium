/**
 * mdast to the Markdown of notebook cells (K-18). Jupyter front ends render
 * CommonMark with GFM tables, inline HTML and dollar math, not MyST syntax,
 * so MyST-only nodes are first lowered to those: an admonition or aside to a
 * blockquote with a bold title, a list table to a GFM table, a dropdown to
 * `<details>`, a figure to its image and caption, math to `$$`, roles such
 * as {sub} and {kbd} to inline HTML. myst-to-md then writes the result, which
 * holds only nodes it writes as plain Markdown. A node with no such form keeps
 * its text and is reported as degraded.
 */
import type { MdastNode } from '@presmium/kernel'
import { writeMd } from 'myst-to-md'
import { VFile } from 'vfile'

export interface MarkdownText {
  text: string
  /** What myst-to-md could not write. */
  problems: string[]
  /** MyST node types the notebook cannot show as they are, e.g. an embed; what text they hold is kept. */
  degraded: string[]
}

/** Inline node types that must sit in a paragraph to be written as one. */
const PHRASING = new Set([
  'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'inlineMath', 'break', 'link', 'linkReference', 'image',
  'imageReference', 'footnoteReference', 'abbreviation', 'subscript', 'superscript', 'crossReference', 'cite', 'citeGroup',
  'underline', 'keyboard', 'smallcaps',
])

/** Standard nodes and the fields of each that plain Markdown writes; other fields would make myst-to-md write MyST. */
const STANDARD: Record<string, string[]> = {
  root: [], paragraph: [], blockquote: [], thematicBreak: [], break: [], text: ['value'], html: ['value'],
  heading: ['depth'], list: ['ordered', 'start', 'spread'], listItem: ['spread', 'checked'],
  code: ['lang', 'value'], inlineCode: ['value'], emphasis: [], strong: [],
  link: ['url', 'title'], image: ['url', 'alt', 'title'], definition: ['identifier', 'label', 'url', 'title'],
  linkReference: ['identifier', 'label', 'referenceType'], imageReference: ['identifier', 'label', 'referenceType', 'alt'],
}

/** Inline HTML tags for MyST roles. */
const TAGS: Record<string, string> = { subscript: 'sub', superscript: 'sup', delete: 'del', underline: 'u', keyboard: 'kbd' }

/** What a figure, table or code container shows, as opposed to its caption and legend. */
const CONTENT = new Set(['image', 'table', 'code', 'iframe', 'mermaid'])

const text = (value: string): MdastNode => ({ type: 'text', value })
const html = (value: string): MdastNode => ({ type: 'html', value })
const paragraph = (children: MdastNode[]): MdastNode => ({ type: 'paragraph', children })
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** The text a node holds. */
function plain(node: MdastNode): string {
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(plain).join('')
}

export function toMarkdown(mdast: MdastNode): MarkdownText {
  // A copy without undefined fields: the IR is JSON, and myst-to-md reads some fields' presence.
  const tree = JSON.parse(JSON.stringify(mdast)) as MdastNode
  const degraded = new Set<string>()
  const blocks = (tree.type === 'root' ? paragraphs(tree.children ?? []) : [tree]).flatMap(node => lower(node, degraded))
  const problems: string[] = []
  const parts = blocks.map((block) => {
    const file = new VFile()
    // Each block on its own: mdast-util-to-markdown writes a root with any inline child as one line.
    writeMd(file, { type: 'root', children: [block] } as Parameters<typeof writeMd>[1])
    problems.push(...file.messages.map(m => m.reason))
    return String(file.result ?? '')
  })
  return { text: parts.filter(Boolean).join('\n\n'), problems, degraded: [...degraded] }
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

/** `node` as standard nodes; MyST nodes without a Jupyter form are added to `degraded`. */
function lower(node: MdastNode, degraded: Set<string>): MdastNode[] {
  const all = (nodes: MdastNode[] = []) => nodes.flatMap(child => lower(child, degraded))
  const children = () => all(node.children)
  // A link within the page names a MyST label, which is no anchor in a notebook: its text stays.
  if (node.type === 'link' && String(node.url).startsWith('#')) return node.children?.length ? children() : [text(String(node.url).slice(1))]
  const fields = STANDARD[node.type]
  if (fields) {
    const own = Object.fromEntries(fields.filter(key => node[key] != null).map(key => [key, node[key]]))
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
      return container(node, degraded)
    case 'table':
      return [table(node, degraded)]
    case 'details': {
      const summary = node.children?.find(child => child.type === 'summary')
      const body = all(node.children?.filter(child => child !== summary))
      return [html(`<details>\n<summary>${escape(summary ? plain(summary) : '')}</summary>`), ...body, html('</details>')]
    }
    case 'definitionList':
      return [definitions(node, degraded)]
    case 'footnoteDefinition': {
      const [first, ...rest] = children()
      const mark = html(`<sup>[${escape(String(node.label ?? node.identifier))}]</sup> `)
      return first?.type === 'paragraph' ? [paragraph([mark, ...first.children ?? []]), ...rest] : [paragraph([mark]), ...first ? [first] : [], ...rest]
    }
    case 'footnoteReference':
      return [html(`<sup>[${escape(String(node.label ?? node.identifier))}]</sup>`)]
    case 'crossReference':
      // A reference shows its text; the label it names is no anchor in a notebook.
      return node.children?.length ? children() : [text(String(node.label ?? node.identifier ?? ''))]
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
    case 'iframe':
      // The embedded page becomes a link to it.
      degraded.add(node.type)
      return [paragraph([{ type: 'link', url: String(node.src), children: [text(String(node.src))] }])]
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

/** A figure, table or quote: its content, then its caption (bold above a table, italic below a figure) and legend. */
function container(node: MdastNode, degraded: Set<string>): MdastNode[] {
  const all = (nodes: MdastNode[] = []) => nodes.flatMap(child => lower(child, degraded))
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

/** A GFM table: each cell's content inline, paragraphs separated by line breaks. */
function table(node: MdastNode, degraded: Set<string>): MdastNode {
  const inline = (child: MdastNode) => PHRASING.has(child.type) || child.type === 'html'
  const rows = (node.children ?? []).map(row => ({
    type: 'tableRow',
    children: (row.children ?? []).map((cell) => {
      const parts = (cell.children ?? []).flatMap(child => lower(child, degraded))
        .map(child => (child.type === 'paragraph' ? child.children ?? [] : inline(child) ? [child] : [text(plain(child))]))
      return { type: 'tableCell', children: parts.flatMap((part, i) => (i ? [html('<br>'), ...part] : part)) }
    }),
  }))
  const align = Array.isArray(node.align) ? node.align : node.children?.[0]?.children?.map(cell => cell.align ?? null)
  return { type: 'table', align, children: rows }
}

/** A definition list as a bullet list: each term in bold, its definitions below it. */
function definitions(node: MdastNode, degraded: Set<string>): MdastNode {
  const items: MdastNode[] = []
  for (const child of node.children ?? []) {
    if (child.type === 'definitionTerm') {
      const term = (child.children ?? []).flatMap(c => lower(c, degraded))
      items.push({ type: 'listItem', spread: true, children: [paragraph([{ type: 'strong', children: term }])] })
    } else {
      if (!items.length) items.push({ type: 'listItem', spread: true, children: [] })
      items.at(-1)!.children!.push(...paragraphs(child.children ?? []).flatMap(c => lower(c, degraded)))
    }
  }
  return { type: 'list', ordered: false, spread: true, children: items }
}
