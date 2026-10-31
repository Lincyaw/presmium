import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { build, Compiler } from '@lincyaw/compiler'
import type { Compilation, RunStats } from '@lincyaw/compiler'
import { errorMessage, isRecord } from '@lincyaw/kernel'
import type { Finding, IRDocument, SiteSpec } from '@lincyaw/kernel'
import { listDocuments, readWorkspaceConfig } from './config.ts'
import { siteContext, siteDocument, siteIR, siteSpec, siteTranslations, webRenderer } from './site.ts'

export interface WorkspaceBuild {
  outDir: string
  documents: { dir: string, title: string, runs: RunStats }[]
  findings: Finding[]
}

export async function buildWorkspace(root: string, options: { outDir?: string, bundled?: string } = {}): Promise<WorkspaceBuild> {
  const config = readWorkspaceConfig(root)
  const found = listDocuments(config)
  const findings: Finding[] = []
  const documents: WorkspaceBuild['documents'] = []
  const site = siteSpec(config, [])
  const base = siteBase(config.site.base)
  const forms: { dir: string, compilation: Compilation, to: string[] }[] = []
  const compilations: Compilation[] = []
  for (const document of found) {
    const compilation = await new Compiler(join(config.root, document.entry), { bundled: options.bundled, settings: config.settings }).compile({ pruneCache: true })
    compilations.push(compilation)
    const to = presentations(compilation, `${base}${urlPath(document.dir)}/`, siteLook(config.site, config.root))
    if (to.length > 0) forms.push({ dir: document.dir, compilation, to })
    const translated = await siteTranslations(compilation)
    findings.push(...compilation.doc.diagnostics, ...translated.findings)
    documents.push({ dir: document.dir, title: document.title, runs: compilation.runStats })
    site.documents.push(siteDocument(document, siteIR(compilation), translated.translations, compilation))
  }
  const outDir = join(resolve(options.outDir ?? join(config.root, 'dist')), 'web')
  const renderer = await webRenderer(config.root, options.bundled)
  const ctx = siteContext({ root: config.root, outDir, workDir: join(config.root, '.presmium', 'site'), base, findings })
  ctx.pluginDirs = pluginsByName(site, compilations)
  try {
    await renderer.buildSite!(site, ctx)
  } catch (error) {
    findings.push({ checkId: 'presmium.render', severity: 'error', message: `the workspace site failed: ${errorMessage(error)}` })
    return { outDir, documents, findings }
  }
  // A document's presentation and its narrated lecture are built beside its pages: `<dir>/slides/` and `<dir>/lecture/`.
  for (const { dir, compilation, to } of forms) {
    const work = join(config.root, '.presmium', 'forms', dir)
    rmSync(work, { recursive: true, force: true })
    try {
      const report = await build(compilation, { outDir: work, to })
      findings.push(...report.findings)
      for (const form of to) if (existsSync(join(work, form))) cpSync(join(work, form), join(outDir, dir, form), { recursive: true })
      if (to.includes('slides')) shareSlidesApp(join(outDir, dir, 'slides'), `${base}${urlPath(dir)}/slides/`, outDir, base)
    } catch (error) {
      findings.push({ checkId: 'presmium.render', severity: 'error', message: `document ${dir}: its ${to.join(' and ')} failed: ${errorMessage(error)}` })
    }
  }
  return { outDir, documents, findings }
}

/**
 * The site's documents name their plugins by package, as a presentation built alone does, so the pages and the
 * presentations share one viewer app (its key follows the plugin names); the site resolves each name to the directory
 * it was loaded from. A name that two documents load from different directories stays a directory, to tell them apart.
 */
function pluginsByName(site: SiteSpec, compilations: readonly Compilation[]): Record<string, string> {
  const dirs = new Map<string, Set<string>>(), names = new Map<string, string>()
  for (const { plugins } of compilations) for (const { name, dir } of plugins) {
    let own = dirs.get(name)
    if (!own) dirs.set(name, own = new Set())
    own.add(dir)
    names.set(dir, name)
  }
  const unique = new Map([...dirs].filter(([, own]) => own.size === 1).map(([name, own]) => [name, [...own][0]!]))
  const byName = (doc: IRDocument): IRDocument => ({ ...doc, config: { ...doc.config, plugins: doc.config.plugins.map(dir => names.has(dir) && unique.has(names.get(dir)!) ? names.get(dir)! : dir) } })
  for (const entry of site.documents) {
    if (entry.doc) entry.doc = byName(entry.doc)
    for (const translation of entry.translations ?? []) translation.doc = byName(translation.doc)
  }
  return Object.fromEntries(unique)
}

const PRESENTATIONS = ['slides', 'lecture']

/** The site's theme and its parameters, for its presentations to look like its pages; a theme directory made absolute. */
function siteLook(site: Record<string, unknown>, root: string): Record<string, unknown> {
  const theme = typeof site.theme === 'string' && (site.theme.startsWith('.') || isAbsolute(site.theme)) ? resolve(root, site.theme) : site.theme
  return { ...theme !== undefined ? { theme } : {}, ...isRecord(site.params) ? { params: site.params } : {} }
}

const urlPath = (dir: string) => dir.split('/').map(encodeURIComponent).join('/')

/**
 * Every document's slides run the same viewer app: it moves to the site's `_app/<key>/`, beside the web pages' own,
 * so a reader downloads it once for all the presentations of the site, and the slides' page points there.
 */
function shareSlidesApp(slides: string, slidesBase: string, outDir: string, base: string): void {
  const app = join(slides, '_app')
  if (!existsSync(app)) return
  for (const key of readdirSync(app)) if (!existsSync(join(outDir, '_app', key))) cpSync(join(app, key), join(outDir, '_app', key), { recursive: true })
  rmSync(app, { recursive: true, force: true })
  const page = join(slides, 'index.html')
  writeFileSync(page, readFileSync(page, 'utf8').replaceAll(`${slidesBase}_app/`, `${base}_app/`))
}

/**
 * The presentation forms a document asks for (`metadata.renderers.slides` or `lecture`), set to be served below its
 * pages at `prefix`: the slides at `slides/`, and the web pages and the slides linked to each other.
 */
function presentations(compilation: Compilation, prefix: string, look: Record<string, unknown>): string[] {
  const { renderers } = compilation.doc.config
  const to = PRESENTATIONS.filter(form => renderers[form] !== undefined)
  if (to.length === 0) return to
  if (to.includes('slides')) renderers.slides = { ...look, ...isRecord(renderers.slides) ? renderers.slides : {}, base: `${prefix}slides/` }
  const settings = compilation.doc.config.presmium ??= {}
  const web = isRecord(settings['presmium.web']) ? settings['presmium.web'] : {}
  settings['presmium.web'] = { ...web, webUrl: prefix, ...to.includes('slides') ? { slidesUrl: `${prefix}slides/` } : {} }
  // The slides find the lecture where it is built, without probing `slides/lecture/` first.
  if (to.includes('lecture')) {
    const lecture = isRecord(settings['presmium.lecture']) ? settings['presmium.lecture'] : {}
    settings['presmium.lecture'] = { url: `${prefix}lecture/`, ...lecture }
  }
  return to
}

function siteBase(value: unknown): string {
  const path = typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : ''
  return path ? `/${path}/` : '/'
}
