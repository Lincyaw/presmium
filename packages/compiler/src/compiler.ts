/**
 * The compiler: MyST source to IR through the passes of docs/ir.md section 4.
 * A `Compiler` keeps its loaded plugins and parsed files between runs, so
 * `presmium dev` recompiles incrementally: only changed files are re-parsed
 * and only changed code is re-executed.
 */
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { ANCHOR_LOCK_PATH, AnchorLock, IR_VERSION, createAnchorResolverRegistry } from '@presmium/kernel'
import type { AnchorResolverRegistry, DeckSlide, Executor, Finding, IRDocument, IRSection, SourceReader } from '@presmium/kernel'
import { BUILTIN_DIRECTIVES, sectionBlocks } from './blocks.ts'
import type { PluginDirective } from './blocks.ts'
import { executePass, FREEZE_DIR, FreezeCache } from './execute.ts'
import type { RunStats } from './execute.ts'
import { loadPlugins, pluginComponents, pluginId } from './plugins.ts'
import type { LoadedPlugin, PluginProblem } from './plugins.ts'
import { splitSections } from './sections.ts'
import { Parser, readFrontmatter } from './source.ts'
import { scheduleSteps } from './steps.ts'
import { validateIR } from './validate.ts'
import { createSourceReader, errorMessage, findWorkspaceRoot, isRecord } from './workspace.ts'

/** Entry file of a deck directory. */
export const DECK_ENTRY = 'lecture.md'

/**
 * Transition until every deck is MyST (wave MR): a directory without
 * lecture.md falls back to its Slidev entry, whose plugins are listed as `addons`.
 */
const LEGACY_ENTRY = 'slides.md'

export interface Compilation {
  doc: IRDocument
  /** Every source file read, entry first. */
  files: string[]
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
  /** One entry per section, for checks written against `CheckContext.slides`. */
  slides: DeckSlide[]
}

/** Resolves a deck argument (a directory holding lecture.md, or an entry file) to its entry file. */
export function resolveEntry(deck: string): string {
  const path = resolve(deck)
  if (!existsSync(path) || !statSync(path).isDirectory()) return path
  const legacy = join(path, LEGACY_ENTRY)
  return !existsSync(join(path, DECK_ENTRY)) && existsSync(legacy) ? legacy : join(path, DECK_ENTRY)
}

export class Compiler {
  readonly entry: string
  readonly deckDir: string
  #workspaceRoot?: string
  #plugins?: { key: string, plugins: LoadedPlugin[], problems: PluginProblem[] }
  #parser?: { key: string, parser: Parser }

  constructor(deck: string) {
    this.entry = resolveEntry(deck)
    this.deckDir = dirname(this.entry)
  }

