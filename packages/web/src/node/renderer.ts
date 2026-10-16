/**
 * The web renderer (docs/ir.md section 6): a VitePress site whose pages the
 * IR runtime (@presmium/viewer) renders in the browser. It supports every IR
 * node. `build` writes a static site with the IR next to it; `dev` runs the
 * VitePress dev server and pushes changed sections to open pages.
 */
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, RenderContext, Renderer } from '@presmium/kernel'
import { diffDocuments } from '@presmium/viewer/domain'
import launchEditor from 'launch-editor'
import { offlineEnabled, rendererConfig } from '../domain/index.ts'
import { clientModules } from './addons.ts'
import { writeServiceWorker } from './offline.ts'
import { publishedDocument } from './publish.ts'
import { siteFiles, write, writeSite } from './site.ts'
import { revisionOf } from './vite.ts'
import { vitepressBuild, vitepressDev } from './vitepress.ts'

/** Working directory of `build`, under the deck; `dev` works in its own output directory. */
const BUILD_DIR = '.presmium/web/build'

/** Source files of a published document (relative to the deck): the only files a page may open. */
function sourceFiles(doc: IRDocument): Set<string> {
  const files = new Set<string>()
  for (const section of doc.sections) {
    files.add(section.source.file)
    for (const block of irBlocks(section.blocks)) files.add(block.source.file)
  }
  return files
}

/** Prepares a working directory: the files published there last time go, so the site holds the current ones only. */
async function prepare(doc: IRDocument, ctx: RenderContext, workDir: string) {
  const options = rendererConfig(ctx)
  const files = siteFiles(workDir)
  rmSync(files.publicDir, { recursive: true, force: true })
  const deck = { deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot }
  const modules = await clientModules(ctx, doc.config.presmium)
  const publish = (d: IRDocument) => publishedDocument(d, ctx, files.publicDir, options.base)
  const site = (published: IRDocument) => writeSite(workDir, { doc: published, deck, modules, options })
  return { options, files, publish, site }
}

export const renderer: Renderer = {
  id: 'web',
  site: true,
  support: () => 'full',

  async build(doc: IRDocument, ctx: RenderContext) {
    const { options, files, publish, site } = await prepare(doc, ctx, join(ctx.deckDir, BUILD_DIR))
    const published = publish(doc)
    site(published)
    // The IR is published with the site.
    write(join(files.publicDir, 'ir.json'), JSON.stringify(published))
    const code = await vitepressBuild(files.root, ctx.outDir)
    if (code !== 0) throw new Error(`vitepress build exited with code ${code}`)
    if (offlineEnabled(doc.config.presmium)) writeServiceWorker(ctx.outDir, options.base)
    return { outDir: ctx.outDir, skipped: [] }
  },

  async dev(doc: IRDocument, ctx: RenderContext) {
    const { options, files, publish, site } = await prepare(doc, ctx, ctx.outDir)
    let current = publish(doc)
    let revision = revisionOf(JSON.stringify(current))
    site(current)
    // "Open in the editor" from a page (K-11): the author's editor, as launch-editor finds it ($EDITOR, a running editor).
    const server = await vitepressDev(files.root, options.port, (message) => {
      if (message.type !== 'presmium:source' || !sourceFiles(current).has(message.file)) return
      launchEditor(`${resolve(ctx.deckDir, message.file)}:${message.line}`, (file, error) => {
        console.error(`[presmium] could not open ${file} in an editor${error ? `: ${error}` : ''}; set $EDITOR or $LAUNCH_EDITOR`)
      })
    })
    return {
      url: `http://localhost:${server.port}${options.base}`,
      async update(next: IRDocument) {
        const published = publish(next)
        const update = diffDocuments(current, published)
        if (!update) return
        // Only changed files are written. The config never changes with the IR, so the server never restarts;
        // the content goes to the pages over the WebSocket, the search documents to the search index (a page's
        // Markdown changes only with its chapter's title and those of the chapters around it: hot updated).
        site(published)
        const base = revision
        current = published
        revision = revisionOf(JSON.stringify(published))
        server.send({ type: 'presmium:update', update, base, revision })
      },
      close: () => server.close(),
    }
  },
}
