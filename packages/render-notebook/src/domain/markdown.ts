/**
 * mdast to the Markdown of notebook cells (K-18). Jupyter front ends render
 * CommonMark with GFM tables, inline HTML and dollar math, not MyST syntax,
 * so MyST-only nodes are first lowered to those (`lowerMyst` of
 * @presmium/kernel): an admonition to a blockquote with a bold title, a
 * dropdown to `<details>`, a footnote to its number, ... myst-to-md then
 * writes the result, which holds only nodes it writes as plain Markdown. A
 * node with no such form keeps its text and is reported as degraded.
 */
import { lowerMyst } from '@presmium/kernel'
import type { LowerOptions, MdastNode } from '@presmium/kernel'
import { writeMd } from 'myst-to-md'
import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import { VFile } from 'vfile'

export interface MarkdownText {
  text: string
  /** What myst-to-md could not write. */
  problems: string[]
  /** MyST node types the notebook cannot show as they are, e.g. an embed; what text they hold is kept. */
  degraded: string[]
}

/** The attributes of raw HTML whose URLs the notebook publishes (docs/ir.md 6.2). */
const URL_ATTRIBUTES = new Set(['src', 'poster', 'href'])

/**
 * Raw HTML with the URLs of its `src`, `poster` and `href` attributes mapped
 * by `urls`. The attributes are found by parsing the HTML (parse5, as a
 * browser parses a fragment), so text that only looks like one is not one;
 * the rest of the HTML stays as written.
 */
function mapHtmlUrls(html: string, urls: NonNullable<LowerOptions['urls']>): string {
  const edits: { start: number, end: number, text: string }[] = []
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node) {
      for (const { name, value } of node.attrs) {
        const at = node.sourceCodeLocation?.attrs?.[name]
        if (!URL_ATTRIBUTES.has(name) || !at) continue
        const mapped = urls(value, 'link')
        if (mapped === undefined) continue
        edits.push({ start: at.startOffset, end: at.endOffset, text: `${html.slice(at.startOffset, at.startOffset + name.length)}="${mapped.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` })
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
    if ('content' in node) visit(node.content)
  }
  visit(parseFragment(html, { sourceCodeLocationInfo: true }))
  let out = html
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, start) + text + out.slice(end)
  return out
}

/** Raw HTML with the URLs of its `src`, `poster` and `href` attributes mapped by `urls`. */
function rawHtml(node: MdastNode, urls: NonNullable<LowerOptions['urls']>): MdastNode {
  if (node.type === 'html' && typeof node.value === 'string') return { ...node, value: mapHtmlUrls(node.value, urls) }
  return node.children ? { ...node, children: node.children.map(child => rawHtml(child, urls)) } : node
}

/** `urls` maps the URLs of images, links and raw HTML (`LowerOptions.urls`); links to labels keep their text. */
export function toMarkdown(mdast: MdastNode, urls?: LowerOptions['urls']): MarkdownText {
  const lowered = lowerMyst(urls ? rawHtml(mdast, urls) : mdast, { urls })
  const problems: string[] = []
  const parts = (lowered.mdast.children ?? []).map((block) => {
    const file = new VFile()
    // Each block on its own: mdast-util-to-markdown writes a root with any inline child as one line.
    writeMd(file, { type: 'root', children: [block] } as Parameters<typeof writeMd>[1])
    problems.push(...file.messages.map(m => m.reason))
    return String(file.result ?? '')
  })
  return { text: parts.filter(Boolean).join('\n\n'), problems, degraded: lowered.degraded }
}
