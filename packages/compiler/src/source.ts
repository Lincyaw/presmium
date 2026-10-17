/**
 * Pass 1 (docs/ir.md section 4): strips the frontmatter, parses MyST with
 * myst-parser and expands `{include}` and `{literalinclude}`. Parsed files are
 * cached by content, so a recompilation only re-parses the files that changed.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { DirectiveOptionType, Finding, MdastNode, SourcePos } from '@presmium/kernel'
import { buttonRole } from 'myst-ext-button'
import { cardDirective } from 'myst-ext-card'
import { gridDirectives } from 'myst-ext-grid'
import { tabDirectives } from 'myst-ext-tabs'
import { mystParse } from 'myst-parser'
import { includeDirectiveTransform } from 'myst-transforms'
import { parse as parseYaml } from 'yaml'

/** Child that a registered directive leaves in place of its body. */
export const BODY = 'presmiumDirectiveBody'

/** Child that a registered role leaves under its `mystRole` node: the options myst-parser read. */
export const ROLE = 'presmiumRoleOptions'

/**
 * MyST's extensions for cards, grids, tabs and buttons (docs/ir.md 2.10),
 * built in as mystmd builds them in: `{grid}`, `{grid-item}`, `{card}`,
 * `{tab-set}`, `{tab-item}` and the role `{button}` give their standard mdast
 * (`grid`, `grid-item`, `card`, `tabSet`, `tabItem`, a link with `class: 'button'`).
 */
const MYST_EXTENSIONS = { directives: [cardDirective, ...gridDirectives, ...tabDirectives], roles: [buttonRole] }

/** myst-parser's types of the options of each `DirectiveOptionType`; a list is read as a string and split later. */
const OPTION_TYPES = { string: String, number: Number, boolean: Boolean, list: String } as const

export interface ParsedFile {
  file: string
  text: string
  frontmatter: Record<string, unknown>
  findings: Finding[]
  /** Top-level nodes; lines refer to `file` (frontmatter lines are blanked, not removed). */
  children: MdastNode[]
}

export interface ExpandedSource {
  /** Top-level nodes of the entry with includes expanded. */
  children: MdastNode[]
  /** Every source file read, entry first: the included files, and those a `{literalinclude}` shows. */
  files: string[]
  /** Files an `{include}` or `{literalinclude}` names that could not be read: creating one changes the source. */
  missing: string[]
  findings: Finding[]
}

/** The file each parsed node comes from. */
const origin = new WeakMap<object, string>()

export function fileOf(node: MdastNode, fallback: string): string {
  return origin.get(node) ?? fallback
}

export function lineOf(node: MdastNode): { line: number, endLine: number } | undefined {
  const position = node.position as { start?: { line: number }, end?: { line: number } } | undefined
  if (!position?.start) return undefined
  return { line: position.start.line, endLine: Math.max(position.start.line, position.end?.line ?? 0) }
}

/** Where a parsed node is written: its file (`entry` when unknown) and lines. */
export function sourceOf(node: MdastNode, entry: string): SourcePos {
  const lines = lineOf(node)
  return { file: fileOf(node, entry), line: lines?.line ?? 1, endLine: lines?.endLine }
}

/** A source text without the byte order mark some editors write first (U+FEFF), which would hide the frontmatter. */
export function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

export class Parser {
  readonly #specs: object[]
  readonly #roles: object[]
  readonly #cache = new Map<string, ParsedFile>()

