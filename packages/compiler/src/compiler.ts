/**
 * The compiler: MyST source to IR through the passes of docs/ir.md section 4.
 * A `Compiler` keeps its loaded plugins and parsed files between runs, so
 * `presmium dev` recompiles incrementally: only changed files are re-parsed
 * and only changed code is re-executed.
 */
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { ANCHOR_LOCK_PATH, AnchorLock, DEFAULT_LANG, IR_VERSION, createAnchorResolverRegistry, errorMessage, isRecord } from '@presmium/kernel'
import type { AnchorResolverRegistry, Executor, Finding, IRDocument, IRPass, IRSection, PassContext, SourceReader } from '@presmium/kernel'
import { BUILTIN_DIRECTIVES, sectionBlocks } from './blocks.ts'
import type { PluginDirective } from './blocks.ts'
import { Dependencies } from './dependencies.ts'
import type { CommittedFiles, Revision } from './dependencies.ts'
import { executePass, FREEZE_DIR, FreezeCache } from './execute.ts'
import type { RunStats } from './execute.ts'
import { numberFootnotes } from './footnotes.ts'
import { DECK_PLUGIN, directoryComponents, loadPlugins, pluginId } from './plugins.ts'
import type { LoadedPlugin, PluginProblem } from './plugins.ts'
import { resolveReferences } from './references.ts'
import { splitSections } from './sections.ts'
import { Parser, readFrontmatter, withoutBom } from './source.ts'
import { scheduleSteps } from './steps.ts'
import { validateIR } from './validate.ts'
import { createSourceReader, findWorkspaceRoot } from './workspace.ts'

/** Entry file of a deck directory. */
export const DECK_ENTRY = 'lecture.md'

/** Renderer ids `{only}` may name besides those the headmatter configures. */
const BUILTIN_RENDERERS = ['web', 'slides', 'notebook']

export interface Compilation {
  doc: IRDocument
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
  plugins: LoadedPlugin[]
  /** Component name -> id of the plugin that registers it (`deck` for the deck's own `components/`). */
  components: Map<string, string>
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

export class Compiler {
  readonly entry: string
  readonly deckDir: string
  #workspace?: { root: string, src: SourceReader }
  readonly #committed: CommittedFiles = new Map()
  #plugins?: { key: string, plugins: LoadedPlugin[], problems: PluginProblem[] }
  #parser?: { key: string, parser: Parser }

  constructor(deck: string) {
    this.entry = resolveEntry(deck)
    this.deckDir = dirname(this.entry)
  }

  async compile(options: CompileOptions = {}): Promise<Compilation> {
    const text = withoutBom(await readFile(this.entry, 'utf8').catch(() => {
      throw new Error(`${this.entry} not found`)
    }))
    const findings: Finding[] = []
    const report = (finding: Finding) => findings.push(finding)
    const headmatter = readFrontmatter(text)
    this.#workspace ??= await findWorkspaceRoot(this.deckDir).then(root => ({ root, src: createSourceReader(root) }))
    const { root: workspaceRoot, src } = this.#workspace
    const lang = typeof headmatter.lang === 'string' && headmatter.lang.trim() ? headmatter.lang.trim() : DEFAULT_LANG
    const dependencies = new Dependencies(workspaceRoot, this.#committed)
    const watch = (...files: string[]) => dependencies.watch(...files)

    // Plugins first: their directives are part of the syntax the parser accepts.
    const names = stringList(headmatter.plugins)
    const { plugins, problems } = await this.#loadPlugins(names)
    const at = (name: string) => ({ file: this.entry, line: frontmatterLine(text, name) })
    for (const p of problems) report({ checkId: 'presmium.plugins', severity: p.severity, message: p.message, source: at(p.name) })
    const presmium = isRecord(headmatter.presmium) ? headmatter.presmium : {}
    const configOf = (plugin: LoadedPlugin) => {
      const config = presmium[pluginId(plugin)]
      return isRecord(config) ? config : {}
    }

    const directives = new Map<string, PluginDirective>()
    const resolvers = createAnchorResolverRegistry()
    const executors: Executor[] = []
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
      try {
        for (const resolver of plugin.resolvers ?? []) resolvers.register(resolver)
      } catch (error) {
        report({ checkId: 'presmium.plugins', severity: 'error', message: `plugin ${plugin.id}: ${errorMessage(error)}`, source: at(loaded.name) })
      }
      executors.push(...plugin.executors ?? [])
    }
    // The deck's own components, which the browser renderers load as they load the plugins' (R-47).
    for (const name of await directoryComponents(this.deckDir)) components.set(name, DECK_PLUGIN)

    // Pass 1: parse and expand includes.
    const parser = this.#parserFor(directives)
    const source = await parser.expand(this.entry)
    findings.push(...source.findings)
    dependencies.watch(...source.missing)
    const { title: _title, lang: _lang, plugins: _plugins, presmium: _presmium, renderers, sectionDepth: depth, execute, ...rest } = headmatter
    const title = typeof headmatter.title === 'string' ? headmatter.title : basename(this.entry, extname(this.entry))
    const sectionDepth = Number.isInteger(depth) && (depth as number) >= 1 ? depth as number : 2

    // Passes 2 to 5: sections, directives, roles, steps.
    const raw = splitSections(source.children, { entry: this.entry, title, sectionDepth }, report)
    const rendererIds = new Set([...BUILTIN_RENDERERS, ...isRecord(renderers) ? Object.keys(renderers) : []])
    const ctx = { entry: this.entry, deckDir: this.deckDir, workspaceRoot, lang, renderers: rendererIds, parser, directives, components, report, watch }
    const sections: IRSection[] = []
    for (const [i, section] of raw.entries()) {
      const { blocks: drafts, hints, config } = await sectionBlocks(section.nodes, ctx)
      const { blocks, steps } = scheduleSteps(drafts, report)
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
      })
    }

