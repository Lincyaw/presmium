import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { hasRendererExtension } from '@lincyaw/kernel'
import type { Exporter, IRDocument, PresmiumNodePlugin, RenderContext } from '@lincyaw/kernel'
import { slidevMarkdown } from './deck-markdown.ts'
import { SLIDEV_DIR, updateDeck, writeDeck, writeIrRevision } from './deck-project.ts'
import { reportBuildFailure, runSlidev, startSlidevDev } from './slidev-cli.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

function baseArgs(ctx: RenderContext): string[] {
  return ctx.base !== '/' ? ['--base', ctx.base] : []
}

const EXPORT_TIMEOUT = 120_000

/** Whether the document has the slides form: its configuration names it, or names no renderer. */
function hasSlides(doc: IRDocument): boolean {
  const named = Object.keys(doc.config.renderers)
  return named.length === 0 || named.includes('slides')
}

/**
 * The slides as one file, by `slidev export` in the project the renderer writes (at the root path, its live code off):
 * a PDF, or a PowerPoint file with a picture of each slide. `presmium-export` (@lincyaw/slidev-addon-publish) also
 * checks the PDF's links.
 */
function slidesExporter(format: 'pdf' | 'pptx', label: Record<string, string>): Exporter {
  return {
    id: format,
    label,
    available: hasSlides,
    async run(ctx) {
      ctx.progress('prepare')
      const dir = await ctx.prepare('slides', { liveCode: false })
      ctx.progress('export')
      const file = `slides.${format}`
      const exported = () => runSlidev(['export', 'slides.md', '--format', format, '--output', join(ctx.outDir, file), '--wait-until', 'networkidle', '--timeout', String(EXPORT_TIMEOUT)], dir, ctx.log, ctx.signal)
      // A deck's first export can fail while Vite optimizes its dependencies and reloads the print page; the second
      // finds them optimized.
      await exported().catch(async (error: unknown) => {
        if (ctx.signal.aborted) throw error
        ctx.log('the export failed; once more, with the dependencies the first run optimized')
        await exported()
      })
      return { files: [file] }
    },
  }
}

const plugin: PresmiumNodePlugin = {
  id: 'presmium.slides',
  version,
  kernel: '^1.0.0',
  renderer: {
    id: 'slides',
    site: true,
    support: (node, extensions) => node.type === 'component' && !node.plugin && !hasRendererExtension(node, extensions) ? 'degraded' : 'full',
    async prepare(doc, ctx) {
      await writeDeck(ctx.workDir, ctx, slidevMarkdown(doc, ctx, ctx.workDir), doc)
    },
    async build(doc, ctx) {
      const dir = ctx.workDir
      await writeDeck(dir, ctx, slidevMarkdown(doc, ctx, dir), doc)
      await rm(ctx.outDir, { recursive: true, force: true })
      await runSlidev(['build', 'slides.md', '--out', ctx.outDir, ...baseArgs(ctx)], dir, ctx.log).catch((error: unknown) => {
        throw reportBuildFailure(error, doc, ctx)
      })
      ctx.report({
        checkId: 'presmium.slides',
        severity: 'info',
        message: ctx.base === '/'
          ? `Slidev deck in ${SLIDEV_DIR}/slides.md; export it with \`slidev export ${SLIDEV_DIR}/slides.md\``
          : `Slidev deck in ${SLIDEV_DIR}/slides.md, written for the base ${ctx.base}; \`slidev export\` serves it at the root, where the local files it links are not found: export with \`presmium-export\` (@lincyaw/slidev-addon-publish)`,
      })
      return { outDir: ctx.outDir, skipped: [] }
    },
    async dev(doc, ctx) {
      const dir = ctx.workDir
      await writeDeck(dir, ctx, slidevMarkdown(doc, ctx, dir), doc)
      await writeIrRevision(dir, ctx, doc)
      const port = Number(ctx.config.port)
      const server = await startSlidevDev(dir, [...Number.isInteger(port) && port > 0 ? ['--port', String(port)] : [], ...baseArgs(ctx)])
      return {
        url: server.url,
        update: next => updateDeck(dir, ctx, slidevMarkdown(next, ctx, dir), next),
        close: server.close,
      }
    },
  },
  exporters: [
    slidesExporter('pdf', { 'zh-CN': '幻灯片 PDF', 'en': 'Slides as PDF' }),
    slidesExporter('pptx', { 'zh-CN': '幻灯片 PowerPoint', 'en': 'Slides as PowerPoint' }),
  ],
}

export default plugin
