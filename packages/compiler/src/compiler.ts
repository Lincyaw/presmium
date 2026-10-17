/**
 * The compiler: MyST source to IR through the passes of docs/ir.md section 4.
 * A `Compiler` keeps its loaded plugins and parsed files between runs, so
 * `presmium dev` recompiles incrementally: only changed files are re-parsed
 * and only changed code is re-executed.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { ANCHOR_LOCK_PATH, AnchorLock, DEFAULT_LANG, IR_VERSION, PROCESS_SANDBOX, createAnchorResolverRegistry, docBlocks, environmentExecutor, errorMessage, failedRun, isRecord } from '@presmium/kernel'
import type { AnchorResolverRegistry, CodeNode, DirectiveOptionType, EnvironmentContext, EnvironmentProvider, EnvironmentSpec, ExecuteConfig, Executor, Finding, GatewayAccess, IRDocument, IRPass, IRSection, NodeServiceContext, PassContext, RunContext, RunRequest, RunResult, ServiceToken, SourceReader, TrustMode } from '@presmium/kernel'
import { defaultOptions } from 'myst-parser'
import { audienceDocument, audienceMarks, AudienceParser, audienceView, emptyReferences, liftScopes, scanOutputs, withheld } from './audience.ts'
import type { Withheld } from './audience.ts'
import { BUILTIN_DIRECTIVES, sectionBlocks } from './blocks.ts'
import type { PluginDirective, PluginRole } from './blocks.ts'
import { Dependencies } from './dependencies.ts'
import type { CommittedFiles, Revision } from './dependencies.ts'
import { checkRuns, checkSecrets, environmentExecutors, environmentProviders, readExecute } from './environments.ts'
import { executePass, FREEZE_DIR, FreezeCache, runEnvironment } from './execute.ts'
import type { ExecutionOptions, RunStats } from './execute.ts'
import { numberFootnotes } from './footnotes.ts'
import { checkForbidden } from './forbid.ts'
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
import { createSourceReader, findWorkspaceRoot, ReadScope, refusedFile } from './workspace.ts'

/** Entry file of a deck directory. */
export const DECK_ENTRY = 'lecture.md'

/** Renderer ids `{only}` may name besides those the headmatter configures. */
const BUILTIN_RENDERERS = ['web', 'slides', 'notebook']

/** The roles MyST itself has ({sub}, {abbr}, ...): a plugin cannot register one of them (docs/ir.md 2.8). */
const MYST_ROLES = new Set((defaultOptions.roles as unknown as { name: string, alias?: string[] }[]).flatMap(role => [role.name, ...role.alias ?? []]))

/**
 * What the host that runs the compiler gives it (docs/architecture.md 4.6,
 * 10.2): `presmium dev`, `build`, `check` give little; `presmium serve`,
 * gateway and agent-host give the plugin policy, the read scope and their settings.
 */
export interface CompilerOptions {
  /** The operator's settings by plugin id; default: `settings` of the workspace root's `presmium.workspace.yaml`, read once per process. */
  settings?: OperatorSettings
  /** The trust mode of the process; default `local`. */
  trust?: TrustMode
  /** Node services the host provides (e.g. the server's `APPROVALS`, `MCP_ENDPOINT`); registered before the plugins'. */
  services?: [ServiceToken<unknown>, unknown][]
  /** Tokens the host keeps (e.g. the agent-host clients in SHARED mode): the plugins' implementations of them are not registered. */
  reserved?: ServiceToken<unknown>[]
  /** Only operator-controlled plugins (D14): `presmium serve`, gateway and agent-host. */
  policy?: boolean
  /** Only files whose real path lies in the workspace root, outside `.git/` (SHARED `presmium serve`). */
  scope?: boolean
  /** The directory from which Presmium's own packages installed with the CLI resolve (the renderers, `addon-deltabox`). */
  bundled?: string
  /** The LOCAL operator directory (`--operator-dir`); default `PRESMIUM_OPERATOR_DIR`, else the user's state directory. Ignored in SHARED mode. */
  operatorDir?: string
  /** SHARED mode: the gateway access the plugins' Node services get (`NodeServiceContext.gateway`). */
  gateway?: GatewayAccess
  /** The process's environment variables plugins may read (`secret`); default `process.env`. */
  secret?: (name: string) => string | undefined
  /** How compile-time execution runs (docs/architecture.md 4.6, 10.6): the rules of `RunContext.env`, `admit`, `remote`. */
  execution?: ExecutionOptions
  /**
   * Compile for this audience only (`presmium build --audience`, P-55): the
   * sections and blocks whose `:audience:` or `{audience}` leaves it out are
   * removed before the plugin passes and compile-time execution.
   */
  audience?: string
  /**
   * Headmatter fields that replace those of the entry's own headmatter (a
   * field set to undefined is removed): a translation is compiled with its
   * original's plugins and renderer configuration (`compileTranslations`).
   */
  headmatter?: Record<string, unknown>
  /**
   * The deck directory, when the entry is not the deck's own `lecture.md`
   * but another file in it or under it (a translation): the plugins, the
   * public files, the components and the recordings are the deck's. Default:
   * the entry's directory.
   */
  deckDir?: string
}

