/** The attributes of raw HTML whose URLs the renderers publish (docs/ir.md 6.2). */
const URL_ATTRIBUTES = /(\s(?:src|poster|href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi

/**
 * Raw HTML with the URLs of its `src`, `poster` and `href` attributes
 * mapped; `map` keeps a URL by giving undefined. A mapped attribute is
 * written with double quotes.
 */
export function mapHtmlUrls(html: string, map: (url: string) => string | undefined): string {
  return html.replace(URL_ATTRIBUTES, (whole, attribute: string, double?: string, single?: string, bare?: string) => {
    const mapped = map((double ?? single ?? bare ?? '').replace(/&amp;/g, '&'))
    return mapped === undefined ? whole : `${attribute}"${mapped.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
  })
}
