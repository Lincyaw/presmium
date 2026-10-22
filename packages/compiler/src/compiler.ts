import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { ANCHOR_LOCK_PATH, AnchorLock, DEFAULT_LANG, IR_VERSION, PROCESS_SANDBOX, createAnchorResolverRegistry, docBlocks, environmentExecutor, errorMessage, failedRun, isRecord } from '@lincyaw/kernel'
import type { AnchorResolverRegistry, CodeNode, DirectiveOptionType, EnvironmentContext, EnvironmentProvider, EnvironmentSpec, ExecuteConfig, Executor, Finding, IRDocument, IRPass, IRSection, NodeServiceContext, PassContext, RunContext, RunRequest, RunResult, ServiceToken, SourceReader } from '@lincyaw/kernel'
import { defaultOptions } from 'myst-parser'
import { audienceDocument, audienceMarks, AudienceParser, emptyReferences, filterForAudience, liftScopes, markBlocks, scanOutputs, withheld } from './audience.ts'
import type { AudienceMark, Withheld } from './audience.ts'
import { BUILTIN_DIRECTIVES, sectionBlocks } from './blocks.ts'
import type { BlockContext, PluginDirective, PluginRole } from './blocks.ts'
import { runAllChecks } from './compilation-actions.ts'
import { enqueueCompile } from './compile-queue.ts'
import { checkLanguages, checkRuns, checkSecrets, environmentExecutors, environmentProviders, toExecuteConfig } from './environments.ts'
import { executePass, FREEZE_DIR, FreezeCache, runEnvironment } from './execute.ts'
import type { RunEnvironmentOptions, RunStats } from './execute.ts'
import { numberFootnotes } from './footnotes.ts'
import { checkForbidden } from './forbid.ts'
import { CompileInputs } from './inputs.ts'
import type { CommittedFiles, GitRead } from './inputs.ts'
import { checkLinks } from './links.ts'
import { pluginLogger } from './logging.ts'
import { NodeServices } from './node-services.ts'
import { parseFrontmatter, sourceOf, withoutBom } from './parser.ts'
import type { Parser } from './parser.ts'
import { DECK_ENTRY } from './paths.ts'
import { DECK_PLUGIN, directoryComponents, loadOperatorPlugins, loadPlugins, pluginId } from './plugins.ts'
import type { LoadedPlugin, PluginProblem, PluginSources } from './plugins.ts'
import { resolveReferences } from './references.ts'
import { hasPluginSyntax, moveSection, SectionCache } from './section-cache.ts'
import { splitSections } from './sections.ts'
import type { RawSection } from './sections.ts'
import { frontmatterLine } from './source-lines.ts'
import { scheduleSteps } from './steps.ts'
import { applyTranslations, translationFields } from './translations.ts'
import { validateIR } from './validate.ts'
import { createSourceReader, findWorkspaceRoot } from './workspace.ts'
import { operatorDir, operatorPlugins, workspaceSettings } from './workspace-settings.ts'
import type { OperatorSettings } from './workspace-settings.ts'

export { DECK_ENTRY }

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
  execution?: RunEnvironmentOptions
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
  /** The MyST files of the document: the entry and the files it includes. */
  sourceFiles: string[]
  /** The other files the compilation read, and the files it read at a git ref. */
  inputs: { files: string[], gitReads: GitRead[] }
  runStats: RunStats
  deckDir: string
  entry: string
  /** The entry's headmatter, merged with `CompilerOptions.headmatter`. */
  headmatter: Record<string, unknown>
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
  /** The document for one audience, with the blocks that leak withheld content removed. */
  audienceDocument(name: string): IRDocument
  audienceCompilation(name: string): AudienceCompilation
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

type Report = (finding: Finding) => void

type HeadmatterLine = (needle: string) => { file: string, line: number }

/** What the plugins of one compilation contribute to it. */
interface Contributions {
  directives: Map<string, PluginDirective>
  roles: Map<string, PluginRole>
  resolvers: AnchorResolverRegistry
  executors: Executor[]
  components: Map<string, string>
  environments: Map<string, EnvironmentProvider>
  environmentContext: EnvironmentContext
}

/** The state of one compilation that its steps share. */
interface CompileRun {
  workspace: Workspace
  headmatter: Record<string, unknown>
  lang: string
  plugins: LoadedPlugin[]
  configOf(plugin: LoadedPlugin): Record<string, unknown>
  service<T>(token: ServiceToken<T>): T | undefined
  execute: ExecuteConfig
  inputs: CompileInputs
  findings: Finding[]
  report: Report
  at: HeadmatterLine
  signal?: AbortSignal
}

