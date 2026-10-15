/**
 * Hyperlinks the slides show, which an export must keep (P-50). Read from the
 * IR as the slides renderer sees it, so generated links such as code
 * permalinks are included and narration (the speaker notes) is not.
 */
import type { IRBlock, IRDocument, MdastNode, SourcePos } from '@presmium/kernel'

export interface DeclaredLink {
  url: string
  /** First slide (section index) that shows the link. */
  slide: number
  /** The block that shows it. */
  source: SourcePos
}

/** `href`, `to` and attributes named like `permalink`, `repo-url` in raw HTML. */
const ATTRIBUTE = /\s(?:href|to|[\w-]*link|[\w-]*url)\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi
/** The same names as keys of JSON in an attribute, e.g. `data-ref='{"href": "https://…"}'`. */
const JSON_KEY = /"(?:href|to|[\w-]*link|[\w-]*url)"\s*:\s*"(https?:\/\/[^"\\\s]+)"/gi
const LINK_KEY = /^(?:href|to|.*link|.*url)$/i

function mdastLinks(node: MdastNode, found: string[]): void {
  if ((node.type === 'link' || node.type === 'definition') && typeof node.url === 'string') found.push(node.url)
  if (node.type === 'html' && typeof node.value === 'string') {
    const html = node.value.replaceAll('&quot;', '"')
    found.push(...[...html.matchAll(ATTRIBUTE)].map(m => m[2]!), ...[...html.matchAll(JSON_KEY)].map(m => m[1]!))
  }
  node.children?.forEach(child => mdastLinks(child, found))
}

function propLinks(value: unknown, found: string[], key = ''): void {
  if (typeof value === 'string' && LINK_KEY.test(key)) found.push(value)
  else if (Array.isArray(value)) value.forEach(item => propLinks(item, found, key))
  else if (typeof value === 'object' && value !== null) Object.entries(value).forEach(([k, v]) => propLinks(v, found, k))
}

/** Links of a visual block, in document order. */
function blockLinks(block: IRBlock): string[] {
  const found: string[] = []
  const { node } = block
  if (node.type === 'markdown') mdastLinks(node.mdast, found)
  else if (node.type === 'code' && node.origin?.permalink) found.push(node.origin.permalink)
  else if (node.type === 'component') {
    propLinks(node.props, found)
    for (const child of node.children ?? []) found.push(...blockLinks(child))
  }
  return found
}

/**
 * Absolute http(s) links of the slides, normalized and deduplicated, each
 * with the first slide that shows it; slides hidden from the slides form
 * (`hints.slides.hide`) and slides outside `range` are left out.
 */
export function slideLinks(doc: IRDocument, range?: Set<number>): DeclaredLink[] {
  const links = new Map<string, DeclaredLink>()
  for (const section of doc.sections) {
    const hints = section.hints.slides ?? {}
    if (hints.hide || hints.disabled || (range && !range.has(section.index))) continue
    for (const block of section.blocks.filter(b => b.role === 'visual')) {
      for (const raw of blockLinks(block)) {
        const url = /^https?:\/\//i.test(raw) ? normalizeUrl(raw.replaceAll('&amp;', '&')) : undefined
        if (url && !links.has(url)) links.set(url, { url, slide: section.index, source: block.source })
      }
    }
  }
  return [...links.values()]
}

/**
 * 1-based line, from line `from` up to before line `to`, where the source
 * writes `url` (normalized as `slideLinks` returns it); undefined when no
 * line does, e.g. for a permalink that a plugin generates.
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
