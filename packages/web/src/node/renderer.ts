/**
 * The web renderer (docs/ir.md section 6): a VitePress site whose pages the
 * IR runtime (@presmium/viewer) renders in the browser. It supports every IR
 * node. `build` writes a static site with the IR next to it; `dev` runs the
 * VitePress dev server and pushes changed sections to open pages.
 */
import { join } from 'node:path'
import type { IRDocument, RenderContext, Renderer } from '@presmium/kernel'
import { diffDocuments } from '@presmium/viewer/domain'
import { rendererConfig, toPages } from '../domain/index.ts'
import { writeServiceWorker } from './offline.ts'
import { publishedDocument } from './publish.ts'
import { siteFiles, write, writeSite } from './site.ts'
import { vitepressBuild, vitepressDev } from './vitepress.ts'

/** Working directory of `build`, under the deck; `dev` works in its own output directory. */
const BUILD_DIR = '.presmium/web/build'

/** What the VitePress project depends on besides the IR runtime's content: pages, titles, configuration. */
function structure(doc: IRDocument): string {
  return JSON.stringify([doc.meta.title, doc.config, toPages(doc), doc.sections.map(s => s.title)])
}

export const renderer: Renderer = {
  id: 'web',
  support: () => 'full',

  async build(doc: IRDocument, ctx: RenderContext) {
    const options = rendererConfig(ctx.config)
    const workDir = join(ctx.deckDir, BUILD_DIR)
    const files = siteFiles(workDir)
    const published = publishedDocument(doc, ctx.deckDir, files.publicDir, options.base)
    writeSite(workDir, { doc: published, deckDir: ctx.deckDir, plugins: ctx.plugins, options })
    // The IR is published with the site.
    write(join(files.publicDir, 'ir.json'), JSON.stringify(published))
    const code = await vitepressBuild(files.root, ctx.outDir)
    if (code !== 0) throw new Error(`vitepress build exited with code ${code}`)
    writeServiceWorker(ctx.outDir, options.base)
    return { outDir: ctx.outDir, skipped: [] }
  },

  async dev(doc: IRDocument, ctx: RenderContext) {
    const options = rendererConfig(ctx.config)
    const workDir = ctx.outDir
    const files = siteFiles(workDir)
    const publish = (d: IRDocument) => publishedDocument(d, ctx.deckDir, files.publicDir, options.base)
    let current = publish(doc)
    writeSite(workDir, { doc: current, deckDir: ctx.deckDir, plugins: ctx.plugins, options })
    const server = await vitepressDev(files.root, options.port)
    return {
      url: `http://localhost:${server.port}${options.base}`,
      async update(next: IRDocument) {
        const published = publish(next)
        const update = diffDocuments(current, published)
        if (!update) return
        // The project changes only with the structure; content goes to the pages over the WebSocket.
        writeSite(workDir, { doc: published, deckDir: ctx.deckDir, plugins: ctx.plugins, options }, structure(published) !== structure(current))
        current = published
        server.send({ type: 'presmium:update', update })
      },
      close: () => server.close(),
    }
  },
}