interface PassResults {
  lock: AnchorLock
  runStats: RunStats
  runContext: RunContext
  cache: FreezeCache
  filled: WeakSet<object>
  invalid: Finding[]
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
    return enqueueCompile(() => this.#compile(options), this.options.priority === 'interactive')
  }

  async #compile(options: CompileOptions): Promise<Compilation> {
    const run = await this.#start(options)
    const { headmatter, execute, findings, report } = run
    const contributions = await this.#collectContributions(run)
    const { sections, marks, sourceFiles } = await this.#compileSections(run, contributions)

    const { title: _title, lang: _lang, plugins: _plugins, presmium, renderers, sectionDepth: _sectionDepth, execute: _execute, translations: _translations, translationOf: _translationOf, ...rest } = headmatter
    const doc: IRDocument = {
      ir: IR_VERSION,
      meta: { ...rest, title: titleOf(headmatter, this.entry), lang: run.lang, entry: this.entry },
      config: {
        plugins: stringList(headmatter.plugins),
        presmium: isRecord(presmium) ? presmium : {},
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
      const filtered = filterForAudience(doc, name, marks)
      doc.sections = filtered.doc.sections
      doc.meta.audience = name
      audience = audienceCompilation(name, withheld(filtered.removed, doc))
      const left = findings.filter(finding => !filtered.keeps(finding))
      findings.splice(0, findings.length, ...findings.filter(filtered.keeps))
      if (left.length > 0) {
        const severity = left.some(f => f.severity === 'error') ? 'error' : left.some(f => f.severity === 'warning') ? 'warning' : 'info'
        report({ checkId: 'presmium.audience', severity, message: `${left.length} finding${left.length === 1 ? ' is' : 's are'} in the content left out for ${name}, not shown here: presmium check without --audience shows ${left.length === 1 ? 'it' : 'them'}`, source: { file: this.entry, line: 1 } })
      }
    }
    checkRuns(doc, execute, report)
    const unsupported = checkLanguages(doc, execute, contributions.executors, report)

    numberFootnotes(doc, sourceFiles)

    const passes = await this.#runPasses(doc, run, contributions, unsupported)
    findings.push(...passes.invalid)
    options.signal?.throwIfAborted()
    doc.diagnostics = sortFindings(findings)
    if (options.pruneCache && !audience && !findings.some(f => f.severity === 'error')) passes.cache.prune()
    return this.#assemble(doc, run, contributions, { sourceFiles, marks, audience, passes })
  }

