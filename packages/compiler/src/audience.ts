/**
 * Audiences (P-55, docs/ir.md 2.11): blocks and sections only for some
 * audiences (`:audience:`, `{audience}`). A compilation for an audience
 * (`CompilerOptions.audience`, `presmium build --audience`) leaves the other
 * audiences' content out before the plugin passes and compile-time execution,
 * so no pass, executor or renderer gets it; `audienceDocument` gives the same
 * view of a document already compiled (`Compilation.forAudience`, the student
 * view of `presmium serve`). Block ids stay those of the whole document; the
 * steps left are numbered again and the sections numbered again.
 *
 * In the source, `:audience:` on a directive inside another directive's body
 * or a list marks the nodes the directive gives (`data.audience` of each);
 * an `{include}` with `:audience:` puts what it includes in an audience scope
 * (`AudienceParser`), whose headings still open sections (`liftScopes`), each
 * section only for those audiences.
 *
 * After a build for an audience, `scanOutputs` looks in every file the build
 * wrote for the longer sentences of what was left out (`presmium.audience`):
 * text that reached the output another way, e.g. through the output of a code
 * block. A sentence the content left in itself contains is not looked for.
 */
import { lstat, readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { irBlocks, isRecord, nodeMdast } from '@presmium/kernel'
import type { Finding, IRBlock, IRDocument, IRNode, IRSection, MdastNode, SourcePos } from '@presmium/kernel'
import { resolveReferences } from './references.ts'
import { Parser } from './source.ts'
import type { ParsedFile } from './source.ts'

/** A section or block left out for an audience. */
export interface Removed {
  source: SourcePos
  /** The audiences it is for. */
  audience: string[]
  /** The title of a section left out. */
  title?: string
  blocks: IRBlock[]
  /** Nodes marked inside a block that stays (`source` is that block's): the diagnostics there stay. */
  nested?: boolean
}

/** Content left out for an audience: where it is written, the audiences it is for, and its longer sentences. */
export interface Withheld {
  source: SourcePos
  audience: string[]
  sentences: string[]
}

/**
 * The source node around what an `{include}` with `:audience:` includes
 * (`audience`: the names, `[]` when none is given). With `section`, it holds
 * nothing and follows a heading: the section the heading opens is only for
 * these audiences.
 */
export const AUDIENCE_SCOPE = 'presmiumAudience'

/** Sentences shorter than this (in characters) are not looked for: such text may well occur anywhere. */
const MIN_SENTENCE = 12

/** Files a build writes that hold no text. */
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.mp3', '.mp4', '.m4a', '.webm', '.ogg', '.oga', '.wav', '.flac', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.zip', '.gz', '.pdf'])

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

/** Whether content for `audience` (none: everyone) is for `name`. */
export function forAudience(audience: string[] | undefined, name: string): boolean {
  return !audience || audience.includes(name)
}

/** Audience names, comma- or space-separated (docs/ir.md 2.11). */
export function audienceList(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter(Boolean))]
}

/** The audiences of content for `inner` inside content for `outer` (none: everyone). */
export function within(outer: string[] | undefined, inner: string[]): string[] {
  return outer ? outer.filter(name => inner.includes(name)) : inner
}

/** The audiences an mdast node nested in a block is for (`data.audience`); none: those of its block. */
export function markOf(node: unknown): string[] | undefined {
  const audience = isRecord(node) && isRecord(node.data) ? node.data.audience : undefined
  return Array.isArray(audience) ? audience as string[] : undefined
}

/** Nodes only for `audience`, within the audiences each is marked for already. */
export function markAudience(nodes: MdastNode[], audience: string[]): MdastNode[] {
  return nodes.map(node => ({ ...node, data: { ...isRecord(node.data) ? node.data : {}, audience: within(markOf(node), audience) } }))
}

/**
 * The parser of a compilation: in every file it reads, an `{include}` with
 * `:audience:` is put in an audience scope (`AUDIENCE_SCOPE`), so what it
 * includes is expanded inside the scope.
 */
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

/** The nodes with each `{include}` that has `:audience:` in an audience scope; the same array when none has. */
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

/**
 * The top-level nodes with the audience scopes that hold headings opening
 * sections taken apart, so the headings still open sections: what comes
 * before the first heading stays in the scope, and each heading is followed
 * by a scope with `section`, which makes its section only for the scope's
 * audiences, and by the nodes of that section as they are.
 */
export function liftScopes(nodes: MdastNode[], sectionDepth: number): MdastNode[] {
  const lifted = (node: MdastNode) => node.type === AUDIENCE_SCOPE && (node.audience as string[]).length > 0 && holdsSection(node, sectionDepth)
  if (!nodes.some(lifted)) return nodes
  const out: MdastNode[] = []
  for (const node of nodes) {
    if (lifted(node)) lift(node, node.audience as string[], sectionDepth, out)
    else out.push(node)
  }
  return out
}

