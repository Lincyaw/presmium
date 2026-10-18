import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface HtmlAttribute {
  name: string
  value: string
  start: number
  end: number
}

export const URL_ATTRIBUTES: ReadonlySet<string> = new Set(['src', 'poster', 'href'])

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

export function mapHtmlUrls(html: string, map: (url: string, attribute: string) => string | undefined): string {
  let out = html
  for (const { name, value, start, end } of htmlAttributes(html, URL_ATTRIBUTES).reverse()) {
    const mapped = map(value, name)
    if (mapped === undefined) continue
    out = `${out.slice(0, start)}${html.slice(start, start + name.length)}="${escapeHtml(mapped)}"${out.slice(end)}`
  }
  return out
}
