import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { ANCHOR_LOCK_PATH, AnchorLock, DEFAULT_LANG, IR_VERSION, PROCESS_SANDBOX, createAnchorResolverRegistry, docBlocks, environmentExecutor, errorMessage, failedRun, isRecord } from '@lincyaw/kernel'
import type { AnchorResolverRegistry, CodeNode, DirectiveOptionType, EnvironmentContext, EnvironmentProvider, EnvironmentSpec, ExecuteConfig, Executor, Finding, IRDocument, IRPass, IRSection, NodeServiceContext, PassContext, RunContext, RunRequest, RunResult, ServiceToken, SourceReader } from '@lincyaw/kernel'
import { defaultOptions } from 'myst-parser'
import { audienceDocument, audienceMarks, AudienceParser, audienceView, emptyReferences, liftScopes, markBlocks, scanOutputs, withheld } from './audience.ts'
import type { Withheld } from './audience.ts'
import { BUILTIN_DIRECTIVES, sectionBlocks } from './blocks.ts'
import type { PluginDirective, PluginRole } from './blocks.ts'
import { Dependencies } from './dependencies.ts'
import type { CommittedFiles, Revision } from './dependencies.ts'
import { checkLanguages, checkRuns, checkSecrets, environmentExecutors, environmentProviders, readExecute } from './environments.ts'
import { executePass, FREEZE_DIR, FreezeCache, runEnvironment } from './execute.ts'
import type { ExecutionOptions, RunStats } from './execute.ts'
import { numberFootnotes } from './footnotes.ts'
import { checkForbidden } from './forbid.ts'
import { pluginChecks } from './host.ts'
import { checkLinks } from './links.ts'
import { DECK_PLUGIN, directoryComponents, loadOperatorPlugins, loadPlugins, pluginId } from './plugins.ts'
import type { LoadedPlugin, PluginProblem, PluginSources } from './plugins.ts'
import { resolveReferences } from './references.ts'
import { splitSections } from './sections.ts'
import { NodeServices, operatorDir, operatorPlugins, pluginLogger, workspaceSettings } from './settings.ts'
import type { OperatorSettings } from './settings.ts'
import { readFrontmatter, sourceOf, withoutBom } from './source.ts'
import type { Parser } from './source.ts'
import { scheduleSteps } from './steps.ts'
import { applyTranslations, translationFields } from './translations.ts'
import { validateIR } from './validate.ts'
import { compileTask } from './scheduling.ts'
import { hasPluginSyntax, moveSection, SectionCache } from './section-cache.ts'
import { createSourceReader, findWorkspaceRoot } from './workspace.ts'

export const DECK_ENTRY = 'lecture.md'

const BUILTIN_RENDERERS = ['web', 'slides', 'notebook']

const MYST_ROLES = new Set((defaultOptions.roles as unknown as { name: string, alias?: string[] }[]).flatMap(role => [role.name, ...role.alias ?? []]))

export interface CompilerOptions {
  priority?: 'interactive' | 'background'
  settings?: OperatorSettings
  services?: [ServiceToken<unknown>, unknown][]
  workspaceRoot?: string
  bundled?: string
  operatorDir?: string
  secret?: (name: string) => string | undefined
  execution?: ExecutionOptions
  audience?: string
  headmatter?: Record<string, unknown>
  deckDir?: string
}

export interface AudienceCompilation {
  name: string
  withheld: Withheld[]
  scan(dir: string, paths?: string[], options?: { quote?: boolean }): Promise<Finding[]>
}

export interface DeclaredEnvironment {
  name: string
  spec: EnvironmentSpec
  provider: EnvironmentProvider
  context: EnvironmentContext
}

