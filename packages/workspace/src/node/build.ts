/**
 * `presmium build` at a workspace root (P-122, docs/ir.md section 7): every
 * document compiled (LOCAL: their own plugins, all code run), then the
 * workspace site built by the web renderer into `<out>/web/`: the home page
 * lists the documents, each under `/<dir>/`. The site has no translations of
 * the documents (a warning for each a document declares).
 */
import { join, resolve } from 'node:path'
import { Compiler } from '@presmium/compiler'
import type { RunStats } from '@presmium/compiler'
import { errorMessage } from '@presmium/kernel'
import type { Finding } from '@presmium/kernel'
import { listDocuments, readWorkspace } from './config.ts'
import { siteContext, siteDocument, siteIR, siteSpec, untranslated, webRenderer } from './site.ts'

export interface WorkspaceBuild {
  /** The site's directory, `<out>/web`. */
  outDir: string
  documents: { dir: string, title: string, runs: RunStats }[]
  /** Every document's diagnostics, then the renderer's. */
  findings: Finding[]
}

export async function buildWorkspace(root: string, options: { outDir?: string, bundled?: string } = {}): Promise<WorkspaceBuild> {
  const config = readWorkspace(root)
  const found = listDocuments(config)
  const findings: Finding[] = []
  const documents: WorkspaceBuild['documents'] = []
  const site = siteSpec(config, [])
  for (const document of found) {
    const compilation = await new Compiler(join(config.root, document.entry), { bundled: options.bundled, settings: config.settings }).compile({ pruneCache: true })
    findings.push(...compilation.doc.diagnostics, ...untranslated(compilation, config.root))
    documents.push({ dir: document.dir, title: document.title, runs: compilation.runs })
    site.documents.push(siteDocument(document, siteIR(compilation)))
  }
  const outDir = join(resolve(options.outDir ?? join(config.root, 'dist')), 'web')
  const renderer = await webRenderer(config.root, options.bundled)
  const ctx = siteContext({ root: config.root, outDir, workDir: join(config.root, '.presmium', 'site'), findings })
  try {
    await renderer.buildSite!(site, ctx)
  } catch (error) {
    findings.push({ checkId: 'presmium.render', severity: 'error', message: `the workspace site failed: ${errorMessage(error)}` })
  }
  return { outDir, documents, findings }
}
