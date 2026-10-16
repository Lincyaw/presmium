/**
 * Passes 3 and 4 (docs/ir.md sections 2.3 to 2.5): turns the nodes of a
 * section into blocks. Directives become IR nodes (built-in `{slide}`,
 * `{only}`, `{hints}`, `{config}`, `{component}`, and the directives of
 * plugins); every block gets its role, narration or visual. Step numbers are
 * assigned later (see steps.ts) from `reveal`, `group` and `span`.
 */
import { environmentExecutor, errorMessage, isRecord } from '@presmium/kernel'
import type {
  BlockRole,
  CodeNode,
  ComponentNode,
  DirectiveContext,
  DirectiveOptionType,
  DirectiveSpec,
  ExecuteConfig,
  Finding,
  IRNode,
  MdastNode,
  RendererId,
  RoleSpec,
  RunSpec,
  SourcePos,
} from '@presmium/kernel'
import { htmlTagNames } from 'html-tag-names'
import { mathmlTagNames } from 'mathml-tag-names'
import { svgTagNames } from 'svg-tag-names'
import { parse as parseYaml } from 'yaml'
import { BODY, ROLE, sourceOf } from './source.ts'
import type { Parser } from './source.ts'

/** A block before step scheduling. */
export interface BlockDraft {
  label?: string
  /** Prefix of the generated block id, e.g. 'paragraph', 'code', 'pm-demo-stepper'. */
  kind: string
  role: BlockRole
  /** `:reveal:` on the block itself: it appears at the step after the last one used. */
  reveal: boolean
  /** Set on every block of a `{slide}` or `{only}` with `:reveal:`: the blocks of a group appear together. */
  group?: number
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

export interface PluginRole {
  plugin: string
  config: Record<string, unknown>
  spec: RoleSpec
}

export interface BlockContext {
  entry: string
  deckDir: string
  workspaceRoot: string
  /** The deck's language (`meta.lang`). */
  lang: string
  /** Renderer ids `{only}` may name: the built-in ones and those the headmatter configures. */
  renderers: Set<string>
  parser: Parser
  directives: Map<string, PluginDirective>
  /** The roles plugins register (docs/ir.md 2.8). */
  roles: Map<string, PluginRole>
  /** Component name -> id of the plugin that registers it. */
  components: Map<string, string>
  /** The headmatter's `execute`: the environment of code with `:run:` and no `:env:` (docs/ir.md 2.7). */
  execute: ExecuteConfig
  report(finding: Finding): void
  watch(...files: string[]): void
}

export type Hints = Record<RendererId, Record<string, unknown>>

/** Plugin configuration of a section (`{config}`), keyed by plugin id. */
export type SectionConfig = Record<string, Record<string, unknown>>

/** Built-in directives; the value tells whether the body is MyST parsed in place. */
export const BUILTIN_DIRECTIVES = new Map([['slide', true], ['only', true], ['hints', false], ['config', false], ['component', false]])

/** Options every directive accepts; they are not passed to plugin directives. */
const COMMON_OPTIONS = ['reveal', 'label']
/** Options of the code a directive runs (docs/ir.md 2.7), which the compiler reads for plugin directives that do not declare them. */
const RUN_OPTIONS = ['env', 'session']
/** The reserved environment name: route by language, as without environments. */
const BROWSER = 'browser'
const COMPONENT_OPTIONS = [...COMMON_OPTIONS, 'span', 'plugin']
/** Directives whose child is code; an `{include}` left in the tree is a literal one (source.ts expands the others). */
const CODE_DIRECTIVES = new Set(['code', 'code-block', 'code-cell', 'sourcecode', 'literalinclude', 'include'])
const NARRATION = new Set(['paragraph', 'list', 'blockquote', 'heading', 'definitionList', 'footnoteDefinition', 'thematicBreak'])
/** Dropped wherever they are: `outputs` is the output area MyST gives a `{code-cell}`, with a random id. */
const DROPPED = new Set(['comment', 'mystTarget', 'outputs', BODY])
/**
 * The elements raw HTML may name, as the HTML parser reads them: HTML's
 * (`svg` and `math` among them), and inside an `<svg>` or a `<math>` those of
 * SVG or MathML (`circle`, `mi`). A tag that names none of them where it
 * stands (`<reminder>`) is no markup.
 */
const HTML_ELEMENTS = new Set(htmlTagNames)
const FOREIGN_ELEMENTS = { svg: new Set(svgTagNames.map(name => name.toLowerCase())), math: new Set(mathmlTagNames) }
/** A tag: `/` if it closes, its name, its attributes (ending in `/` if it closes itself), `>`. */
const TAG = /<(\/?)([A-Za-z][\w:.-]*)([^<>]*)(>?)/g

interface Scope {
  visual: boolean
  only?: RendererId[]
  /** `:reveal: items` on the enclosing `{slide}` or `{only}`: each of its lists reveals its items. */
  items?: boolean
  /** Group of the enclosing `{slide}` or `{only}` with `:reveal:`. */
  group?: number
}

/** The blocks, hints and configuration of the section being converted. */
interface Output {
  blocks: BlockDraft[]
  hints: Hints
  /** Read before the blocks, so a directive anywhere in the section sees it. */
  config: SectionConfig
  groups: number
}

type Push = (draft: Omit<BlockDraft, 'only' | 'reveal' | 'group' | 'label'> & { label?: string, reveal?: boolean }) => void

export async function sectionBlocks(nodes: MdastNode[], ctx: BlockContext): Promise<{ blocks: BlockDraft[], hints: Hints, config: SectionConfig }> {
  const out: Output = { blocks: [], hints: {}, config: sectionConfig(nodes, ctx), groups: 0 }
  await convert(nodes, { visual: false }, ctx, out)
  return { blocks: out.blocks, hints: out.hints, config: out.config }
}

/**
 * The `{config}` directives of a section, at its top level or in a `{slide}`
 * or `{only}`: YAML mappings keyed by plugin id, merged in source order.
 */
function sectionConfig(nodes: MdastNode[], ctx: BlockContext): SectionConfig {
  const config: SectionConfig = {}
  for (const node of nodes) {
    if (node.type !== 'mystDirective') continue
    if (node.name === 'slide' || node.name === 'only') {
      for (const [id, options] of Object.entries(sectionConfig(bodyNodes(node), ctx))) config[id] = { ...config[id], ...options }
      continue
    }
    if (node.name !== 'config') continue
    const source = sourceOf(node, ctx.entry)
    const fail = (message: string) =>
      ctx.report({ checkId: 'presmium.directive', severity: 'error', message: `{config}: ${message}`, source: { file: source.file, line: source.line } })
    for (const [id, options] of Object.entries(yamlBody(typeof node.value === 'string' ? node.value : '', fail) ?? {})) {
      if (isRecord(options)) config[id] = { ...config[id], ...options }
      else fail(`the configuration of "${id}" must be a mapping`)
    }
  }
  return config
}

async function convert(nodes: MdastNode[], scope: Scope, ctx: BlockContext, out: Output): Promise<void> {
  let label: string | undefined
  const push: Push = (draft) => {
    const items = draft.node.type === 'markdown' ? listItems(draft.node.mdast) : 0
    if (scope.items && items > 0 && draft.node.type === 'markdown') {
      draft.node.reveal = 'items'
      draft.span = items - 1
    }
    out.blocks.push({ ...draft, label: draft.label ?? label, reveal: draft.reveal === true, group: scope.group, only: scope.only })
    label = undefined
  }

  for (const node of nodes) {
    const source = sourceOf(node, ctx.entry)
    if (node.type === 'mystTarget') {
      label = typeof node.label === 'string' ? node.label : undefined
      continue
    }
    if (DROPPED.has(node.type)) continue
    if (node.type === 'mystDirective') {
      const before = out.blocks.length
      await directive(node, source, scope, label, ctx, push, out)
      if (out.blocks.length > before) label = undefined
      continue
    }
    if (node.type === 'code') {
      push({ kind: 'code', role: 'visual', span: 0, source, node: codeNode(node, {}, source, ctx) })
      continue
    }
    const role: BlockRole = scope.visual || !NARRATION.has(node.type) || onlyImages(node) ? 'visual' : 'narration'
    const block = markdown([node], ctx)
    push({ kind: node.type, role, span: 0, source, node: role === 'narration' ? { ...block, mdast: { ...block.mdast, children: literalTags(block.mdast.children ?? []) } } : block })
  }
}

async function directive(node: MdastNode, source: SourcePos, scope: Scope, target: string | undefined, ctx: BlockContext, push: Push, out: Output): Promise<void> {
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
      for (const id of ids.filter(id => !ctx.renderers.has(id))) {
        fail(`unknown renderer id "${id}": its content shows in no form; known ids are ${[...ctx.renderers].join(', ')}`, 'warning')
      }
      only = scope.only ? scope.only.filter(id => ids.includes(id)) : ids
    }
    // `:reveal:` makes the whole directive a group that appears at the next step.
    const inner: Scope = {
      visual: scope.visual || name === 'slide',
      only,
      items: reveal === undefined ? scope.items : reveal === 'items',
      group: reveal === 'next' ? ++out.groups : scope.group,
    }
    const start = out.blocks.length
    await convert(bodyNodes(node), inner, ctx, out)
    const first = out.blocks[start]
    if (first) first.label ??= label ?? target
    return
  }

  if (name === 'hints') {
    const data = yamlBody(body, fail)
    for (const [renderer, value] of Object.entries(data ?? {})) {
      if (isRecord(value)) out.hints[renderer] = { ...out.hints[renderer], ...value }
      else fail(`hints for "${renderer}" must be a mapping`)
    }
    return
  }

  // Read with the section, before its blocks (see `sectionConfig`).
  if (name === 'config') return

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
    const own = (key: string) => spec.options?.[key] !== undefined
    for (const [key, value] of Object.entries(options)) {
      if (COMMON_OPTIONS.includes(key) || (RUN_OPTIONS.includes(key) && !own(key))) continue
      const type = spec.options?.[key]
      if (spec.options && !type) fail(`unknown option :${key}:`, 'warning')
      typed[key] = type ? optionValue(value, type) : value
    }
    const bodyLine = bodyNodeLine(node) ?? source.line + 1
    const dctx: DirectiveContext = {
      file: source.file,
      deckDir: ctx.deckDir,
      workspaceRoot: ctx.workspaceRoot,
      lang: ctx.lang,
      config: { ...config, ...out.config[plugin] },
      source,
      parse: markdown => ({ type: 'root', children: clean(ctx.parser.parse(markdown, bodyLine).children ?? [], ctx, source.file) }),
      report: finding => ctx.report({ ...finding, source: finding.source ?? { file: source.file, line: source.line } }),
      watch: ctx.watch,
    }
    try {
      const result = await spec.toIR({ name, arg: arg || undefined, options: typed, body }, dctx)
      const runs = runnableCode(result.node)
      const given = Object.fromEntries(RUN_OPTIONS.filter(key => !own(key) && options[key] !== undefined).map(key => [key, options[key]!]))
      for (const run of runs) runOptions(run, given, fail, ctx)
      if (runs.length === 0 && Object.keys(given).length > 0) fail(`${Object.keys(given).map(key => `:${key}:`).join(' and ')} has no effect: the directive runs no code`, 'warning')
      const kind = result.node.type === 'component' ? kebab(result.node.name) : result.node.type === 'code' ? 'code' : name
      push({ kind, label, reveal: reveal !== undefined, role: result.role ?? 'visual', span: result.span ?? 0, source, node: result.node })
    } catch (error) {
      fail(`plugin ${plugin} failed: ${errorMessage(error)}`)
    }
    return
  }

  const children = (node.children ?? []).filter(c => c.type !== BODY)
  const code = CODE_DIRECTIVES.has(name) ? codeOf(children[0]) : undefined
  if (code) {
    push({ kind: 'code', label, reveal: reveal !== undefined, role: 'visual', span: 0, source, node: codeNode(code, options, source, ctx) })
    return
  }
  if (children.length === 0) return fail('unknown directive; is the plugin that provides it listed in `plugins`?')
  // A MyST directive (admonition, figure, math, ...): its standard mdast output is visual content.
  push({ kind: name, label, reveal: reveal !== undefined, role: 'visual', span: 0, source, node: markdown(children, ctx) })
}

