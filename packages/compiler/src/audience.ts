/**
 * Audiences (P-55, docs/ir.md 2.11): blocks and sections only for some
 * audiences (`:audience:`, `{audience}`). A compilation for an audience
 * (`CompilerOptions.audience`, `presmium build --audience`) leaves the other
 * audiences' content out before the plugin passes and compile-time execution,
 * so no pass, executor or renderer gets it; `Compilation.forAudience` gives
 * the same view of a document already compiled (the student view of
 * `presmium serve`). Block ids stay those of the whole document; the steps
 * left are numbered again and the sections numbered again.
 *
 * After a build for an audience, `scanOutputs` looks in every file the build
 * wrote for the longer sentences of what was left out (`presmium.audience`):
 * text that reached the output another way, e.g. through the output of a code
 * block. A sentence the content left in itself contains is not looked for.
 */
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { irBlocks } from '@presmium/kernel'
import type { Finding, IRBlock, IRDocument, IRSection, MdastNode, SourcePos } from '@presmium/kernel'

/** A section or block left out for an audience. */
export interface Removed {
  source: SourcePos
  /** The audiences it is for. */
  audience: string[]
  /** The title of a section left out. */
  title?: string
  blocks: IRBlock[]
}

/** Content left out for an audience: where it is written, the audiences it is for, and its longer sentences. */
export interface Withheld {
  source: SourcePos
  audience: string[]
  sentences: string[]
}

/** Sentences shorter than this (in characters) are not looked for: such text may well occur anywhere. */
const MIN_SENTENCE = 12

/** Files a build writes that hold no text. */
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.mp3', '.mp4', '.m4a', '.webm', '.ogg', '.oga', '.wav', '.flac', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.zip', '.gz', '.pdf'])

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

/** Whether content for `audience` (none: everyone) is for `name`. */
export function forAudience(audience: string[] | undefined, name: string): boolean {
  return !audience || audience.includes(name)
}

/**
 * The document as `name` sees it: without the sections and blocks whose
 * audiences do not include it, nor the diagnostics located in them; and what
 * was left out.
 */
export function audienceView(doc: IRDocument, name: string): { doc: IRDocument, removed: Removed[] } {
  const removed: Removed[] = []
  const sections: IRSection[] = []
  for (const section of doc.sections) {
    if (!forAudience(section.audience, name)) {
      removed.push({ source: section.source, audience: section.audience!, title: section.title, blocks: section.blocks })
      continue
    }
    let changed = false
    const keep = (blocks: IRBlock[]): IRBlock[] => blocks.flatMap((block) => {
      if (!forAudience(block.audience, name)) {
        changed = true
        removed.push({ source: block.source, audience: block.audience!, blocks: [block] })
        return []
      }
      return block.node.type === 'component' && block.node.children ? [{ ...block, node: { ...block.node, children: keep(block.node.children) } }] : [block]
    })
    const blocks = keep(section.blocks)
    sections.push(changed ? compactSteps({ ...section, blocks }) : section)
  }
  if (removed.length === 0) return { doc, removed }
  const inside = ({ source: at }: Finding) => removed.some(({ source }) => at?.file === source.file && (at.line ?? 0) >= source.line && (at.line ?? 0) <= (source.endLine ?? source.line))
  return {
    doc: {
      ...doc,
      sections: sections.map((section, i) => (section.index === i + 1 ? section : { ...section, index: i + 1 })),
      diagnostics: doc.diagnostics.filter(finding => !inside(finding)),
    },
    removed,
  }
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
 * Every file under `dir` that holds a sentence of the content left out for
 * `audience`: an error located at the content left out, naming the file.
 */
export async function scanOutputs(left: Withheld[], dir: string, audience: string): Promise<Finding[]> {
  const wanted = left.filter(item => item.sentences.length > 0)
  const found = new Map<Withheld, { sentence: string, file: string }>()
  for (const file of wanted.length > 0 ? await files(dir) : []) {
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
    message: `content only for ${item.audience.join(', ')} is in the build for ${audience}: "${sentence}" in ${relative(dir, file)}`,
    hint: 'it reached the build another way, e.g. through the output of a code block or a file a block reads; take it out there, or give that block the same :audience:',
    source: { file: item.source.file, line: item.source.line },
  }))
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

/** The files under `dir`, recursively; links are not followed. */
async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await files(path))
    else if (entry.isFile()) found.push(path)
  }
  return found
}
