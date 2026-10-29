import { lstat, readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { compactSteps, irBlocks, isRecord, nodeMdast, productionAssetIds, propText } from '@lincyaw/kernel'
import type { Finding, IRBlock, IRDocument, IRNode, IRSection, MdastNode, SourcePos } from '@lincyaw/kernel'
import { resolveReferences } from './references.ts'

export interface Removed {
  source: SourcePos
  audience: string[]
  title?: string
  blocks: IRBlock[]
  nested?: boolean
}

export interface AudienceMark {
  source: SourcePos
  audience: string[]
}

export interface Withheld {
  source: SourcePos
  audience: string[]
  sentences: string[]
}

const MIN_SENTENCE = 12

const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.mp3', '.mp4', '.m4a', '.webm', '.ogg', '.oga', '.wav', '.flac', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.zip', '.gz', '.pdf'])

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

export function includesAudience(audience: string[] | undefined, name: string): boolean {
  return !audience || audience.includes(name)
}

export function markOf(node: unknown): string[] | undefined {
  const audience = isRecord(node) && isRecord(node.data) ? node.data.audience : undefined
  return Array.isArray(audience) ? audience as string[] : undefined
}

/** Removes the sections and blocks not for the audience; `keeps` tells whether a finding lies in what is left. */
export function filterForAudience(doc: IRDocument, name: string, marks: AudienceMark[] = []): { doc: IRDocument, removed: Removed[], keeps: (finding: Finding) => boolean } {
  const removed: Removed[] = []
  const sections: IRSection[] = []
  for (const section of doc.sections) {
    if (!includesAudience(section.audience, name)) {
      removed.push({ source: section.source, audience: section.audience!, title: section.title, blocks: section.blocks })
      continue
    }
    let dropped = false
    const keep = (blocks: IRBlock[]): IRBlock[] => blocks.flatMap((block) => {
      if (!includesAudience(block.audience, name)) {
        dropped = true
        removed.push({ source: block.source, audience: block.audience!, blocks: [block] })
        return []
      }
      const node = nodeFor(block, name, removed, keep)
      return [node === block.node ? block : { ...block, node }]
    })
    const blocks = keep(section.blocks)
    sections.push(dropped ? compactSteps({ ...section, blocks }) : same(blocks, section.blocks) ? section : { ...section, blocks })
  }
  const marked = marks.filter(mark => !includesAudience(mark.audience, name)).map(mark => mark.source)
  if (removed.length === 0 && marked.length === 0) return { doc, removed, keeps: () => true }
  const spans = [...leftOut(doc, name, removed), ...marked]
  const keeps = ({ source: at }: Finding) => !at || !spans.some(span => at.file === span.file && (at.line ?? 0) >= span.line && (at.line ?? 0) <= (span.endLine ?? span.line))
  const stepIds = new Set(sections.flatMap(section => section.stepIds ?? []))
  const production = doc.production && { ...doc.production, ...doc.production.captionTimings ? { captionTimings: Object.fromEntries(Object.entries(doc.production.captionTimings).filter(([id]) => stepIds.has(id))) } : {}, mediaClips: doc.production.mediaClips.filter(clip => stepIds.has(clip.attachment.stepId)) }
  return {
    doc: {
      ...doc,
      sections: sections.map((section, i) => (section.index === i + 1 ? section : { ...section, index: i + 1 })),
      diagnostics: doc.diagnostics.filter(keeps),
      ...production ? { production, productionAssets: Object.fromEntries(productionAssetIds(production, sections).flatMap(id => doc.productionAssets?.[id] ? [[id, doc.productionAssets[id]!]] : [])) } : {},
    },
    removed,
    keeps,
  }
}

function leftOut(doc: IRDocument, name: string, removed: Removed[]): SourcePos[] {
  const spans: SourcePos[] = removed.filter(item => !item.nested && item.title === undefined).map(item => item.source)
  doc.sections.forEach((section, i) => {
    if (includesAudience(section.audience, name)) return
    const next = doc.sections.slice(i + 1).find(later => later.source.file === section.source.file)
    spans.push({ file: section.source.file, line: section.source.line, endLine: next ? next.source.line - 1 : Number.MAX_SAFE_INTEGER })
    for (const block of irBlocks(section.blocks)) if (block.source.file !== section.source.file) spans.push(block.source)
  })
  return spans
}