function holdsSection(scope: MdastNode, depth: number): boolean {
  return (scope.children ?? []).some(node => (node.type === 'heading' && Number(node.depth) <= depth) || (node.type === AUDIENCE_SCOPE && holdsSection(node, depth)))
}

/**
 * Takes `scope` apart into `out`. The scope is the expansion's own node,
 * which knows the file and line of its `{include}`: it keeps what comes
 * before the first heading.
 */
function lift(scope: MdastNode, audience: string[], depth: number, out: MdastNode[]): void {
  const before: MdastNode[] = []
  let opened = false
  const open = () => {
    if (!opened && before.length > 0) out.push(Object.assign(scope, { audience, children: before }))
    opened = true
  }
  for (const node of scope.children ?? []) {
    if (node.type === AUDIENCE_SCOPE && holdsSection(node, depth)) {
      open()
      lift(node, within(audience, node.audience as string[]), depth, out)
    } else if (node.type === 'heading' && Number(node.depth) <= depth) {
      // A heading's label stays just before it, where the section takes it.
      const label = !opened && before.at(-1)?.type === 'mystTarget' ? before.pop() : undefined
      open()
      out.push(...label ? [label] : [], node, { type: AUDIENCE_SCOPE, audience, section: true })
    } else {
      (opened ? out : before).push(node)
    }
  }
}

/**
 * The document as `name` sees it: without the sections, blocks and nested
 * nodes whose audiences do not include it, nor the diagnostics located in
 * the sections and blocks left out; and what was left out.
 */
