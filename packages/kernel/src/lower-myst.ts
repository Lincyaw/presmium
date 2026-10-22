import { escapeHtml as escape, mapHtmlUrls } from './html.ts'
import type { MdastNode } from './ir.ts'

export type LinkedType = 'image' | 'link' | 'definition'

export interface LowerOptions {
  links?: (label: string) => string | undefined
  urls?: (url: string, type: LinkedType) => string | undefined
  htmlUrls?: boolean
  footnotes?: 'gfm' | 'html'
  iframes?: 'element' | 'link'
  roles?: 'children' | 'marks'
  cards?: 'element' | 'headings'
}

export interface LoweredMarkdown {
  mdast: MdastNode
  degraded: string[]
}

const PHRASING = new Set([
  'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'inlineMath', 'break', 'link', 'linkReference', 'image',
  'imageReference', 'footnoteReference', 'abbreviation', 'subscript', 'superscript', 'crossReference', 'cite', 'citeGroup',
  'underline', 'keyboard', 'smallcaps', 'presmiumRole',
])

const STANDARD: Record<string, string[]> = {
  root: [], paragraph: [], blockquote: [], thematicBreak: [], break: [], text: ['value'], html: ['value'],
  heading: ['depth'], list: ['ordered', 'start', 'spread'], listItem: ['spread', 'checked'],
  code: ['lang', 'value'], inlineCode: ['value'], emphasis: [], strong: [],
  link: ['url', 'title'], image: ['url', 'alt', 'title'], definition: ['identifier', 'label', 'url', 'title'],
  linkReference: ['identifier', 'label', 'referenceType'], imageReference: ['identifier', 'label', 'referenceType', 'alt'],
}

const FOOTNOTES: Record<string, string[]> = { footnoteReference: ['identifier'], footnoteDefinition: ['identifier'] }

const LINKED = new Set<string>(['image', 'link', 'definition'] satisfies LinkedType[])

const TAGS: Record<string, string> = { subscript: 'sub', superscript: 'sup', delete: 'del', underline: 'u', keyboard: 'kbd' }

const CONTENT = new Set(['image', 'table', 'code', 'iframe', 'mermaid'])

const text = (value: string): MdastNode => ({ type: 'text', value })
const html = (value: string): MdastNode => ({ type: 'html', value })
const paragraph = (children: MdastNode[]): MdastNode => ({ type: 'paragraph', children })
const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

interface Lowering {
  options: LowerOptions
  degraded: Set<string>
}

const SMALL_HEADING = 4

export function lowerMyst(mdast: MdastNode, options: LowerOptions = {}): LoweredMarkdown {
  const tree = JSON.parse(JSON.stringify(mdast)) as MdastNode
  const ctx: Lowering = { options, degraded: new Set() }
  const top = tree.type === 'root' ? paragraphs(tree.children ?? []) : [tree]
  return { mdast: { type: 'root', children: top.flatMap(node => lower(node, ctx)) }, degraded: [...ctx.degraded] }
}

function plain(node: MdastNode): string {
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(plain).join('')
}

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

function labelLink(labels: unknown[], children: MdastNode[], ctx: Lowering): MdastNode[] {
  const url = labels.map(label => typeof label === 'string' && label ? ctx.options.links?.(label) : undefined).find(Boolean)
  return url ? [{ type: 'link', url, children }] : children
}

function dollars(value: string): MdastNode[] {
  return value.split('$').flatMap((part, i) => [...i > 0 ? [html('\\$')] : [], ...part ? [text(part)] : []])
}

