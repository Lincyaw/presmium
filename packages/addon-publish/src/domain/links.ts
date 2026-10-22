import type { IRBlock, IRDocument, MdastNode, SourcePos } from '@lincyaw/kernel'

export interface DeclaredLink {
  url: string
  slide: number
  source: SourcePos
}

const ATTRIBUTE = /\s(?:href|to|[\w-]*link|[\w-]*url)\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi
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

export function linkLine(lines: string[], url: string, from: number, to = lines.length + 1): number | undefined {
  const forms = [url, url.replace(/\/$/, ''), url.replaceAll('&', '&amp;')].map(form => form.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'))
  const written = new RegExp(`(?:${forms.join('|')})(?=$|[\\s"'<>)\\]])`)
  for (let i = Math.max(from, 1); i < Math.min(to, lines.length + 1); i++) {
    if (written.test(lines[i - 1]!)) return i
  }
  return undefined
}

export function normalizeUrl(url: string): string | undefined {
  try {
    return new URL(url).href
  } catch {
    return undefined
  }
}