    const doc: IRDocument = {
      ir: IR_VERSION,
      meta: { ...rest, title, lang, entry: this.entry },
      config: {
        plugins: names,
        presmium,
        renderers: isRecord(renderers) ? recordOfRecords(renderers) : {},
      },
      sections,
      diagnostics: [],
    }

    numberFootnotes(doc, source.files)

    // Pass 6: plugin passes, by `order`, then by plugin declaration order.
    const lockFile = join(this.deckDir, ANCHOR_LOCK_PATH)
    let lock = AnchorLock.empty()
    try {
      lock = AnchorLock.parse(await readFile(lockFile, 'utf8').catch(() => undefined))
    } catch (error) {
      report({ checkId: 'presmium.lock', severity: 'error', message: errorMessage(error), source: { file: lockFile, line: 1 } })
    }
    const cache = new FreezeCache(join(this.deckDir, FREEZE_DIR), relative(this.deckDir, this.entry))
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
    let runs: RunStats = { executed: 0, cached: 0 }
    if (invalid.length === 0) {
      resolveReferences(doc, report)
      runs = await executePass(doc, executors, cache, report, { rerun: rerunOption(execute) })
      for (const step of passes.filter(({ pass }) => pass.after === 'execute')) await runPass(step)
      // Pass 8: validation.
      invalid = validateIR(doc, this.entry)
    }
    findings.push(...invalid)
    doc.diagnostics = sortFindings(findings)
    if (options.pruneCache && !findings.some(f => f.severity === 'error')) cache.prune()

    return {
      doc,
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
    }
  }

  async #loadPlugins(names: string[]) {
    const key = JSON.stringify(names)
    if (this.#plugins?.key !== key) this.#plugins = { key, ...await loadPlugins(this.deckDir, names) }
    return this.#plugins
  }

  #parserFor(directives: Map<string, PluginDirective>): Parser {
    const syntax = new Map([...BUILTIN_DIRECTIVES, ...[...directives.keys()].map(name => [name, false] as const)])
    const key = JSON.stringify([...syntax].sort())
    if (this.#parser?.key !== key) this.#parser = { key, parser: new Parser(syntax) }
    return this.#parser.parser
  }
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
 * `execute: { rerun: environment }` in the headmatter: code whose recording was
 * made with another runtime (e.g. another interpreter version) runs again
 * instead of reusing the recording.
 */
function rerunOption(execute: unknown): boolean {
  return isRecord(execute) && execute.rerun === 'environment'
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function recordOfRecords(value: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, isRecord(v) ? v : {}]))
}
