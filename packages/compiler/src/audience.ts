import { lstat, readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { irBlocks, isRecord, nodeMdast, propText } from '@lincyaw/kernel'
import type { Finding, IRBlock, IRDocument, IRNode, IRSection, MdastNode, SourcePos } from '@lincyaw/kernel'
import { resolveReferences } from './references.ts'
import { Parser, sourceOf } from './parser.ts'
import { compactSteps } from './steps.ts'
import type { ParsedFile } from './parser.ts'

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

export const AUDIENCE_SCOPE = 'presmiumAudience'

const MIN_SENTENCE = 12

const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.mp3', '.mp4', '.m4a', '.webm', '.ogg', '.oga', '.wav', '.flac', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.zip', '.gz', '.pdf'])

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

export function includesAudience(audience: string[] | undefined, name: string): boolean {
  return !audience || audience.includes(name)
}

export function audienceList(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter(Boolean))]
}

/** The audiences of an inner marking inside an outer one: their intersection. */
export function narrowAudience(outer: string[] | undefined, inner: string[]): string[] {
  return outer ? outer.filter(name => inner.includes(name)) : inner
}

export function markOf(node: unknown): string[] | undefined {
  const audience = isRecord(node) && isRecord(node.data) ? node.data.audience : undefined
  return Array.isArray(audience) ? audience as string[] : undefined
}

export function markAudience(nodes: MdastNode[], audience: string[]): MdastNode[] {
  return nodes.map(node => ({ ...node, data: { ...isRecord(node.data) ? node.data : {}, audience: narrowAudience(markOf(node), audience) } }))
}

export class AudienceParser extends Parser {
  readonly #scoped = new WeakMap<ParsedFile, ParsedFile>()

  override async read(file: string): Promise<ParsedFile | undefined> {
    const parsed = await super.read(file)
    if (!parsed) return undefined
    let scoped = this.#scoped.get(parsed)
    if (!scoped) this.#scoped.set(parsed, scoped = { ...parsed, children: scopeIncludes(parsed.children) })
    return scoped
  }
}

function scopeIncludes(nodes: MdastNode[]): MdastNode[] {
  let changed = false
  const result = nodes.map((node): MdastNode => {
    const option = isRecord(node.options) ? node.options.audience : undefined
    if (node.type === 'mystDirective' && node.name === 'include' && option !== undefined && !node.children?.some(c => c.type === 'include' && c.literal === true)) {
      changed = true
      return { type: AUDIENCE_SCOPE, audience: audienceList(typeof option === 'string' ? option : ''), position: node.position, children: [node] }
    }
    const children = node.children?.length ? scopeIncludes(node.children) : node.children
    if (children === node.children) return node
    changed = true
    return { ...node, children }
  })
  return changed ? result : nodes
}

export function liftScopes(nodes: MdastNode[], sectionDepth: number, trailing?: (node: MdastNode, audience: string[]) => void): MdastNode[] {
  if (!nodes.some(node => lifted(node, sectionDepth))) return nodes
  const out: MdastNode[] = []
  let section: string[] | undefined
  for (const node of nodes) {
    if (lifted(node, sectionDepth)) {
      section = lift(node, node.audience as string[], sectionDepth, out, trailing)
      continue
    }
    if (opens(node, sectionDepth)) section = undefined
    else if (section && wider(node, undefined, section)) {
      trailing?.(node, section)
      section = undefined
    }
    out.push(node)
  }
  return out
}

function lifted(node: MdastNode, depth: number): boolean {
  return node.type === AUDIENCE_SCOPE && (node.audience as string[]).length > 0 && holdsSection(node, depth)
}

function opens(node: MdastNode, depth: number): boolean {
  return node.type === 'heading' && Number(node.depth) <= depth
}

function holdsSection(scope: MdastNode, depth: number): boolean {
  return (scope.children ?? []).some(node => opens(node, depth) || (node.type === AUDIENCE_SCOPE && holdsSection(node, depth)))
}

const SETTINGS = new Set(['hints', 'config', 'audience'])

function ownAudience(node: MdastNode): string[] | undefined {
  if (node.type === AUDIENCE_SCOPE) return node.section ? undefined : node.audience as string[]
  const option = node.type === 'mystDirective' && isRecord(node.options) ? node.options.audience : undefined
  return option === undefined ? undefined : audienceList(typeof option === 'string' ? option : '')
}

function wider(node: MdastNode, own: string[] | undefined, section: string[]): boolean {
  if (node.type === 'comment' || node.type === 'mystTarget' || (node.type === 'mystDirective' && SETTINGS.has(String(node.name)))) return false
  const marked = ownAudience(node)
  const audience = marked ? narrowAudience(own, marked) : own
  return !audience || audience.some(name => !section.includes(name))
}