export interface Compilation {
  doc: IRDocument
  options: CompilerOptions
  files: string[]
  dependencies: { files: string[], revisions: Revision[] }
  runs: RunStats
  deckDir: string
  entry: string
  frontmatter: Record<string, unknown>
  workspaceRoot: string
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLock
  plugins: LoadedPlugin[]
  components: Map<string, string>
  service<T>(token: ServiceToken<T>): T | undefined
  settings: OperatorSettings
  operatorDir?: string
  pluginSources: PluginSources
  execute: ExecuteConfig
  environments: DeclaredEnvironment[]
  executors: Executor[]
  runContext: RunContext
  run(node: CodeNode, signal?: AbortSignal): Promise<RunResult>
  audience?: AudienceCompilation
  forAudience(name: string): IRDocument
  audienceOf(name: string): AudienceCompilation
  publishChecks(options?: { externalLinks?: boolean }): Promise<Finding[]>
  check(options?: { externalLinks?: boolean }): Promise<Finding[]>
}

export interface CompileOptions {
  pruneCache?: boolean
  signal?: AbortSignal
}

export function resolveEntry(deck: string): string {
  const path = resolve(deck)
  return existsSync(path) && statSync(path).isDirectory() ? join(path, DECK_ENTRY) : path
}

interface Workspace {
  root: string
  src: SourceReader
  settings: OperatorSettings
  problem?: string
  sources: PluginSources
  operatorDir?: string
  operatorProblem?: string
}

interface Plugins {
  key: string
  plugins: LoadedPlugin[]
  problems: PluginProblem[]
}

export class Compiler {
  readonly entry: string
  readonly deckDir: string
  readonly options: CompilerOptions
  #workspace?: Workspace
  readonly #committed: CommittedFiles = new Map()
  #plugins?: Plugins
  #parser?: { key: string, parser: Parser }
  readonly #environments = new Map<string, Executor>()
  readonly #sections = new SectionCache()

  constructor(deck: string, options: CompilerOptions = {}) {
    this.entry = resolveEntry(deck)
    this.deckDir = options.deckDir ? resolve(options.deckDir) : dirname(this.entry)
    this.options = options
  }

