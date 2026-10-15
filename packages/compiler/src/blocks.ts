/**
 * Passes 3 and 4 (docs/ir.md sections 2.3 to 2.5): turns the nodes of a
 * section into blocks. Directives become IR nodes (built-in `{slide}`,
 * `{only}`, `{hints}`, `{component}`, and the directives of plugins); every
 * block gets its role, narration or visual. Step numbers are assigned later
 * (see steps.ts) from `reveal` and `span`.
 */
import type {
  BlockRole,
  CodeNode,
  DirectiveContext,
  DirectiveOptionType,
  DirectiveSpec,
  Finding,
  IRNode,
  MdastNode,
  RendererId,
  RunSpec,
  SourcePos,
} from '@presmium/kernel'
import { parse as parseYaml } from 'yaml'
import { BODY, fileOf, lineOf } from './source.ts'
import type { Parser } from './source.ts'
import { errorMessage, isRecord } from './workspace.ts'

/** A block before step scheduling. */
export interface BlockDraft {
  label?: string
  /** Prefix of the generated block id, e.g. 'paragraph', 'code', 'pm-demo-stepper'. */
  kind: string
  role: BlockRole
  /** Appears at the step after the current one. */
  reveal: boolean
  span: number
  only?: RendererId[]
  source: SourcePos
  node: IRNode
}

export interface PluginDirective {
  plugin: string
  config: Record<string, unknown>
  spec: DirectiveSpec
}

export interface BlockContext {
  entry: string
  deckDir: string
  workspaceRoot: string
  parser: Parser
  directives: Map<string, PluginDirective>
  /** Component name -> id of the plugin that registers it. */
  components: Map<string, string>
  report(finding: Finding): void
}

export type Hints = Record<RendererId, Record<string, unknown>>

/** Built-in directives; the value tells whether the body is MyST parsed in place. */
export const BUILTIN_DIRECTIVES = new Map([['slide', true], ['only', true], ['hints', false], ['component', false]])

/** Options every directive accepts; they are not passed to plugin directives. */
const COMMON_OPTIONS = ['reveal', 'label']
const COMPONENT_OPTIONS = [...COMMON_OPTIONS, 'span', 'plugin']
const CODE_DIRECTIVES = new Set(['code', 'code-block', 'code-cell', 'sourcecode'])
const NARRATION = new Set(['paragraph', 'list', 'blockquote', 'heading', 'definitionList', 'footnoteDefinition', 'thematicBreak'])
const DROPPED = new Set(['comment', 'mystTarget', BODY])

interface Scope {
  visual: boolean
  only?: RendererId[]
  /** Reveal of the enclosing `{slide}` or `{only}`: 'next' for its first visual block, 'items' for each of its lists. */
  reveal?: 'next' | 'items'
}

type Push = (draft: Omit<BlockDraft, 'only' | 'reveal' | 'label'> & { label?: string, reveal?: boolean }) => void

export async function sectionBlocks(nodes: MdastNode[], ctx: BlockContext): Promise<{ blocks: BlockDraft[], hints: Hints }> {
  const blocks: BlockDraft[] = []
  const hints: Hints = {}
  await convert(nodes, { visual: false }, ctx, blocks, hints)
  return { blocks, hints }
}

async function convert(nodes: MdastNode[], scope: Scope, ctx: BlockContext, out: BlockDraft[], hints: Hints): Promise<void> {
  let label: string | undefined
  let reveal = scope.reveal
  const push: Push = (draft) => {
    const items = draft.node.type === 'markdown' ? listItems(draft.node.mdast) : 0
    if (reveal === 'items' && items > 0 && draft.node.type === 'markdown') {
      draft.node.reveal = 'items'
      draft.span = items
    }
    // The reveal of an enclosing {slide} or {only} goes to its first visual block.
    const inherited = reveal === 'next' && draft.role === 'visual'
    out.push({ ...draft, label: draft.label ?? label, reveal: draft.reveal === true || inherited, only: scope.only })
    label = undefined
    if (inherited) reveal = undefined
  }

  for (const node of nodes) {
    const source = sourceOf(node, ctx.entry)
    if (node.type === 'mystTarget') {
      label = typeof node.label === 'string' ? node.label : undefined
      continue
    }
    if (DROPPED.has(node.type)) continue
    if (node.type === 'mystDirective') {
      const before = out.length
      await directive(node, source, { ...scope, reveal }, label, ctx, push, hints, out)
      if (out.length > before) label = undefined
      if (reveal === 'next' && out.slice(before).some(b => b.role === 'visual')) reveal = undefined
      continue
    }
    if (node.type === 'code') {
      push({ kind: 'code', role: 'visual', span: 0, source, node: codeNode(node, {}, source, ctx) })
      continue
    }
    const role: BlockRole = scope.visual || !NARRATION.has(node.type) || onlyImages(node) ? 'visual' : 'narration'
    push({ kind: node.type, role, span: 0, source, node: markdown([node], ctx) })
  }
}