export function audienceDocument(doc: IRDocument, name: string, filled: WeakSet<object>, marks: AudienceMark[] = []): IRDocument {
  const { doc: found, removed } = filterForAudience(doc, name, marks)
  const view = { ...found, meta: { ...found.meta, audience: name } }
  if (removed.length === 0) return view
  const own = detached(view, filled)
  resolveReferences(own, () => {})
  return withoutLeaks(own, removed, name)
}

export function emptyReferences(doc: IRDocument): WeakSet<object> {
  const found = new WeakSet<object>()
  const visit = (node: MdastNode) => {
    if (node.type === 'crossReference' && !node.children?.length) found.add(node)
    node.children?.forEach(visit)
  }
  for (const section of doc.sections) for (const block of irBlocks(section.blocks)) nodeMdast(block.node).forEach(visit)
  return found
}

export function withheld(removed: Removed[], kept: IRDocument): Withheld[] {
  const shown = ownText(kept)
  return removed.map(({ source, audience, title, blocks }) => {
    const texts = [...title ? [title] : [], ...blocks.flatMap(block => [...irBlocks([block])].flatMap(sentenceSources))]
    return { source, audience, sentences: [...new Set(texts.flatMap(sentences))].filter(sentence => !shown.includes(sentence)) }
  })
}

export function unshown(left: Withheld[], docs: IRDocument[]): Withheld[] {
  const shown = docs.map(ownText).join('\n')
  return left.map(item => ({ ...item, sentences: item.sentences.filter(sentence => !shown.includes(sentence)) }))
}

function ownText(doc: IRDocument): string {
  return doc.sections.flatMap(section => [section.title, ...[...irBlocks(section.blocks)].flatMap(sentenceSources)]).map(squash).join('\n')
}

export async function scanOutputs(left: Withheld[], paths: string[], audience: string, base: string, quote = true): Promise<Finding[]> {
  const wanted = left.filter(item => item.sentences.length > 0)
  const found = new Map<Withheld, { sentence: string, file: string }>()
  const written = wanted.length > 0 ? (await Promise.all(paths.map(files))).flat() : []
  for (const file of written) {
    const buffer = await readFile(file).catch(() => undefined)
    if (!buffer || BINARY.has(extname(file).toLowerCase()) || buffer.subarray(0, 8000).includes(0)) continue
    const text = readable(buffer.toString('utf8'))
    for (const item of wanted) {
      if (found.has(item)) continue
      const sentence = item.sentences.find(s => text.includes(s))
      if (sentence) found.set(item, { sentence, file })
    }
    if (found.size === wanted.length) break
  }
  return [...found].map(([item, { sentence, file }]): Finding => ({
    checkId: 'presmium.audience',
    severity: 'error',
    message: `content only for ${item.audience.join(', ')} is in the build for ${audience}: ${quote ? `"${sentence}" ` : ''}in ${relative(base, file)}`,
    hint: 'it reached the build another way, e.g. through the output of a code block or a file a block reads; take it out there, or give that block the same :audience:',
    source: { file: item.source.file, line: item.source.line },
  }))
}

function same(blocks: readonly IRBlock[], before: readonly IRBlock[]): boolean {
  return blocks.length === before.length && blocks.every((block, i) => block === before[i])
}

function nodeFor(block: IRBlock, name: string, removed: Removed[], keep: (blocks: IRBlock[]) => IRBlock[]): IRNode {
  const { node } = block
  const left: MdastNode[] = []
  let result: IRNode = node
  if (node.type === 'markdown') {
    const mdast = prune(node.mdast, name, left)
    if (mdast !== node.mdast) result = { ...node, mdast }
  } else if (node.type === 'component') {
    const props = prune(node.props, name, left)
    const fallback = node.fallback && prune(node.fallback, name, left)
    const children = node.children && keep(node.children)
    if (props !== node.props || fallback !== node.fallback || (children && !same(children, node.children!))) {
      result = { ...node, props, ...fallback ? { fallback } : {}, ...children ? { children } : {} }
    }
  }
  for (const nested of left) {
    removed.push({ source: block.source, audience: markOf(nested)!, blocks: [{ ...block, node: { type: 'markdown', mdast: { type: 'root', children: [nested] } } }], nested: true })
  }
  return result
}

