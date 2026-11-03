// One Markdown note to one document (`presmium import`). Pure: the caller resolves links and copies files.
//
// Each level-1 or level-2 heading starts a page (the first page holds what comes before it, under the note's title);
// every page has one step that shows all its blocks. Paragraphs, headings, lists, quotes, code, math and tables become
// rich text; a Mermaid diagram becomes a code block of its own, which is what draws it; a paragraph holding only an
// image becomes an image block. What has no rich-text node (raw HTML, footnotes, rules, callouts) is kept as an mdast
// extension that the viewer renders. `[[target]]` and `[[target|label]]` wikilinks, relative links and images go through
// the caller's `links`. Node ids come from the content, so importing an unchanged paragraph again keeps its id.
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'
import { parse as parseYaml } from 'yaml'
import type { Asset, DocumentBlock, InlineNode, MdastNode, RichTextNode, Section, Step, TeachingDocument, TextMark } from '@lincyaw/kernel'

export interface Frontmatter {
  title?: string
  description?: string
  lang?: string
  tags: string[]
  aliases: string[]
}

export interface MarkdownLinks {
  /** A wikilink's target (without `#fragment`) to the href of the document it names; undefined when there is none. */
  page(target: string, fragment: string | undefined): string | undefined
  /** A relative URL of a link to its new href; undefined when it leads nowhere that is published. */
  url(url: string): string | undefined
  /** A relative URL of an image to the location of its copy, relative to the document. */
  image(url: string): string | undefined
}