async function directive(node: MdastNode, source: SourcePos, scope: Scope, target: string | undefined, ctx: BlockContext, push: Push, hints: Hints, out: BlockDraft[]): Promise<void> {
  const name = String(node.name)
  const options = isRecord(node.options) ? node.options as Record<string, string | true> : {}
  const arg = typeof node.args === 'string' ? node.args.trim() : ''
  const body = typeof node.value === 'string' ? node.value : ''
  const label = typeof options.label === 'string' ? options.label : undefined
  const reveal = options.reveal === undefined ? undefined : options.reveal === 'items' ? 'items' : 'next'
  const fail = (message: string, severity: Finding['severity'] = 'error') =>
    ctx.report({ checkId: 'presmium.directive', severity, message: `{${name}}: ${message}`, source: { file: source.file, line: source.line } })

  if (name === 'slide' || name === 'only') {
    let only = scope.only
    if (name === 'only') {
      const ids = arg.split(/[\s,]+/).filter(Boolean)
      if (ids.length === 0) fail('needs the renderer ids it is limited to, e.g. {only} web, notebook')
      only = scope.only ? scope.only.filter(id => ids.includes(id)) : ids
    }
    const inner: Scope = { visual: scope.visual || name === 'slide', only, reveal: reveal ?? scope.reveal }
    const start = out.length
    await convert(bodyNodes(node), inner, ctx, out, hints)
    const first = out[start]
    if (first) first.label ??= label ?? target
    return
  }

  if (name === 'hints') {
    const data = yamlBody(body, fail)
    for (const [renderer, value] of Object.entries(data ?? {})) {
      if (isRecord(value)) hints[renderer] = { ...hints[renderer], ...value }
      else fail(`hints for "${renderer}" must be a mapping`)
    }
    return
  }

  if (name === 'component') {
    if (!arg) return fail('needs a component name, e.g. {component} PmQuiz')
    const props: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(options)) {
      if (!COMPONENT_OPTIONS.includes(key)) props[key] = value === true ? true : yamlValue(value)
    }
    Object.assign(props, yamlBody(body, fail))
    const plugin = typeof options.plugin === 'string' ? options.plugin : ctx.components.get(arg)
    if (plugin === undefined) fail(`no plugin in \`plugins\` registers the component ${arg}`, 'warning')
    const span = options.span === undefined ? 0 : Number(options.span)
    if (!Number.isInteger(span) || span < 0) return fail(`:span: must be a non-negative integer`)
    push({ kind: kebab(arg), label, reveal: reveal !== undefined, role: 'visual', span, source, node: { type: 'component', plugin: plugin ?? '', name: arg, props } })
    return
  }

  const registered = ctx.directives.get(name)
  if (registered) {
    const { spec, plugin, config } = registered
    const typed: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(options)) {
      if (COMMON_OPTIONS.includes(key)) continue
      const type = spec.options?.[key]
      if (spec.options && !type) fail(`unknown option :${key}:`, 'warning')
      typed[key] = type ? optionValue(value, type) : value
    }
    const bodyLine = bodyNodeLine(node) ?? source.line + 1
    const dctx: DirectiveContext = {
      file: source.file,
      deckDir: ctx.deckDir,
      workspaceRoot: ctx.workspaceRoot,
      config,
      source,
      parse: markdown => ({ type: 'root', children: clean(ctx.parser.parse(markdown, bodyLine).children ?? [], ctx) }),
      report: finding => ctx.report({ ...finding, source: finding.source ?? { file: source.file, line: source.line } }),
    }
    try {
      const result = await spec.toIR({ name, arg: arg || undefined, options: typed, body }, dctx)
      const kind = result.node.type === 'component' ? kebab(result.node.name) : result.node.type === 'code' ? 'code' : name
      push({ kind, label, reveal: reveal !== undefined, role: result.role ?? 'visual', span: result.span ?? 0, source, node: result.node })
    } catch (error) {
      fail(`plugin ${plugin} failed: ${errorMessage(error)}`)
    }
    return
  }

  const children = (node.children ?? []).filter(c => c.type !== BODY)
  if (CODE_DIRECTIVES.has(name) && children[0]?.type === 'code') {
    push({ kind: 'code', label, reveal: reveal !== undefined, role: 'visual', span: 0, source, node: codeNode(children[0], options, source, ctx) })
    return
  }
  if (children.length === 0) return fail('unknown directive; is the plugin that provides it listed in `plugins`?')
  // A MyST directive (admonition, figure, math, ...): its standard mdast output is visual content.
  push({ kind: name, label, reveal: reveal !== undefined, role: 'visual', span: 0, source, node: markdown(children, ctx) })
}