/** A compilation for an audience (`CompilerOptions.audience`, `Compilation.audienceOf`): what it left out, and the scan of a build for it. */
export interface AudienceCompilation {
  name: string
  /** The content left out, with its longer sentences. */
  withheld: Withheld[]
  /**
   * Errors (`presmium.audience`) for the content left out whose sentences are
   * in a file under `dir` (a build's output), or only under `paths` (the
   * files and directories the build wrote in it). With `quote: false` the
   * messages leave the sentence out, for findings the audience itself reads.
   */
  scan(dir: string, paths?: string[], options?: { quote?: boolean }): Promise<Finding[]>
}

/** A declared environment and its provider, for `presmium check --env`. */
export interface DeclaredEnvironment {
  name: string
  spec: EnvironmentSpec
  provider: EnvironmentProvider
  context: EnvironmentContext
}

export interface Compilation {
  doc: IRDocument
  /** The options it was compiled with (a translation is compiled with the same). */
  options: CompilerOptions
  /** Every source file read, entry first. */
  files: string[]
  /**
   * What the IR depends on besides the source (`presmium dev` watches it):
   * files that directives and passes read in the working tree or declared
   * with `watch`, and the git revisions they read files at.
   */
  dependencies: { files: string[], revisions: Revision[] }
  /** Code nodes executed or answered from the cache. */
  runs: RunStats
  deckDir: string
  entry: string
  frontmatter: Record<string, unknown>
  workspaceRoot: string
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLock
  /** The loaded plugins: the operator plugins first, then the deck's. */
  plugins: LoadedPlugin[]
  /** Component name -> id of the plugin that registers it (`deck` for the deck's own `components/`). */
  components: Map<string, string>
  /** The deck's Node services: the host's, then the plugins' `services` (docs/architecture.md 4.6). */
  service<T>(token: ServiceToken<T>): T | undefined
  /** The operator's settings by plugin id (`presmium.workspace.yaml`, or the host's). */
  settings: OperatorSettings
  trust: TrustMode
  /** The LOCAL operator directory; absent in SHARED mode, or when the one given lies inside the workspace (an error). */
  operatorDir?: string
  /** Where the plugins came from, for the renderers' packages. */
  pluginSources: PluginSources
  /** The read scope of SHARED `presmium serve`. */
  scope?: ReadScope
  /** The headmatter's `execute` as far as it is well formed. */
  execute: ExecuteConfig
  /** The declared environments that a plugin provides. */
  environments: DeclaredEnvironment[]
  /** The compile-time executors: the plugins' and those of the declared environments. */
  executors: Executor[]
  /** The context of the compile-time runs. */
  runContext: RunContext
  /**
   * Runs a code node now with the executor compile time would choose and the
   * same execution options, without reading or writing recordings (MCP's
   * `run_code`, docs/architecture.md 10.6).
   */
  run(node: CodeNode, signal?: AbortSignal): Promise<RunResult>
  /** Set when compiled for an audience (`CompilerOptions.audience`). */
  audience?: AudienceCompilation
  /**
   * The document as an audience sees it (P-55): without the sections, blocks
   * and nested nodes for other audiences, steps and sections numbered again,
   * cross-references resolved in it, and without the blocks that still show
   * a sentence of what was left out (an error in its diagnostics); the
   * student view of `presmium serve` and of `tutor` tokens.
   */
  forAudience(name: string): IRDocument
  /** What `forAudience(name)` leaves out, and the scan of a build of it. */
  audienceOf(name: string): AudienceCompilation
  /**
   * The publication checks (P-54, docs/ir.md 2.11) in the view of each
   * renderer the deck builds: `presmium.links` and `presmium.forbid`; with
   * `externalLinks`, lychee checks the external links when it is installed.
   */
  publishChecks(options?: { externalLinks?: boolean }): Promise<Finding[]>
}