export function audienceMarks(nodes: MdastNode[], entry: string, outer?: string[], marks: AudienceMark[] = []): AudienceMark[] {
  for (const node of nodes) {
    const own = ownAudience(node)
    const audience = own ? narrowAudience(outer, own) : outer
    if (own && node.position) marks.push({ source: sourceOf(node, entry), audience: audience! })
    if (node.children?.length) audienceMarks(node.children, entry, audience, marks)
  }
  return marks
}

export function markBlocks(sections: IRSection[], marks: AudienceMark[]): void {
  if (marks.length === 0) return
  for (const section of sections) {
    for (const block of irBlocks(section.blocks)) {
      const { file, line } = block.source
      const end = block.source.endLine ?? line
      for (const mark of marks) {
        if (mark.source.file === file && mark.source.line <= line && end <= (mark.source.endLine ?? mark.source.line)) block.audience = narrowAudience(block.audience, mark.audience)
      }
    }
  }
}

function lift(scope: MdastNode, audience: string[], depth: number, out: MdastNode[], trailing?: (node: MdastNode, audience: string[]) => void): string[] {
  const before: MdastNode[] = []
  let opened = false
  let last = audience
  const open = () => {
    if (!opened && before.length > 0) out.push(Object.assign(scope, { audience, children: before }))
    opened = true
  }
  for (const node of scope.children ?? []) {
    if (node.type === AUDIENCE_SCOPE && holdsSection(node, depth)) {
      open()
      last = lift(node, narrowAudience(audience, node.audience as string[]), depth, out, trailing)
    } else if (opens(node, depth)) {
      const label = !opened && before.at(-1)?.type === 'mystTarget' ? before.pop() : undefined
      open()
      out.push(...label ? [label] : [], node, { type: AUDIENCE_SCOPE, audience, section: true })
      last = audience
    } else {
      if (opened && last !== audience && wider(node, audience, last)) {
        trailing?.(node, last)
        last = audience
      }
      (opened ? out : before).push(node)
    }
  }
  return last
}

/** Removes the sections and blocks not for the audience; `keeps` tells whether a finding lies in what is left. */
export function filterForAudience(doc: IRDocument, name: string, marks: AudienceMark[] = []): { doc: IRDocument, removed: Removed[], keeps: (finding: Finding) => boolean } {
  const removed: Removed[] = []
  const sections: IRSection[] = []
  const compacted = new Set<string>()
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
    if (dropped) compacted.add(section.id)
    sections.push(dropped ? compactSteps({ ...section, blocks }) : same(blocks, section.blocks) ? section : { ...section, blocks })
  }
  const marked = marks.filter(mark => !includesAudience(mark.audience, name)).map(mark => mark.source)
  if (removed.length === 0 && marked.length === 0) return { doc, removed, keeps: () => true }
  const kept = new Set(sections.map(section => section.id))
  sections.forEach((section, i) => sections[i] = withViewKeys(section, kept, compacted.has(section.id)))
  const spans = [...leftOut(doc, name, removed), ...marked]
  const keeps = ({ source: at }: Finding) => !at || !spans.some(span => at.file === span.file && (at.line ?? 0) >= span.line && (at.line ?? 0) <= (span.endLine ?? span.line))
  return {
    doc: {
      ...doc,
      sections: sections.map((section, i) => (section.index === i + 1 ? section : { ...section, index: i + 1 })),
      diagnostics: doc.diagnostics.filter(keeps),
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

const STEPS_KEY = 'presmiumSteps'
const BACK_KEY = 'presmiumBack'

function withViewKeys(section: IRSection, sections: ReadonlySet<string>, compacted: boolean): IRSection {
  const hints = section.hints.slides
  const back = isRecord(hints) && typeof hints[BACK_KEY] === 'string' && !sections.has(hints[BACK_KEY])
  if (!isRecord(hints) || (!(compacted && STEPS_KEY in hints) && !back)) return section
  const paths = new Set<string>()
  const visit = (blocks: readonly IRBlock[], prefix: string) => {
    for (const block of blocks) {
      paths.add(prefix + block.id)
      if (block.node.type === 'component' && block.node.children) visit(block.node.children, `${prefix}${block.id}/`)
    }
  }
  visit(section.blocks, '')
  const has = (key: string) => paths.has(key) || paths.has(key.replace(/\+\d+$/, '')) || (key.endsWith('-') && paths.has(key.slice(0, -1)))
  const own: Record<string, unknown> = { ...hints }
  const steps = hints[STEPS_KEY]
  if (compacted && Array.isArray(steps)) {
    const left = steps.map(keys => (Array.isArray(keys) ? keys.filter(key => typeof key === 'string' && has(key)) : []))
    const closed = left.filter((keys, i) => i === 0 || keys.length > 0)
    if (closed.length > 1) own[STEPS_KEY] = closed
    else delete own[STEPS_KEY]
  }
  if (back) delete own[BACK_KEY]
  return { ...section, hints: { ...section.hints, slides: own } }
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
