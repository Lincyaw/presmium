/**
 * Search tokenizer: splits at spaces and punctuation like MiniSearch's default
 * tokenizer (so `console.log` gives `console` and `log`), then into words by
 * `Intl.Segmenter`, so Chinese text without spaces splits into words.
 * VitePress serializes it into the client bundle, so it must not refer to
 * anything outside its own body.
 */
export function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  const words: string[] = []
  for (const piece of text.split(/[\n\r\p{Z}\p{P}]+/u)) {
    for (const part of segmenter.segment(piece)) {
      if (part.isWordLike) words.push(part.segment)
    }
  }
  return words
}

const VOID_ELEMENT = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i
const SLIDE_ONLY = /<([a-z][\w-]*)\b[^>]*?\sslide-only(?=[\s=/>])[^>]*>/gi
/** VitePress prints a code block's language before the code; indexed, it merges with the first word. */
const CODE_LANGUAGE = /<span class="lang">[^<]*<\/span>/g

/** End of the element whose start tag ends at `from`, or `from` when it is not closed. */
function elementEnd(html: string, tag: string, from: number): number {
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  tags.lastIndex = from
  let depth = 1
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    if (match[0].endsWith('/>')) continue
    depth += match[1] ? -1 : 1
    if (depth === 0) return tags.lastIndex
  }
  return from
}

/**
 * The rendered HTML of a page as the search index should see it: without
 * `slide-only` elements, which the web form never shows, and without the code
 * language labels.
 */
export function searchableHtml(html: string): string {
  const starts = new RegExp(SLIDE_ONLY)
  let out = ''
  let pos = 0
  for (let match = starts.exec(html); match; match = starts.exec(html)) {
    const tag = match[1]!
    const end = VOID_ELEMENT.test(tag) || match[0].endsWith('/>') ? starts.lastIndex : elementEnd(html, tag, starts.lastIndex)
    out += html.slice(pos, match.index)
    pos = end
    starts.lastIndex = end
  }
  return (out + html.slice(pos)).replace(CODE_LANGUAGE, '')
}
