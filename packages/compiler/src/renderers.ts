import { existsSync, realpathSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { errorMessage, irBlocks, isRecord } from '@lincyaw/kernel'
import type { ComponentNode, ComponentRenderer, DocumentLink, Finding, IRBlock, IRDocument, IRSection, LocalAsset, RenderContext, RenderDevServer, RenderOutput, Renderer, RendererExtension, SourcePos } from '@lincyaw/kernel'
import { unshown } from './audience.ts'
import { audienceCompilation, DECK_ENTRY } from './compiler.ts'
import type { AudienceCompilation, Compilation, Compiler } from './compiler.ts'
import { revisionFiles } from './dependencies.ts'
import { localAsset, portable, relativeIR } from './paths.ts'
import { directoryAsset, inside, lineOf, publishesDirectory } from './published.ts'
import { loadPlugin, pluginId } from './plugins.ts'
import { compileTranslations } from './translations.ts'
import type { CompiledTranslation } from './translations.ts'

export const WORK_DIR = '.presmium'

export const DEFAULT_RENDERER_PACKAGES: Record<string, string> = {
  web: '@lincyaw/web',
  slides: '@lincyaw/render-slides',
  notebook: '@lincyaw/render-notebook',
}

export interface InstalledRenderer {
  renderer: Renderer
  package: string
}

export interface RendererOutput {
  renderer: string
  outDir: string
  workDir: string
  base: string
  skipped: RenderOutput['skipped']
}

export interface BuildReport {
  ir: string
  outputs: RendererOutput[]
  findings: Finding[]
}

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

interface Run {
  ids: string[]
  bases: Map<string, string>
}

function configuredBase(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const path = value.trim().replace(/^\/+|\/+$/g, '')
  return path ? `/${path}/` : '/'
}

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
  audience?: string
  quote?: boolean
  scan?: 'outDir' | 'written'
}

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
  const render = async ({ renderer }: InstalledRenderer) => {
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
  }
  // Each renderer can start its own toolchain. Do not multiply their native pools.
  const results: Awaited<ReturnType<typeof render>>[] = []
  for (const renderer of selected) results.push(await render(renderer))
  const outputs = results.flatMap(({ result }) => result ? [result] : [])
  if (compilation.audience) {
    const scan = audienceScan(compilation.audience, translated.translations, doc)
    const paths = options.scan === 'written' ? [ir, ...outputs.map(output => output.outDir)] : undefined
    findings.push(...await scan.scan(options.outDir, paths, { quote: options.quote ?? true }))
  }
  return { ir, outputs, findings: unique([...doc.diagnostics, ...findings, ...results.flatMap(({ reported }) => reported)]) }
}

function audienceScan(audience: AudienceCompilation, translations: CompiledTranslation[], doc: IRDocument): AudienceCompilation {
  const kept = [doc, ...translations.map(translation => translation.doc)]
  const left = [audience, ...translations.flatMap(translation => (translation.audience ? [translation.audience] : []))].flatMap(own => own.withheld)
  return audienceCompilation(audience.name, unshown(left, kept))
}

const WEB = 'web'

async function translationsFor(compilation: Compilation, run: Run, compilers?: Map<string, Compiler>): Promise<{ translations: CompiledTranslation[], views: NonNullable<RenderContext['translations']>, findings: Finding[] }> {
  if (!run.ids.includes(WEB) || !compilation.doc.config.translations) return { translations: [], views: [], findings: [] }
  const { translations, findings } = await compileTranslations(compilation, compilers)
  return { translations, views: translations.map(({ lang, doc }) => ({ lang, doc: viewFor(doc, WEB) })), findings }
}

function unique(findings: Finding[]): Finding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = JSON.stringify([finding.checkId, finding.severity, finding.message, finding.source?.file, finding.source?.line])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

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
  servers: { renderer: string, url: string }[]
  ir: string
  update(compilation: Compilation): Promise<void>
  close(): Promise<void>
}

export interface DevOptions {
  outDir: string
  to?: string[]
  server?: { url: string }
  onCompile?(compilation: Compilation, findings: Finding[]): void
  compilation?: Compilation
  base?: string
  port?: number
  preview?: { origins: string[] }
}

