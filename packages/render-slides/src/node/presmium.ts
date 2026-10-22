import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { hasRendererExtension } from '@lincyaw/kernel'
import type { PresmiumNodePlugin, RenderContext } from '@lincyaw/kernel'
import { slidevMarkdown } from './deck-markdown.ts'
import { SLIDEV_DIR, updateDeck, writeDeck, writeIrRevision } from './deck-project.ts'
import { reportBuildFailure, runSlidev, startSlidevDev } from './slidev-cli.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

function baseArgs(ctx: RenderContext): string[] {
  return ctx.base !== '/' ? ['--base', ctx.base] : []
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
      await runSlidev(['build', 'slides.md', '--out', ctx.outDir, ...baseArgs(ctx)], dir).catch((error: unknown) => {
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
}

export default plugin
