/**
 * The URLs of raw HTML that the renderers publish (docs/ir.md 6.2): the
 * `src`, `poster` and `href` attributes of its elements, found by parsing
 * it as HTML (parse5, as a browser parses a fragment), so text that only
 * looks like an attribute (`<code> href=x</code>`, a comment, a script) is
 * not one.
 */
import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

type Node = DefaultTreeAdapterMap['node']

const URL_ATTRIBUTES = new Set(['src', 'poster', 'href'])

/**
 * Raw HTML with the URLs of its `src`, `poster` and `href` attributes
 * mapped; `map` keeps a URL by giving undefined. A mapped attribute is
 * written with double quotes; the rest of the HTML stays as written.
 */
export function mapHtmlUrls(html: string, map: (url: string) => string | undefined): string {
  const edits: { start: number, end: number, text: string }[] = []
  const visit = (node: Node) => {
    if ('attrs' in node) {
      for (const { name, value } of node.attrs) {
        const at = node.sourceCodeLocation?.attrs?.[name]
        if (!URL_ATTRIBUTES.has(name) || !at) continue
        const mapped = map(value)
        if (mapped === undefined) continue
        const written = html.slice(at.startOffset, at.endOffset)
        edits.push({ start: at.startOffset, end: at.endOffset, text: `${written.slice(0, name.length)}="${mapped.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` })
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