/**
 * The code of a code directive: its child, or the code in the container that
 * `:caption:` makes or in the notebook block of a `{code-cell}` (whose
 * output area is dropped).
 */
function codeOf(node: MdastNode | undefined): MdastNode | undefined {
  if (node?.type === 'code') return node
  return node?.type === 'container' || node?.type === 'block' ? node.children?.find(c => c.type === 'code') : undefined
}

function codeNode(node: MdastNode, options: Record<string, string | true>, source: SourcePos, ctx: BlockContext): CodeNode {
  const lang = typeof node.lang === 'string' ? node.lang : ''
  const code: CodeNode = { type: 'code', lang, value: typeof node.value === 'string' ? node.value : '' }
  const title = options.caption ?? options.filename
  if (typeof title === 'string') code.title = title
  // `:emphasize-lines:`, which myst-parser reads into `emphasizeLines`, highlights the same lines at every step.
  const emphasized: unknown[] = Array.isArray(node.emphasizeLines) ? node.emphasizeLines : []
  const count = code.value.split('\n').length
  const lines = emphasized.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= count)
  if (lines.length < emphasized.length) {
    ctx.report({ checkId: 'presmium.directive', severity: 'warning', message: `:emphasize-lines: lines outside the ${count} lines of the code are ignored`, source: { file: source.file, line: source.line } })
  }
  if (lines.length > 0) code.highlight = [lines]
  const warn = (message: string, severity: Finding['severity'] = 'warning') => ctx.report({ checkId: 'presmium.directive', severity, message, source: { file: source.file, line: source.line } })
  if (options.run !== undefined) code.run = runSpec(lang, options, warn, ctx)
  else if (options.env !== undefined || options.session !== undefined) warn(':env: and :session: need :run:; they are ignored')
  if (options.echo !== undefined) {
    const echo = options.echo === true ? '' : options.echo.trim().toLowerCase()
    if (echo !== 'false' && echo !== 'true') warn(`:echo: ${echo} is not true or false; ignored`)
    else if (echo === 'false' && !code.run) warn(':echo: false needs :run:; the code shows')
    else if (echo === 'false') {
      code.echo = false
      // Hidden code cannot be run by readers: what it shows is what compile time recorded.
      if (code.run!.when === 'live') {
        warn(':echo: false with :run: live: the code has no controls to run it; it runs at compile time')
        code.run!.when = 'compile'
      }
    }
  }
  return code
}

