/**
 * Renderer registry and dispatch (docs/ir.md section 6). A renderer is the
 * `renderer` of a plugin: one listed in `plugins`, or the package installed
 * for a renderer id (`renderers.<id>.package`, else the default package).
 * Each renderer gets a view of the IR without the blocks `only` excludes;
 * blocks it does not support at all are listed in the build report. The
 * web renderer also gets the translations the deck declares, compiled
 * (`RenderContext.translations`, docs/ir.md 2.12). The local files the
 * renderers publish are those `RenderContext.localAsset` gives (docs/ir.md
 * 6.2): files, and directories inside the deck as a file listing; a local
 * reference that cannot be published is a warning on its line.
 */
import { existsSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { errorMessage, irBlocks, isRecord } from '@presmium/kernel'
import type { ComponentNode, ComponentRenderer, Finding, IRBlock, IRDocument, IRSection, RenderContext, RenderDevServer, RenderOutput, Renderer, RendererExtension, SourcePos } from '@presmium/kernel'
import { unshown } from './audience.ts'
import { audienceCompilation } from './compiler.ts'
import type { AudienceCompilation, Compilation, Compiler } from './compiler.ts'
import { revisionFiles } from './dependencies.ts'
import { localAsset, portable, relativeIR } from './paths.ts'
import { directoryAsset, inside, lineOf, publishesDirectory } from './published.ts'
import { loadPlugin, pluginId } from './plugins.ts'
import { compileTranslations } from './translations.ts'
import type { CompiledTranslation } from './translations.ts'
import { refusedFile } from './workspace.ts'

/** Parent of the renderers' work directories in `build`, relative to the deck. */
export const WORK_DIR = '.presmium'

/** Package that provides each built-in renderer id. */
export const DEFAULT_RENDERER_PACKAGES: Record<string, string> = {
  web: '@presmium/web',
  slides: '@presmium/render-slides',
  notebook: '@presmium/render-notebook',
}

export interface InstalledRenderer {
  renderer: Renderer
  /** Package that provides it. */
  package: string
}

export interface RendererOutput {
  renderer: string
  outDir: string
  /** The renderer's work directory (`RenderContext.workDir`), e.g. the Slidev deck of the slides renderer. */
  workDir: string
  /** The public base path the output is served under (`RenderContext.base`). */
  base: string
  skipped: RenderOutput['skipped']
}

export interface BuildReport {
  /** Path of the IR written next to the renderer outputs. */
  ir: string
  outputs: RendererOutput[]
  /** Compile diagnostics followed by renderer findings. */
  findings: Finding[]
}

/** Renderers available to a deck, by id; `missing` explains the configured ones that are not. */
async function installedRenderers(compilation: Compilation): Promise<{ renderers: Map<string, InstalledRenderer>, missing: Map<string, string> }> {
  const renderers = new Map<string, InstalledRenderer>()
  const missing = new Map<string, string>()
  for (const { name, plugin } of compilation.plugins) {
    if (plugin?.renderer && !renderers.has(plugin.renderer.id)) renderers.set(plugin.renderer.id, { renderer: plugin.renderer, package: name })
  }
  const config = compilation.doc.config.renderers
  for (const id of new Set([...Object.keys(DEFAULT_RENDERER_PACKAGES), ...Object.keys(config)])) {
    if (renderers.has(id)) continue
    const pkg = typeof config[id]?.package === 'string' ? config[id].package as string : DEFAULT_RENDERER_PACKAGES[id]
    if (!pkg) {
      missing.set(id, 'no package provides it; set renderers.<id>.package')
      continue
    }
    const { loaded, problem } = await loadPlugin(pkg, compilation.deckDir, compilation.pluginSources)
    const renderer = loaded?.plugin?.renderer
    if (renderer?.id === id) renderers.set(id, { renderer, package: pkg })
    else missing.set(id, problem?.message ?? `package ${pkg} provides no renderer "${id}"`)
  }
  return { renderers, missing }
}

/**
 * The renderers to run: `to` when given (missing ones are errors), else the
 * ids configured in `renderers` (missing ones are warnings), else all installed.
 */
async function selectRenderers(compilation: Compilation, to?: string[]): Promise<{ selected: InstalledRenderer[], findings: Finding[] }> {
  const { renderers, missing } = await installedRenderers(compilation)
  const configured = Object.keys(compilation.doc.config.renderers)
  const ids = to ?? (configured.length > 0 ? configured : [...renderers.keys()])
  const findings: Finding[] = []
  const selected: InstalledRenderer[] = []
  for (const id of ids) {
    const found = renderers.get(id)
    if (found) selected.push(found)
    else findings.push(renderFinding(compilation, to ? 'error' : 'warning', `renderer ${id} is not installed: ${missing.get(id) ?? 'unknown renderer id'}`))
  }
  return { selected, findings }
}

/** The renderers run together: their ids, and the public base of each (`RenderContext.base`). */
interface Run {
  ids: string[]
  bases: Map<string, string>
}

/** `renderers.<id>.base` as a public base path, `/` or `/<path>/`; undefined when it is not set. */
function configuredBase(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const path = value.trim().replace(/^\/+|\/+$/g, '')
  return path ? `/${path}/` : '/'
}

/**
 * The renderers run together and their public bases: the configured base;
 * else, in a build (`shared`) of two or more site renderers none of which
 * sets one, `/<id>/` for each, so the output directory deploys as one site
 * (C-13); else `/`.
 */
function runOf(compilation: Compilation, selected: InstalledRenderer[], shared: boolean): Run {
  const renderers = selected.map(({ renderer }) => renderer)
  const configured = new Map(renderers.map(({ id }) => [id, configuredBase(compilation.doc.config.renderers[id]?.base)]))
  const sites = renderers.filter(renderer => renderer.site)
  const together = shared && sites.length > 1 && sites.every(({ id }) => configured.get(id) === undefined)
  return {
    ids: renderers.map(({ id }) => id),
    bases: new Map(renderers.map(({ id, site }) => [id, configured.get(id) ?? (together && site ? `/${id}/` : '/')])),
  }
}

export interface BuildOptions {
  outDir: string
  to?: string[]
  /**
   * Build the version for this audience (P-55) of a compilation of the
   * whole deck: its view for the audience (`Compilation.forAudience`), with
   * the translations compiled for it; the student view of a host's
   * `ServerHost.build`. A compilation for an audience
   * (`CompilerOptions.audience`) builds its own.
   */
  audience?: string
  /** For an audience: whether the scan's findings quote the sentences they found (default true); not for findings the audience reads. */
  quote?: boolean
}

/**
 * Writes `<outDir>/ir.json` (with paths relative to the deck, `relativeIR`)
 * and runs the selected renderers, each into `<outDir>/<id>`. They write
 * directories of their own, so they run at the same time; the report lists
 * them in the order selected. A build for an audience then scans what it
 * wrote, the IR and each renderer's directory, for the sentences of what the
 * audience's version left out, of the deck or of a translation (`presmium.audience`).
 */
export async function build(whole: Compilation, options: BuildOptions): Promise<BuildReport> {
  const compilation = options.audience && options.audience !== whole.audience?.name
    ? { ...whole, doc: whole.forAudience(options.audience), audience: whole.audienceOf(options.audience) }
    : whole
  const { doc } = compilation
  const ir = await writeIR(relativeIR(doc, compilation.deckDir, compilation.workspaceRoot), options.outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  if (selected.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer available; only the IR was written to ${ir}`))
  const run = runOf(compilation, selected, true)
  const translated = await translationsFor(compilation, run)
  findings.push(...translated.findings)
  const results = await Promise.all(selected.map(async ({ renderer }) => {
    const reported: Finding[] = []
    const ctx = renderContext(compilation, renderer.id, join(options.outDir, renderer.id), join(compilation.deckDir, WORK_DIR, renderer.id), run, reported)
    if (renderer.id === WEB) ctx.translations = translated.views
    const view = viewFor(doc, renderer.id)
    const unsupported = unsupportedBlocks(view, renderer, ctx.extensions)
    try {
      await mkdir(ctx.outDir, { recursive: true })
      const output = await renderer.build(view, ctx)
      const listed = new Set(output.skipped.map(s => `${s.section}#${s.block}`))
      const result: RendererOutput = { renderer: renderer.id, outDir: output.outDir, workDir: ctx.workDir, base: ctx.base, skipped: [...output.skipped, ...unsupported.filter(s => !listed.has(`${s.section}#${s.block}`))] }
      return { result, reported }
    } catch (error) {
      reported.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed: ${errorMessage(error)}`))
      return { reported }
    }
  }))
  const outputs = results.flatMap(({ result }) => result ? [result] : [])
  if (compilation.audience) {
    const scan = audienceScan(compilation.audience, translated.translations, doc)
    findings.push(...await scan.scan(options.outDir, [ir, ...outputs.map(output => output.outDir)], { quote: options.quote ?? true }))
  }
  // Each renderer reports the local references it cannot publish: a reference is reported once.
  return { ir, outputs, findings: unique([...doc.diagnostics, ...findings, ...results.flatMap(({ reported }) => reported)]) }
}

/**
 * The scan of a build for an audience: the sentences the deck's version for
 * it left out and those its translations' versions left out, but those any
 * of the versions shows (code is the same in every language).
 */
function audienceScan(audience: AudienceCompilation, translations: CompiledTranslation[], doc: IRDocument): AudienceCompilation {
  const kept = [doc, ...translations.map(translation => translation.doc)]
  const left = [audience, ...translations.flatMap(translation => (translation.audience ? [translation.audience] : []))].flatMap(own => own.withheld)
  return audienceCompilation(audience.name, unshown(left, kept))
}

/** The renderer that gets the translations (`RenderContext.translations`). */
const WEB = 'web'

/** The translations of a run with the web renderer, compiled, and the web renderer's views of them. */
async function translationsFor(compilation: Compilation, run: Run, compilers?: Map<string, Compiler>): Promise<{ translations: CompiledTranslation[], views: NonNullable<RenderContext['translations']>, findings: Finding[] }> {
  if (!run.ids.includes(WEB) || !compilation.doc.config.translations) return { translations: [], views: [], findings: [] }
  const { translations, findings } = await compileTranslations(compilation, compilers)
  return { translations, views: translations.map(({ lang, doc }) => ({ lang, doc: viewFor(doc, WEB) })), findings }
}

/** Findings without repetitions. */
function unique(findings: Finding[]): Finding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = JSON.stringify([finding.checkId, finding.severity, finding.message, finding.source?.file, finding.source?.line])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * What `build` does short of building: each selected renderer that can
 * writes what it generates in its work directory (`Renderer.prepare`), e.g.
 * the Slidev deck that `slidev export` works on. `outDir` is where a build
 * would write. `base` replaces the public base of every renderer, for a tool
 * that serves what is prepared under a base of its own: `slidev export`
 * serves the Slidev deck at the root (`/`).
 */
export async function prepare(compilation: Compilation, options: { outDir: string, to?: string[], base?: string }): Promise<{ outputs: Omit<RendererOutput, 'skipped'>[], findings: Finding[] }> {
  const { selected, findings } = await selectRenderers(compilation, options.to)
  const run = runOf(compilation, selected, true)
  const base = configuredBase(options.base)
  if (base) for (const id of run.ids) run.bases.set(id, base)
  const outputs: Omit<RendererOutput, 'skipped'>[] = []
  for (const { renderer } of selected) {
    const ctx = renderContext(compilation, renderer.id, join(options.outDir, renderer.id), join(compilation.deckDir, WORK_DIR, renderer.id), run, findings)
    if (!renderer.prepare) {
      findings.push(renderFinding(compilation, 'warning', `renderer ${renderer.id} prepares nothing`))
      continue
    }
    try {
      await renderer.prepare(viewFor(compilation.doc, renderer.id), ctx)
      outputs.push({ renderer: renderer.id, outDir: ctx.outDir, workDir: ctx.workDir, base: ctx.base })
    } catch (error) {
      findings.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed: ${errorMessage(error)}`))
    }
  }
  return { outputs, findings: [...compilation.doc.diagnostics, ...findings] }
}