  compile(options: CompileOptions = {}): Promise<Compilation> {
    return compileTask(() => this.#compile(options), this.options.priority === 'interactive')
  }

  async #compile(options: CompileOptions): Promise<Compilation> {
    options.signal?.throwIfAborted()
    const workspace = this.#workspace ??= await this.#openWorkspace()
    const { root: workspaceRoot, src, settings } = workspace
    const findings: Finding[] = []
    const report = (finding: Finding) => findings.push(finding)
    const read = await readFile(this.entry, 'utf8').catch(() => undefined)
    if (read === undefined) throw new Error(`${this.entry} not found`)
    const text = withoutBom(read)
    if (workspace.problem) report({ checkId: 'presmium.workspace', severity: 'error', message: workspace.problem, source: { file: this.entry, line: 1 } })
    if (workspace.operatorProblem) report({ checkId: 'presmium.workspace', severity: 'error', message: workspace.operatorProblem, source: { file: this.entry, line: 1 } })
    const headmatter = withHeadmatter(readFrontmatter(text), this.options.headmatter)
    const lang = typeof headmatter.lang === 'string' && headmatter.lang.trim() ? headmatter.lang.trim() : DEFAULT_LANG
    const dependencies = new Dependencies(workspaceRoot, this.#committed)
    const watch = (...files: string[]) => dependencies.watch(...files)
    const presmium = isRecord(headmatter.presmium) ? headmatter.presmium : {}
    const configOf = (plugin: LoadedPlugin) => {
      const config = presmium[pluginId(plugin)]
      return isRecord(config) ? config : {}
    }

    const names = stringList(headmatter.plugins)
    const loaded = await this.#loadPlugins(names, workspace)
    const { plugins } = loaded
    const problems = [...loaded.problems]
    const services = new NodeServices(this.options.services)
    for (const plugin of plugins) addServices(services, plugin, {
      deckDir: this.deckDir,
      workspaceRoot,
      config: configOf(plugin),
      settings: settings[pluginId(plugin)] ?? {},
      lang,
      secret: this.options.secret ?? (name => process.env[name]),
      ...workspace.operatorDir ? { operatorDir: workspace.operatorDir } : {},
      log: pluginLogger(pluginId(plugin)),
      service: token => services.get(token),
    }, problems)
    const service = <T>(token: ServiceToken<T>) => services.get(token)
    const at = (name: string) => ({ file: this.entry, line: frontmatterLine(text, name) })
    for (const p of problems) report({ checkId: 'presmium.plugins', severity: p.severity, message: p.message, source: at(p.name) })
    const execute = readExecute(headmatter.execute, report, at)
    checkSecrets(headmatter, report, at)

    const directives = new Map<string, PluginDirective>()
    const roles = new Map<string, PluginRole>()
    const resolvers = createAnchorResolverRegistry()
    const executors: Executor[] = []
    const providers = new Map<string, EnvironmentProvider>()
    const components = new Map<string, string>()
    for (const loaded of plugins) {
      for (const name of await directoryComponents(loaded.dir)) {
        const owner = components.get(name)
        if (owner === undefined) components.set(name, pluginId(loaded))
        else report({ checkId: 'presmium.plugins', severity: 'warning', message: `plugin ${pluginId(loaded)}: component ${name} is already registered by ${owner}; its component is ignored`, source: at(loaded.name) })
      }
      const { plugin } = loaded
      if (!plugin) continue
      for (const spec of plugin.directives ?? []) {
        if (BUILTIN_DIRECTIVES.has(spec.name) || directives.has(spec.name)) {
          report({ checkId: 'presmium.plugins', severity: 'error', message: `plugin ${plugin.id}: directive {${spec.name}} is already defined`, source: at(loaded.name) })
        } else {
          directives.set(spec.name, { plugin: plugin.id, config: configOf(loaded), spec })
        }
      }
      for (const spec of plugin.roles ?? []) {
        if (MYST_ROLES.has(spec.name) || roles.has(spec.name)) {
          report({ checkId: 'presmium.plugins', severity: 'error', message: `plugin ${plugin.id}: role {${spec.name}} is already defined`, source: at(loaded.name) })
        } else {
          roles.set(spec.name, { plugin: plugin.id, config: configOf(loaded), spec })
        }
      }
      try {
        for (const resolver of plugin.resolvers ?? []) resolvers.register(resolver)
      } catch (error) {
        report({ checkId: 'presmium.plugins', severity: 'error', message: `plugin ${plugin.id}: ${errorMessage(error)}`, source: at(loaded.name) })
      }
      executors.push(...plugin.executors ?? [])
      for (const [kind, provider] of Object.entries(plugin.environments ?? {})) if (!providers.has(kind)) providers.set(kind, provider)
    }
    for (const name of await directoryComponents(this.deckDir)) components.set(name, DECK_PLUGIN)
    const secret = this.options.secret ?? (name => process.env[name])
    const environmentContext: EnvironmentContext = { deckDir: this.deckDir, workspaceRoot, secret, log: pluginLogger('presmium.execute') }
    const declared = environmentProviders(execute, providers, report, at)
    executors.push(...await environmentExecutors(execute, declared, environmentContext, this.#environments, report, at))

    const parser = this.#parserFor(directives, roles)
    parser.signal = options.signal
    const source = await parser.expand(this.entry)
    findings.push(...source.findings)
    dependencies.watch(...source.missing)
    const { title: _title, lang: _lang, plugins: _plugins, presmium: _presmium, renderers, sectionDepth: depth, execute: _execute, translations: _translations, translationOf: _translationOf, ...rest } = headmatter
    const title = typeof headmatter.title === 'string' ? headmatter.title : basename(this.entry, extname(this.entry))
    const sectionDepth = Number.isInteger(depth) && (depth as number) >= 1 ? depth as number : 2

    const lifted = liftScopes(source.children, sectionDepth, (node, audience) => report({
      checkId: 'presmium.audience',
      severity: 'warning',
      message: `this content follows an {include} with :audience: whose file opens a section, so it is part of that section, which is only for ${audience.join(', ')}`,
      hint: 'start a section of its own with a heading after the {include}, or move it before the {include}',
      source: sourceOf(node, this.entry),
    }))
    const marks = audienceMarks(lifted, this.entry)
    const raw = splitSections(lifted, { entry: this.entry, title, sectionDepth }, report)
    const rendererIds = new Set([...BUILTIN_RENDERERS, ...isRecord(renderers) ? Object.keys(renderers) : []])
    const ctx = { entry: this.entry, deckDir: this.deckDir, workspaceRoot, lang, renderers: rendererIds, parser, directives, roles, components, execute, report, watch }
    const prepared: IRSection[] = []
    const cacheable: boolean[] = []
    this.#sections.context(JSON.stringify({ headmatter, components: [...components], plugins: this.#plugins?.key }))
    let yielded = performance.now()
    for (const [i, section] of raw.entries()) {
      options.signal?.throwIfAborted()
      const key = hasPluginSyntax(section.nodes, directives, roles) ? undefined : this.#sections.key(section)
      cacheable.push(key !== undefined)
      const known = key === undefined ? undefined : this.#sections.get(section.id, key, section.source)
      if (known) {
        prepared.push(known.section)
        findings.push(...known.findings)
        if (performance.now() - yielded >= 8) {
          await setImmediate()
          yielded = performance.now()
        }
        continue
      }
      const local: Finding[] = []
      const sectionReport = (finding: Finding) => { report(finding); local.push(finding) }
      const { blocks: drafts, hints, config, audience } = await sectionBlocks(section.nodes, { ...ctx, report: sectionReport })
      const { blocks, steps } = scheduleSteps(drafts, sectionReport)
      drafts.forEach((draft, j) => {
        if (draft.audience) blocks[j]!.audience = draft.audience
      })
      const compiled: IRSection = {
        id: section.id,
        index: i + 1,
        title: section.title,
        depth: section.depth,
        source: section.source,
        steps,
        hints,
        ...Object.keys(config).length > 0 ? { config } : {},
        blocks,
        ...audience ? { audience } : {},
      }
      prepared.push(compiled)
      if (key !== undefined) this.#sections.set(section.id, key, compiled, local)
      if (performance.now() - yielded >= 8) {
        await setImmediate()
        yielded = performance.now()
      }
    }
    this.#sections.prune(new Set(raw.map(section => section.id)))
    // Clone cached blueprints together. Fresh plugin nodes must retain identity:
    // directives can associate them with pass-local state in a WeakMap.
    const sections = structuredClone(prepared.map((section, i) => cacheable[i] ? section : null))
      .map((section, i) => section ?? prepared[i]!)
    sections.forEach((section, i) => {
      section.index = i + 1
      moveSection(section, raw[i]!.source)
    })

    markBlocks(sections, marks)

    const doc: IRDocument = {
      ir: IR_VERSION,
      meta: { ...rest, title, lang, entry: this.entry },
      config: {
        plugins: names,
        presmium,
        renderers: isRecord(renderers) ? recordOfRecords(renderers) : {},
        ...Object.keys(execute).length > 0 ? { execute } : {},
      },
      sections,
      diagnostics: [],
    }
    applyTranslations(doc, translationFields(headmatter), report)
    let audience: AudienceCompilation | undefined
    if (this.options.audience) {
      const name = this.options.audience
      const view = audienceView(doc, name, marks)
      doc.sections = view.doc.sections
      doc.meta.audience = name
      audience = audienceCompilation(name, withheld(view.removed, doc))
      const left = findings.filter(finding => !view.keeps(finding))
      findings.splice(0, findings.length, ...findings.filter(view.keeps))
      if (left.length > 0) {
        const severity = left.some(f => f.severity === 'error') ? 'error' : left.some(f => f.severity === 'warning') ? 'warning' : 'info'
        report({ checkId: 'presmium.audience', severity, message: `${left.length} finding${left.length === 1 ? ' is' : 's are'} in the content left out for ${name}, not shown here: presmium check without --audience shows ${left.length === 1 ? 'it' : 'them'}`, source: { file: this.entry, line: 1 } })
      }
    }
    checkRuns(doc, execute, report)
    const unsupported = checkLanguages(doc, execute, executors, report)

    numberFootnotes(doc, source.files)

    const lockFile = join(this.deckDir, ANCHOR_LOCK_PATH)
    let lock = AnchorLock.empty()
    try {
      lock = AnchorLock.parse(await readFile(lockFile, 'utf8').catch(() => undefined))
    } catch (error) {
      report({ checkId: 'presmium.lock', severity: 'error', message: errorMessage(error), source: { file: lockFile, line: 1 } })
    }
    const cache = new FreezeCache(join(this.deckDir, FREEZE_DIR), relative(this.deckDir, this.entry))
    const runContext = this.#runContext(workspaceRoot, settings, service, lang)
    const passes = plugins.flatMap(loaded => (loaded.plugin?.passes ?? []).map(pass => ({ pass, loaded })))
      .sort((a, b) => (a.pass.order ?? 0) - (b.pass.order ?? 0))
    const runPass = async ({ pass, loaded }: { pass: IRPass, loaded: LoadedPlugin }) => {
      options.signal?.throwIfAborted()
      const config = configOf(loaded)
      const pctx: PassContext = {
        deckDir: this.deckDir,
        workspaceRoot,
        lang,
        src: dependencies.reader(src),
        resolvers: dependencies.resolvers(resolvers),
        lock: lock.toJSON(),
        executors,
        cache,
        config,
        configFor: section => ({ ...config, ...section.config?.[pluginId(loaded)] }),
        report: finding => report({ ...finding, source: finding.source ?? at(loaded.name) }),
        watch,
        service,
      }
      try {
        await pass.run(doc, pctx)
      } catch (error) {
        report({ checkId: 'presmium.plugins', severity: 'error', message: `pass ${pass.name} of plugin ${pluginId(loaded)} failed: ${errorMessage(error)}`, source: at(loaded.name) })
      }
      options.signal?.throwIfAborted()
    }
    const blame = (findings: Finding[], culprit: string): Finding[] => findings.map(finding => ({ ...finding, hint: culprit }))
    let invalid = blame(validateIR(doc, this.entry), 'the IR is invalid before the plugin passes: a directive wrote it')
    for (const step of invalid.length > 0 ? [] : passes.filter(({ pass }) => pass.after !== 'execute')) {
      await runPass(step)
      invalid = validateIR(doc, this.entry)
      if (invalid.length > 0) {
        invalid = blame(invalid, `the IR is invalid after pass ${step.pass.name} of plugin ${pluginId(step.loaded)}`)
        break
      }
    }

    let runs: RunStats = { executed: 0, cached: 0 }
    let filled = new WeakSet<object>()
    if (invalid.length === 0) {
      filled = emptyReferences(doc)
      resolveReferences(doc, report)
      runs = await executePass(doc, executors, cache, report, { ...this.options.execution, signal: options.signal, rerun: execute.rerun === 'environment', context: runContext, unsupported })
      for (const step of passes.filter(({ pass }) => pass.after === 'execute')) await runPass(step)
      invalid = validateIR(doc, this.entry)
    }
    findings.push(...invalid)
    options.signal?.throwIfAborted()
    doc.diagnostics = sortFindings(findings)
    if (options.pruneCache && !audience && !findings.some(f => f.severity === 'error')) cache.prune()
    const publish = { doc, entry: this.entry, deckDir: this.deckDir, workspaceRoot, renderers: publishedRenderers(doc, plugins) }

    const compilation: Compilation = {
      doc,
      options: this.options,
      files: source.files,
      dependencies: { files: dependencies.files, revisions: dependencies.revisions },
      runs,
      deckDir: this.deckDir,
      entry: this.entry,
      frontmatter: headmatter,
      workspaceRoot,
      src,
      resolvers,
      lock,
      plugins,
      components,
      service,
      settings,
      operatorDir: workspace.operatorDir,
      pluginSources: workspace.sources,
      execute,
      environments: [...declared].map(([name, provider]) => ({ name, spec: execute.environments![name]!, provider, context: environmentContext })),
      executors,
      runContext,
      run: (node, signal) => this.#run(doc, node, executors, runContext, signal),
      ...audience ? { audience } : {},
      forAudience: name => audienceDocument(doc, name, filled, marks),
      audienceOf: (name) => {
        const view = audienceView(doc, name, marks)
        return audienceCompilation(name, withheld(view.removed, view.doc))
      },
      publishChecks: async (checks = {}) => [...await checkLinks(publish, checks), ...checkForbidden(publish, headmatter)],
      check: checks => pluginChecks(compilation, checks),
    }
    return compilation
  }

  #runContext(workspaceRoot: string, settings: OperatorSettings, service: <T>(token: ServiceToken<T>) => T | undefined, lang: string): RunContext {
    const passEnv = stringList(settings['presmium.exec']?.passEnv)
    const sandbox = service(PROCESS_SANDBOX)
    return {
      env: runEnvironment(this.options.execution?.env ?? 'local', passEnv, workspaceRoot),
      ...sandbox ? { sandbox } : {},
      lang,
    }
  }

  async #run(doc: IRDocument, node: CodeNode, executors: Executor[], context: RunContext, signal?: AbortSignal): Promise<RunResult> {
    const run = node.run ?? { lang: node.lang, when: 'live' as const }
    const executor = run.executor
      ? executors.find(e => e.id === run.executor && e.supports(run.lang))
      : executors.find(e => !e.id.startsWith(environmentExecutor('')) && e.supports(run.lang))
    if (!executor) return failedRun(run.executor ?? '', `no executor for ${run.executor ?? run.lang}`)
    const request = (code: CodeNode): RunRequest => {
      const spec = code.run ?? run
      return { lang: spec.lang, code: code.value, ...spec.args ? { args: spec.args } : {}, ...spec.stdin !== undefined ? { stdin: spec.stdin } : {}, ...spec.timeoutMs !== undefined ? { timeoutMs: spec.timeoutMs } : {} }
    }
    let nodes = [node]
    if (run.session) {
      const before: CodeNode[] = []
      for (const { block } of docBlocks(doc)) {
        if (block.node === node) break
        if (block.node.type === 'code' && block.node.run?.session === run.session && block.node.run.when !== 'live') before.push(block.node)
      }
      nodes = [...before, node]
    }
    const session = run.session ? `run:${randomUUID()}` : undefined
    const requests = nodes.map(code => ({ ...request(code), ...session ? { session } : {} }))
    const results = await Promise.all(requests.map(r => executor.run(r, signal, context)))
    if (session) await executor.endSession?.(session)
    return results.at(-1)!
  }

  async #openWorkspace(): Promise<Workspace> {
    const root = this.options.workspaceRoot ? resolve(this.options.workspaceRoot) : await findWorkspaceRoot(this.deckDir)
    const read = this.options.settings ? { settings: this.options.settings } : workspaceSettings(root)
    const sources: PluginSources = { workspaceRoot: root, listed: operatorPlugins(read.settings), bundled: this.options.bundled }
    const workspace: Workspace = { root, src: createSourceReader(root), settings: read.settings, problem: read.problem, sources }
    try {
      workspace.operatorDir = operatorDir(root, this.options.operatorDir ?? process.env.PRESMIUM_OPERATOR_DIR)
    } catch (error) {
      workspace.operatorProblem = errorMessage(error)
    }
    return workspace
  }

