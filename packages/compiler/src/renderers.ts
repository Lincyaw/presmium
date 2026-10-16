/**
 * Renderer registry and dispatch (docs/ir.md section 6). A renderer is the
 * `renderer` of a plugin: one listed in `plugins`, or the package installed
 * for a renderer id (`renderers.<id>.package`, else the default package).
 * Each renderer gets a view of the IR without the blocks `only` excludes;
 * blocks it does not support at all are listed in the build report.
 */
import { existsSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { errorMessage, irBlocks, isRecord } from '@presmium/kernel'
import type { ComponentNode, ComponentRenderer, Finding, IRBlock, IRDocument, IRSection, RenderContext, RenderDevServer, RenderOutput, Renderer, RendererExtension } from '@presmium/kernel'
import type { Compilation, Compiler } from './compiler.ts'
import { revisionFiles } from './dependencies.ts'
import { localAsset, portable, relativeIR } from './paths.ts'
import { loadPlugin, pluginId } from './plugins.ts'

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
    const { loaded, problem } = await loadPlugin(pkg, compilation.deckDir)
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

/**
 * Writes `<outDir>/ir.json` (with paths relative to the deck, `relativeIR`)
 * and runs the selected renderers, each into `<outDir>/<id>`. They write
 * directories of their own, so they run at the same time; the report lists
 * them in the order selected.
 */
export async function build(compilation: Compilation, options: { outDir: string, to?: string[] }): Promise<BuildReport> {
  const { doc } = compilation
  const ir = await writeIR(relativeIR(doc, compilation.deckDir, compilation.workspaceRoot), options.outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  if (selected.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer available; only the IR was written to ${ir}`))
  const run = runOf(compilation, selected, true)
  const results = await Promise.all(selected.map(async ({ renderer }) => {
    const reported: Finding[] = []
    const ctx = renderContext(compilation, renderer.id, join(options.outDir, renderer.id), join(compilation.deckDir, WORK_DIR, renderer.id), run, reported)
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
  return { ir, outputs, findings: [...doc.diagnostics, ...findings, ...results.flatMap(({ reported }) => reported)] }
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
  const servers: { renderer: string, url: string, server: RenderDevServer }[] = []
  for (const { renderer } of selected) {
    if (!renderer.dev) {
      findings.push(renderFinding(compilation, 'warning', `renderer ${renderer.id} has no dev server`))
      continue
    }
    const outDir = join(options.outDir, renderer.id)
    const ctx = renderContext(compilation, renderer.id, outDir, outDir, run, findings)
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
    watched = new Set([...compilation.files, ...files, ...git.flat()])
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
function renderContext(compilation: Compilation, id: string, outDir: string, workDir: string, run: Run, findings: Finding[]): RenderContext {
  const { deckDir, workspaceRoot, doc } = compilation
  const config = doc.config.renderers[id]
  const report = (finding: Finding) => findings.push({ ...finding, source: finding.source ?? { file: compilation.entry, line: 1 } })
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
    localAsset: (source, url) => localAsset(deckDir, source, url),
    report,
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
