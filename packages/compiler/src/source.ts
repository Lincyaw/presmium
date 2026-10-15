/**
 * Pass 1 (docs/ir.md section 4): strips the frontmatter, parses MyST with
 * myst-parser and expands `{include}`. Parsed files are cached by content, so
 * a recompilation only re-parses the files that changed.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Finding, MdastNode } from '@presmium/kernel'
import { mystParse } from 'myst-parser'
import { parse as parseYaml } from 'yaml'
import { errorMessage, isRecord } from './workspace.ts'

/** Child that a registered directive leaves in place of its body. */
export const BODY = 'presmiumDirectiveBody'

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
  /** Every source file read, entry first. */
  files: string[]
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

export class Parser {
  readonly #specs: object[]
  readonly #cache = new Map<string, ParsedFile>()

  /** `directives` maps each Presmium directive name to whether its body is MyST to parse in place. */
  constructor(directives: Map<string, boolean>) {
    this.#specs = [...directives].map(([name, mystBody]) => ({
      name,
      arg: { type: String },
      body: { type: mystBody ? 'myst' : String },
      run(data: { node: MdastNode, body?: unknown }) {
        const body = data.node.children?.find(c => c.type === 'mystDirectiveBody')
        const children = mystBody && Array.isArray(data.body) ? data.body as MdastNode[] : []
        return [{ type: BODY, line: body && lineOf(body)?.line, children }]
      },
    }))
  }

  /** Parses MyST text whose first line is `line` of its file. */
  parse(markdown: string, line = 1): MdastNode {
    const tree = mystParse(markdown, { directives: this.#specs as never }) as MdastNode
    if (line !== 1) shiftLines(tree, line - 1)
    return tree
  }

  /** Reads and parses a file; unchanged files come from the cache. Undefined when unreadable. */
  async read(file: string): Promise<ParsedFile | undefined> {
    const text = await readFile(file, 'utf8').catch(() => undefined)
    if (text === undefined) return undefined
    const cached = this.#cache.get(file)
    if (cached?.text === text) return cached
    const parsed = this.#parseFile(file, text)
    this.#cache.set(file, parsed)
    return parsed
  }

  /** Reads the entry and expands its `{include}` directives recursively. */
  async expand(entry: string): Promise<ExpandedSource> {
    const files: string[] = []
    const findings: Finding[] = []
    const parsed = await this.read(entry)
    if (!parsed) throw new Error(`cannot read ${entry}`)
    files.push(entry)
    findings.push(...parsed.findings)
    const children = await this.#expandAll(parsed.children, entry, [entry], files, findings)
    return { children, files, findings }
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

  async #expandAll(nodes: MdastNode[], file: string, stack: string[], files: string[], findings: Finding[]): Promise<MdastNode[]> {
    const result: MdastNode[] = []
    for (const node of nodes) {
      if (node.type === 'mystDirective' && node.name === 'include') {
        result.push(...await this.#include(node, file, stack, files, findings))
        continue
      }
      if (!node.children?.length) {
        result.push(node)
        continue
      }
      const children = await this.#expandAll(node.children, file, stack, files, findings)
      const same = children.length === node.children.length && children.every((c, i) => c === node.children![i])
      const copy = same ? node : { ...node, children }
      origin.set(copy, file)
      result.push(copy)
    }
    return result
  }

  async #include(node: MdastNode, file: string, stack: string[], files: string[], findings: Finding[]): Promise<MdastNode[]> {
    const source = { file, line: lineOf(node)?.line ?? 1 }
    const fail = (message: string) => {
      findings.push({ checkId: 'presmium.parse', severity: 'error', message, source })
      return []
    }
    const arg = typeof node.args === 'string' ? node.args.trim() : ''
    if (!arg) return fail('{include} needs a file argument')
    const target = resolve(dirname(file), arg)
    if (stack.includes(target)) return fail(`{include} ${arg} includes itself`)
    const parsed = await this.read(target)
    if (!parsed) return fail(`{include} ${arg}: file not found`)
    if (!files.includes(target)) files.push(target)
    findings.push(...parsed.findings)
    if (Object.keys(parsed.frontmatter).length > 0) {
      findings.push({ checkId: 'presmium.parse', severity: 'warning', message: 'the frontmatter of an included file is ignored', source: { file: target, line: 1 } })
    }
    return this.#expandAll(parsed.children, target, [...stack, target], files, findings)
  }
}

/** The frontmatter of a source text; `{}` when it has none or it is not a valid mapping. */
export function readFrontmatter(text: string): Record<string, unknown> {
  const { yaml } = splitFrontmatter(text)
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
 * Each definition goes back where it is written, at the top level or into the
 * body of the `{slide}` or `{only}` that holds it, so it belongs to its section.
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

function insertAt(nodes: MdastNode[], node: MdastNode, line: number): void {
  const directive = nodes.find((n) => {
    const lines = n.type === 'mystDirective' ? lineOf(n) : undefined
    return lines && lines.line < line && line <= lines.endLine
  })
  const body = directive?.children?.find(c => c.type === BODY)
  if (body?.children) return insertAt(body.children, node, line)
  const after = nodes.findIndex(n => (lineOf(n)?.line ?? 0) > line)
  nodes.splice(after < 0 ? nodes.length : after, 0, node)
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