/** The code a directive's node runs: its own, or that of a component's child blocks. */
function runnableCode(node: IRNode): RunSpec[] {
  if (node.type === 'code') return node.run ? [node.run] : []
  if (node.type !== 'component') return []
  return (node as ComponentNode).children?.flatMap(child => runnableCode(child.node)) ?? []
}

/**
 * `:env:` and `:session:` on code that runs (docs/ir.md 2.7): the environment,
 * else the headmatter's `execute.env`, becomes the executor
 * `presmium.env.<name>`; the reserved `browser` routes by language. Whether
 * the environment is declared, and the sessions, are checked once the deck
 * is converted (environments.ts).
 */
function runOptions(spec: RunSpec, options: Record<string, string | true>, warn: (message: string, severity?: Finding['severity']) => void, ctx: BlockContext): void {
  const env = typeof options.env === 'string' ? options.env.trim() : undefined
  if (options.env === true || env === '') warn(':env: needs the name of an environment of `execute.environments`, or browser', 'error')
  if (env && spec.executor && spec.executor !== environmentExecutor(env)) {
    warn(`:env: ${env} and :executor: ${spec.executor} both choose where the code runs; write one of them`, 'error')
  } else if (env) {
    if (env === BROWSER) delete spec.executor
    else spec.executor = environmentExecutor(env)
  } else if (!spec.executor && ctx.execute.env && ctx.execute.env !== BROWSER) {
    spec.executor = environmentExecutor(ctx.execute.env)
  }
  const session = typeof options.session === 'string' ? options.session.trim() : ''
  if (options.session !== undefined && !session) warn(':session: needs a name', 'error')
  if (session) spec.session = session
}

