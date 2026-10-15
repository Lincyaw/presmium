/**
 * Hyperlinks a slide declares, which an export must keep (P-50). Read from the
 * slide Markdown after the addons' `transformMarkdown`, so generated links such
 * as code permalinks are included.
 */

const MARKDOWN_LINK = /(?<!!)\[(?:[^\]\\]|\\.)*\]\(\s*<?(https?:\/\/[^\s<>)]+)/g
const REFERENCE = /^ {0,3}\[[^\]]+\]:\s*<?(https?:\/\/[^\s<>]+)/gm
const AUTOLINK = /<(https?:\/\/[^\s<>]+)>/g
/** `href`, `to` and attributes named like `permalink`, `repo-url`. */
const ATTRIBUTE = /\s(?:href|to|[\w-]*link|[\w-]*url)\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi
/** The same names as keys of JSON passed to a component, e.g. `variants="[{&quot;href&quot;:&quot;https://…&quot;}]"`. */
const JSON_KEY = /"(?:href|to|[\w-]*link|[\w-]*url)"\s*:\s*"(https?:\/\/[^"\\\s]+)"/gi

/** Absolute http(s) links of a slide, normalized and deduplicated, in source order. */
export function declaredLinks(markdown: string): string[] {
  const text = withoutDocOnly(withoutCode(markdown).replace(/<!--[\s\S]*?-->/g, ''))
  const found = [
    ...[MARKDOWN_LINK, REFERENCE, AUTOLINK].flatMap(re => [...text.matchAll(re)].map(m => ({ at: m.index, url: m[1]! }))),
    ...[...text.matchAll(ATTRIBUTE)].map(m => ({ at: m.index, url: m[2]! })),
    // Positions in the unescaped text are close enough to order the links.
    ...[...text.replaceAll('&quot;', '"').matchAll(JSON_KEY)].map(m => ({ at: m.index, url: m[1]! })),
  ].sort((a, b) => a.at - b.at)
  return [...new Set(found.map(f => normalizeUrl(f.url.replaceAll('&amp;', '&'))).filter((url): url is string => url !== undefined))]
}

/**
 * 1-based line, from line `from` up to before line `to`, where the source
 * writes `url` (normalized as `declaredLinks` returns it); undefined when no
 * line does, e.g. for a permalink that an addon generates.
 */
export function linkLine(lines: string[], url: string, from: number, to = lines.length + 1): number | undefined {
  const forms = [url, url.replace(/\/$/, ''), url.replaceAll('&', '&amp;')].map(form => form.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'))
  // The URL as a whole: followed by the end of the line or a character that ends a link.
  const written = new RegExp(`(?:${forms.join('|')})(?=$|[\\s"'<>)\\]])`)
  for (let i = Math.max(from, 1); i < Math.min(to, lines.length + 1); i++) {
    if (written.test(lines[i - 1]!)) return i
  }
  return undefined
}

/** The WHATWG serialization, so source and PDF links compare equal; undefined when invalid. */
export function normalizeUrl(url: string): string | undefined {
  try {
    return new URL(url).href
  } catch {
    return undefined
  }
}

/** Removes fenced code blocks and inline code: URLs there are text, not links. */
function withoutCode(markdown: string): string {
  const lines: string[] = []
  let fence: string | undefined
  for (const line of markdown.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence === undefined && marker) fence = marker
    else if (fence !== undefined && marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
    else if (fence === undefined) lines.push(line)
  }
  return lines.join('\n').replace(/(`+)[\s\S]*?\1/g, '')
}

/** Removes elements marked `doc-only` (architecture §5.6): the slides form never shows them. */
function withoutDocOnly(text: string): string {
  const open = /<([a-zA-Z][\w-]*)\b[^>]*\sdoc-only\b[^>]*>/g
  let result = text
  for (let match = open.exec(result); match; match = open.exec(result)) {
    const afterTag = match.index + match[0].length
    const end = match[0].endsWith('/>') ? afterTag : closingEnd(result, match[1]!, afterTag)
    result = result.slice(0, match.index) + result.slice(end)
    open.lastIndex = match.index
  }
  return result
}

/** Index after the tag that closes `name` opened before `from`, or the end of the text. */
function closingEnd(text: string, name: string, from: number): number {
  const tags = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'g')
  tags.lastIndex = from
  let depth = 1
  for (let tag = tags.exec(text); tag; tag = tags.exec(text)) {
    if (tag[1]) depth--
    else if (!tag[2]) depth++
    if (depth === 0) return tag.index + tag[0].length
  }
  return text.length
}

/** Slide numbers of a Slidev `--range` such as `1,4-5,6`; undefined means every slide. */
export function parseRange(range: string | undefined): Set<number> | undefined {
  if (range === undefined) return undefined
  const slides = new Set<number>()
  for (const part of range.split(',').map(p => p.trim()).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!match) throw new Error(`invalid range "${range}"`)
    const from = Number(match[1])
    for (let n = from; n <= Number(match[2] ?? from); n++) slides.add(n)
  }
  return slides
}
