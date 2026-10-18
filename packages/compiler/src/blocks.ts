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
import { defaultOptions } from 'myst-parser'
import { svgTagNames } from 'svg-tag-names'
import { parse as parseYaml } from 'yaml'
import { AUDIENCE_SCOPE, audienceList, markAudience, within } from './audience.ts'
import { BODY, ROLE, sourceOf } from './source.ts'
import type { Parser } from './source.ts'

export interface BlockDraft {
  label?: string
  kind: string
  role: BlockRole
  reveal: boolean
  group?: number
  span: number
  only?: RendererId[]
  audience?: string[]
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
  lang: string
  renderers: Set<string>
  parser: Parser
  directives: Map<string, PluginDirective>
  roles: Map<string, PluginRole>
  components: Map<string, string>
  execute: ExecuteConfig
  report(finding: Finding): void
  watch(...files: string[]): void
}

export type Hints = Record<RendererId, Record<string, unknown>>

export type SectionConfig = Record<string, Record<string, unknown>>

export const BUILTIN_DIRECTIVES = new Map([['slide', true], ['only', true], ['hints', false], ['config', false], ['component', false], ['audience', false]])

const COMMON_OPTIONS = ['reveal', 'label', 'audience']
const MYST_ERRORS = new Set(['mystDirectiveError', 'mystRoleError'])
const RUN_OPTIONS = ['env', 'session']
const BROWSER = 'browser'
const COMPONENT_OPTIONS = [...COMMON_OPTIONS, 'span', 'plugin']
const CODE_DIRECTIVES = new Set(['code', 'code-block', 'code-cell', 'sourcecode', 'literalinclude', 'include'])
const NARRATION = new Set(['paragraph', 'list', 'blockquote', 'heading', 'definitionList', 'footnoteDefinition', 'thematicBreak'])
const DROPPED = new Set(['comment', 'mystTarget', 'outputs', BODY])
const HTML_ELEMENTS = new Set(htmlTagNames)
const FOREIGN_ELEMENTS = { svg: new Set(svgTagNames.map(name => name.toLowerCase())), math: new Set(mathmlTagNames) }
const TAG = /<(\/?)([A-Za-z][\w:.-]*)([^<>]*)(>?)/g
const MYST_DIRECTIVES = defaultOptions.directives as unknown as { name: string, alias?: string[], options?: Record<string, unknown> }[]

interface Scope {
  visual: boolean
  only?: RendererId[]
  items?: boolean
  group?: number
  audience?: string[]
}

interface Output {
  blocks: BlockDraft[]
  hints: Hints
  config: SectionConfig
  groups: number
  audience?: string[]
}

type Push = (draft: Omit<BlockDraft, 'only' | 'reveal' | 'group' | 'label'> & { label?: string, reveal?: boolean }) => void

export async function sectionBlocks(nodes: MdastNode[], ctx: BlockContext): Promise<{ blocks: BlockDraft[], hints: Hints, config: SectionConfig, audience?: string[] }> {
  const out: Output = { blocks: [], hints: {}, config: sectionConfig(nodes, ctx), groups: 0 }
  await convert(nodes, { visual: false }, ctx, out)
  return { blocks: out.blocks, hints: out.hints, config: out.config, ...out.audience ? { audience: out.audience } : {} }
}