function codeNode(node: MdastNode, options: Record<string, string | true>, source: SourcePos, ctx: BlockContext): CodeNode {
  const lang = typeof node.lang === 'string' ? node.lang : ''
  const code: CodeNode = { type: 'code', lang, value: typeof node.value === 'string' ? node.value : '' }
  const title = options.caption ?? options.filename
  if (typeof title === 'string') code.title = title
  if (options.run !== undefined) code.run = runSpec(lang, options, source, ctx)
  return code
}

/** `:run:` [compile|live|both], `:executor:`, `:timeout:` (ms) of a code directive. */
function runSpec(lang: string, options: Record<string, string | true>, source: SourcePos, ctx: BlockContext): RunSpec {
  const when = options.run === true || options.run === '' ? 'compile' : options.run
  const spec: RunSpec = { lang, when: 'compile' }
  if (when === 'compile' || when === 'live' || when === 'both') spec.when = when
  else ctx.report({ checkId: 'presmium.directive', severity: 'warning', message: `:run: ${when} is not compile, live or both; using compile`, source: { file: source.file, line: source.line } })
  if (typeof options.executor === 'string') spec.executor = options.executor
  const timeout = Number(options.timeout)
  if (options.timeout !== undefined && Number.isFinite(timeout) && timeout > 0) spec.timeoutMs = timeout
  return spec
}

function markdown(nodes: MdastNode[], ctx: BlockContext): IRNode {
  return { type: 'markdown', mdast: { type: 'root', children: clean(nodes, ctx) } }
}

/**
 * Standard mdast for the IR: positions, comments and labels are dropped and
 * MyST wrappers around processed directives and roles are unwrapped.
 */
function clean(nodes: MdastNode[], ctx: BlockContext): MdastNode[] {
  return nodes.flatMap((node): MdastNode[] => {
    if (DROPPED.has(node.type)) return []
    if (node.type === 'mystDirective' || node.type === 'mystRole') {
      const name = String(node.name)
      if (node.type === 'mystDirective' && (BUILTIN_DIRECTIVES.has(name) || ctx.directives.has(name))) {
        const where = sourceOf(node, ctx.entry)
        ctx.report({ checkId: 'presmium.directive', severity: 'warning', message: `{${name}} is only supported at the top level of a section or in {slide} and {only}; it is dropped`, source: { file: where.file, line: where.line } })
        return []
      }
      if (node.children?.length) return clean(node.children, ctx)
    }
    const { position: _position, children, ...rest } = node
    return [children ? { ...rest, children: clean(children, ctx) } as MdastNode : rest as MdastNode]
  })
}

function bodyNodes(node: MdastNode): MdastNode[] {
  return node.children?.find(c => c.type === BODY)?.children ?? []
}

function bodyNodeLine(node: MdastNode): number | undefined {
  const line = node.children?.find(c => c.type === BODY)?.line
  return typeof line === 'number' ? line : undefined
}

function sourceOf(node: MdastNode, entry: string): SourcePos {
  const lines = lineOf(node)
  return { file: fileOf(node, entry), line: lines?.line ?? 1, endLine: lines?.endLine }
}

/** Top-level list items of a markdown block, the units of `:reveal: items`. */
function listItems(mdast: MdastNode): number {
  return (mdast.children ?? []).filter(c => c.type === 'list').reduce((n, list) => n + (list.children?.length ?? 0), 0)
}

function onlyImages(node: MdastNode): boolean {
  const children = node.children ?? []
  return node.type === 'paragraph' && children.some(c => c.type === 'image')
    && children.every(c => c.type === 'image' || (c.type === 'text' && !String(c.value).trim()))
}

function yamlBody(body: string, fail: (message: string) => void): Record<string, unknown> | undefined {
  if (!body.trim()) return undefined
  try {
    const data: unknown = parseYaml(body)
    if (isRecord(data)) return data
    fail('the body must be a YAML mapping')
  } catch (error) {
    fail(`invalid YAML body: ${errorMessage(error)}`)
  }
  return undefined
}

/** An option value read as YAML: `3` is a number, `[a, b]` a list. Options from a `---` block are already typed. */
function yamlValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return parseYaml(value) ?? value
  } catch {
    return value
  }
}

function optionValue(value: string | true, type: DirectiveOptionType): unknown {
  const text = value === true ? '' : value
  switch (type) {
    case 'boolean': return value === true || /^(?:true|yes|1|)$/i.test(text.trim())
    case 'number': return Number(text)
    case 'list': return text.split(/[\s,]+/).filter(Boolean)
    default: return text
  }
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}