export interface DevSession {
  /** Dev server URL per renderer id. */
  servers: { renderer: string, url: string }[]
  /** IR file kept up to date while watching. */
  ir: string
  close(): Promise<void>
}

export interface DevOptions {
  outDir: string
  to?: string[]
  /** The Presmium server of `presmium dev`, to which the renderers' dev servers proxy `/__presmium/` (`RenderContext.server`). */
  server?: { url: string }
  /** Called after every compilation, the first one included. */
  onCompile?(compilation: Compilation, findings: Finding[]): void
}

/**
 * Compiles, starts the dev server of each selected renderer, then recompiles
 * on every change of what the IR depends on, and pushes the new IR to the
 * servers: the source files, the files that directives and passes read (e.g.
 * referenced code, K-09), and the git files that name the revisions they read.
 * Each compilation is reported once what it depends on is watched. Changes
 * during a compilation make one more, which reads the source as it is then.
 */
export async function dev(compiler: Compiler, options: DevOptions): Promise<DevSession> {
  let started = Date.now()
  let compilation = await compiler.compile()
  const ir = await writeIR(compilation.doc, options.outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  const run = runOf(compilation, selected, false)
  // The translations are compiled again with the original; the web dev server reads them at each update.
  const translators = new Map<string, Compiler>()
  let translated = await translationsFor(compilation, run, translators)
  findings.push(...translated.findings)
  const translations = translated.views
  const servers: { renderer: string, url: string, server: RenderDevServer }[] = []
  for (const { renderer } of selected) {
    if (!renderer.dev) {
      findings.push(renderFinding(compilation, 'warning', `renderer ${renderer.id} has no dev server`))
      continue
    }
    const outDir = join(options.outDir, renderer.id)
    const ctx = renderContext(compilation, renderer.id, outDir, outDir, run, findings, options.server)
    if (renderer.id === WEB) ctx.translations = translations
    try {
      await mkdir(ctx.outDir, { recursive: true })
      const server = await renderer.dev(viewFor(compilation.doc, renderer.id), ctx)
      servers.push({ renderer: renderer.id, url: server.url, server })
    } catch (error) {
      findings.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed to start: ${errorMessage(error)}`))
    }
  }
  if (servers.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer dev server; watching the source and writing the IR to ${ir}`))
  // The servers load the plugins and renderer options they started with (R-35).
  const setup = (c: Compilation) => JSON.stringify([c.doc.config.plugins, c.doc.config.renderers])
  const initial = setup(compilation)

  const watchers = new Map<string, FSWatcher>()
  /** Watched directory -> names in it whose change matters: a watched file, or the next directory on the way to one not created yet. */
  let relevant = new Map<string, Set<string>>()
  let watched = new Set<string>()
  let timer: NodeJS.Timeout | undefined
  let running = Promise.resolve()
  let queued = false
  let closed = false
  // At most one compilation waits behind the one running: it reads the source when it starts (R-05).
  const schedule = () => {
    if (closed) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (queued) return
      queued = true
      running = running.then(() => {
        // This compilation reads what the changes still waiting for the timer changed.
        queued = false
        clearTimeout(timer)
        return recompile()
      })
    }, 30)
  }
  // Directories are watched rather than files, so editors and git, which save by renaming, are seen too.
  // A file changed after the compilation started, possibly before its directory was watched, is compiled again.
  const watchFiles = async () => {
    const { files, revisions } = compilation.dependencies
    const revs = new Map<string, Set<string>>()
    for (const { file, rev } of revisions) revs.set(dirname(file), (revs.get(dirname(file)) ?? new Set<string>()).add(rev))
    const git = await Promise.all([...revs].map(([dir, names]) => revisionFiles(dir, names)))
    if (closed) return
    watched = new Set([...compilation.files, ...files, ...git.flat(), ...translated.translations.flatMap(t => t.files)])
    const next = new Map<string, Set<string>>()
    for (const file of watched) {
      // A file in a directory not created yet (e.g. an include being written): its nearest existing ancestor is watched.
      let dir = dirname(file)
      let name = basename(file)
      while (!existsSync(dir) && dirname(dir) !== dir) {
        name = basename(dir)
        dir = dirname(dir)
      }
      next.set(dir, (next.get(dir) ?? new Set<string>()).add(name))
    }
    relevant = next
    for (const [dir, watcher] of watchers) {
      if (relevant.has(dir)) continue
      watcher.close()
      watchers.delete(dir)
    }
    for (const dir of relevant.keys()) {
      if (watchers.has(dir)) continue
      try {
        watchers.set(dir, watch(dir, (_event, name) => {
          if (name && relevant.get(dir)?.has(basename(name))) schedule()
        }))
      } catch {
        // A directory that cannot be watched (removed meanwhile) is looked at again after the next compilation.
      }
    }
    if (!queued && [...watched].some(file => modifiedSince(file, started))) schedule()
  }
  const recompile = async () => {
    started = Date.now()
    const reported: Finding[] = []
    try {
      compilation = await compiler.compile()
      await writeIR(compilation.doc, options.outDir)
      reported.push(...compilation.doc.diagnostics)
      translated = await translationsFor(compilation, run, translators)
      reported.push(...translated.findings)
      translations.splice(0, translations.length, ...translated.views)
      if (servers.length > 0 && setup(compilation) !== initial) {
        reported.push(renderFinding(compilation, 'warning', 'the plugins or renderers in the headmatter changed; restart presmium dev to load them in the dev servers'))
      }
      for (const { renderer, server } of servers) {
        await server.update(viewFor(compilation.doc, renderer)).catch((error: unknown) => {
          reported.push(renderFinding(compilation, 'error', `renderer ${renderer} failed to update: ${errorMessage(error)}`))
        })
      }
    } catch (error) {
      reported.push(renderFinding(compilation, 'error', errorMessage(error)))
    }
    await watchFiles()
    options.onCompile?.(compilation, reported)
  }
  await watchFiles()
  options.onCompile?.(compilation, [...compilation.doc.diagnostics, ...findings])

  return {
    servers: servers.map(({ renderer, url }) => ({ renderer, url })),
    ir,
    async close() {
      closed = true
      clearTimeout(timer)
      for (const watcher of watchers.values()) watcher.close()
      await running
      await Promise.all(servers.map(s => s.server.close()))
    },
  }
}

