import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { errorMessage, findComponentRenderer, isRecord } from '@lincyaw/kernel'
import type { BoundRendererExtension, ComponentNode, ComponentRenderer, Exporter, Finding, IRBlock, IRDocument, NodeVitePlugin, RenderContext, RenderOutput, Renderer } from '@lincyaw/kernel'
import { documentLink, publishedAsset } from './assets.ts'
import type { Compilation, Compiler } from './compiler.ts'
import { portable } from './paths.ts'
import { loadPlugin, pluginId } from './plugins.ts'
import type { LoadedPlugin } from './plugins.ts'
import { compileTranslations } from './translations.ts'
import type { CompiledTranslation } from './translations.ts'
import { viewFor } from './views.ts'

export const DEFAULT_RENDERER_PACKAGES: Record<string, string> = {
  web: '@lincyaw/web',
  slides: '@lincyaw/render-slides',
  notebook: '@lincyaw/render-notebook',
}

export const WEB = 'web'

export interface InstalledRenderer {
  renderer: Renderer
  package: string
  /** The exporters of the renderer's package, with its configuration in the document. */
  exporters: DocumentExporter[]
}

/** An exporter a document can use, with its plugin's configuration in the document. */
export interface DocumentExporter {
  exporter: Exporter
  config: Record<string, unknown>
}

function exportersOf(compilation: Compilation, loaded: LoadedPlugin): DocumentExporter[] {
  const config = compilation.doc.config.presmium[pluginId(loaded)]
  return (loaded.plugin?.exporters ?? []).map(exporter => ({ exporter, config: isRecord(config) ? config : {} }))
}

/** The renderers of one build, prepare or dev, and the base path of each. */
export interface RenderRun {
  ids: string[]
  bases: Map<string, string>
}

async function installedRenderers(compilation: Compilation): Promise<{ renderers: Map<string, InstalledRenderer>, missing: Map<string, string> }> {
  const renderers = new Map<string, InstalledRenderer>()
  const missing = new Map<string, string>()
  for (const loaded of compilation.plugins) {
    const { name, plugin } = loaded
    if (plugin?.renderer && !renderers.has(plugin.renderer.id)) renderers.set(plugin.renderer.id, { renderer: plugin.renderer, package: name, exporters: exportersOf(compilation, loaded) })
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
    if (loaded && renderer?.id === id) renderers.set(id, { renderer, package: pkg, exporters: exportersOf(compilation, loaded) })
    else missing.set(id, problem?.message ?? `package ${pkg} provides no renderer "${id}"`)
  }
  return { renderers, missing }
}

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

/** The exporters of the document's plugins and of its renderers' packages; one id once, the plugins' first. */
export async function documentExporters(compilation: Compilation): Promise<DocumentExporter[]> {
  const { selected } = await selectRenderers(compilation)
  const found = new Map<string, DocumentExporter>()
  for (const own of [...compilation.plugins.flatMap(loaded => exportersOf(compilation, loaded)), ...selected.flatMap(installed => installed.exporters)]) {
    if (!found.has(own.exporter.id)) found.set(own.exporter.id, own)
  }
  return [...found.values()]
}

export function configuredBase(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const path = value.trim().replace(/^\/+|\/+$/g, '')
  return path ? `/${path}/` : '/'
}

/** With `shared`, site renderers without a configured base share the output under `/<id>/`. */
export function planRenderRun(compilation: Compilation, selected: InstalledRenderer[], shared: boolean, base?: string): RenderRun {
  const renderers = selected.map(({ renderer }) => renderer)
  const configured = new Map(renderers.map(({ id }) => [id, configuredBase(compilation.doc.config.renderers[id]?.base)]))
  const sites = renderers.filter(renderer => renderer.site)
  const together = shared && sites.length > 1 && sites.every(({ id }) => configured.get(id) === undefined)
  const run: RenderRun = {
    ids: renderers.map(({ id }) => id),
    bases: new Map(renderers.map(({ id, site }) => [id, configured.get(id) ?? (together && site ? `/${id}/` : '/')])),
  }
  const given = configuredBase(base)
  if (given) for (const id of run.ids) run.bases.set(id, given)
  return run
}