  /**
   * `directives` maps each Presmium directive name to whether its body is
   * MyST to parse in place; `roles` each role a plugin registers to the types
   * of its options (docs/ir.md 2.8).
   */
  constructor(directives: Map<string, boolean>, roles: Map<string, Record<string, DirectiveOptionType> | undefined> = new Map()) {
    this.#roles = [...MYST_EXTENSIONS.roles, ...[...roles].map(([name, options]) => ({
      name,
      options: Object.fromEntries(Object.entries(options ?? {}).map(([key, type]) => [key, { type: OPTION_TYPES[type] ?? String }])),
      body: { type: String },
      run(data: { options?: Record<string, unknown> }) {
        return [{ type: ROLE, options: data.options ?? {} }]
      },
    }))]
    this.#specs = [...MYST_EXTENSIONS.directives, ...[...directives].map(([name, mystBody]) => ({
      name,
      arg: { type: String },
      body: { type: mystBody ? 'myst' : String },
      run(data: { node: MdastNode, body?: unknown }) {
        const body = data.node.children?.find(c => c.type === 'mystDirectiveBody')
        const children = mystBody && Array.isArray(data.body) ? data.body as MdastNode[] : []
        return [{ type: BODY, line: body && lineOf(body)?.line, children }]
      },
    }))]
  }

  /** Parses MyST text whose first line is `line` of its file. */
  parse(markdown: string, line = 1): MdastNode {
    const tree = mystParse(markdown, { directives: this.#specs as never, roles: this.#roles as never }) as MdastNode
    if (line !== 1) shiftLines(tree, line - 1)
    return tree
  }

  /** Reads and parses a file; unchanged files come from the cache. Undefined when unreadable. */
  async read(file: string): Promise<ParsedFile | undefined> {
    const read = await readFile(file, 'utf8').catch(() => undefined)
    if (read === undefined) return undefined
    const text = withoutBom(read)
    const cached = this.#cache.get(file)
    if (cached?.text === text) return cached
    const parsed = this.#parseFile(file, text)
    this.#cache.set(file, parsed)
    return parsed
  }

  /**
   * Reads the entry and expands its `{include}` directives recursively. The
   * files no longer read leave the cache.
   */
  async expand(entry: string): Promise<ExpandedSource> {
    const files: string[] = []
    const findings: Finding[] = []
    const missing: string[] = []
    const parsed = await this.read(entry)
    if (!parsed) throw new Error(`cannot read ${entry}`)
    files.push(entry)
    findings.push(...parsed.findings)
    const children = await this.#expandAll(parsed.children, entry, [entry], { files, missing, findings })
    for (const file of this.#cache.keys()) {
      if (!files.includes(file)) this.#cache.delete(file)
    }
    return { children, files, missing, findings }
  }

  #parseFile(file: string, text: string): ParsedFile {
    const findings: Finding[] = []
    const { yaml, body } = splitFrontmatter(text)
    let frontmatter: Record<string, unknown> = {}
    if (yaml !== undefined) {
      try {
        const data: unknown = parseYaml(yaml) ?? {}
        if (isRecord(data)) frontmatter = data
        else findings.push({ checkId: 'presmium.parse', severity: 'error', message: 'frontmatter is not a mapping', source: { file, line: 1 } })
      } catch (error) {
        findings.push({ checkId: 'presmium.parse', severity: 'error', message: `invalid frontmatter: ${errorMessage(error)}`, source: { file, line: 1 } })
      }
    }
    const tree = this.parse(body)
    tagFile(tree, file)
    // `+++` block breaks nest content in `block` nodes; sections are found at the top level.
    const children = placeFootnotes((tree.children ?? []).flatMap(c => c.type === 'block' ? c.children ?? [] : [c]))
    return { file, text, frontmatter, findings, children }
  }

  async #expandAll(nodes: MdastNode[], file: string, stack: string[], out: Expansion): Promise<MdastNode[]> {
    const result: MdastNode[] = []
    for (const node of nodes) {
      if (node.type === 'mystDirective' && node.children?.some(child => child.type === 'include' && child.literal === true)) {
        result.push(...await this.#literal(node, file, out))
        continue
      }
      if (node.type === 'mystDirective' && node.name === 'include') {
        result.push(...await this.#include(node, file, stack, out))
        continue
      }
      if (!node.children?.length) {
        result.push(node)
        continue
      }
      const children = await this.#expandAll(node.children, file, stack, out)
      const same = children.length === node.children.length && children.every((c, i) => c === node.children![i])
      const copy = same ? node : { ...node, children }
      origin.set(copy, file)
      result.push(copy)
    }
    return result
  }

  async #include(node: MdastNode, file: string, stack: string[], out: Expansion): Promise<MdastNode[]> {
    const source = { file, line: lineOf(node)?.line ?? 1 }
    const fail = (message: string) => {
      out.findings.push({ checkId: 'presmium.parse', severity: 'error', message, source })
      return []
    }
    const arg = typeof node.args === 'string' ? node.args.trim() : ''
    if (!arg) return fail('{include} needs a file argument')
    const target = resolve(dirname(file), arg)
    if (stack.includes(target)) return fail(`{include} ${arg} includes itself`)
    const parsed = await this.read(target)
    if (!parsed) {
      // Watched all the same: the author may be about to create it.
      if (!out.missing.includes(target)) out.missing.push(target)
      return fail(`{include} ${arg}: file not found`)
    }
    if (!out.files.includes(target)) out.files.push(target)
    out.findings.push(...parsed.findings)
    if (Object.keys(parsed.frontmatter).length > 0) {
      out.findings.push({ checkId: 'presmium.parse', severity: 'warning', message: 'the frontmatter of an included file is ignored', source: { file: target, line: 1 } })
    }
    return this.#expandAll(parsed.children, target, [...stack, target], out)
  }

  /**
   * `{literalinclude}` (and an `{include}` with `:literal:` or `:lang:`): the
   * file's text as code, cut by its options (`:lines:`, `:start-after:`, ...)
   * as MyST's include transform does. The file is read like an `{include}`d
   * one.
   */
  async #literal(node: MdastNode, file: string, out: Expansion): Promise<MdastNode[]> {
    const source = { file, line: lineOf(node)?.line ?? 1 }
    const name = `{${String(node.name)}}`
    const fail = (message: string) => {
      out.findings.push({ checkId: 'presmium.parse', severity: 'error', message, source })
      return []
    }
    const include = structuredClone(node.children!.find(child => child.type === 'include')!)
    const arg = typeof include.file === 'string' ? include.file.trim() : ''
    if (!arg) return fail(`${name} needs a file argument`)
    const target = resolve(dirname(file), arg)
    const text = await readFile(target, 'utf8').catch(() => undefined)
    if (text === undefined) {
      if (!out.missing.includes(target)) out.missing.push(target)
      return fail(`${name} ${arg}: file not found`)
    }
    if (!out.files.includes(target)) out.files.push(target)
    // MyST's transform fills the include with the code (in a container when it has a caption); its messages are warnings here.
    const vfile = {
      message(reason: string) {
        out.findings.push({ checkId: 'presmium.directive', severity: 'warning', message: `${name} ${arg}: ${reason}`, source })
        return {}
      },
    }
    await includeDirectiveTransform({ type: 'root', children: [include] } as never, {}, vfile as never, {
      loadFile: () => text,
      resolveFile: () => target,
      parseContent: () => ({ mdast: { type: 'root', children: [] } }),
      sourceFile: file,
      sourcePath: dirname(file),
    })
    const children = include.children ?? []
    // The file's last line break ends its last line, as a fenced block's closing fence does: no empty line after it.
    for (const code of [...children, ...children.flatMap(child => child.children ?? [])]) {
      if (code.type === 'code' && typeof code.value === 'string') code.value = code.value.replace(/\r?\n$/, '')
    }
    const copy: MdastNode = { ...node, children }
    origin.set(copy, file)
    return [copy]
  }
}

