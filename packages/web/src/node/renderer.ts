/**
 * The web renderer (docs/ir.md section 6): a VitePress site whose pages the
 * IR runtime (@presmium/viewer) renders in the browser. It supports every IR
 * node. `build` writes a static site with the IR next to it; `dev` runs the
 * VitePress dev server and pushes changed sections to open pages.
 * `buildSite` and `devSite` do the same for a workspace site (./sites.ts).
 */
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, RenderContext, Renderer } from '@presmium/kernel'
import { diffDocuments } from '@presmium/viewer/domain'
import launchEditor from 'launch-editor'
import { offlineEnabled, rendererConfig } from '../domain/index.ts'
import type { WebRendererConfig } from '../domain/index.ts'
import { clientModules, nodeVitePlugins } from './addons.ts'
import type { ClientModules } from './addons.ts'
import { writeServiceWorker } from './offline.ts'
import { publishedDocument, publishedFile } from './publish.ts'
import { siteFiles, write, writeSite } from './site.ts'
import type { WorkspaceOptions } from './site.ts'
import { buildSite, devSite } from './sites.ts'
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

/** How a document's site is made besides its render context: as part of a workspace site, with the site's own client modules. */
export interface DocumentSite {
  workspace?: WorkspaceOptions
  /** Client modules of the whole site (the workspace's browser plugin), added to the document's. */
  extra?: ClientModules
  /** The file the site shell's options come from, to which a local `head.image` is relative (a workspace's configuration); default the deck's entry. */
  config?: string
}

function merge(modules: ClientModules, extra?: ClientModules): ClientModules {
  if (!extra) return modules
  return {
    components: new Map([...extra.components, ...modules.components]),
    plugins: [...extra.plugins, ...modules.plugins],
    viewers: [...extra.viewers, ...modules.viewers],
    vite: [...extra.vite, ...modules.vite],
    nodeVite: [...extra.nodeVite, ...modules.nodeVite],
  }
}

/** URLs with a scheme or protocol-relative: not local files. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

/**
 * The image of the site shell's `head` (P-78) as the pages name it: a URL as
 * it is, a local file published with the site (relative to the file
 * `document.config`, by default the deck's entry); absolute under the
 * sitemap's host name when there is one, as Open Graph wants it.
 */
function headImage(doc: IRDocument, ctx: RenderContext, options: WebRendererConfig, publicDir: string, document: DocumentSite): string | undefined {
  const image = options.shell.head?.image
  if (!image || REMOTE.test(image)) return image
  const published = publishedFile(ctx, publicDir, options.base, { file: document.config ?? resolve(ctx.deckDir, doc.meta.entry), line: 1 }, image)
  return published && options.shell.sitemap ? `${options.shell.sitemap.hostname}${published}` : published
}

/** Prepares a working directory: the files published there last time go, so the site holds the current ones only. */
async function prepare(doc: IRDocument, ctx: RenderContext, workDir: string, document: DocumentSite = {}) {
  const options = rendererConfig(ctx)
  const files = siteFiles(workDir)
  rmSync(files.publicDir, { recursive: true, force: true })
  const deck = { deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot }
  // The plugins' Node entries are imported once; the components are listed at each write, so a dev server
  // registers one added to the deck while it runs.
  const nodeVite = await nodeVitePlugins(ctx, doc.config.presmium, Boolean(document.workspace))
  const publish = (d: IRDocument) => publishedDocument(d, ctx, files.publicDir, options.base)
  const image = headImage(doc, ctx, options, files.publicDir, document)
  // The translations (P-123) are read at each write: `presmium dev` compiles them again with the original.
  const site = (published: IRDocument) => writeSite(workDir, {
    doc: published,
    deck,
    modules: merge(clientModules(ctx, nodeVite), document.extra),
    options,
    workspace: document.workspace,
    translations: (ctx.translations ?? []).map(({ lang, doc: translated }) => ({ lang, doc: publish(translated) })),
    image,
  })
  return { options, files, publish, site }
}

/** Builds a document's site into `ctx.outDir`, working in `workDir`. */
export async function buildDocument(doc: IRDocument, ctx: RenderContext, workDir: string, document: DocumentSite = {}): Promise<void> {
  const { options, files, publish, site } = await prepare(doc, ctx, workDir, document)
  const published = publish(doc)
  site(published)
  // The IR is published with the site.
  write(join(files.publicDir, 'ir.json'), JSON.stringify(published))
  const code = await vitepressBuild(files.root, ctx.outDir)
  if (code !== 0) throw new Error(`vitepress build exited with code ${code}`)
  if (offlineEnabled(doc.config.presmium)) writeServiceWorker(ctx.outDir, options.base)
}

export interface DocumentDevServer {
  port: number
  update(doc: IRDocument): Promise<void>
  close(): Promise<void>
}

/**
 * Runs a document's dev server, working in `ctx.outDir`; `port` overrides the configured one (0: a free
 * port), `host` VitePress's address; an abort of `signal` stops it while it starts.
 */
export async function devDocument(doc: IRDocument, ctx: RenderContext, document: DocumentSite = {}, port?: number, listen: { host?: string, signal?: AbortSignal } = {}): Promise<DocumentDevServer> {
  const { options, files, publish, site } = await prepare(doc, ctx, ctx.outDir, document)
  let current = publish(doc)
  let revision = revisionOf(JSON.stringify(current))
  site(current)
  // "Open in the editor" from a page (K-11): the author's editor, as launch-editor finds it ($EDITOR, a running editor).
  const server = await vitepressDev(files.root, port ?? options.port, (message) => {
    if (message.type !== 'presmium:source' || document.workspace || !sourceFiles(current).has(message.file)) return
    launchEditor(`${resolve(ctx.deckDir, message.file)}:${message.line}`, (file, error) => {
      console.error(`[presmium] could not open ${file} in an editor${error ? `: ${error}` : ''}; set $EDITOR or $LAUNCH_EDITOR`)
    })
  }, listen)
  return {
    port: server.port,
    async update(next: IRDocument) {
      const published = publish(next)
      const update = diffDocuments(current, published)
      // Only changed files are written. The config never changes with the IR, so the server never restarts;
      // the content goes to the pages over the WebSocket, the search documents to the search index (a page's
      // Markdown changes only with its chapter's title and those of the chapters around it: hot updated).
      // A page of a translation gets the translation as it is now when it loads.
      site(published)
      if (!update) {
        if (ctx.translations?.length) server.send({ type: 'presmium:translations' })
        return
      }
      const base = revision
      current = published
      revision = revisionOf(JSON.stringify(published))
      server.send({ type: 'presmium:update', update, base, revision })
    },
    close: () => server.close(),
  }
}

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