function prune<T>(value: T, name: string, left: MdastNode[]): T {
  if (Array.isArray(value)) {
    let changed = false
    const kept = value.flatMap((item: unknown) => {
      if (!includesAudience(markOf(item), name)) {
        left.push(item as MdastNode)
        changed = true
        return []
      }
      const next = prune(item, name, left)
      if (next !== item) changed = true
      return [next]
    })
    return (changed ? kept : value) as T
  }
  if (!isRecord(value)) return value
  let changed = false
  const entries = Object.entries(value).map(([key, item]) => {
    const next = prune(item, name, left)
    if (next !== item) changed = true
    return [key, next] as const
  })
  return (changed ? Object.fromEntries(entries) : value) as T
}

function detached(view: IRDocument, filled: WeakSet<object>): IRDocument {
  const copy = (node: MdastNode): MdastNode => {
    if (filled.has(node)) {
      const { children: _children, ...written } = node
      return written
    }
    return node.children ? { ...node, children: node.children.map(copy) } : { ...node }
  }
  const blocks = (list: IRBlock[]): IRBlock[] => list.map((block) => {
    const { node } = block
    if (node.type === 'markdown') return { ...block, node: { ...node, mdast: copy(node.mdast) } }
    if (node.type !== 'component') return block
    return { ...block, node: { ...node, ...node.fallback ? { fallback: copy(node.fallback) } : {}, ...node.children ? { children: blocks(node.children) } : {} } }
  })
  return { ...view, sections: view.sections.map(section => ({ ...section, blocks: blocks(section.blocks) })) }
}

function withoutLeaks(view: IRDocument, removed: Removed[], name: string): IRDocument {
  const wanted = withheld(removed, view).filter(item => item.sentences.length > 0)
  if (wanted.length === 0) return view
  const findings: Finding[] = []
  const sections = view.sections.map((section) => {
    const blocks = section.blocks.filter((block) => {
      const text = readable(JSON.stringify(block.node, (key, value: unknown) => (key.startsWith('image/') || key === 'application/pdf' ? undefined : value)))
      for (const item of wanted) {
        if (!item.sentences.some(sentence => text.includes(sentence))) continue
        findings.push({
          checkId: 'presmium.audience',
          severity: 'error',
          message: `the block shows content only for ${item.audience.join(', ')} (written at ${basename(item.source.file)}:${item.source.line}); it is left out of the view for ${name}`,
          hint: 'it reached the block another way, e.g. through the output of a code block; take it out there, or give the block the same :audience:',
          source: { file: block.source.file, line: block.source.line },
        })
        return false
      }
      return true
    })
    return blocks.length === section.blocks.length ? section : compactSteps({ ...section, blocks })
  })
  return findings.length === 0 ? view : { ...view, sections, diagnostics: [...view.diagnostics, ...findings] }
}

/** The texts of a block that the leak scan splits into sentences: its own source, without recorded output. */
function sentenceSources(block: IRBlock): string[] {
  const { node } = block
  switch (node.type) {
    case 'markdown': return mdastSentenceSources(node.mdast)
    case 'code': return [node.title ?? '', node.value, ...(node.variants ?? []).map(variant => variant.value)]
    case 'component': return [...propText(node.props), ...node.fallback ? mdastSentenceSources(node.fallback) : []]
  }
}

function mdastSentenceSources(node: MdastNode): string[] {
  const own: string[] = []
  if (typeof node.value === 'string') own.push(node.type === 'html' ? node.value.replace(/<[^<>]*>/g, ' ') : node.value)
  for (const key of ['alt', 'title'] as const) if (typeof node[key] === 'string') own.push(node[key] as string)
  return [...own, ...(node.children ?? []).flatMap(mdastSentenceSources)]
}

function sentences(text: string): string[] {
  return text.split(/[。！？!?；;\r\n]+|(?<=\.)\s+/u).map(squash).filter(sentence => [...sentence].length >= MIN_SENTENCE)
}

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function readable(text: string): string {
  const decoded = text
    .replace(/\\u\{([\da-f]+)\}/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([\da-f]{4})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\x([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\[nrt]/g, ' ')
    .replace(/\\(["'`\\/])/g, '$1')
    .replace(/&#x([\da-f]+);|&#(\d+);/gi, (_, hex: string | undefined, dec: string | undefined) => String.fromCodePoint(hex ? Number.parseInt(hex, 16) : Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name: string) => HTML_ENTITIES[name]!)
  return `${squash(decoded)}\n${squash(decoded.replace(/<[^<>]*>/g, ''))}`
}

async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => undefined)
  if (!entries) return (await lstat(path).catch(() => undefined))?.isFile() ? [path] : []
  const found: string[] = []
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) found.push(...await files(child))
    else if (entry.isFile()) found.push(child)
  }
  return found
}