export async function dev(compiler: Compiler, options: DevOptions): Promise<DevSession> {
  let started = Date.now()
  let compilation = options.compilation ?? await compiler.compile()
  const ir = await writeIR(compilation.doc, options.outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  const run = runOf(compilation, selected, false)
  const base = configuredBase(options.base)
  if (base) for (const id of run.ids) run.bases.set(id, base)
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
    if (options.port !== undefined) ctx.config = { ...ctx.config, port: options.port }
    if (options.preview) ctx.preview = { origins: [...options.preview.origins] }
    if (renderer.id === WEB) {
      ctx.translations = translations
    }
    try {
      await mkdir(ctx.outDir, { recursive: true })
      const server = await renderer.dev(viewFor(compilation.doc, renderer.id), ctx)
      servers.push({ renderer: renderer.id, url: server.url, server })
    } catch (error) {
      findings.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed to start: ${errorMessage(error)}`))
    }
  }
  if (servers.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer dev server; watching the source and writing the IR to ${ir}`))
  const setup = (c: Compilation) => JSON.stringify([c.doc.config.plugins, c.doc.config.renderers])
  const initial = setup(compilation)

  const watchers = new Map<string, FSWatcher>()
  let relevant = new Map<string, Set<string>>()
  let watched = new Set<string>()
  let timer: NodeJS.Timeout | undefined
  let running = Promise.resolve()
  let queued = false
  let closed = false
  const schedule = () => {
    if (closed) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (queued) return
      queued = true
      running = running.then(() => {
        queued = false
        clearTimeout(timer)
        return recompile()
      })
    }, 30)
  }
  const watchFiles = async () => {
    const { files, revisions } = compilation.dependencies
    const revs = new Map<string, Set<string>>()
    for (const { file, rev } of revisions) revs.set(dirname(file), (revs.get(dirname(file)) ?? new Set<string>()).add(rev))
    const git = await Promise.all([...revs].map(([dir, names]) => revisionFiles(dir, names)))
    if (closed) return
    watched = new Set([...compilation.files, ...files, ...git.flat(), ...translated.translations.flatMap(t => t.files)])
    const next = new Map<string, Set<string>>()
    for (const file of watched) {
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
      }
    }
    if (!queued && [...watched].some(file => modifiedSince(file, started))) schedule()
  }
  const push = async (next: Compilation, reported: Finding[]) => {
    compilation = next
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
  }
  const recompile = async () => {
    started = Date.now()
    const reported: Finding[] = []
    try {
      await push(await compiler.compile(), reported)
    } catch (error) {
      reported.push(renderFinding(compilation, 'error', errorMessage(error)))
    }
    await watchFiles()
    options.onCompile?.(compilation, reported)
  }
  if (!options.compilation) await watchFiles()
  options.onCompile?.(compilation, [...compilation.doc.diagnostics, ...findings])

  return {
    servers: servers.map(({ renderer, url }) => ({ renderer, url })),
    ir,
    async update(next) {
      if (closed) return
      const reported: Finding[] = []
      running = running.then(() => push(next, reported)).catch((error: unknown) => {
        reported.push(renderFinding(next, 'error', errorMessage(error)))
      })
      await running
      options.onCompile?.(compilation, reported)
    },
    async close() {
      closed = true
      clearTimeout(timer)
      for (const watcher of watchers.values()) watcher.close()
      await running
      await Promise.all(servers.map(s => s.server.close()))
    },
  }
}

function modifiedSince(file: string, time: number): boolean {
  const modified = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
  return modified >= time - 20 && modified <= Date.now()
}

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

function extensionOf(node: ComponentNode, extensions: RendererExtension[]) {
  const owner = extensions.find(e => e.plugin === node.plugin && e.components?.[node.name])
    ?? (node.plugin ? undefined : extensions.find(e => e.components?.[node.name]))
  return owner?.components?.[node.name]
}

function renderContext(compilation: Compilation, id: string, outDir: string, workDir: string, run: Run, findings: Finding[], server?: { url: string }): RenderContext {
  const { deckDir, workspaceRoot, doc } = compilation
  const config = doc.config.renderers[id]
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
    documentLink: (source, url) => documentLink(compilation, source, url),
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

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

const FILES_DIR = 'files'

function localTarget(source: SourcePos, url: string): string | undefined {
  if (REMOTE.test(url)) return undefined
  const path = url.replace(/[?#].*$/s, '')
  if (!path || path.startsWith('/')) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
  }
  return resolve(dirname(source.file), name)
}

function documentLink(compilation: Compilation, source: SourcePos, url: string): DocumentLink | undefined {
  const target = localTarget(source, url)
  if (!target) return undefined
  const dir = basename(target) === DECK_ENTRY && statSync(target, { throwIfNoEntry: false })?.isFile() ? dirname(target)
    : statSync(target, { throwIfNoEntry: false })?.isDirectory() && existsSync(join(target, DECK_ENTRY)) ? target
      : undefined
  if (dir === undefined || !inside(dir, compilation.workspaceRoot)) return undefined
  const hash = url.indexOf('#')
  let fragment = hash < 0 ? '' : url.slice(hash + 1)
  try {
    fragment = decodeURIComponent(fragment)
  } catch {
  }
  return { dir: relative(compilation.workspaceRoot, dir).split(sep).join('/'), ...fragment ? { fragment } : {} }
}

function publishedAsset(compilation: Compilation, source: SourcePos, url: string, report: (finding: Finding) => void): LocalAsset | undefined {
  const { deckDir, workspaceRoot } = compilation
  const warn = (message: string) => report({ checkId: 'presmium.links', severity: 'warning', message, source: { file: source.file, line: lineOf(source, url) } })
  const target = localTarget(source, url)
  const found = localAsset(deckDir, source, url)
  if (found && target && basename(realpathSync(found.file)) === DECK_ENTRY) {
    const linked = documentLink(compilation, source, url)
    warn(`${url} is not published: it is the source of ${linked?.dir ? `the document ${linked.dir}` : 'a document'}, which a workspace site links as its page; this build keeps the link as written`)
    return undefined
  }
  if (found && !inside(found.file, workspaceRoot) && existsSync(join(workspaceRoot, '.git'))) {
    warn(`${url} is not published: the file lies outside the deck's repository`)
    return undefined
  }
  if (found) return { ...found, directory: false }
  if (!target) return undefined
  if (!existsSync(target)) {
    warn(`${url} is not published: there is no such file`)
    return undefined
  }
  if (!publishesDirectory(target, deckDir)) return undefined
  const directory = directoryAsset(target, deckDir, join(deckDir, WORK_DIR, FILES_DIR), compilation.doc.meta.lang, message => warn(`${url} is not published: ${message}`))
  return directory && { ...directory, directory: true }
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