export function audienceView(doc: IRDocument, name: string): { doc: IRDocument, removed: Removed[] } {
  const removed: Removed[] = []
  const sections: IRSection[] = []
  for (const section of doc.sections) {
    if (!forAudience(section.audience, name)) {
      removed.push({ source: section.source, audience: section.audience!, title: section.title, blocks: section.blocks })
      continue
    }
    let dropped = false
    const keep = (blocks: IRBlock[]): IRBlock[] => blocks.flatMap((block) => {
      if (!forAudience(block.audience, name)) {
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
  if (removed.length === 0) return { doc, removed }
  const inside = ({ source: at }: Finding) => removed.some(({ source, nested }) => !nested && at?.file === source.file && (at.line ?? 0) >= source.line && (at.line ?? 0) <= (source.endLine ?? source.line))
  return {
    doc: {
      ...doc,
      sections: sections.map((section, i) => (section.index === i + 1 ? section : { ...section, index: i + 1 })),
      diagnostics: doc.diagnostics.filter(finding => !inside(finding)),
    },
    removed,
  }
}

/**
 * The view of a compiled document for `name` (`Compilation.forAudience`):
 * `audienceView`, detached from the document, with the cross-references
 * resolved again in it (the references compilation filled in are given in
 * `filled`), so a reference to a section left out keeps no title of it and
 * figures and equations are numbered as the view has them, as in a build
 * for the audience; and without the blocks that still show a sentence of
 * what was left out (`withoutLeaks`).
 */
export function audienceDocument(doc: IRDocument, name: string, filled: WeakSet<object>): IRDocument {
  const { doc: view, removed } = audienceView(doc, name)
  if (removed.length === 0) return view
  const own = detached(view, filled)
  resolveReferences(own, () => {})
  return withoutLeaks(own, removed, name)
}

/** The cross-references of a document written without text, which compilation resolves (`resolveReferences`) by filling them in. */
export function emptyReferences(doc: IRDocument): WeakSet<object> {
  const found = new WeakSet<object>()
  const visit = (node: MdastNode) => {
    if (node.type === 'crossReference' && !node.children?.length) found.add(node)
    node.children?.forEach(visit)
  }
  for (const section of doc.sections) for (const block of irBlocks(section.blocks)) nodeMdast(block.node).forEach(visit)
  return found
}

/** The longer sentences of what was left out of `kept`, but those its own content holds too. */
export function withheld(removed: Removed[], kept: IRDocument): Withheld[] {
  const own = kept.sections.flatMap(section => [section.title, ...[...irBlocks(section.blocks)].flatMap(blockTexts)])
  const keptText = own.map(squash).join('\n')
  return removed.map(({ source, audience, title, blocks }) => {
    const texts = [...title ? [title] : [], ...blocks.flatMap(block => [...irBlocks([block])].flatMap(blockTexts))]
    return { source, audience, sentences: [...new Set(texts.flatMap(sentences))].filter(sentence => !keptText.includes(sentence)) }
  })
}

/**
 * Every file under the `paths` a build wrote that holds a sentence of the
 * content left out for `audience`: an error located at the content left out,
 * naming the file relative to `base`, and the sentence unless `quote` is
 * false (findings the audience itself gets, e.g. a `tutor` token's build).
 */
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

/** `blocks` holds the same blocks as `before`. */
function same(blocks: readonly IRBlock[], before: readonly IRBlock[]): boolean {
  return blocks.length === before.length && blocks.every((block, i) => block === before[i])
}

/**
 * A block's node without what inside it is for other audiences: the nodes
 * marked so (`data.audience`) in its mdast, a component's props and
 * fallback, which go to `removed`; and a component's child blocks (`keep`).
 */
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

/** `value` without the mdast nodes in it marked for other audiences, which go to `left`; `value` itself when none is. */
function prune<T>(value: T, name: string, left: MdastNode[]): T {
  if (Array.isArray(value)) {
    let changed = false
    const kept = value.flatMap((item: unknown) => {
      if (!forAudience(markOf(item), name)) {
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

/**
 * The view with its own copy of the mdast that `resolveReferences` reads and
 * numbers, the references in `filled` emptied again as written.
 */
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

/**
 * The view without the blocks that show a sentence of what was left out:
 * the code of the whole document ran at compile time, so a block's recorded
 * output may hold one. `presmium serve` renders the view itself, without a
 * build to scan, so such a block is left out too, with an error
 * (`presmium.audience`) in the view's diagnostics, which names where the
 * content left out is written but not what it says: the audience reads it.
 */
function withoutLeaks(view: IRDocument, removed: Removed[], name: string): IRDocument {
  const wanted = withheld(removed, view).filter(item => item.sentences.length > 0)
  if (wanted.length === 0) return view
  const findings: Finding[] = []
  const sections = view.sections.map((section) => {
    const blocks = section.blocks.filter((block) => {
      // Images and other binary data hold no sentence.
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

/**
 * A section without the steps no visual block of it takes any more: the
 * steps left are numbered again, and narration of a step left out goes with
 * the step before it (as `viewFor` does for the blocks of other renderers).
 */
function compactSteps(section: IRSection): IRSection {
  const used = new Set([0])
  for (const block of irBlocks(section.blocks)) {
    if (block.role !== 'visual') continue
    for (let step = block.at; step <= block.at + (block.span ?? 0); step++) used.add(step)
    if (block.until !== undefined) used.add(block.until)
  }
  if (used.size > section.steps) return section
  const steps: number[] = []
  for (let step = 0, n = -1; step <= section.steps; step++) steps.push(used.has(step) ? ++n : n)
  const map = (step: number) => steps[Math.min(step, section.steps)]!
  const renumber = (blocks: IRBlock[]): IRBlock[] => blocks.map(block => ({
    ...block,
    at: map(block.at),
    ...block.until === undefined ? {} : { until: map(block.until) },
    ...block.node.type === 'component' && block.node.children ? { node: { ...block.node, children: renumber(block.node.children) } } : {},
  }))
  return { ...section, steps: map(section.steps), blocks: renumber(section.blocks) }
}

/** The texts a block's own source holds: prose, code, the props and fallback of a component (not its child blocks, nor recorded output). */
function blockTexts(block: IRBlock): string[] {
  const { node } = block
  switch (node.type) {
    case 'markdown': return mdastTexts(node.mdast)
    case 'code': return [node.title ?? '', node.value, ...(node.variants ?? []).map(variant => variant.value)]
    case 'component': return [...propTexts(node.props), ...node.fallback ? mdastTexts(node.fallback) : []]
  }
}

/** Each text of an mdast tree on its own (a sentence split by emphasis is two texts, as the outputs keep them). */
function mdastTexts(node: MdastNode): string[] {
  const own: string[] = []
  if (typeof node.value === 'string') own.push(node.type === 'html' ? node.value.replace(/<[^<>]*>/g, ' ') : node.value)
  for (const key of ['alt', 'title'] as const) if (typeof node[key] === 'string') own.push(node[key] as string)
  return [...own, ...(node.children ?? []).flatMap(mdastTexts)]
}

function propTexts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(propTexts)
  if (value && typeof value === 'object') return Object.values(value).flatMap(propTexts)
  return []
}

/** The sentences of a text long enough to look for, each on one line with its spaces squashed. */
function sentences(text: string): string[] {
  return text.split(/[。！？!?；;\r\n]+|(?<=\.)\s+/u).map(squash).filter(sentence => [...sentence].length >= MIN_SENTENCE)
}

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The text of an output file as it reads: the escapes of JavaScript and
 * JSON strings and HTML's character references resolved, spaces squashed;
 * then once more without tags, for text a renderer marked up (highlighted code).
 */
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

/** The files at `path`: itself when a file, else those under it, recursively; links are not followed. */
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
