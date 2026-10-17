/**
 * Standard mdast to the Markdown Slidev reads, through mdast-util-to-markdown
 * with GFM. MyST nodes are lowered to standard ones first (`lowerMyst` of
 * @presmium/kernel, see ./slidev.ts).
 */
import type { MdastNode } from '@presmium/kernel'
import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Options } from 'mdast-util-to-markdown'
import { bundledLanguages } from 'shiki/langs'

const OPTIONS = {
  bullet: '-',
  extensions: [gfmToMarkdown()],
  // A bare `$` would start KaTeX math in Slidev.
  unsafe: [{ character: '$', inConstruct: 'phrasing' }],
} as unknown as Options

/** Serializes a tree of standard mdast nodes. */
export function markdown(tree: MdastNode): string {
  return toMarkdown(tree as Parameters<typeof toMarkdown>[0], OPTIONS).trim()
}

/** The language of a code block for Slidev: one Shiki does not know would fail the build, so it is shown as plain text. */
export function codeLang(lang: unknown): string {
  const name = typeof lang === 'string' ? lang.toLowerCase() : ''
  return name in bundledLanguages ? name : 'text'
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The attributes of raw HTML whose URLs the slides publish (docs/ir.md 6.2). */
const URL_ATTRIBUTES = new Set(['src', 'poster', 'href'])

/**
 * Raw HTML with the URLs of its `src`, `poster` and `href` attributes
 * mapped; `map` keeps a URL by giving undefined. The attributes are found by
 * parsing the HTML (parse5, as a browser parses a fragment), so text that
 * only looks like one (`<code> href=x</code>`, a comment, a script) is not
 * one; the rest of the HTML stays as written.
 */
export function mapHtmlUrls(html: string, map: (url: string, attribute: string) => string | undefined): string {
  const edits: { start: number, end: number, text: string }[] = []
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node) {
      for (const { name, value } of node.attrs) {
        const at = node.sourceCodeLocation?.attrs?.[name]
        if (!URL_ATTRIBUTES.has(name) || !at) continue
        const mapped = map(value, name)
        if (mapped === undefined) continue
        edits.push({ start: at.startOffset, end: at.endOffset, text: `${html.slice(at.startOffset, at.startOffset + name.length)}="${escapeHtml(mapped)}"` })
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
