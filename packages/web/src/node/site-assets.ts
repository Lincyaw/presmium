import { join, resolve } from 'node:path'
import { ABSOLUTE_URL, isRecord } from '@lincyaw/kernel'
import type { RenderContext, SiteSpec } from '@lincyaw/kernel'
import { publishedFile } from './publish.ts'
import { isSingle } from './site-model.ts'
import { publishedTheme } from './site-theme.ts'

/**
 * Publish shell assets from the site's configuration owner, once for every document in the site: its logo and theme. A
 * relative logo is found beside the file its parameters are written in: the workspace's for a workspace site, the
 * document's lecture.json for a single document's, unless the renderer's options name another (`siteFile`, relative to
 * the document: a workspace document's presentation, which shows the workspace's parameters).
 */
export function publishedSite(site: SiteSpec, ctx: RenderContext, outDir = ctx.outDir, base = ctx.base): SiteSpec {
  site = publishedTheme(site, outDir, base)
  const params = isRecord(site.config.params) ? site.config.params : undefined
  if (!params || typeof params.logo !== 'string') return site
  const logo = params.logo.trim()
  const file = typeof ctx.config.siteFile === 'string' ? resolve(ctx.deckDir, ctx.config.siteFile)
    : isSingle(site) ? resolve(ctx.deckDir, site.documents[0]!.doc?.meta.entry ?? 'lecture.json') : join(ctx.workspaceRoot, 'presmium.workspace.yaml')
  const source = { file, line: 1 }
  const url = ABSOLUTE_URL.test(logo) ? logo : logo.startsWith('/') ? `${ctx.base}${logo.slice(1)}` : publishedFile(ctx, outDir, base, source, logo)
  const { logo: _source, ...rest } = params
  return { ...site, config: { ...site.config, params: { ...rest, ...url ? { logo: url } : {} } } }
}
