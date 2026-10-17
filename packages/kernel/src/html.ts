/**
 * HTML text shared by the compiler, the renderers and the hosts: escaping,
 * and the URLs of raw HTML (docs/ir.md 6.2), found by parsing it as HTML
 * (parse5, as a browser parses a fragment), so text that only looks like an
 * attribute (`<code> href=x</code>`, a comment, the code of a script) is not one.
 */
import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

/** Text as HTML text or a (double-quoted) attribute value: `&`, `<`, `>` and `"` escaped. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** An attribute of raw HTML: its value, and where it is written (`start` to `end`, the name included). */
export interface HtmlAttribute {
  name: string
  value: string
  start: number
  end: number
}

/** The attributes of raw HTML whose URLs the renderers publish. */
export const URL_ATTRIBUTES: ReadonlySet<string> = new Set(['src', 'poster', 'href'])

/** The values of the attributes `names` (lowercase) of the elements of raw HTML, in the order they are written. */
export function htmlAttributes(html: string, names: ReadonlySet<string>): HtmlAttribute[] {
  const found: HtmlAttribute[] = []
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node) {
      for (const { name, value } of node.attrs) {
        const at = node.sourceCodeLocation?.attrs?.[name]
        if (names.has(name) && at) found.push({ name, value, start: at.startOffset, end: at.endOffset })
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
    if ('content' in node) visit(node.content)
  }
  visit(parseFragment(html, { sourceCodeLocationInfo: true }))
  return found.sort((a, b) => a.start - b.start)
}

/**
 * Raw HTML with the URLs of its `src`, `poster` and `href` attributes
 * mapped; `map` keeps a URL by giving undefined. A mapped attribute is
 * written with double quotes; the rest of the HTML stays as written.
 */
export function mapHtmlUrls(html: string, map: (url: string, attribute: string) => string | undefined): string {
  let out = html
  // From the last to the first, so the offsets of those before stay true.
  for (const { name, value, start, end } of htmlAttributes(html, URL_ATTRIBUTES).reverse()) {
    const mapped = map(value, name)
    if (mapped === undefined) continue
    out = `${out.slice(0, start)}${html.slice(start, start + name.length)}="${escapeHtml(mapped)}"${out.slice(end)}`
  }
  return out
}