  async #loadPlugins(names: string[], workspace: Workspace): Promise<Plugins> {
    const key = JSON.stringify(names)
    if (this.#plugins?.key === key) return this.#plugins
    const operators = await loadOperatorPlugins(workspace.sources)
    const deck = await loadPlugins(this.deckDir, names, workspace.sources)
    const dirs = new Set(operators.plugins.map(loaded => loaded.dir))
    const plugins = [...operators.plugins, ...deck.plugins.filter(loaded => !dirs.has(loaded.dir))]
    const problems = [...operators.problems, ...deck.problems]
    this.#plugins = { key, plugins, problems }
    return this.#plugins
  }

  #parserFor(directives: Map<string, PluginDirective>, roles: Map<string, PluginRole>): Parser {
    const syntax = new Map([...BUILTIN_DIRECTIVES, ...[...directives.keys()].map(name => [name, false] as const)])
    const options = new Map<string, Record<string, DirectiveOptionType> | undefined>([...roles].map(([name, { spec }]) => [name, spec.options]))
    const key = JSON.stringify([[...syntax].sort(), [...options].sort()])
    if (this.#parser?.key !== key) this.#parser = { key, parser: new AudienceParser(syntax, options) }
    return this.#parser.parser
  }
}

function addServices(services: NodeServices, loaded: LoadedPlugin, context: NodeServiceContext, problems: PluginProblem[]): void {
  const contribute = loaded.plugin?.services
  if (!contribute) return
  try {
    for (const message of services.add(pluginId(loaded), contribute.call(loaded.plugin, context))) problems.push({ name: loaded.name, severity: 'warning', message })
  } catch (error) {
    problems.push({ name: loaded.name, severity: 'error', message: `plugin ${pluginId(loaded)}: services() failed: ${errorMessage(error)}` })
  }
}