function lower(node: MdastNode, ctx: Lowering): MdastNode[] {
  const { options, degraded } = ctx
  const all = (nodes: MdastNode[] = []) => nodes.flatMap(child => lower(child, ctx))
  const children = () => all(node.children)
  if (node.type === 'link' && isButton(node) && cardsAs(options) === 'element') {
    return [html('<span class="pm-button">'), ...lower({ ...node, class: undefined }, ctx), html('</span>')]
  }
  if (node.type === 'link' && String(node.url).startsWith('#')) {
    const label = String(node.url).slice(1)
    return labelLink([label], node.children?.length ? children() : [text(label)], ctx)
  }
  if (node.type === 'text' && typeof node.value === 'string' && node.value.includes('$')) return dollars(node.value)
  const fields = STANDARD[node.type] ?? (options.footnotes === 'gfm' ? FOOTNOTES[node.type] : undefined)
  if (fields) {
    const own: Record<string, unknown> = Object.fromEntries(fields.filter(key => node[key] != null).map(key => [key, node[key]]))
    if (LINKED.has(node.type) && typeof own.url === 'string') own.url = options.urls?.(own.url, node.type as LinkedType) ?? own.url
    if (node.type === 'html' && typeof own.value === 'string') own.value = rawHtml(own.value, options)
    return [{ type: node.type, ...own, ...node.children ? { children: children() } : {} }]
  }
  switch (node.type) {
    case 'math':
      return [html(`$$\n${node.value ?? ''}\n$$`)]
    case 'inlineMath':
      return [html(`$${node.value ?? ''}$`)]
    case 'admonition':
    case 'aside': {
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
      return [{ type: 'code', lang: 'mermaid', value: node.value ?? '' }]
    case 'raw':
      if (node.lang === 'html') return [html(rawHtml(String(node.value ?? ''), options))]
      break
    case 'iframe': {
      const src = String(node.src ?? '')
      if (options.iframes === 'element') {
        const attrs = (['width', 'height'] as const).filter(key => node[key] != null && node[key] !== '').map(key => ` ${key}="${escape(String(node[key]))}"`).join('')
        return [html(`<iframe src="${escape(src)}"${attrs} loading="lazy"></iframe>`)]
      }
      degraded.add(node.type)
      return [paragraph([{ type: 'link', url: src, children: [text(src)] }])]
    }
    case 'presmiumRole':
      if (!node.children?.length && options.roles === 'marks') return [text(roleMark(node))]
      return children()
    case 'grid':
    case 'grid-item':
    case 'card':
    case 'tabSet':
    case 'tabItem':
      return layout(node, ctx)
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

function rawHtml(value: string, options: LowerOptions): string {
  const { urls } = options
  return options.htmlUrls && urls ? mapHtmlUrls(value, (url, attribute) => urls(url, attribute === 'href' ? 'link' : 'image')) : value
}

function cardsAs(options: LowerOptions): 'element' | 'headings' {
  return options.cards ?? (options.iframes === 'element' ? 'element' : 'headings')
}

/** Whether a MyST node has the class `button`, which renders a link or span as a button. */
export function isButton(node: MdastNode): boolean {
  return typeof node.class === 'string' && node.class.split(/\s+/).includes('button')
}

function layout(node: MdastNode, ctx: Lowering): MdastNode[] {
  const all = (nodes: MdastNode[] = []) => nodes.flatMap(child => lower(child, ctx))
  const element = cardsAs(ctx.options) === 'element'
  const div = (className: string, content: MdastNode[], style = '') => [html(`<div class="${className}"${style}>`), ...content, html('</div>')]
  const heading = (content: MdastNode[]): MdastNode => ({ type: 'heading', depth: SMALL_HEADING, children: content })
  const items = node.children ?? []
  switch (node.type) {
    case 'grid': {
      if (!element) {
        ctx.degraded.add(node.type)
        return all(items)
      }
      const columns = Array.isArray(node.columns) ? Number(node.columns.at(-1)) || 1 : 1
      return div('pm-grid', all(items), ` style="--pm-grid-columns: ${columns}"`)
    }
    case 'grid-item':
      return element ? div('pm-grid__item', all(items)) : all(items)
    case 'card': {
      const part = (type: string) => items.find(child => child.type === type)?.children ?? []
      const title = all(part('cardTitle'))
      const url = typeof node.url === 'string' && node.url ? node.url : undefined
      const linked = url ? lower({ type: 'link', url, children: title.length ? title : [text(url)] }, ctx) : title
      const body = all(items.filter(child => !['header', 'cardTitle', 'footer'].includes(child.type)))
      if (!element) {
        ctx.degraded.add(node.type)
        const top = title.length ? [heading(linked)] : url ? [paragraph(linked)] : []
        return [...all(part('header')), ...top, ...body, ...all(part('footer'))]
      }
      const header = part('header').length ? div('pm-card__header', all(part('header'))) : []
      const footer = part('footer').length ? div('pm-card__footer', all(part('footer'))) : []
      const top = title.length || url ? div('pm-card__title', [paragraph(linked)]) : []
      return div(url ? 'pm-card pm-card--link' : 'pm-card', [...header, ...top, ...body, ...footer])
    }
    case 'tabSet':
      if (!element) ctx.degraded.add(node.type)
      return element ? div('pm-tabs', all(items)) : all(items)
    case 'tabItem': {
      const title = typeof node.title === 'string' ? node.title : ''
      if (!element) return [...title ? [heading([text(title)])] : [], ...all(items)]
      return div('pm-tabs__item', [...title ? [html(`<div class="pm-tabs__title">${escape(title)}</div>`)] : [], ...all(items)])
    }
  }
  return all(items)
}

export function roleMark(node: MdastNode): string {
  const options = typeof node.options === 'object' && node.options !== null ? node.options as Record<string, unknown> : {}
  const value = typeof options.value === 'string' ? options.value.trim() : ''
  return `〔${String(node.name ?? '')}${value ? ` ${value}` : ''}〕`
}

function footnoteNumber(node: MdastNode): string {
  return String(node.enumerator ?? node.label ?? node.identifier)
}

function container(node: MdastNode, ctx: Lowering): MdastNode[] {
  const all = (nodes: MdastNode[] = []) => nodes.flatMap(child => lower(child, ctx))
  const items = node.children ?? []
  const given = items.find(child => child.type === 'caption')
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
