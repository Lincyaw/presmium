import { join } from 'node:path'
import type { IRDocument, RenderContext, Renderer } from '@lincyaw/kernel'
import { rendererConfig } from '../domain/index.ts'
import { buildDocument, devDocument } from './document-site.ts'
import { buildSite, devSite } from './workspace-site.ts'

const BUILD_DIR = '.presmium/web/build'

export const renderer: Renderer = {
  id: 'web',
  site: true,
  support: () => 'full',

  async build(doc: IRDocument, ctx: RenderContext) {
    await buildDocument(doc, ctx, join(ctx.deckDir, BUILD_DIR))
    return { outDir: ctx.outDir, skipped: [] }
  },

  async dev(doc: IRDocument, ctx: RenderContext) {
    const server = await devDocument(doc, ctx)
    const { base } = rendererConfig(ctx)
    return {
      url: `http://localhost:${server.port}${base}`,
      update: next => server.update(next),
      close: () => server.close(),
    }
  },

  buildSite,
  devSite,
}
