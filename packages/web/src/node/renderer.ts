import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, RenderContext, Renderer } from '@lincyaw/kernel'
import { diffDocuments } from '@lincyaw/viewer/domain'
import launchEditor from 'launch-editor'
import { offlineEnabled, rendererConfig } from '../domain/index.ts'
import type { WebRendererConfig } from '../domain/index.ts'
import { clientModules, nodeVitePlugins } from './addons.ts'
import type { ClientModules } from './addons.ts'
import { writeServiceWorker } from './offline.ts'
import { PublicationCache, publishedDocument, publishedFile } from './publish.ts'
import type { DocumentPage } from './publish.ts'
import { siteFiles, write, writeSite } from './site.ts'
import type { WorkspaceOptions } from './site.ts'
import { buildSite, devSite } from './sites.ts'
import { revisionOf } from './vite.ts'
import { vitepressBuild, vitepressDev } from './vitepress.ts'

const BUILD_DIR = '.presmium/web/build'

function sourceFiles(doc: IRDocument): Set<string> {
  const files = new Set<string>()
  for (const section of doc.sections) {
    files.add(section.source.file)
    for (const block of irBlocks(section.blocks)) files.add(block.source.file)
  }
  return files
}

export interface DocumentSite {
  workspace?: WorkspaceOptions
  extra?: ClientModules
  documentPage?: DocumentPage
  config?: string
}

function merge(modules: ClientModules, extra?: ClientModules): ClientModules {
  if (!extra) return modules
  return {
    restartable: modules.restartable === true && extra.restartable === true,
    components: new Map([...extra.components, ...modules.components]),
    plugins: [...extra.plugins, ...modules.plugins],
    viewers: [...extra.viewers, ...modules.viewers],
    vite: [...extra.vite, ...modules.vite],
    nodeVite: [...extra.nodeVite, ...modules.nodeVite],
  }
}

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

function headImage(doc: IRDocument, ctx: RenderContext, options: WebRendererConfig, publicDir: string, document: DocumentSite): string | undefined {
  const image = options.shell.head?.image
  if (!image || REMOTE.test(image)) return image
  const published = publishedFile(ctx, publicDir, options.base, { file: document.config ?? resolve(ctx.deckDir, doc.meta.entry), line: 1 }, image)
  return published && options.shell.sitemap ? `${options.shell.sitemap.hostname}${published}` : published
}

async function prepare(doc: IRDocument, ctx: RenderContext, workDir: string, document: DocumentSite = {}, incremental = false) {
  const options = rendererConfig(ctx)
  const files = siteFiles(workDir)
  rmSync(files.publicDir, { recursive: true, force: true })
  const deck = { deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot }
  const nodeVite = await nodeVitePlugins(ctx, doc.config.presmium, Boolean(document.workspace))
  const publication = incremental ? new PublicationCache() : undefined
  const publish = (d: IRDocument) => publishedDocument(d, ctx, files.publicDir, options.base, document.documentPage, publication)
  const image = headImage(doc, ctx, options, files.publicDir, document)
  const site = (published: IRDocument) => writeSite(workDir, {
    doc: published,
    deck,
    modules: merge(clientModules(ctx, nodeVite), document.extra),
    options,
    workspace: document.workspace,
    translations: (ctx.translations ?? []).map(({ lang, doc: translated }) => ({ lang, doc: publish(translated) })),
    image,
    ...ctx.preview ? { preview: ctx.preview } : {},
  })
  return { options, files, publish, site }
}

export async function buildDocument(doc: IRDocument, ctx: RenderContext, workDir: string, document: DocumentSite = {}): Promise<void> {
  const { options, files, publish, site } = await prepare(doc, ctx, workDir, document)
  const published = publish(doc)
  site(published)
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

export async function devDocument(doc: IRDocument, ctx: RenderContext, document: DocumentSite = {}, port?: number, listen: { host?: string, signal?: AbortSignal } = {}): Promise<DocumentDevServer> {
  const { options, files, publish, site } = await prepare(doc, ctx, ctx.outDir, document, true)
  let current = publish(doc)
  let revision = revisionOf(JSON.stringify(current))
  site(current)
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