/** `:run:` [compile|live|both], `:executor:`, `:timeout:` (ms), `:env:`, `:session:` of a code directive. */
function runSpec(lang: string, options: Record<string, string | true>, warn: (message: string, severity?: Finding['severity']) => void, ctx: BlockContext): RunSpec {
  const when = options.run === true || options.run === '' ? 'compile' : options.run
  const spec: RunSpec = { lang, when: 'compile' }
  if (when === 'compile' || when === 'live' || when === 'both') spec.when = when
  else warn(`:run: ${when} is not compile, live or both; using compile`)
  if (typeof options.executor === 'string') spec.executor = options.executor
  const timeout = Number(options.timeout)
  if (options.timeout !== undefined && Number.isFinite(timeout) && timeout > 0) spec.timeoutMs = timeout
  runOptions(spec, options, warn, ctx)
  return spec
}

function markdown(nodes: MdastNode[], ctx: BlockContext): Extract<IRNode, { type: 'markdown' }> {
  return { type: 'markdown', mdast: { type: 'root', children: clean(nodes, ctx) } }
}

/** How deep the raw HTML read so far is inside `<svg>` and `<math>` elements. */
type Foreign = Record<keyof typeof FOREIGN_ELEMENTS, number>

/**
 * Inline raw HTML whose tags name no element, such as the `<reminder>` of an
 * agent's trace, as the text it is: in narration and in table cells such tags
 * are words of the content rather than markup, and a renderer that compiles
 * the HTML (the slides', as Vue templates) fails on one that is not closed
 * (docs/coverage-agentic-se.md section 4). Inline HTML comes one tag per
 * node, so the `<svg>` or `<math>` that SVG and MathML tags stand in is
 * followed across the nodes.
 */