export interface CompileOptions {
  /** Remove the recorded runs of code no longer in the deck when the compilation has no errors (`presmium build`). */
  pruneCache?: boolean
}

/** Resolves a deck argument (a directory holding lecture.md, or an entry file) to its entry file. */
export function resolveEntry(deck: string): string {
  const path = resolve(deck)
  return existsSync(path) && statSync(path).isDirectory() ? join(path, DECK_ENTRY) : path
}

interface Workspace {
  root: string
  src: SourceReader
  scope?: ReadScope
  settings: OperatorSettings
  /** Why the workspace configuration could not be read. */
  problem?: string
  sources: PluginSources
  operatorDir?: string
  /** Why the operator directory given is refused. */
  operatorProblem?: string
}

/** Loaded plugins and the Node services they provide, kept while the deck lists the same plugins. */
interface Plugins {
  key: string
  plugins: LoadedPlugin[]
  problems: PluginProblem[]
  services: NodeServices
}

export class Compiler {
  readonly entry: string
  readonly deckDir: string
  readonly options: CompilerOptions
  #workspace?: Workspace
  readonly #committed: CommittedFiles = new Map()
  #plugins?: Plugins
  #parser?: { key: string, parser: Parser }
  /** The executors of the declared environments, kept between compilations (environments.ts). */
  readonly #environments = new Map<string, Executor>()

  constructor(deck: string, options: CompilerOptions = {}) {
    this.entry = resolveEntry(deck)
    this.deckDir = options.deckDir ? resolve(options.deckDir) : dirname(this.entry)
    this.options = options
  }