export async function translationsFor(compilation: Compilation, run: RenderRun, compilers?: Map<string, Compiler>): Promise<{ translations: CompiledTranslation[], views: NonNullable<RenderContext['translations']>, findings: Finding[] }> {
  if (!run.ids.includes(WEB) || !compilation.doc.config.translations) return { translations: [], views: [], findings: [] }
  const { translations, findings } = await compileTranslations(compilation, compilers)
  return { translations, views: translations.map(({ lang, doc }) => ({ lang, doc: viewFor(doc, WEB) })), findings }
}

export async function writeIR(doc: IRDocument, outDir: string): Promise<string> {
  const file = join(outDir, 'ir.json')
  await mkdir(outDir, { recursive: true })
  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`)
  return file
}

export function renderContext(compilation: Compilation, id: string, outDir: string, workDir: string, run: RenderRun, findings: Finding[], server?: { url: string }): RenderContext {
  const { deckDir, workspaceRoot, doc } = compilation
  const config = doc.config.renderers[id]
  const report = (finding: Finding) => {
    const located = { ...finding, source: finding.source ?? { file: compilation.entry, line: 1 } }
    if (!findings.some(f => JSON.stringify(f) === JSON.stringify(located))) findings.push(located)
  }
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
    vitePlugins: vitePluginsFor(compilation, report),
    nodeVitePlugins: nodeVitePlugins(compilation),
    extensionFor: node => findComponentRenderer(node, ctx.extensions),
    portable: (value, from) => portable(value, from, workspaceRoot),
    localAsset: (source, url) => publishedAsset(compilation, source, url, report),
    documentLink: (source, url) => documentLink(compilation, source, url),
    report,
    service: compilation.service,
    ...server ? { server } : {},
  }
  const bind = (render: ComponentRenderer) => (node: ComponentNode, block: IRBlock) => render(node, block, ctx)
  ctx.extensions = compilation.plugins.flatMap((loaded): BoundRendererExtension[] => {
    const contribution = loaded.plugin?.rendererExtensions?.[id]
    if (!contribution) return []
    const components = contribution.components && Object.fromEntries(Object.entries(contribution.components).map(([name, render]) => [name, bind(render)]))
    return [{ plugin: pluginId(loaded), ...components ? { components } : {} }]
  })
  return ctx
}

export function vitePluginsFor(compilation: Compilation, report: (finding: Finding) => void): unknown[] {
  return compilation.plugins.flatMap((loaded) => {
    const contribute = loaded.plugin?.vitePlugins
    if (!contribute) return []
    const config = compilation.doc.config.presmium[pluginId(loaded)]
    try {
      return contribute.call(loaded.plugin, { deckDir: compilation.deckDir, workspaceRoot: compilation.workspaceRoot, config: isRecord(config) ? config : {} })
    } catch (error) {
      report({ checkId: 'presmium.render', severity: 'error', message: `plugin ${pluginId(loaded)} failed to give its Vite plugins: ${errorMessage(error)}`, source: { file: compilation.entry, line: 1 } })
      return []
    }
  })
}

export function nodeVitePlugins(compilation: Pick<Compilation, 'plugins' | 'doc'>): NodeVitePlugin[] {
  return compilation.plugins.flatMap((loaded) => {
    if (!loaded.entry || !loaded.plugin?.vitePlugins) return []
    const config = compilation.doc.config.presmium[pluginId(loaded)]
    return [{ id: pluginId(loaded), entry: loaded.entry, config: isRecord(config) ? config : {} }]
  })
}

export function unsupportedBlocks(doc: IRDocument, renderer: Renderer, extensions: BoundRendererExtension[]): RenderOutput['skipped'] {
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

export function renderFinding(compilation: Compilation, severity: Finding['severity'], message: string): Finding {
  return { checkId: 'presmium.render', severity, message, source: { file: compilation.entry, line: 1 } }
}