/**
 * Whether `file` was modified at or after `time`. File times can lag the
 * clock by a few milliseconds; one in the future (e.g. an extracted archive)
 * is not a modification, or every compilation would start another.
 */
function modifiedSince(file: string, time: number): boolean {
  const modified = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
  return modified >= time - 20 && modified <= Date.now()
}

/**
 * The document a renderer sees: blocks limited by `only` to other renderers
 * are left out, and so are the steps that only they took (R-03): the steps
 * left are numbered again, narration of a step left out goes with the step
 * before it, and the section's `stepMap` gives the new number of every step.
 */
export function viewFor(doc: IRDocument, renderer: string): IRDocument {
  let changed = false
  const keep = (blocks: IRBlock[]): IRBlock[] => blocks.flatMap((block) => {
    if (block.only && !block.only.includes(renderer)) {
      changed = true
      return []
    }
    return block.node.type === 'component' && block.node.children ? [{ ...block, node: { ...block.node, children: keep(block.node.children) } }] : [block]
  })
  const sections = doc.sections.map((section) => {
    changed = false
    const blocks = keep(section.blocks)
    return changed ? compactSteps({ ...section, blocks }) : section
  })
  return { ...doc, sections }
}

/** A section without the steps no visual block of it takes any more (see `viewFor`). */
function compactSteps(section: IRSection): IRSection {
  const used = new Set([0])
  for (const block of irBlocks(section.blocks)) {
    if (block.role !== 'visual') continue
    for (let step = block.at; step <= block.at + (block.span ?? 0); step++) used.add(step)
    if (block.until !== undefined) used.add(block.until)
  }
  if (used.size > section.steps) return section
  const stepMap: number[] = []
  for (let step = 0, n = -1; step <= section.steps; step++) stepMap.push(used.has(step) ? ++n : n)
  const map = (step: number) => stepMap[Math.min(step, section.steps)]!
  const renumber = (blocks: IRBlock[]): IRBlock[] => blocks.map(block => ({
    ...block,
    at: map(block.at),
    ...block.until === undefined ? {} : { until: map(block.until) },
    ...block.node.type === 'component' && block.node.children ? { node: { ...block.node, children: renumber(block.node.children) } } : {},
  }))
  return { ...section, steps: map(section.steps), stepMap, blocks: renumber(section.blocks) }
}

