import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { ABSOLUTE_URL, deckLocale, DOCUMENT_ENTRY, isRecord, safeDecodeURIComponent } from '@lincyaw/kernel'
import type { IRDocument, RenderContext, SiteSpec } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { parseLandingPage, siteTheme, WEB_MESSAGES } from '../domain/index.ts'
import type { HomeDocument, SiteContent, SiteLandingPage } from '../domain/index.ts'
import { publishedFile } from './publish.ts'
import { documentLinkOf, documentPage, shellOptions, siteLanguage, siteTitle } from './site-model.ts'

export type IndependentLanding = { kind: 'page', page: SiteLandingPage, source: string } | { kind: 'template', file: string }

/** Resolve website pages from their own source, independently of the document compiler. */
export function loadLanding(site: SiteSpec, ctx: RenderContext): IndependentLanding | undefined {
  const input = site.config.landing
  if (input === undefined || typeof input === 'string') return undefined
  const fail = (key: string): never => { throw new Error(WEB_MESSAGES[deckLocale(siteLanguage(site))].invalidSiteParameter(key)) }
  if (!isRecord(input) || site.home !== undefined) return fail('site.landing')
  const file = (value: unknown, key: string, extension: string) => {
    if (typeof value !== 'string' || !value.trim()) return fail(key)
    const path = resolve(ctx.workspaceRoot, value)
    if (!existsSync(path) || !statSync(path).isFile() || extname(path).toLowerCase() !== extension || !isInside(realpathSync(path), realpathSync(ctx.workspaceRoot))) return fail(key)
    return path
  }
  if ('source' in input && 'template' in input) return fail('site.landing')
  if ('template' in input) return { kind: 'template', file: file(input.template, 'site.landing.template', '.html') }
  if ('source' in input) {
    const source = file(input.source, 'site.landing.source', '.json')
    let value: unknown
    try { value = JSON.parse(readFileSync(source, 'utf8')) } catch { return fail('site.landing.source') }
    return { kind: 'page', page: parseLandingPage(value, siteLanguage(site)), source }
  }
  return { kind: 'page', page: parseLandingPage(input, siteLanguage(site)), source: join(ctx.workspaceRoot, 'presmium.workspace.yaml') }
}

/** Local media belongs to the page source; site-absolute navigation belongs to the deployment base. */
export function publishLanding(landing: Extract<IndependentLanding, { kind: 'page' }>, site: SiteSpec, ctx: RenderContext, outDir = ctx.outDir, base = ctx.base, docs: ReadonlyMap<string, IRDocument> = new Map(site.documents.flatMap(entry => entry.doc ? [[entry.dir, entry.doc] as const] : []))): SiteLandingPage {
  const page = structuredClone(landing.page)
  const source = { file: landing.source, line: 1 }
  const publish = (value: string, link = false): string => {
    if (ABSOLUTE_URL.test(value) || value.startsWith('#')) return value
    if (value.startsWith('/')) return `${ctx.base}${value.slice(1)}`
    if (link) {
      const reference = documentLinkOf(ctx)(source, value)
      if (reference) {
        const href = documentPage(site, ctx.base, docs)(reference)
        if (href) return href
        throw new Error(WEB_MESSAGES[deckLocale(siteLanguage(site))].invalidSiteParameter(`site.landing: ${value}`))
      }
      const path = value.replace(/[?#].*$/s, '')
      if (!extname(path)) return `${ctx.base}${value.replace(/^\.\//, '')}`
    }
    const file = resolve(dirname(landing.source), safeDecodeURIComponent(value.replace(/[?#].*$/s, '')))
    if (existsSync(file) && basename(realpathSync(file)) === DOCUMENT_ENTRY) throw new Error(WEB_MESSAGES[deckLocale(siteLanguage(site))].invalidSiteParameter(`site.landing: ${value}`))
    const result = publishedFile(ctx, outDir, base, source, value)
    if (!result) throw new Error(WEB_MESSAGES[deckLocale(siteLanguage(site))].invalidSiteParameter(`site.landing: ${value}`))
    return result
  }
  const actions = (items: { link: string }[] | undefined) => items?.forEach(action => { action.link = publish(action.link, true) })
  if (page.hero) {
    if (page.hero.image) page.hero.image = publish(page.hero.image)
    actions(page.hero.actions)
  }
  for (const section of page.sections) {
    if (section.type === 'features') for (const item of section.items) {
      if (item.image) item.image = publish(item.image)
      if (item.link) item.link = publish(item.link, true)
    }
    if (section.type === 'media') {
      section.src = publish(section.src)
      if (section.poster) section.poster = publish(section.poster)
      if (section.captions) section.captions = Object.fromEntries(Object.entries(section.captions).map(([lang, url]) => [lang, publish(url)]))
    }
    if (section.type === 'cta') actions(section.actions)
  }
  return page
}

/** The public content collection available to a free-form HTML template. */
export function siteContent(site: SiteSpec, base: string, lang: string, documents: HomeDocument[]): SiteContent {
  // A template may link the workspace theme's stylesheets and mark its root with `data-pm-site-theme-name`.
  const { name, stylesheets } = siteTheme(shellOptions(site), lang)
  return {
    schemaVersion: 1,
    title: siteTitle(site, lang),
    base,
    lang,
    documents: documents.map(({ dir, title, href, description, lang, tags, pages }) => ({ id: dir, title, href, description, lang, tags, pages })),
    ...name ? { theme: { name, stylesheets: stylesheets ?? [] } } : {},
  }
}
