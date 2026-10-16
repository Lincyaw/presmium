/**
 * The publication check `presmium.links` (P-54, docs/ir.md 2.11): in the view
 * of each renderer (`viewFor`), so content that only one form shows is
 * checked in that form only, every link, image, card and component asset,
 * and the `href`, `src` and `poster` of raw HTML, must name what exists: a
 * local file in the repository (a directory is published as a list of its
 * files), a `#fragment` of the deck (a section id, a block id, a label or a
 * heading), or a `<document>.md#fragment` of another document of the
 * workspace. A link broken in every form is reported once. With
 * `externalLinks`, lychee checks the external links when it is installed.
 */
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { irBlocks, isRecord } from '@presmium/kernel'
import type { Finding, IRBlock, IRDocument, MdastNode, SourcePos } from '@presmium/kernel'
import { BUILTIN_DIRECTIVES } from './blocks.ts'
import { viewFor } from './renderers.ts'
import { plainText, slugify, splitSections } from './sections.ts'
import { Parser, readFrontmatter } from './source.ts'

/** What the publication checks read of a compilation. */
export interface PublishInput {
  doc: IRDocument
  entry: string
  deckDir: string
  workspaceRoot: string
  /** The renderers whose views are checked. */
  renderers: string[]
}

/** URLs with a scheme or protocol-relative: no local file. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i
const EXTERNAL = /^https?:\/\//i
/** The attributes of raw HTML that name a file or a place. */
const ATTRIBUTES = /(?<![\w-])(href|src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/gi
const IDS = /(?<![\w-])(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/gi
/** Nodes whose `url` names a file or a place: a card's `:link:` too (docs/ir.md 2.10). */
const LINKED = new Set(['link', 'image', 'definition', 'card'])

/** A problem of a link, with the renderers whose view has it. */
interface Problem {
  source: SourcePos
  url: string
  message: string
  renderers: string[]
}

export async function checkLinks(input: PublishInput, options: { externalLinks?: boolean } = {}): Promise<Finding[]> {
  const problems = new Map<string, Problem>()
  const external = new Map<string, SourcePos>()
  const documents = new Map<string, Promise<Set<string>>>()
  for (const renderer of input.renderers) {
    const view = viewFor(input.doc, renderer)
    const anchors = documentAnchors(view)
    for (const section of view.sections) {
      for (const block of irBlocks(section.blocks)) {
        for (const url of blockUrls(block)) {
          if (EXTERNAL.test(url)) {
            if (!external.has(url)) external.set(url, block.source)
            continue
          }
          const message = await linkProblem(url, block.source, input, anchors, documents)
          if (!message) continue
          const key = `${block.source.file}\0${block.source.line}\0${url}`
          const known = problems.get(key)
          if (known) known.renderers.push(renderer)
          else problems.set(key, { source: block.source, url, message, renderers: [renderer] })
        }
      }
    }
  }
  const line = lineFinder()
  const findings = [...problems.values()].map(({ source, url, message, renderers }): Finding => ({
    checkId: 'presmium.links',
    severity: 'error',
    message: `${message}${renderers.length < input.renderers.length ? ` (in ${renderers.join(', ')})` : ''}`,
    source: { file: source.file, line: line(source, needles(url)) },
  }))
  if (options.externalLinks) findings.push(...await externalLinks(external, input.entry, line))
  return findings
}

/** The URLs a block names itself (its child blocks are walked on their own). */
function blockUrls(block: IRBlock): string[] {
  const { node } = block
  const urls: string[] = []
  const walk = (mdast: MdastNode) => {
    if (LINKED.has(mdast.type) && typeof mdast.url === 'string') urls.push(mdast.url)
    if (mdast.type === 'html' && typeof mdast.value === 'string') {
      for (const [, , ...values] of mdast.value.matchAll(ATTRIBUTES)) urls.push(values.find(v => v !== undefined)!)
    }
    mdast.children?.forEach(walk)
  }
  if (node.type === 'markdown') walk(node.mdast)
  if (node.type === 'component') {
    if (node.fallback) walk(node.fallback)
    for (const url of Object.values(node.assets ?? {})) urls.push(url)
  }
  return urls.map(url => url.trim()).filter(Boolean)
}

/** What is wrong with a URL of a block, or undefined. */
async function linkProblem(url: string, source: SourcePos, input: PublishInput, anchors: Set<string>, documents: Map<string, Promise<Set<string>>>): Promise<string | undefined> {
  if (REMOTE.test(url)) return undefined
  const hash = url.indexOf('#')
  const fragment = hash < 0 ? '' : decode(url.slice(hash + 1))
  const path = decode((hash < 0 ? url : url.slice(0, hash)).replace(/\?.*$/s, ''))
  if (!path) return fragment && !anchors.has(fragment) ? `#${fragment} is no section, block, label or heading of the deck` : undefined
  const file = path.startsWith('/') ? join(input.deckDir, 'public', path) : resolve(dirname(source.file), path)
  if (!inside(file, input.workspaceRoot)) return `${path} lies outside the repository: it cannot be published`
  if (!existsSync(file)) return `${path}: no such file`
  if (!fragment) return undefined
  // A link into a document: the deck itself, or another document of the workspace.
  const entry = statSync(file).isDirectory() ? join(file, 'lecture.md') : file
  if (extname(entry) !== '.md' || !existsSync(entry)) return undefined
  if (entry === input.entry) return anchors.has(fragment) ? undefined : `${path}#${fragment}: #${fragment} is no section, block, label or heading of the deck`
  if (!documents.has(entry)) documents.set(entry, sourceAnchors(entry))
  return (await documents.get(entry)!).has(fragment) ? undefined : `${path}#${fragment}: no section, block, label or heading of ${relative(input.workspaceRoot, entry).split(sep).join('/')} has the id ${fragment}`
}

/** The places of a compiled document a `#fragment` may name: section ids, block ids, labels, headings, footnotes and ids of raw HTML. */
function documentAnchors(doc: IRDocument): Set<string> {
  const anchors = new Set<string>()
  for (const section of doc.sections) {
    anchors.add(section.id)
    for (const block of irBlocks(section.blocks)) {
      anchors.add(block.id)
      const { node } = block
      if (node.type === 'markdown') mdastAnchors(node.mdast, anchors)
      if (node.type === 'component' && node.fallback) mdastAnchors(node.fallback, anchors)
    }
  }
  return anchors
}

function mdastAnchors(node: MdastNode, anchors: Set<string>): void {
  for (const key of ['identifier', 'label', 'html_id'] as const) if (typeof node[key] === 'string' && node[key]) anchors.add(node[key] as string)
  if (node.type === 'footnoteDefinition' && typeof node.identifier === 'string') anchors.add(`fn-${node.identifier}`)
  if (node.type === 'heading') anchors.add(slugify(plainText(node)))
  if (node.type === 'mystDirective' && isRecord(node.options) && typeof node.options.label === 'string') anchors.add(node.options.label)
  if (node.type === 'html' && typeof node.value === 'string') {
    for (const [, ...values] of node.value.matchAll(IDS)) anchors.add(values.find(v => v !== undefined)!)
  }
  node.children?.forEach(child => mdastAnchors(child, anchors))
}

/**
 * The places of another document, read from its source as the compiler
 * splits it (its includes expanded): section ids, labels and headings. Its
 * plugins are not loaded: their directives give no places here.
 */
async function sourceAnchors(entry: string): Promise<Set<string>> {
  const anchors = new Set<string>()
  try {
    const parser = new Parser(new Map([...BUILTIN_DIRECTIVES]))
    const { children } = await parser.expand(entry)
    const headmatter = readFrontmatter(readFileSync(entry, 'utf8'))
    const depth = Number.isInteger(headmatter.sectionDepth) && (headmatter.sectionDepth as number) >= 1 ? headmatter.sectionDepth as number : 2
    const title = typeof headmatter.title === 'string' ? headmatter.title : basename(dirname(entry))
    for (const section of splitSections(children, { entry, title, sectionDepth: depth }, () => {})) anchors.add(section.id)
    for (const node of children) mdastAnchors(node, anchors)
  } catch {
    // An unreadable document has no places.
  }
  return anchors
}

/**
 * `presmium check --external-links`: lychee checks the external links when
 * it is installed (a warning for each that fails); without it, a note.
 */
async function externalLinks(urls: Map<string, SourcePos>, entry: string, line: LineFinder): Promise<Finding[]> {
  if (urls.size === 0) return []
  const at = { file: entry, line: 1 }
  if (spawnSync('lychee', ['--version'], { stdio: 'ignore' }).error) {
    return [{ checkId: 'presmium.links', severity: 'info', message: `lychee is not installed: ${urls.size === 1 ? 'the external link was' : `the ${urls.size} external links were`} not checked (install lychee, https://lychee.cli.rs, to check them)`, source: at }]
  }
  const output = await new Promise<{ stdout: string, error?: Error }>((done) => {
    execFile('lychee', ['--format', 'json', '--no-progress', '--', ...urls.keys()], { maxBuffer: 64 << 20 }, (error, stdout) => done({ stdout, ...error ? { error } : {} }))
  })
  let report: unknown
  try {
    report = JSON.parse(output.stdout)
  } catch {
    return [{ checkId: 'presmium.links', severity: 'warning', message: `lychee did not check the external links: ${output.error?.message ?? 'it printed no report'}`, source: at }]
  }
  const failed = isRecord(report) ? [report.fail_map, report.error_map].flatMap(map => (isRecord(map) ? Object.values(map).flat() : [])) : []
  return failed.flatMap((item): Finding[] => {
    if (!isRecord(item) || typeof item.url !== 'string') return []
    const source = urls.get(item.url) ?? urls.get(item.url.replace(/\/$/, '')) ?? at
    const status = isRecord(item.status) && typeof item.status.text === 'string' ? item.status.text : 'failed'
    return [{ checkId: 'presmium.links', severity: 'warning', message: `${item.url}: ${status}`, source: { file: source.file, line: line(source, [item.url]) } }]
  })
}

/** How a URL may be written in the source: as it is, and decoded. */
function needles(url: string): string[] {
  return [...new Set([url, decode(url)])]
}

/** Finds the line of a block's source that holds one of `needles` (its first line when none does); reads each file once. */
export type LineFinder = (source: SourcePos, needles: string[]) => number

export function lineFinder(): LineFinder {
  const files = new Map<string, string[]>()
  return (source, needles) => {
    let lines = files.get(source.file)
    if (!lines) {
      try {
        lines = readFileSync(source.file, 'utf8').split(/\r?\n/)
      } catch {
        lines = []
      }
      files.set(source.file, lines)
    }
    for (let line = source.line; line <= Math.min(source.endLine ?? source.line, lines.length); line++) {
      if (needles.some(needle => needle && lines[line - 1]!.includes(needle))) return line
    }
    return source.line
  }
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function inside(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