export interface ImportedMarkdown {
  document: TeachingDocument
  /** Wikilinks and relative links that `links` could not resolve, as written. */
  unresolved: string[]
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
/** Stands in for the `|` of `[[target|label]]` while parsing, so a GFM table does not split the cell at it. */
const LABEL = '\uE000'
const WIKILINK = new RegExp(`\\[\\[([^\\]|${LABEL}\\n]+)(?:[|${LABEL}]([^\\]\\n]+))?\\]\\]`, 'g')
const HIGHLIGHT = /==(?=\S)([^=\n]*\S)==/g
const CALLOUT = /^\[!([A-Za-z]+)\][+-]?[ \t]*/
const SCHEME = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i
const MARKS: Record<string, TextMark['type']> = { strong: 'bold', emphasis: 'italic', delete: 'strike' }
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const LETTER = /\p{L}/gu

export function splitFrontmatter(source: string): { frontmatter: Frontmatter, body: string } {
  const match = FRONTMATTER.exec(source)
  let data: unknown
  if (match) {
    try {
      data = parseYaml(match[1]!)
    } catch {
    }
  }
  const record = data !== null && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  const text = (key: string) => (typeof record[key] === 'string' && (record[key] as string).trim() ? (record[key] as string).trim() : undefined)
  const list = (key: string) => {
    const value = record[key]
    return (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
      .flatMap(item => (typeof item === 'string' || typeof item === 'number' ? [String(item).trim()] : [])).filter(Boolean)
  }
  return {
    frontmatter: { title: text('title'), description: text('description'), lang: text('lang'), tags: list('tags'), aliases: list('aliases') },
    body: match ? source.slice(match[0].length) : source,
  }
}

/** The title of a note: its frontmatter title, else its first level-1 heading. */
export function noteTitle(source: string): string | undefined {
  const { frontmatter, body } = splitFrontmatter(source)
  return frontmatter.title ?? /^#[ \t]+(.+?)[ \t#]*$/m.exec(body)?.[1]?.trim()
}

/** The anchor of a heading, as GitHub writes it: lower case, punctuation dropped, spaces to hyphens. */
export function headingSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

function guessLang(text: string): string {
  const letters = text.match(LETTER)?.length ?? 0
  return letters > 0 && (text.match(CJK)?.length ?? 0) / letters > 0.3 ? 'zh-CN' : 'en'
}

function plain(node: MdastNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(plain).join('')
}

function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

function withoutPositions(node: MdastNode): unknown {
  const { position: _position, children, ...rest } = node
  return children ? { ...rest, children: children.map(withoutPositions) } : rest
}

function restoreLabels(node: MdastNode): void {
  if (typeof node.value === 'string') node.value = node.value.replaceAll(LABEL, '|')
  node.children?.forEach(restoreLabels)
}

export function markdownDocument(source: string, options: { id: string, title: string, lang?: string, links: MarkdownLinks }): ImportedMarkdown {
  const { frontmatter, body } = splitFrontmatter(source)
  const protectedBody = body.replace(/\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g, (_, target: string, label: string) => `[[${target}${LABEL}${label}]]`)
  const root = fromMarkdown(protectedBody, { extensions: [gfm(), math()], mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()] }) as unknown as MdastNode
  const unresolved: string[] = []
  const definitions = new Map<string, string>()
  const collect = (node: MdastNode) => {
    if (node.type === 'definition') definitions.set(String(node.identifier).toLowerCase(), String(node.url))
    node.children?.forEach(collect)
  }
  collect(root)

  // Links are rewritten in the mdast first, so callouts and other extensions carry the same hrefs as rich text.
  const relink = (node: MdastNode): MdastNode[] => {
    if (node.type === 'text' && typeof node.value === 'string' && node.value.includes('[[')) return wikilinks(node.value)
    if ((node.type === 'link' || node.type === 'definition') && typeof node.url === 'string' && !SCHEME.test(node.url)) {
      const href = options.links.url(node.url)
      if (href === undefined) {
        unresolved.push(node.url)
        if (node.type === 'link') return (node.children ?? []).flatMap(relink)
      }
      node.url = href ?? node.url
    }
    if (node.type === 'linkReference') {
      const url = definitions.get(String(node.identifier).toLowerCase())
      if (url !== undefined) return relink({ type: 'link', url, children: node.children ?? [] })
    }
    if (node.children) node.children = node.children.flatMap(relink)
    return [node]
  }
  const wikilinks = (value: string): MdastNode[] => {
    const out: MdastNode[] = []
    let cursor = 0
    for (const match of value.matchAll(WIKILINK)) {
      if (match.index > cursor) out.push({ type: 'text', value: value.slice(cursor, match.index) })
      const written = match[1]!.trim()
      const [target = '', ...fragment] = written.split('#')
      const label = (match[2] ?? written).trim()
      const href = options.links.page(target.trim(), fragment.length ? fragment.join('#') : undefined)
      if (href === undefined) unresolved.push(`[[${written}]]`)
      out.push(href === undefined ? { type: 'text', value: label } : { type: 'link', url: href, children: [{ type: 'text', value: label }] })
      cursor = match.index + match[0].length
    }
    if (cursor < value.length) out.push({ type: 'text', value: value.slice(cursor) })
    return out
  }
  root.children = (root.children ?? []).flatMap(relink)
  restoreLabels(root)

  const used = new Set<string>()
  const unique = (base: string) => {
    let id = base.slice(0, 180) || 'node'
    for (let n = 2; used.has(id); n++) id = `${base.slice(0, 180)}-${n}`
    used.add(id)
    return id
  }
  const idOf = (prefix: string, node: MdastNode) => unique(`${prefix}-${hash(JSON.stringify(withoutPositions(node)))}`)
  const extension = (node: MdastNode): RichTextNode => {
    const text = plain(node).trim()
    return { id: idOf(node.type, node), type: 'extension', kind: 'presmium.mdast', schemaVersion: 1, data: { node: withoutPositions(node) as never },
      fallback: text ? [{ id: idOf('fallback', node), type: 'paragraph', children: [{ type: 'text', text }] }] : [] }
  }

  const inline = (nodes: MdastNode[], marks: TextMark[] = []): InlineNode[] => nodes.flatMap((node): InlineNode[] => {
    const styled = (text: string, extra: TextMark[] = []): InlineNode => ({ type: 'text', text, ...marks.length + extra.length ? { marks: [...marks, ...extra] } : {} })
    if (node.type === 'text') {
      const value = String(node.value ?? '')
      if (!value.includes('==')) return value ? [styled(value)] : []
      const out: InlineNode[] = []
      let cursor = 0
      for (const match of value.matchAll(HIGHLIGHT)) {
        if (match.index > cursor) out.push(styled(value.slice(cursor, match.index)))
        out.push(styled(match[1]!, [{ type: 'background', value: 'warn' }]))
        cursor = match.index + match[0].length
      }
      if (cursor < value.length) out.push(styled(value.slice(cursor)))
      return out
    }
    if (node.type === 'break') return [{ type: 'break' }]
    if (node.type === 'inlineMath') return [{ type: 'math', value: String(node.value ?? '') }]
    if (node.type === 'inlineCode') return [styled(String(node.value ?? ''), [{ type: 'code' }])]
    if (MARKS[node.type]) return inline(node.children ?? [], [...marks, { type: MARKS[node.type]! } as TextMark])
    if (node.type === 'link') return [{ type: 'link', href: String(node.url), children: inline(node.children ?? [], marks) }]
    if (node.type === 'image' && typeof node.url === 'string') {
      const href = SCHEME.test(node.url) ? node.url : options.links.image(node.url)
      return href ? [{ type: 'link', href, children: [styled(String(node.alt || node.url))] }] : [styled(String(node.alt ?? ''))]
    }
    return [{ type: 'extension', kind: 'presmium.mdast', schemaVersion: 1, data: { node: withoutPositions(node) as never }, fallback: plain(node) }]
  })

  const rich = (node: MdastNode): RichTextNode[] => {
    const children = node.children ?? []
    switch (node.type) {
      case 'paragraph': {
        const content = inline(children)
        return content.length ? [{ id: idOf('p', node), type: 'paragraph', children: content }] : []
      }
      case 'heading':
        return [{ id: unique(headingSlug(plain(node)) || `h-${hash(plain(node))}`), type: 'heading', level: Math.min(6, Math.max(1, Number(node.depth))) as 1, children: inline(children) }]
      case 'blockquote': {
        const callout = calloutOf(node)
        return callout ? [extension(callout)] : [{ id: idOf('quote', node), type: 'blockquote', children: children.flatMap(rich) }]
      }
      case 'list':
        return [{ id: idOf('list', node), type: 'list', ordered: Boolean(node.ordered), ...Number(node.start) >= 1 ? { start: Number(node.start) } : {},
          children: children.map(item => ({ id: idOf('item', item), type: 'listItem', ...typeof item.checked === 'boolean' ? { checked: item.checked } : {}, children: (item.children ?? []).flatMap(rich) })) }]
      case 'code':
        return [{ id: idOf('code', node), type: 'code', language: String(node.lang ?? ''), value: String(node.value ?? '') }]
      case 'math':
        return [{ id: idOf('math', node), type: 'math', value: String(node.value ?? '') }]
      case 'table': {
        const align = Array.isArray(node.align) ? node.align as (string | null)[] : []
        return [{ id: idOf('table', node), type: 'table', headerRows: 1, children: children.map(row => ({ id: idOf('row', row), type: 'tableRow',
          children: (row.children ?? []).map((cell, c) => ({ id: idOf('cell', cell), type: 'tableCell', children: inline(cell.children ?? []),
            ...align[c] ? { style: { alignment: align[c] as 'left' } } : {} })) })) }]
      }
      case 'definition':
        return []
      default:
        return [extension(node)]
    }
  }

  // Pages: a level-1 or level-2 heading starts one. The note's own title heading opens the first page and is not repeated.
  const nodes = root.children ?? []
  const title = frontmatter.title ?? (nodes[0]?.type === 'heading' && nodes[0].depth === 1 ? plain(nodes[0]).trim() : undefined) ?? options.title
  const pages: { title: string, level: number, nodes: MdastNode[] }[] = [{ title, level: 1, nodes: [] }]
  nodes.forEach((node, i) => {
    const opensPage = node.type === 'heading' && Number(node.depth) <= 2
    if (opensPage && i === 0 && node.depth === 1 && plain(node).trim() === title) return
    if (opensPage) pages.push({ title: plain(node).trim() || title, level: Number(node.depth), nodes: [] })
    else pages.at(-1)!.nodes.push(node)
  })
  if (pages.length > 1 && pages[0]!.nodes.length === 0 && pages[1]!.level === 1) pages.shift()

  const sections: Record<string, Section> = {}, blocks: Record<string, DocumentBlock> = {}, steps: Record<string, Step> = {}, assets: Record<string, Asset> = {}
  const sectionOrder: string[] = []
  for (const page of pages) {
    const sectionId = unique(headingSlug(page.title) || `page-${hash(page.title)}`)
    const children: string[] = []
    let text: RichTextNode[] = []
    const flush = () => {
      if (!text.length) return
      const id = unique(`${sectionId}--text-${children.length}`)
      blocks[id] = { id, type: 'text', content: text }
      children.push(id)
      text = []
    }
    for (const node of page.nodes) {
      const image = node.type === 'paragraph' ? soleImage(node) : undefined
      const location = image && typeof image.url === 'string' && !SCHEME.test(image.url) ? options.links.image(image.url) : undefined
      if (node.type === 'code' && (node.lang === 'mermaid' || node.lang === 'mmd')) {
        flush()
        const id = unique(`${sectionId}--diagram-${children.length}`)
        blocks[id] = { id, type: 'code', language: 'mermaid', value: String(node.value ?? '') }
        children.push(id)
      } else if (image && location) {
        flush()
        const id = unique(`${sectionId}--image-${children.length}`), assetId = unique(`asset-${hash(location)}`)
        assets[assetId] = { id: assetId, kind: 'image', location, ...image.title ? { title: String(image.title) } : {} }
        blocks[id] = { id, type: 'image', assetId, alt: String(image.alt ?? '') }
        children.push(id)
      } else {
        if (image && !location && typeof image.url === 'string') unresolved.push(image.url)
        text.push(...rich(node))
      }
    }
    flush()
    const stepId = unique(`${sectionId}--step`)
    sections[sectionId] = { id: sectionId, title: page.title, level: Math.min(2, page.level) as 1, children, stepOrder: [stepId], layout: { type: 'stack' } }
    steps[stepId] = { id: stepId, sectionId, visuals: children.map(blockId => ({ blockId, visible: true })), narrationIds: [] }
    sectionOrder.push(sectionId)
  }

  return {
    document: {
      schemaVersion: 1,
      id: options.id,
      metadata: {
        title,
        lang: frontmatter.lang ?? options.lang ?? guessLang(body),
        ...frontmatter.description ? { description: frontmatter.description } : {},
        ...frontmatter.tags.length ? { tags: frontmatter.tags } : {},
        plugins: [],
        renderers: { web: {} },
      },
      sectionOrder, sections, blocks, steps, narrations: {}, assets, definitions: {},
      production: { defaults: {}, stepOverrides: {}, mediaClips: [] },
    } as TeachingDocument,
    unresolved: [...new Set(unresolved)],
  }
}

function soleImage(paragraph: MdastNode): MdastNode | undefined {
  const content = (paragraph.children ?? []).filter(child => !(child.type === 'text' && !String(child.value ?? '').trim()))
  return content.length === 1 && content[0]!.type === 'image' ? content[0] : undefined
}

/** `> [!note] Title` (as GitHub and Obsidian write callouts) as a MyST admonition, which the viewer draws as one. */
function calloutOf(quote: MdastNode): MdastNode | undefined {
  const first = quote.children?.[0]
  const lead = first?.type === 'paragraph' ? first.children?.[0] : undefined
  const match = lead?.type === 'text' ? CALLOUT.exec(String(lead.value ?? '')) : null
  if (!first || !lead || !match) return undefined
  const rest = String(lead.value).slice(match[0].length)
  const breakAt = rest.indexOf('\n')
  const titleText = (breakAt < 0 ? rest : rest.slice(0, breakAt)).trim()
  const bodyLead = breakAt < 0 ? '' : rest.slice(breakAt + 1)
  const inlineRest = [...bodyLead ? [{ type: 'text', value: bodyLead }] : [], ...(first.children ?? []).slice(1)]
  const kind = match[1]!.toLowerCase()
  return {
    type: 'admonition', kind,
    children: [
      { type: 'admonitionTitle', children: [{ type: 'text', value: titleText || kind.charAt(0).toUpperCase() + kind.slice(1) }] },
      ...inlineRest.length ? [{ type: 'paragraph', children: inlineRest }] : [],
      ...(quote.children ?? []).slice(1),
    ],
  }
}