export async function workspacePlugins(root: string, options: CompilerOptions = {}): Promise<{ plugins: LoadedPlugin[], problems: PluginProblem[], service<T>(token: ServiceToken<T>): T | undefined }> {
  const settings = options.settings ?? workspaceSettings(root).settings
  const { plugins, problems } = await loadOperatorPlugins({ workspaceRoot: root, listed: operatorPlugins(settings), bundled: options.bundled })
  let operator: string | undefined
  try {
    operator = operatorDir(root, options.operatorDir ?? process.env.PRESMIUM_OPERATOR_DIR)
  } catch {
  }
  const services = new NodeServices(options.services)
  for (const loaded of plugins) {
    addServices(services, loaded, {
      deckDir: root,
      workspaceRoot: root,
      config: {},
      settings: settings[pluginId(loaded)] ?? {},
      lang: DEFAULT_LANG,
      secret: options.secret ?? (name => process.env[name]),
      ...operator ? { operatorDir: operator } : {},
      service: token => services.get(token),
      log: pluginLogger(pluginId(loaded)),
    }, problems)
  }
  return { plugins, problems, service: token => services.get(token) }
}

export function audienceCompilation(name: string, left: Withheld[]): AudienceCompilation {
  return { name, withheld: left, scan: (dir, paths, options = {}) => scanOutputs(left, paths ?? [dir], name, dir, options.quote) }
}