async function writeIR(doc: IRDocument, outDir: string): Promise<string> {
  const file = join(outDir, 'ir.json')
  await mkdir(outDir, { recursive: true })
  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`)
  return file
}

/** This renderer's extension for a component: that of the plugin the node names, else of any plugin with a component of its name. */
function extensionOf(node: ComponentNode, extensions: RendererExtension[]) {
  const owner = extensions.find(e => e.plugin === node.plugin && e.components?.[node.name])
    ?? (node.plugin ? undefined : extensions.find(e => e.components?.[node.name]))
  return owner?.components?.[node.name]
}

/**
 * The context of renderer `id`, one of those `run` runs together; the
 * plugins' component renderers for it are bound to it.
 */
function renderContext(compilation: Compilation, id: string, outDir: string, workDir: string, run: Run, findings: Finding[], server?: { url: string }): RenderContext {
  const { deckDir, workspaceRoot, doc } = compilation
  const config = doc.config.renderers[id]
  // A renderer may ask for a file again (a dev server at each update): what it reports is kept once.
  const report = (finding: Finding) => {
    const located = { ...finding, source: finding.source ?? { file: compilation.entry, line: 1 } }
    if (!findings.some(f => JSON.stringify(f) === JSON.stringify(located))) findings.push(located)
  }
  const vitePlugins = compilation.plugins.flatMap((loaded) => {
    const contribute = loaded.plugin?.vitePlugins
    if (!contribute) return []
    const options = doc.config.presmium[pluginId(loaded)]
    try {
      return contribute.call(loaded.plugin, { deckDir, workspaceRoot, config: isRecord(options) ? options : {} })
    } catch (error) {
      report({ checkId: 'presmium.render', severity: 'error', message: `plugin ${pluginId(loaded)} failed to give its Vite plugins: ${errorMessage(error)}` })
      return []
    }
  })
  const ctx: RenderContext = {
    deckDir,
    workspaceRoot,
    outDir,
    workDir,
    config: isRecord(config) ? config : {},
    extensions: [],
    plugins: doc.config.plugins,
    pluginDirs: Object.fromEntries(compilation.plugins.map(loaded => [loaded.name, loaded.dir])),
    lang: doc.meta.lang,
    renderers: run.ids,
    base: run.bases.get(id) ?? '/',
    vitePlugins,
    extensionFor: node => extensionOf(node, ctx.extensions),
    portable: (value, from) => portable(value, from, workspaceRoot),
    localAsset: (source, url) => publishedAsset(compilation, source, url, report),
    report,
    service: compilation.service,
    ...server ? { server } : {},
  }
  const bind = (render: ComponentRenderer) => (node: ComponentNode, block: IRBlock) => render(node, block, ctx)
  ctx.extensions = compilation.plugins.flatMap((loaded): RendererExtension[] => {
    const contribution = loaded.plugin?.rendererExtensions?.[id]
    if (!contribution) return []
    const components = contribution.components && Object.fromEntries(Object.entries(contribution.components).map(([name, render]) => [name, bind(render)]))
    return [{ plugin: pluginId(loaded), ...components ? { components } : {} }]
  })
  return ctx
}

/** URLs that name no local file: a scheme, protocol-relative, or a fragment (as `localAsset` reads them). */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

/** Directory of the deck's work directory where the directories it publishes are prepared (see `publishedDirectory`). */
const FILES_DIR = 'files'

/**
 * The local file a block's URL names, as the renderers publish it
 * (`RenderContext.localAsset`, docs/ir.md 6.2): a file in the repository,
 * or a directory strictly inside the deck that is not a deck itself (a link
 * to another document of a workspace stays a link), published with a file
 * listing. A relative reference to nothing, or to a file outside the git
 * repository the deck is in, cannot be published: a warning on its line. In SHARED
 * `presmium serve` only the workspace's files are read (docs/architecture.md 10.2).
 */
function publishedAsset(compilation: Compilation, source: SourcePos, url: string, report: (finding: Finding) => void): { file: string, name: string } | undefined {
  const { deckDir, workspaceRoot, scope } = compilation
  const warn = (message: string) => report({ checkId: 'presmium.links', severity: 'warning', message, source: { file: source.file, line: lineOf(source, url) } })
  const refuse = (file: string) => {
    report({ checkId: 'presmium.files', severity: 'error', message: refusedFile(file), source: { file: source.file, line: source.line } })
    return undefined
  }
  const found = localAsset(deckDir, source, url)
  if (found && scope && !scope.allows(found.file)) return refuse(found.file)
  // A deck outside any git repository has no repository to keep its files in.
  if (found && !inside(found.file, workspaceRoot) && existsSync(join(workspaceRoot, '.git'))) {
    warn(`${url} is not published: the file lies outside the deck's repository`)
    return undefined
  }
  if (found || REMOTE.test(url)) return found
  const path = url.replace(/[?#].*$/s, '')
  // `/...` names a file of the deck's public/, or a path of the site.
  if (!path || path.startsWith('/')) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
    // As written.
  }
  const target = resolve(dirname(source.file), name)
  if (!existsSync(target)) {
    warn(`${url} is not published: there is no such file`)
    return undefined
  }
  if (!publishesDirectory(target, deckDir)) return undefined
  if (scope && !scope.allows(target)) return refuse(target)
  return directoryAsset(target, deckDir, join(deckDir, WORK_DIR, FILES_DIR), compilation.doc.meta.lang, message => warn(`${url} is not published: ${message}`))
}

function unsupportedBlocks(doc: IRDocument, renderer: Renderer, extensions: RendererExtension[]): RenderOutput['skipped'] {
  const skipped: RenderOutput['skipped'] = []
  const visit = (section: string, blocks: IRBlock[]) => {
    for (const block of blocks) {
      let support
      try {
        support = renderer.support(block.node, extensions)
      } catch {
        support = 'none'
      }
      if (support === 'none') skipped.push({ section, block: block.id, reason: `${block.node.type} node not supported by ${renderer.id}` })
      else if (block.node.type === 'component' && block.node.children) visit(section, block.node.children)
    }
  }
  for (const section of doc.sections) visit(section.id, section.blocks)
  return skipped
}

function renderFinding(compilation: Compilation, severity: Finding['severity'], message: string): Finding {
  return { checkId: 'presmium.render', severity, message, source: { file: compilation.entry, line: 1 } }
}
