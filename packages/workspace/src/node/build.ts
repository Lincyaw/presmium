import { cpSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build, Compiler } from '@lincyaw/compiler'
import type { Compilation, RunStats } from '@lincyaw/compiler'
import { errorMessage, isRecord } from '@lincyaw/kernel'
import type { Finding } from '@lincyaw/kernel'
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
  for (const document of found) {
    const compilation = await new Compiler(join(config.root, document.entry), { bundled: options.bundled, settings: config.settings }).compile({ pruneCache: true })
    const to = presentations(compilation, `${base}${document.dir.split('/').map(encodeURIComponent).join('/')}/`)
    if (to.length > 0) forms.push({ dir: document.dir, compilation, to })
    const translated = await siteTranslations(compilation)
    findings.push(...compilation.doc.diagnostics, ...translated.findings)
    documents.push({ dir: document.dir, title: document.title, runs: compilation.runStats })
    site.documents.push(siteDocument(document, siteIR(compilation), translated.translations, compilation))
  }
  const outDir = join(resolve(options.outDir ?? join(config.root, 'dist')), 'web')
  const renderer = await webRenderer(config.root, options.bundled)
  const ctx = siteContext({ root: config.root, outDir, workDir: join(config.root, '.presmium', 'site'), base, findings })
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
    } catch (error) {
      findings.push({ checkId: 'presmium.render', severity: 'error', message: `document ${dir}: its ${to.join(' and ')} failed: ${errorMessage(error)}` })
    }
  }
  return { outDir, documents, findings }
}

const PRESENTATIONS = ['slides', 'lecture']

/**
 * The presentation forms a document asks for (`metadata.renderers.slides` or `lecture`), set to be served below its
 * pages at `prefix`: the slides at `slides/`, and the web pages and the slides linked to each other.
 */
function presentations(compilation: Compilation, prefix: string): string[] {
  const { renderers } = compilation.doc.config
  const to = PRESENTATIONS.filter(form => renderers[form] !== undefined)
  if (to.length === 0) return to
  if (to.includes('slides')) renderers.slides = { ...isRecord(renderers.slides) ? renderers.slides : {}, base: `${prefix}slides/` }
  const settings = compilation.doc.config.presmium ??= {}
  const web = isRecord(settings['presmium.web']) ? settings['presmium.web'] : {}
  settings['presmium.web'] = { ...web, webUrl: prefix, ...to.includes('slides') ? { slidesUrl: `${prefix}slides/` } : {} }
  return to
}

function siteBase(value: unknown): string {
  const path = typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : ''
  return path ? `/${path}/` : '/'
}