function sectionConfig(nodes: MdastNode[], ctx: BlockContext): SectionConfig {
  const config: SectionConfig = {}
  for (const node of nodes) {
    const inner = node.type === AUDIENCE_SCOPE ? node.children : node.type === 'mystDirective' && (node.name === 'slide' || node.name === 'only') ? bodyNodes(node) : undefined
    if (inner) {
      for (const [id, options] of Object.entries(sectionConfig(inner, ctx))) config[id] = { ...config[id], ...options }
      continue
    }
    if (node.type !== 'mystDirective' || node.name !== 'config') continue
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
    const audience = draft.audience ?? scope.audience
    out.blocks.push({ ...draft, label: draft.label ?? label, reveal: draft.reveal === true, group: scope.group, only: scope.only, ...audience ? { audience } : {} })
    label = undefined
  }

  for (const node of nodes) {
    const source = sourceOf(node, ctx.entry)
    if (node.type === 'mystTarget') {
      label = typeof node.label === 'string' ? node.label : undefined
      continue
    }
    if (MYST_ERRORS.has(node.type)) {
      mystError(node, source, ctx)
      continue
    }
    if (node.type === AUDIENCE_SCOPE) {
      const audience = scopeAudience(node, source, ctx)
      if (node.section) {
        out.audience = within(out.audience, audience)
        continue
      }
      const start = out.blocks.length
      await convert(node.children ?? [], { ...scope, audience: within(scope.audience, audience) }, ctx, out)
      const first = out.blocks[start]
      if (first) {
        first.label ??= label
        label = undefined
      }
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
  const audience = options.audience === undefined ? scope.audience : audienceOption(options.audience, scope.audience, fail)

  if (name === 'audience') {
    const names = audienceList(arg)
    if (names.length === 0) fail('needs the audiences its section is for, e.g. {audience} teacher; until it names them, the section is left out of every version for an audience')
    if (body.trim()) fail('takes no body: it marks its whole section; to mark part of a section, give a directive :audience:, e.g. an {only} around the paragraphs', 'warning')
    out.audience = out.audience ? out.audience.filter(a => names.includes(a)) : names
    return
  }

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
    const inner: Scope = {
      visual: scope.visual || name === 'slide',
      only,
      items: reveal === undefined ? scope.items : reveal === 'items',
      group: reveal === 'next' ? ++out.groups : scope.group,
      audience,
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
    push({ kind: kebab(arg), label, reveal: reveal !== undefined, role: 'visual', span, source, audience, node: { type: 'component', plugin: plugin ?? '', name: arg, props } })
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
      push({ kind, label, reveal: reveal !== undefined, role: result.role ?? 'visual', span: result.span ?? 0, source, audience, node: result.node })
    } catch (error) {
      fail(`plugin ${plugin} failed: ${errorMessage(error)}`)
    }
    return
  }

  const children = (node.children ?? []).filter(c => c.type !== BODY)
  const code = CODE_DIRECTIVES.has(name) ? codeOf(children[0]) : undefined
  if (code) {
    push({ kind: 'code', label, reveal: reveal !== undefined, role: 'visual', span: 0, source, audience, node: codeNode(code, options, source, ctx) })
    return
  }
  if (children.length === 0) return fail('unknown directive; is the plugin that provides it listed in `plugins`?')
  push({ kind: name, label, reveal: reveal !== undefined, role: 'visual', span: 0, source, audience, node: markdown(children, ctx) })
}

function audienceOption(value: unknown, outer: string[] | undefined, fail: (message: string) => void): string[] {
  const names = typeof value === 'string' ? audienceList(value) : []
  if (names.length === 0) fail(':audience: needs the audiences it is for, e.g. :audience: teacher')
  return within(outer, names)
}

function scopeAudience(node: MdastNode, source: SourcePos, ctx: BlockContext): string[] {
  const audience = node.audience as string[]
  if (audience.length === 0 && !node.section) {
    ctx.report({ checkId: 'presmium.directive', severity: 'error', message: '{include}: :audience: needs the audiences it is for, e.g. :audience: teacher', source: { file: source.file, line: source.line } })
  }
  return audience
}

function mystError(node: MdastNode, source: SourcePos, ctx: BlockContext): void {
  const name = String(node.name ?? '')
  const message = typeof node.message === 'string' ? node.message : 'invalid'
  const spec = node.type === 'mystDirectiveError' ? MYST_DIRECTIVES.find(d => d.name === name || d.alias?.includes(name)) : undefined
  const unknown = spec && isRecord(node.options) ? Object.keys(node.options).filter(key => !(key in (spec.options ?? {})) && !COMMON_OPTIONS.includes(key)) : []
  const hint = unknown.length > 0 ? `; {${name}} takes no ${unknown.map(key => `:${key}:`).join(', ')}` : ''
  const what = node.type === 'mystDirectiveError' ? `{${name}}` : `role {${name}}`
  ctx.report({ checkId: 'presmium.directive', severity: 'error', message: `${what}: ${message}${hint}`, source: { file: source.file, line: source.line } })
}

function codeOf(node: MdastNode | undefined): MdastNode | undefined {
  if (node?.type === 'code') return node
  return node?.type === 'container' || node?.type === 'block' ? node.children?.find(c => c.type === 'code') : undefined
}

function codeNode(node: MdastNode, options: Record<string, string | true>, source: SourcePos, ctx: BlockContext): CodeNode {
  const lang = typeof node.lang === 'string' ? node.lang : ''
  const code: CodeNode = { type: 'code', lang, value: typeof node.value === 'string' ? node.value : '' }
  const title = options.caption ?? options.filename
  if (typeof title === 'string') code.title = title
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
      if (code.run!.when === 'live') {
        warn(':echo: false with :run: live: the code has no controls to run it; it runs at compile time')
        code.run!.when = 'compile'
      }
    }
  }
  return code
}

function runnableCode(node: IRNode): RunSpec[] {
  if (node.type === 'code') return node.run ? [node.run] : []
  if (node.type !== 'component') return []
  return (node as ComponentNode).children?.flatMap(child => runnableCode(child.node)) ?? []
}

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

type Foreign = Record<keyof typeof FOREIGN_ELEMENTS, number>

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

function clean(nodes: MdastNode[], ctx: BlockContext, file = ctx.entry): MdastNode[] {
  return nodes.flatMap((node): MdastNode[] => {
    if (MYST_ERRORS.has(node.type)) {
      mystError(node, sourceOf(node, file), ctx)
      return []
    }
    if (DROPPED.has(node.type)) return []
    if (node.type === AUDIENCE_SCOPE) return markAudience(clean(node.children ?? [], ctx, file), scopeAudience(node, sourceOf(node, file), ctx))
    if (node.type === 'mystRole' && ctx.roles.has(String(node.name))) return [roleNode(node, ctx, file)]
    if (node.type === 'mystDirective' || node.type === 'mystRole') {
      const name = String(node.name)
      const where = sourceOf(node, file)
      const report = (severity: Finding['severity'], message: string) =>
        ctx.report({ checkId: 'presmium.directive', severity, message, source: { file: where.file, line: where.line } })
      if (node.children?.length && !(node.type === 'mystDirective' && (BUILTIN_DIRECTIVES.has(name) || ctx.directives.has(name)))) {
        const nodes = clean(node.children, ctx, file)
        const option = node.type === 'mystDirective' && isRecord(node.options) ? node.options.audience : undefined
        return option === undefined ? nodes : markAudience(nodes, audienceOption(option, undefined, message => report('error', `{${name}}: ${message}`)))
      }
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