function literalTags(nodes: MdastNode[], foreign: Foreign = { svg: 0, math: 0 }): MdastNode[] {
  return nodes.map((node) => {
    if (node.type === 'html' && typeof node.value === 'string') {
      const tags = [...node.value.matchAll(TAG)]
      const known = (name: string) => HTML_ELEMENTS.has(name) || (foreign.svg > 0 && FOREIGN_ELEMENTS.svg.has(name)) || (foreign.math > 0 && FOREIGN_ELEMENTS.math.has(name))
      if (tags.length > 0 && tags.every(([, , name]) => !known(name!.toLowerCase()))) return { type: 'text', value: node.value }
      for (const [, close, name, attributes, end] of tags) {
        const ns = name!.toLowerCase()
        if (ns !== 'svg' && ns !== 'math') continue
        if (close) foreign[ns] = Math.max(0, foreign[ns] - 1)
        else if (!(end && attributes!.trimEnd().endsWith('/'))) foreign[ns]++
      }
      return node
    }
    return node.children ? { ...node, children: literalTags(node.children, { ...foreign }) } : node
  })
}

/**
 * Standard mdast for the IR: positions, comments and labels are dropped and
 * MyST wrappers around processed directives and roles are unwrapped. MyST
 * syntax that nothing processed does not reach the IR: an unknown role keeps
 * its text, an unknown directive is dropped.
 */