  async compile(): Promise<Compilation> {
    const text = await readFile(this.entry, 'utf8').catch(() => {
      throw new Error(`${this.entry} not found`)
    })
    const findings: Finding[] = []
    const report = (finding: Finding) => findings.push(finding)
    const headmatter = readFrontmatter(text)
    const workspaceRoot = this.#workspaceRoot ??= await findWorkspaceRoot(this.deckDir)
    const src = createSourceReader(workspaceRoot)

    // Plugins first: their directives are part of the syntax the parser accepts.
    const names = stringList(headmatter.plugins ?? headmatter.addons)
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
      for (const name of await pluginComponents(loaded)) if (!components.has(name)) components.set(name, pluginId(loaded))
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

    // Pass 1: parse and expand includes.
    const parser = this.#parserFor(directives)
    const source = await parser.expand(this.entry)
    findings.push(...source.findings)
    const { title: _title, plugins: _plugins, addons: _addons, presmium: _presmium, renderers, sectionDepth: depth, ...rest } = headmatter
    const title = typeof headmatter.title === 'string' ? headmatter.title : basename(this.entry, extname(this.entry))
    const sectionDepth = Number.isInteger(depth) && (depth as number) >= 1 ? depth as number : 2

    // Passes 2 to 5: sections, directives, roles, steps.
    const raw = splitSections(source.children, { entry: this.entry, title, sectionDepth }, report)
    const ctx = { entry: this.entry, deckDir: this.deckDir, workspaceRoot, parser, directives, components, report }
    const sections: IRSection[] = []
    for (const [i, section] of raw.entries()) {
      const { blocks: drafts, hints } = await sectionBlocks(section.nodes, ctx)
      const { blocks, steps } = scheduleSteps(drafts, report)
      sections.push({ id: section.id, index: i + 1, title: section.title, depth: section.depth, source: section.source, steps, hints, blocks })
    }

    const doc: IRDocument = {
      ir: IR_VERSION,
      meta: { ...rest, title, entry: this.entry },
      config: {
        plugins: names,
        presmium,
        renderers: isRecord(renderers) ? recordOfRecords(renderers) : {},
      },
      sections,
      diagnostics: [],
    }

    // Pass 6: plugin passes, by `order`, then by plugin declaration order.
    const lockFile = join(this.deckDir, ANCHOR_LOCK_PATH)
    let lock = AnchorLock.empty()
    try {
      lock = AnchorLock.parse(await readFile(lockFile, 'utf8').catch(() => undefined))
    } catch (error) {
      report({ checkId: 'presmium.lock', severity: 'error', message: errorMessage(error), source: { file: lockFile, line: 1 } })
    }
    const cache = new FreezeCache(join(this.deckDir, FREEZE_DIR))
    const passes = plugins.flatMap(loaded => (loaded.plugin?.passes ?? []).map(pass => ({ pass, loaded })))
      .sort((a, b) => (a.pass.order ?? 0) - (b.pass.order ?? 0))
    for (const { pass, loaded } of passes) {
      try {
        await pass.run(doc, {
          deckDir: this.deckDir,
          workspaceRoot,
          src,
          resolvers,
          lock: lock.toJSON(),
          executors,
          cache,
          config: configOf(loaded),
          report: finding => report({ ...finding, source: finding.source ?? at(loaded.name) }),
        })
      } catch (error) {
        report({ checkId: 'presmium.plugins', severity: 'error', message: `pass ${pass.name} of plugin ${pluginId(loaded)} failed: ${errorMessage(error)}`, source: at(loaded.name) })
      }
    }

    // Pass 7: compile-time execution; pass 8: validation.
    const runs = await executePass(doc, executors, cache, report)
    findings.push(...validateIR(doc))
    doc.diagnostics = sortFindings(findings)

    const slides = await sectionSlides(sections, parser)
    return { doc, files: source.files, runs, deckDir: this.deckDir, entry: this.entry, frontmatter: headmatter, workspaceRoot, src, resolvers, lock, plugins, slides }
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

async function sectionSlides(sections: IRSection[], parser: Parser): Promise<DeckSlide[]> {
  const slides: DeckSlide[] = []
  for (const section of sections) {
    const text = (await parser.read(section.source.file))?.text ?? ''
    const lines = text.split('\n').slice(section.source.line - 1, section.source.endLine ?? section.source.line)
    slides.push({ index: section.index, file: section.source.file, line: section.source.line, frontmatter: {}, content: lines.join('\n') })
  }
  return slides
}

/** 1-based line of the first frontmatter line that mentions `text`; 1 when absent. */
export function frontmatterLine(text: string, needle: string): number {
  const lines = text.split(/\r?\n/)
  const end = lines.indexOf('---', 1)
  const index = lines.slice(0, end < 0 ? undefined : end).findIndex(line => line.includes(needle))
  return index < 0 ? 1 : index + 1
}

export function sortFindings(findings: Finding[]): Finding[] {
  const file = (f: Finding) => f.source?.file ?? ''
  const line = (f: Finding) => f.source?.line ?? 0
  return findings.toSorted((a, b) => file(a) < file(b) ? -1 : file(a) > file(b) ? 1 : line(a) - line(b))
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function recordOfRecords(value: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, isRecord(v) ? v : {}]))
}