/** What an expansion collects besides the nodes. */
interface Expansion {
  files: string[]
  missing: string[]
  findings: Finding[]
}

/** The frontmatter of a source text; `{}` when it has none or it is not a valid mapping. */
export function readFrontmatter(text: string): Record<string, unknown> {
  const { yaml } = splitFrontmatter(withoutBom(text))
  try {
    const data: unknown = yaml === undefined ? {} : parseYaml(yaml)
    return isRecord(data) ? data : {}
  } catch {
    return {}
  }
}

/** Separates a leading `---` YAML block; the body keeps the blanked lines so positions stay true. */
function splitFrontmatter(text: string): { yaml?: string, body: string } {
  const match = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return { body: text }
  const lines = match[0].split('\n').length - 1
  return { yaml: match[1] ?? '', body: '\n'.repeat(lines) + text.slice(match[0].length) }
}

/**
 * The parser moves every footnote definition of a file to its end, with the
 * position of another one; only the definition's content keeps its true lines.
 * Each definition goes back where it is written: at the top level, or into
 * the directive, list or quote that holds it (the body of a `{slide}` or
 * `{only}`, an admonition, a tab item, a dropdown, a card), so it belongs to
 * its section and to the audience of what holds it (P-55).
 */
function placeFootnotes(nodes: MdastNode[]): MdastNode[] {
  const placed = nodes.filter(node => node.type !== 'footnoteDefinition')
  for (const definition of nodes.filter(node => node.type === 'footnoteDefinition')) {
    const lines = contentLines(definition)
    if (!lines) {
      placed.push(definition)
      continue
    }
    definition.position = { start: { line: lines.line, column: 1 }, end: { line: lines.endLine, column: 1 } }
    insertAt(placed, definition, lines.line)
  }
  return placed
}