  async compile(options: CompileOptions = {}): Promise<Compilation> {
    const workspace = this.#workspace ??= await this.#openWorkspace()
    const { root: workspaceRoot, src, scope, settings } = workspace
    const findings: Finding[] = []
    const report = (finding: Finding) => findings.push(finding)
    const refused = scope && !scope.allows(this.entry)
    const text = refused ? '' : withoutBom(await readFile(this.entry, 'utf8').catch(() => {
      throw new Error(`${this.entry} not found`)
    }))
    if (refused) report({ checkId: 'presmium.files', severity: 'error', message: refusedFile(this.entry), source: { file: this.entry, line: 1 } })
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

    // Plugins first: their directives are part of the syntax the parser accepts.
    const names = stringList(headmatter.plugins)
    const { plugins, problems, services } = await this.#loadPlugins(names, workspace, (loaded): NodeServiceContext => ({
      deckDir: this.deckDir,
      workspaceRoot,
      config: configOf(loaded),
      settings: settings[pluginId(loaded)] ?? {},
      lang,
      trust: this.options.trust ?? 'local',
      secret: this.options.secret ?? (name => process.env[name]),
      ...this.options.gateway ? { gateway: this.options.gateway } : {},
      ...workspace.operatorDir ? { operatorDir: workspace.operatorDir } : {},
      log: pluginLogger(pluginId(loaded)),
    }))
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
      for (const name of await directoryComponents(loaded.dir)) if (!components.has(name)) components.set(name, pluginId(loaded))
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
    // The deck's own components, which the browser renderers load as they load the plugins' (R-47).
    for (const name of await directoryComponents(this.deckDir)) components.set(name, DECK_PLUGIN)
    // The declared environments: their executors run the blocks that name them (docs/ir.md 2.7).
    const secret = this.options.secret ?? (name => process.env[name])
    const environmentContext: EnvironmentContext = { deckDir: this.deckDir, workspaceRoot, secret, ...this.options.gateway ? { gateway: this.options.gateway } : {}, log: pluginLogger('presmium.execute') }
    const declared = environmentProviders(execute, providers, report, at)
    executors.push(...await environmentExecutors(execute, declared, environmentContext, this.#environments, report, at))

    // Pass 1: parse and expand includes.
    const parser = this.#parserFor(directives, roles)
    parser.scope = scope
    const source = await parser.expand(this.entry)
    findings.push(...source.findings)
    dependencies.watch(...source.missing)
    const { title: _title, lang: _lang, plugins: _plugins, presmium: _presmium, renderers, sectionDepth: depth, execute: _execute, translations: _translations, translationOf: _translationOf, ...rest } = headmatter
    const title = typeof headmatter.title === 'string' ? headmatter.title : basename(this.entry, extname(this.entry))
    const sectionDepth = Number.isInteger(depth) && (depth as number) >= 1 ? depth as number : 2

    // Passes 2 to 5: sections, directives, roles, steps. The headings an `{include}` with `:audience:` holds still open sections;
    // what follows such an `{include}` before the next heading joins the last of them.
    const lifted = liftScopes(source.children, sectionDepth, (node, audience) => report({
      checkId: 'presmium.audience',
      severity: 'warning',
      message: `this content follows an {include} with :audience: whose file opens a section, so it is part of that section, which is only for ${audience.join(', ')}`,
      hint: 'start a section of its own with a heading after the {include}, or move it before the {include}',
      source: sourceOf(node, this.entry),
    }))
    // Where the source marks content for audiences: a view for another audience drops the findings there too.
    const marks = audienceMarks(lifted, this.entry)
    const raw = splitSections(lifted, { entry: this.entry, title, sectionDepth }, report)
    const rendererIds = new Set([...BUILTIN_RENDERERS, ...isRecord(renderers) ? Object.keys(renderers) : []])
    const ctx = { entry: this.entry, deckDir: this.deckDir, workspaceRoot, lang, renderers: rendererIds, parser, directives, roles, components, execute, report, watch }
    const sections: IRSection[] = []
    for (const [i, section] of raw.entries()) {
      const { blocks: drafts, hints, config, audience } = await sectionBlocks(section.nodes, ctx)
      const { blocks, steps } = scheduleSteps(drafts, report)
      drafts.forEach((draft, j) => {
        if (draft.audience) blocks[j]!.audience = draft.audience
      })
      sections.push({
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
      })
    }

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
    // The translations, checked against the whole deck: a build for an audience follows the same digest.
    applyTranslations(doc, translationFields(headmatter), report)
    // For an audience: the other audiences' content goes before any pass, executor or renderer sees it (P-55);
    // so do the findings located in it, which may name it (a file it includes, a role it uses), with a count left.
    let audience: AudienceCompilation | undefined
    if (this.options.audience) {
      const name = this.options.audience
      const view = audienceView(doc, name, marks)
      doc.sections = view.doc.sections
      audience = audienceCompilation(name, withheld(view.removed, doc))
      const left = findings.filter(finding => !view.keeps(finding))
      findings.splice(0, findings.length, ...findings.filter(view.keeps))
      if (left.length > 0) {
        const severity = left.some(f => f.severity === 'error') ? 'error' : left.some(f => f.severity === 'warning') ? 'warning' : 'info'
        report({ checkId: 'presmium.audience', severity, message: `${left.length} finding${left.length === 1 ? ' is' : 's are'} in the content left out for ${name}, not shown here: presmium check without --audience shows ${left.length === 1 ? 'it' : 'them'}`, source: { file: this.entry, line: 1 } })
      }
    }
    checkRuns(doc, execute, report)

    numberFootnotes(doc, source.files)

    // Pass 6: plugin passes, by `order`, then by plugin declaration order.
    const lockFile = join(this.deckDir, ANCHOR_LOCK_PATH)
    let lock = AnchorLock.empty()
    try {
      lock = AnchorLock.parse(await readFile(lockFile, 'utf8').catch(() => undefined))
    } catch (error) {
      report({ checkId: 'presmium.lock', severity: 'error', message: errorMessage(error), source: { file: lockFile, line: 1 } })
    }
    const cache = new FreezeCache(join(this.deckDir, FREEZE_DIR), relative(this.deckDir, this.entry), scope)
    const runContext = this.#runContext(workspaceRoot, settings, service, lang)
    const passes = plugins.flatMap(loaded => (loaded.plugin?.passes ?? []).map(pass => ({ pass, loaded })))
      .sort((a, b) => (a.pass.order ?? 0) - (b.pass.order ?? 0))
    const runPass = async ({ pass, loaded }: { pass: IRPass, loaded: LoadedPlugin }) => {
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
    }
    // The IR is checked before the passes and after each, so what breaks it, a directive or a pass, is
    // named and nothing runs on a broken IR (R-32).
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

    // Cross-references take the text of their targets once every pass has shaped the IR;
    // pass 7, compile-time execution; then the plugin passes that work on its outputs.
    let runs: RunStats = { executed: 0, cached: 0, refused: [] }
    // The references resolution fills in, which a view for an audience resolves again in itself.
    let filled = new WeakSet<object>()
    if (invalid.length === 0) {
      filled = emptyReferences(doc)
      resolveReferences(doc, report)
      runs = await executePass(doc, executors, cache, report, { ...this.options.execution, rerun: execute.rerun === 'environment', context: runContext })
      for (const step of passes.filter(({ pass }) => pass.after === 'execute')) await runPass(step)
      // Pass 8: validation.
      invalid = validateIR(doc, this.entry)
    }
    findings.push(...invalid)
    // Files the read scope refused on the way (the source reader, the execution cache) are errors of the deck.
    for (const file of scope?.refused ?? []) {
      if (!findings.some(f => f.checkId === 'presmium.files' && f.message === refusedFile(file))) {
        report({ checkId: 'presmium.files', severity: 'error', message: refusedFile(file), source: { file: this.entry, line: 1 } })
      }
    }
    scope?.refused.clear()
    doc.diagnostics = sortFindings(findings)
    // A build for an audience compiled only part of the deck: the recordings of the rest stay.
    if (options.pruneCache && !audience && !findings.some(f => f.severity === 'error')) cache.prune()
    const publish = { doc, entry: this.entry, deckDir: this.deckDir, workspaceRoot, renderers: publishedRenderers(doc, plugins) }

    return {
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
      trust: this.options.trust ?? 'local',
      operatorDir: workspace.operatorDir,
      pluginSources: workspace.sources,
      scope,
      execute,
      environments: [...declared].map(([name, provider]) => ({ name, spec: execute.environments![name]!, provider, context: environmentContext })),
      executors,
      runContext,
      run: (node, signal) => this.#run(doc, node, executors, runContext, signal),
      ...audience ? { audience } : {},
      forAudience: name => audienceDocument(doc, name, filled, marks),
      audienceOf: (name) => {
        const view = audienceView(doc, name)
        return audienceCompilation(name, withheld(view.removed, view.doc))
      },
      publishChecks: async (checks = {}) => [...await checkLinks(publish, checks), ...checkForbidden(publish, headmatter)],
    }
  }

  /**
   * The context of the runs of a compilation: the environment the code may
   * see (`execution.env` rules, with `settings.presmium.exec.passEnv`), the
   * process sandbox when a Node service provides one, the gateway access and
   * the deck's language.
   */
  #runContext(workspaceRoot: string, settings: OperatorSettings, service: <T>(token: ServiceToken<T>) => T | undefined, lang: string): RunContext {
    const passEnv = stringList(settings['presmium.exec']?.passEnv)
    const sandbox = service(PROCESS_SANDBOX)
    return {
      env: runEnvironment(this.options.execution?.env ?? 'local', passEnv, workspaceRoot),
      ...sandbox ? { sandbox } : {},
      ...this.options.gateway ? { gateway: this.options.gateway } : {},
      lang,
    }
  }

  /** A code node run now (`Compilation.run`); a block of a session runs after the session's blocks before it, in a session of its own. */
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
    const remote = this.options.execution?.remote
    const results = await Promise.all(requests.map(r => remote ? remote.run(executor.id, r, context.env, signal) : executor.run(r, signal, context)))
    if (session) await (remote ? remote.endSession(executor.id, session) : executor.endSession?.(session))
    return results.at(-1)!
  }

  /** The workspace of the deck: its root, settings, plugin sources and operator directory, found once. */
  async #openWorkspace(): Promise<Workspace> {
    const root = await findWorkspaceRoot(this.deckDir)
    const scope = this.options.scope ? new ReadScope(root) : undefined
    const read = this.options.settings ? { settings: this.options.settings } : workspaceSettings(root)
    const sources: PluginSources = { workspaceRoot: root, listed: operatorPlugins(read.settings), bundled: this.options.bundled, policy: this.options.policy }
    const workspace: Workspace = { root, src: createSourceReader(root, scope), scope, settings: read.settings, problem: read.problem, sources }
    if ((this.options.trust ?? 'local') === 'local') {
      try {
        workspace.operatorDir = operatorDir(root, this.options.operatorDir ?? process.env.PRESMIUM_OPERATOR_DIR)
      } catch (error) {
        workspace.operatorProblem = errorMessage(error)
      }
    }
    return workspace
  }

  /**
   * The operator plugins and the deck's, loaded again when the deck lists
   * other plugins; their Node services are created once, with the deck's
   * configuration of that time.
   */
  async #loadPlugins(names: string[], workspace: Workspace, context: (loaded: LoadedPlugin) => NodeServiceContext): Promise<Plugins> {
    const key = JSON.stringify(names)
    if (this.#plugins?.key === key) return this.#plugins
    const operators = await loadOperatorPlugins(workspace.sources)
    const deck = await loadPlugins(this.deckDir, names, workspace.sources)
    const dirs = new Set(operators.plugins.map(loaded => loaded.dir))
    const plugins = [...operators.plugins, ...deck.plugins.filter(loaded => !dirs.has(loaded.dir))]
    const problems = [...operators.problems, ...deck.problems]
    const services = new NodeServices(this.options.services, this.options.reserved)
    for (const loaded of plugins) addServices(services, loaded, context(loaded), problems)
    this.#plugins = { key, plugins, problems, services }
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

/** Registers the Node services a plugin provides (`PresmiumNodePlugin.services`), its problems in `problems`. */
function addServices(services: NodeServices, loaded: LoadedPlugin, context: NodeServiceContext, problems: PluginProblem[]): void {
  const contribute = loaded.plugin?.services
  if (!contribute) return
  try {
    for (const message of services.add(pluginId(loaded), contribute.call(loaded.plugin, context))) problems.push({ name: loaded.name, severity: 'warning', message })
  } catch (error) {
    problems.push({ name: loaded.name, severity: 'error', message: `plugin ${pluginId(loaded)}: services() failed: ${errorMessage(error)}` })
  }
}

/**
 * The operator plugins of the workspace at `root` (D14), loaded as the
 * compiler of a document there loads them (`options` as its), with their
 * Node services, for what is no document: the home page of `presmium serve`,
 * whose server routes and browser parts are theirs too.
 */
export async function workspacePlugins(root: string, options: CompilerOptions = {}): Promise<{ plugins: LoadedPlugin[], problems: PluginProblem[], service<T>(token: ServiceToken<T>): T | undefined }> {
  const settings = options.settings ?? workspaceSettings(root).settings
  const { plugins, problems } = await loadOperatorPlugins({ workspaceRoot: root, listed: operatorPlugins(settings), bundled: options.bundled, policy: options.policy })
  const trust = options.trust ?? 'local'
  let operator: string | undefined
  if (trust === 'local') {
    try {
      operator = operatorDir(root, options.operatorDir ?? process.env.PRESMIUM_OPERATOR_DIR)
    } catch {
      // The documents' compilations report it.
    }
  }
  const services = new NodeServices(options.services, options.reserved)
  for (const loaded of plugins) {
    addServices(services, loaded, {
      deckDir: root,
      workspaceRoot: root,
      config: {},
      settings: settings[pluginId(loaded)] ?? {},
      lang: DEFAULT_LANG,
      trust,
      secret: options.secret ?? (name => process.env[name]),
      ...options.gateway ? { gateway: options.gateway } : {},
      ...operator ? { operatorDir: operator } : {},
      log: pluginLogger(pluginId(loaded)),
    }, problems)
  }
  return { plugins, problems, service: token => services.get(token) }
}

/** What a view for the audience `name` left out, with its sentences (`left`), and the scan of a build of it. */
export function audienceCompilation(name: string, left: Withheld[]): AudienceCompilation {
  return { name, withheld: left, scan: (dir, paths, options = {}) => scanOutputs(left, paths ?? [dir], name, dir, options.quote) }
}

/** A headmatter with the fields of `replaced` in place of its own; a field `replaced` sets to undefined is removed. */
function withHeadmatter(own: Record<string, unknown>, replaced?: Record<string, unknown>): Record<string, unknown> {
  if (!replaced) return own
  const merged = { ...own, ...replaced }
  for (const [key, value] of Object.entries(replaced)) if (value === undefined) delete merged[key]
  return merged
}

/** 1-based line of the first frontmatter line that mentions `text`; 1 when absent. */
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

/**
 * The renderers whose views the publication checks read: those the
 * headmatter configures, else the built-in ones and those of the plugins (as
 * a build without `--to` runs them).
 */
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