  /** Reads the entry's headmatter, loads the plugins with their Node services and reads the execution settings. */
  async #start(options: CompileOptions): Promise<CompileRun> {
    options.signal?.throwIfAborted()
    const workspace = this.#workspace ??= await this.#openWorkspace()
    const { root: workspaceRoot, settings } = workspace
    const findings: Finding[] = []
    const report = (finding: Finding) => findings.push(finding)
    const read = await readFile(this.entry, 'utf8').catch(() => undefined)
    if (read === undefined) throw new Error(`${this.entry} not found`)
    const text = withoutBom(read)
    if (workspace.problem) report({ checkId: 'presmium.workspace', severity: 'error', message: workspace.problem, source: { file: this.entry, line: 1 } })
    if (workspace.operatorProblem) report({ checkId: 'presmium.workspace', severity: 'error', message: workspace.operatorProblem, source: { file: this.entry, line: 1 } })
    const headmatter = withHeadmatter(parseFrontmatter(text), this.options.headmatter)
    const lang = typeof headmatter.lang === 'string' && headmatter.lang.trim() ? headmatter.lang.trim() : DEFAULT_LANG
    const inputs = new CompileInputs(workspaceRoot, this.#committed)
    const presmium = isRecord(headmatter.presmium) ? headmatter.presmium : {}
    const configOf = (plugin: LoadedPlugin) => {
      const config = presmium[pluginId(plugin)]
      return isRecord(config) ? config : {}
    }

    const loaded = await this.#loadPlugins(stringList(headmatter.plugins), workspace)
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
      service: token => services.tryGet(token),
    }, problems)
    const service = <T>(token: ServiceToken<T>) => services.tryGet(token)
    const at = (name: string) => ({ file: this.entry, line: frontmatterLine(text, name) })
    for (const p of problems) report({ checkId: 'presmium.plugins', severity: p.severity, message: p.message, source: at(p.name) })
    const execute = toExecuteConfig(headmatter.execute, report, at)
    checkSecrets(headmatter, report, at)
    return { workspace, headmatter, lang, plugins, configOf, service, execute, inputs, findings, report, at, signal: options.signal }
  }

  /** Registers each plugin's directives, roles, anchor resolvers, executors, environment providers and components. */
  async #collectContributions(run: CompileRun): Promise<Contributions> {
    const { plugins, configOf, execute, report, at } = run
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
    const environmentContext: EnvironmentContext = { deckDir: this.deckDir, workspaceRoot: run.workspace.root, secret, log: pluginLogger('presmium.execute') }
    const environments = environmentProviders(execute, providers, report, at)
    executors.push(...await environmentExecutors(execute, environments, environmentContext, this.#environments, report, at))
    return { directives, roles, resolvers, executors, components, environments, environmentContext }
  }

  /** Parses the source, splits it into sections and turns each into blocks and steps; unchanged sections come from the cache. */
  async #compileSections(run: CompileRun, contributions: Contributions): Promise<{ sections: IRSection[], marks: AudienceMark[], sourceFiles: string[] }> {
    const { headmatter, inputs, findings, report, signal } = run
    const { directives, roles, components } = contributions
    const parser = this.#parserFor(directives, roles)
    parser.signal = signal
    const source = await parser.expand(this.entry)
    findings.push(...source.findings)
    inputs.watch(...source.missing)
    const depth = headmatter.sectionDepth
    const sectionDepth = Number.isInteger(depth) && (depth as number) >= 1 ? depth as number : 2

    const lifted = liftScopes(source.children, sectionDepth, (node, audience) => report({
      checkId: 'presmium.audience',
      severity: 'warning',
      message: `this content follows an {include} with :audience: whose file opens a section, so it is part of that section, which is only for ${audience.join(', ')}`,
      hint: 'start a section of its own with a heading after the {include}, or move it before the {include}',
      source: sourceOf(node, this.entry),
    }))
    const marks = audienceMarks(lifted, this.entry)
    const raw = splitSections(lifted, { entry: this.entry, title: titleOf(headmatter, this.entry), sectionDepth }, report)
    const renderers = headmatter.renderers
    const ctx: BlockContext = {
      entry: this.entry,
      deckDir: this.deckDir,
      workspaceRoot: run.workspace.root,
      lang: run.lang,
      renderers: new Set([...BUILTIN_RENDERERS, ...isRecord(renderers) ? Object.keys(renderers) : []]),
      parser,
      directives,
      roles,
      components,
      execute: run.execute,
      report,
      watch: (...files) => inputs.watch(...files),
    }
    const prepared: IRSection[] = []
    const cacheable: boolean[] = []
    this.#sections.context(JSON.stringify({ headmatter, components: [...components], plugins: this.#plugins?.key }))
    let yielded = performance.now()
    const yieldSometimes = async () => {
      if (performance.now() - yielded < 8) return
      await setImmediate()
      yielded = performance.now()
    }
    for (const [i, section] of raw.entries()) {
      signal?.throwIfAborted()
      const key = hasPluginSyntax(section.nodes, directives, roles) ? undefined : this.#sections.key(section)
      cacheable.push(key !== undefined)
      const known = key === undefined ? undefined : this.#sections.get(section.id, key, section.source)
      if (known) {
        prepared.push(known.section)
        findings.push(...known.findings)
        await yieldSometimes()
        continue
      }
      const local: Finding[] = []
      const compiled = await compileSection(section, i + 1, { ...ctx, report: (finding) => { report(finding); local.push(finding) } })
      prepared.push(compiled)
      if (key !== undefined) this.#sections.set(section.id, key, compiled, local)
      await yieldSometimes()
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
    return { sections, marks, sourceFiles: source.files }
  }

  /** Runs the plugins' passes, resolves references and runs the code at compile time, validating the IR in between. */
  async #runPasses(doc: IRDocument, run: CompileRun, contributions: Contributions, unsupported: ReadonlySet<CodeNode>): Promise<PassResults> {
    const { plugins, configOf, workspace, inputs, report, at, signal } = run
    const { executors, resolvers } = contributions
    const lockFile = join(this.deckDir, ANCHOR_LOCK_PATH)
    let lock = AnchorLock.empty()
    try {
      lock = AnchorLock.parse(await readFile(lockFile, 'utf8').catch(() => undefined))
    } catch (error) {
      report({ checkId: 'presmium.lock', severity: 'error', message: errorMessage(error), source: { file: lockFile, line: 1 } })
    }
    const cache = new FreezeCache(join(this.deckDir, FREEZE_DIR), relative(this.deckDir, this.entry))
    const runContext = this.#runContext(workspace.root, workspace.settings, run.service, run.lang)
    const passes = plugins.flatMap(loaded => (loaded.plugin?.passes ?? []).map(pass => ({ pass, loaded })))
      .sort((a, b) => (a.pass.order ?? 0) - (b.pass.order ?? 0))
    const runPass = async ({ pass, loaded }: { pass: IRPass, loaded: LoadedPlugin }) => {
      signal?.throwIfAborted()
      const config = configOf(loaded)
      const pctx: PassContext = {
        deckDir: this.deckDir,
        workspaceRoot: workspace.root,
        lang: run.lang,
        src: inputs.reader(workspace.src),
        resolvers: inputs.resolvers(resolvers),
        lock: lock.toJSON(),
        executors,
        cache,
        config,
        configFor: section => ({ ...config, ...section.config?.[pluginId(loaded)] }),
        report: finding => report({ ...finding, source: finding.source ?? at(loaded.name) }),
        watch: (...files) => inputs.watch(...files),
        service: run.service,
      }
      try {
        await pass.run(doc, pctx)
      } catch (error) {
        report({ checkId: 'presmium.plugins', severity: 'error', message: `pass ${pass.name} of plugin ${pluginId(loaded)} failed: ${errorMessage(error)}`, source: at(loaded.name) })
      }
      signal?.throwIfAborted()
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

    let runStats: RunStats = { executed: 0, cached: 0 }
    let filled = new WeakSet<object>()
    if (invalid.length === 0) {
      filled = emptyReferences(doc)
      resolveReferences(doc, report)
      runStats = await executePass(doc, executors, cache, report, { ...this.options.execution, signal, rerun: run.execute.rerun === 'environment', context: runContext, unsupported })
      for (const step of passes.filter(({ pass }) => pass.after === 'execute')) await runPass(step)
      invalid = validateIR(doc, this.entry)
    }
    return { lock, runStats, runContext, cache, filled, invalid }
  }

  #assemble(doc: IRDocument, run: CompileRun, contributions: Contributions, results: { sourceFiles: string[], marks: AudienceMark[], audience?: AudienceCompilation, passes: PassResults }): Compilation {
    const { workspace, headmatter, plugins, execute, inputs } = run
    const { executors } = contributions
    const { marks, audience, passes } = results
    const { runContext } = passes
    const publish = { doc, entry: this.entry, deckDir: this.deckDir, workspaceRoot: workspace.root, renderers: publishedRenderers(doc, plugins) }
    const compilation: Compilation = {
      doc,
      options: this.options,
      sourceFiles: results.sourceFiles,
      inputs: { files: inputs.files, gitReads: inputs.gitReads },
      runStats: passes.runStats,
      deckDir: this.deckDir,
      entry: this.entry,
      headmatter,
      workspaceRoot: workspace.root,
      src: workspace.src,
      resolvers: contributions.resolvers,
      lock: passes.lock,
      plugins,
      components: contributions.components,
      service: run.service,
      settings: workspace.settings,
      operatorDir: workspace.operatorDir,
      pluginSources: workspace.sources,
      execute,
      environments: [...contributions.environments].map(([name, provider]) => ({ name, spec: execute.environments![name]!, provider, context: contributions.environmentContext })),
      executors,
      runContext,
      run: (node, signal) => this.#run(doc, node, executors, runContext, signal),
      ...audience ? { audience } : {},
      audienceDocument: name => audienceDocument(doc, name, passes.filled, marks),
      audienceCompilation: (name) => {
        const filtered = filterForAudience(doc, name, marks)
        return audienceCompilation(name, withheld(filtered.removed, filtered.doc))
      },
      publishChecks: async (checks = {}) => [...await checkLinks(publish, checks), ...checkForbidden(publish, headmatter)],
      check: checks => runAllChecks(compilation, checks),
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
    const runSession = run.session ? `run:${randomUUID()}` : undefined
    const requests = nodes.map(code => ({ ...request(code), ...runSession ? { session: runSession } : {} }))
    const results = await Promise.all(requests.map(r => executor.run(r, signal, context)))
    if (runSession) await executor.endSession?.(runSession)
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

/** One section's blocks and steps, from its mdast. */
async function compileSection(section: RawSection, index: number, ctx: BlockContext): Promise<IRSection> {
  const { blocks: drafts, hints, config, audience } = await sectionBlocks(section.nodes, ctx)
  const { blocks, steps } = scheduleSteps(drafts, ctx.report)
  drafts.forEach((draft, j) => {
    if (draft.audience) blocks[j]!.audience = draft.audience
  })
  return {
    id: section.id,
    index,
    title: section.title,
    depth: section.depth,
    source: section.source,
    steps,
    hints,
    ...Object.keys(config).length > 0 ? { config } : {},
    blocks,
    ...audience ? { audience } : {},
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
      service: token => services.tryGet(token),
      log: pluginLogger(pluginId(loaded)),
    }, problems)
  }
  return { plugins, problems, service: token => services.tryGet(token) }
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

function titleOf(headmatter: Record<string, unknown>, entry: string): string {
  return typeof headmatter.title === 'string' ? headmatter.title : basename(entry, extname(entry))
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
