import { join, resolve } from 'node:path'
import type { IRDocument, RenderContext, Renderer, SiteDevServer, SiteDocument, SiteSpec } from '@lincyaw/kernel'
import launchEditor from 'launch-editor'
import { rendererConfig } from '../domain/index.ts'
import { buildSite as buildPages } from './site-build.ts'
import type { BuiltDocument } from './site-build.ts'
import { documentContext, documentSourceFiles } from './site-model.ts'
import { startSiteServer } from './site-server.ts'
import { viewerAppCache } from './viewer-app.ts'

const BUILD_DIR = '.presmium/web/build'
const LOOPBACK = '127.0.0.1'

/** One document as a site of its own: at the root of its site path, with no home page. */
function documentSite(doc: IRDocument, ctx: RenderContext): SiteSpec {
  return { title: doc.meta.title, documents: [{ dir: '', title: doc.meta.title, doc, ...ctx.translations ? { translations: ctx.translations } : {} }], config: ctx.config }
}

function documentWorkDir(ctx: RenderContext, dir: string): string {
  return join(ctx.workDir, 'documents', dir ? encodeURIComponent(dir) : '_')
}

export const renderer: Renderer = {
  id: 'web',
  site: true,
  support: () => 'full',

  async build(doc: IRDocument, ctx: RenderContext) {
    const work = join(ctx.deckDir, BUILD_DIR)
    const entry: BuiltDocument = { dir: '', doc, ctx, nodePlugins: ctx.nodeVitePlugins ?? [], translations: ctx.translations ?? [] }
    await buildPages(documentSite(doc, ctx), { ...ctx, workDir: work }, [entry])
    return { outDir: ctx.outDir, skipped: [] }
  },

  async dev(doc: IRDocument, ctx: RenderContext) {
    let current = doc
    const { port } = rendererConfig(ctx)
    const server = await startSiteServer({
      site: () => documentSite(current, ctx),
      ctx,
      cacheDir: viewerAppCache(),
      workDir: join(ctx.outDir, 'site'),
      document: async () => current,
      context: () => ctx,
      nodePlugins: () => ctx.nodeVitePlugins ?? [],
      translations: () => ctx.translations ?? [],
      listen: { host: LOOPBACK, port: port ?? 0 },
      openSource(file, line) {
        if (!documentSourceFiles(current).has(file)) return
        launchEditor(`${resolve(ctx.deckDir, file)}:${line}`, (opened, error) => {
          console.error(`[presmium] could not open ${opened} in an editor${error ? `: ${error}` : ''}; set $EDITOR or $LAUNCH_EDITOR`)
        })
      },
    })
    return {
      url: server.url,
      async update(next) {
        current = next
        server.update('', next)
      },
      close: () => server.close(),
    }
  },

  async buildSite(site: SiteSpec, ctx: RenderContext) {
    const documents: BuiltDocument[] = site.documents.flatMap((entry) => {
      if (!entry.doc) return []
      const own = documentContext(ctx, site, entry.dir, entry.doc, join(ctx.outDir, entry.dir), documentWorkDir(ctx, entry.dir))
      return [{ dir: entry.dir, doc: entry.doc, ctx: own, nodePlugins: entry.nodeVitePlugins ?? [], translations: entry.translations ?? [] }]
    })
    await buildPages(site, ctx, documents)
    return { outDir: ctx.outDir, skipped: [] }
  },

  async devSite(site: SiteSpec, ctx: RenderContext, compile: (dir: string) => Promise<IRDocument>): Promise<SiteDevServer> {
    const entryOf = (dir: string) => site.documents.find(entry => entry.dir === dir)
    const host = typeof ctx.config.host === 'string' && ctx.config.host ? ctx.config.host : LOOPBACK
    const server = await startSiteServer({
      site: () => site,
      ctx,
      cacheDir: viewerAppCache(),
      workDir: join(ctx.workDir, 'viewer'),
      document: compile,
      context: (dir, doc) => documentContext(ctx, site, dir, doc, documentWorkDir(ctx, dir), documentWorkDir(ctx, dir)),
      nodePlugins: dir => entryOf(dir)?.nodeVitePlugins ?? [],
      translations: dir => entryOf(dir)?.translations ?? [],
      listen: { host, port: Number(ctx.config.port) || 0 },
    })
    return {
      url: server.url,
      async update(dir, doc) {
        const known: SiteDocument = { dir, title: doc.meta.title, ...doc.meta.lang ? { lang: doc.meta.lang } : {}, ...Array.isArray(doc.meta.tags) ? { tags: (doc.meta.tags as unknown[]).filter((t): t is string => typeof t === 'string') } : {} }
        const entry = entryOf(dir)
        if (entry) Object.assign(entry, known)
        else site.documents.push(known)
        server.update(dir, doc)
      },
      target: async () => server.origin,
      app: (dir, wait) => server.app(dir, wait),
      warm: dir => server.warm(dir),
      close: () => server.close(),
    }
  },
}