/** Nodes whose children are inline content, never a footnote definition's place. */
const INLINE = new Set(['paragraph', 'heading', 'tableCell', 'caption', 'admonitionTitle', 'cardTitle', 'summary', 'definitionTerm'])

function insertAt(nodes: MdastNode[], node: MdastNode, line: number): void {
  const holder = nodes.find((n) => {
    const lines = lineOf(n)
    return lines && lines.line < line && line <= lines.endLine && !INLINE.has(n.type) && n.children?.length
  })
  const inner = holder && contentOf(holder)
  if (inner) return insertAt(inner, node, line)
  const after = nodes.findIndex(n => (lineOf(n)?.line ?? 0) > line)
  nodes.splice(after < 0 ? nodes.length : after, 0, node)
}

/**
 * Where a node that holds a line keeps its content: a Presmium directive's
 * body; the node a MyST directive made (an admonition, a tab item, a
 * dropdown's `details`), which has no position of its own; a list's or a
 * quote's children.
 */
function contentOf(holder: MdastNode): MdastNode[] | undefined {
  const children = holder.children!
  if (holder.type !== 'mystDirective') return children
  const body = children.find(c => c.type === BODY)
  if (body) return body.children
  const [made] = children
  return children.length === 1 && made && !lineOf(made) && made.children ? made.children : children
}

/** First and last line of a node's positioned descendants. */
function contentLines(node: MdastNode): { line: number, endLine: number } | undefined {
  let found: { line: number, endLine: number } | undefined
  for (const child of node.children ?? []) {
    const lines = lineOf(child) ?? contentLines(child)
    if (lines) found = { line: Math.min(found?.line ?? lines.line, lines.line), endLine: Math.max(found?.endLine ?? 0, lines.endLine) }
  }
  return found
}

function tagFile(node: MdastNode, file: string): void {
  origin.set(node, file)
  for (const child of node.children ?? []) tagFile(child, file)
}

function shiftLines(node: MdastNode, offset: number): void {
  const position = node.position as { start?: { line: number }, end?: { line: number } } | undefined
  if (position?.start) position.start.line += offset
  if (position?.end) position.end.line += offset
  if (typeof node.line === 'number') node.line += offset
  for (const child of node.children ?? []) shiftLines(child, offset)
}
