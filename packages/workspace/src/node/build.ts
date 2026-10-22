import { join, resolve } from 'node:path'
import { Compiler } from '@lincyaw/compiler'
import type { RunStats } from '@lincyaw/compiler'
import { errorMessage } from '@lincyaw/kernel'
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
  for (const document of found) {
    const compilation = await new Compiler(join(config.root, document.entry), { bundled: options.bundled, settings: config.settings }).compile({ pruneCache: true })
    const translated = await siteTranslations(compilation)
    findings.push(...compilation.doc.diagnostics, ...translated.findings)
    documents.push({ dir: document.dir, title: document.title, runs: compilation.runStats })
    site.documents.push(siteDocument(document, siteIR(compilation), translated.translations, compilation))
  }
  const outDir = join(resolve(options.outDir ?? join(config.root, 'dist')), 'web')
  const renderer = await webRenderer(config.root, options.bundled)
  const ctx = siteContext({ root: config.root, outDir, workDir: join(config.root, '.presmium', 'site'), base: siteBase(config.site.base), findings })
  try {
    await renderer.buildSite!(site, ctx)
  } catch (error) {
    findings.push({ checkId: 'presmium.render', severity: 'error', message: `the workspace site failed: ${errorMessage(error)}` })
  }
  return { outDir, documents, findings }
}

function siteBase(value: unknown): string {
  const path = typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : ''
  return path ? `/${path}/` : '/'
}