function clean(nodes: MdastNode[], ctx: BlockContext, file = ctx.entry): MdastNode[] {
  return nodes.flatMap((node): MdastNode[] => {
    if (DROPPED.has(node.type)) return []
    if (node.type === 'mystRole' && ctx.roles.has(String(node.name))) return [roleNode(node, ctx, file)]
    if (node.type === 'mystDirective' || node.type === 'mystRole') {
      const name = String(node.name)
      if (node.children?.length && !(node.type === 'mystDirective' && (BUILTIN_DIRECTIVES.has(name) || ctx.directives.has(name)))) {
        return clean(node.children, ctx, file)
      }
      const where = sourceOf(node, file)
      const report = (severity: Finding['severity'], message: string) =>
        ctx.report({ checkId: 'presmium.directive', severity, message, source: { file: where.file, line: where.line } })
      if (node.type === 'mystRole') {
        report('warning', `unknown role {${name}}; its text is kept as plain text`)
        return typeof node.value === 'string' ? [{ type: 'text', value: node.value }] : []
      }
      if (BUILTIN_DIRECTIVES.has(name) || ctx.directives.has(name)) {
        report('warning', `{${name}} is only supported at the top level of a section or in {slide} and {only}; it is dropped`)
      } else {
        report('error', `{${name}}: unknown directive; is the plugin that provides it listed in \`plugins\`?`)
      }
      return []
    }
    const { position: _position, children, ...rest } = node
    if (!children) return [rest as MdastNode]
    const cleaned = clean(children, ctx, file)
    return [{ ...rest, children: node.type === 'tableCell' ? literalTags(cleaned) : cleaned } as MdastNode]
  })
}

/**
 * A role a plugin registers, as the IR keeps it (docs/ir.md 2.8): a
 * `presmiumRole` node with the plugin's id, the options (typed as the role
 * declares them, and `value`, the content between the backticks) and the
 * children the role gives, by default the text of `value`.
 */
function roleNode(node: MdastNode, ctx: BlockContext, file: string): MdastNode {
  const name = String(node.name)
  const { plugin, config, spec } = ctx.roles.get(name)!
  const value = typeof node.value === 'string' ? node.value : ''
  const where = sourceOf(node, file)
  const report = (finding: Finding) => ctx.report({ ...finding, source: finding.source ?? { file: where.file, line: where.line } })
  const raw = node.children?.find(child => child.type === ROLE)?.options
  const options: Record<string, unknown> = {}
  for (const [key, given] of Object.entries(isRecord(raw) ? raw : {})) {
    const type = spec.options?.[key]
    options[key] = type === 'list' && typeof given === 'string' ? given.split(/[\s,]+/).filter(Boolean) : given
  }
  const dctx: DirectiveContext = {
    file: where.file,
    deckDir: ctx.deckDir,
    workspaceRoot: ctx.workspaceRoot,
    lang: ctx.lang,
    config,
    source: where,
    parse: markdown => ({ type: 'root', children: clean(ctx.parser.parse(markdown, where.line).children ?? [], ctx, where.file) }),
    report,
    watch: ctx.watch,
  }
  let children: MdastNode[] = [{ type: 'text', value }]
  try {
    if (spec.children) children = spec.children({ name, value, options }, dctx)
  } catch (error) {
    report({ checkId: 'presmium.plugins', severity: 'error', message: `role {${name}} of plugin ${plugin} failed: ${errorMessage(error)}` })
  }
  return { type: 'presmiumRole', plugin, name, options: { ...options, value }, children }
}

function bodyNodes(node: MdastNode): MdastNode[] {
  return node.children?.find(c => c.type === BODY)?.children ?? []
}

function bodyNodeLine(node: MdastNode): number | undefined {
  const line = node.children?.find(c => c.type === BODY)?.line
  return typeof line === 'number' ? line : undefined
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