function withHeadmatter(own: Record<string, unknown>, replaced?: Record<string, unknown>): Record<string, unknown> {
  if (!replaced) return own
  const merged = { ...own, ...replaced }
  for (const [key, value] of Object.entries(replaced)) if (value === undefined) delete merged[key]
  return merged
}

export function frontmatterLine(text: string, needle: string): number {
  const lines = withoutBom(text).split(/\r?\n/)
  const end = lines.indexOf('---', 1)
  const index = lines.slice(0, end < 0 ? undefined : end).findIndex(line => line.includes(needle))
  return index < 0 ? 1 : index + 1
}

export function sortFindings(findings: Finding[]): Finding[] {
  const file = (f: Finding) => f.source?.file ?? ''
  const line = (f: Finding) => f.source?.line ?? 0
  return findings.toSorted((a, b) => file(a) < file(b) ? -1 : file(a) > file(b) ? 1 : line(a) - line(b))
}

function publishedRenderers(doc: IRDocument, plugins: LoadedPlugin[]): string[] {
  const configured = Object.keys(doc.config.renderers)
  if (configured.length > 0) return configured
  return [...new Set([...BUILTIN_RENDERERS, ...plugins.flatMap(loaded => (loaded.plugin?.renderer ? [loaded.plugin.renderer.id] : []))])]
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function recordOfRecords(value: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, isRecord(v) ? v : {}]))
}
