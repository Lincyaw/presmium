/**
 * Renderer registry and dispatch (docs/ir.md section 6). A renderer is the
 * `renderer` of a plugin: one listed in `plugins`, or the package installed
 * for a renderer id (`renderers.<id>.package`, else the default package).
 * Each renderer gets a view of the IR without the blocks `only` excludes;
 * blocks it does not support at all are listed in the build report.
 */
import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { ComponentNode, ComponentRenderer, Finding, IRBlock, IRDocument, RenderContext, RenderDevServer, RenderOutput, Renderer, RendererExtension } from '@presmium/kernel'
import type { Compilation, Compiler } from './compiler.ts'
import { revisionFiles } from './dependencies.ts'
import { loadPlugin, pluginId } from './plugins.ts'
import { errorMessage, isRecord } from './workspace.ts'

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
export async function installedRenderers(compilation: Compilation): Promise<{ renderers: Map<string, InstalledRenderer>, missing: Map<string, string> }> {
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
export async function selectRenderers(compilation: Compilation, to?: string[]): Promise<{ selected: InstalledRenderer[], findings: Finding[] }> {
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

/** Writes `<outDir>/ir.json` and runs each selected renderer into `<outDir>/<id>`. */
export async function build(compilation: Compilation, options: { outDir: string, to?: string[] }): Promise<BuildReport> {
  const { doc } = compilation
  const ir = await writeIR(doc, options.outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  const outputs: RendererOutput[] = []
  if (selected.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer available; only the IR was written to ${ir}`))
  for (const { renderer } of selected) {
    const ctx = renderContext(compilation, renderer.id, join(options.outDir, renderer.id), join(compilation.deckDir, WORK_DIR, renderer.id), findings)
    const view = viewFor(doc, renderer.id)
    const unsupported = unsupportedBlocks(view, renderer, ctx.extensions)
    try {
      await mkdir(ctx.outDir, { recursive: true })
      const output = await renderer.build(view, ctx)
      const listed = new Set(output.skipped.map(s => `${s.section}#${s.block}`))
      outputs.push({ renderer: renderer.id, outDir: output.outDir, workDir: ctx.workDir, skipped: [...output.skipped, ...unsupported.filter(s => !listed.has(`${s.section}#${s.block}`))] })
    } catch (error) {
      findings.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed: ${errorMessage(error)}`))
    }
  }
  return { ir, outputs, findings: [...doc.diagnostics, ...findings] }
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
 */
export async function dev(compiler: Compiler, options: DevOptions): Promise<DevSession> {
  let compilation = await compiler.compile()
  const ir = await writeIR(compilation.doc, options.outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  const servers: { renderer: string, url: string, server: RenderDevServer }[] = []
  for (const { renderer } of selected) {
    if (!renderer.dev) {
      findings.push(renderFinding(compilation, 'warning', `renderer ${renderer.id} has no dev server`))
      continue
    }
    const outDir = join(options.outDir, renderer.id)
    const ctx = renderContext(compilation, renderer.id, outDir, outDir, findings)
    try {
      await mkdir(ctx.outDir, { recursive: true })
      const server = await renderer.dev(viewFor(compilation.doc, renderer.id), ctx)
      servers.push({ renderer: renderer.id, url: server.url, server })
    } catch (error) {
      findings.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed to start: ${errorMessage(error)}`))
    }
  }
  if (servers.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer dev server; watching the source and writing the IR to ${ir}`))
  options.onCompile?.(compilation, [...compilation.doc.diagnostics, ...findings])

  const watchers = new Map<string, FSWatcher>()
  let timer: NodeJS.Timeout | undefined
  let running = Promise.resolve()
  const recompile = async () => {
    const renderFindings: Finding[] = []
    try {
      compilation = await compiler.compile()
      await writeIR(compilation.doc, options.outDir)
      for (const { renderer, server } of servers) {
        await server.update(viewFor(compilation.doc, renderer)).catch((error: unknown) => {
          renderFindings.push(renderFinding(compilation, 'error', `renderer ${renderer} failed to update: ${errorMessage(error)}`))
        })
      }
      options.onCompile?.(compilation, [...compilation.doc.diagnostics, ...renderFindings])
    } catch (error) {
      options.onCompile?.(compilation, [renderFinding(compilation, 'error', errorMessage(error))])
    }
    await watchFiles()
  }
  // Directories are watched rather than files, so editors and git, which save by renaming, are seen too.
  let watched = new Set<string>()
  const watchFiles = async () => {
    const { files, revisions } = compilation.dependencies
    // Files read at a revision in one directory share their repository.
    const byDir = new Map(revisions.map(r => [`${dirname(r.file)}\0${r.rev}`, r]))
    const git = await Promise.all([...byDir.values()].map(revisionFiles))
    watched = new Set([...compilation.files, ...files, ...git.flat()])
    for (const dir of new Set([...watched].map(f => dirname(f)))) {
      if (watchers.has(dir)) continue
      try {
        watchers.set(dir, watch(dir, (_event, name) => {
          if (!name || !watched.has(join(dir, basename(name)))) return
          clearTimeout(timer)
          timer = setTimeout(() => {
            running = running.then(recompile)
          }, 30)
        }))
      } catch {
        // A directory that does not exist, e.g. that of a referenced file not written yet, is not watched.
      }
    }
  }
  await watchFiles()

  return {
    servers: servers.map(({ renderer, url }) => ({ renderer, url })),
    ir,
    async close() {
      clearTimeout(timer)
      for (const watcher of watchers.values()) watcher.close()
      await running
      await Promise.all(servers.map(s => s.server.close()))
    },
  }
}

/** The document a renderer sees: blocks limited by `only` to other renderers are left out. */
export function viewFor(doc: IRDocument, renderer: string): IRDocument {
  const keep = (blocks: IRBlock[]): IRBlock[] => blocks
    .filter(block => !block.only || block.only.includes(renderer))
    .map(block => block.node.type === 'component' && block.node.children
      ? { ...block, node: { ...block.node, children: keep(block.node.children) } }
      : block)
  return { ...doc, sections: doc.sections.map(section => ({ ...section, blocks: keep(section.blocks) })) }
}

async function writeIR(doc: IRDocument, outDir: string): Promise<string> {
  const file = join(outDir, 'ir.json')
  await mkdir(outDir, { recursive: true })
  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`)
  return file
}

/** The context of renderer `id`; the plugins' component renderers for it are bound to it. */
function renderContext(compilation: Compilation, id: string, outDir: string, workDir: string, findings: Finding[]): RenderContext {
  const config = compilation.doc.config.renderers[id]
  const ctx: RenderContext = {
    deckDir: compilation.deckDir,
    outDir,
    workDir,
    config: isRecord(config) ? config : {},
    extensions: [],
    plugins: compilation.doc.config.plugins,
    report: finding => findings.push({ ...finding, source: finding.source ?? { file: compilation.entry, line: 1 } }),
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
