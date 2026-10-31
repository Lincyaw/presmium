import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { ABSOLUTE_URL, errorMessage, isRecord } from '@lincyaw/kernel'
import type { IRDocument, NodeVitePlugin, RenderContext, SiteSpec } from '@lincyaw/kernel'
import { FONT_LICENSE, fontLicense } from '@lincyaw/kernel/node'
import { SitemapStream, streamToPromise } from 'sitemap'
import { chapterRedirects, offlineEnabled, pageLink, SERVICE_WORKER, searchDocuments, sitePageLayout, translationPages, webPages } from '../domain/index.ts'
import type { AppConfig, SiteConfig, SiteShell, WebPage } from '../domain/index.ts'
import { BUNDLE_ENTRY, buildDocumentBundle, documentComponents } from './document-bundle.ts'
import type { DocumentBundle } from './document-bundle.ts'
import { writeServiceWorker } from './offline.ts'
import { publishedDocument, publishedFile } from './publish.ts'
import { APP_DIR, CODE_DIR, contentKey, copyApp, copyPublic, copyRuntimeAssets, runtimeAssets, searchIndex } from './site-files.ts'
import { documentBase, documentPage, documentSiteConfig, homeDocument, homeDocuments, isSingle, landingConfig, landingDocument, languageLabel, LIST_PAGE, siteLanguage, siteLanguages, siteNeighbours, siteShellBelow, siteTitle, sitemapPages, translationOf } from './site-model.ts'
import { publishedSite } from './site-assets.ts'
import { loadLanding, publishLanding, siteContent } from './landing.ts'
import { buildLandingTemplate, writeLandingTemplate } from './landing-template.ts'
import { pageHtml, redirectHtml } from './site-page.ts'
import type { MetaTag } from './site-page.ts'
import { appEntry, appPlugin, buildViewerApp, buildViewerServer, viewerAppCache } from './viewer-app.ts'
import type { AppPlugin, ViewerApp } from './viewer-app.ts'

/**
 * A built site of the web form: the viewer app copied once below the site's path, and each document as data beside its
 * pages: its IR (and its translations'), its own code, its search index, its published files and its plugins' run-time
 * files. Every page is rendered on the server, so that it reads without its script, and the app then hydrates it.
 */

/** A document of the site, as its build has it. */
export interface BuiltDocument {
  dir: string
  doc: IRDocument
  /** Its render context: below its own site path and output directory. */
  ctx: RenderContext
  nodePlugins: readonly NodeVitePlugin[]
  translations: readonly { lang: string, doc: IRDocument }[]
}

interface ServerRender {
  render(input: { config: AppConfig, doc?: IRDocument, components: string[] }): Promise<string>
}

interface Built {
  app: ViewerApp
  /** The app's directory in the site, named by its content. */
  appDir: string
  appUrl: string
  server: ServerRender
  plugins: Map<string, AppPlugin>
}

// A document's directory as one segment of a path; the document at the root as `~` (a `.` would be taken out of the address).
const segment = (dir: string) => (dir ? encodeURIComponent(dir) : '~')

/** The URL of the site's Open Graph image: an absolute URL as written, a local file published (with the sitemap's host name when there is one). */
function headImage(shell: SiteShell, publish: (url: string) => string | undefined): string | undefined {
  const image = shell.head?.image
  if (!image || ABSOLUTE_URL.test(image)) return image
  const published = publish(image)
  return published && shell.sitemap ? `${shell.sitemap.hostname}${published}` : published
}

function metaTags(shell: SiteShell, image: string | undefined, title: string): MetaTag[] {
  const head = shell.head
  return [
    ...head?.description ? [{ name: 'description', content: head.description }] : [],
    ...head ? [{ property: 'og:type', content: 'website' }, { property: 'og:title', content: title }] : [],
    ...head?.description ? [{ property: 'og:description', content: head.description }] : [],
    ...image ? [{ property: 'og:image', content: image }] : [],
  ]
}

function pageTitle(page: WebPage, doc: IRDocument): string {
  return page.title === doc.meta.title ? page.title : `${page.title} | ${doc.meta.title}`
}

function pageFile(page: WebPage): string {
  return page.path === 'index' ? 'index.html' : `${page.path}.html`
}

async function writeSitemap(file: string, hostname: string, base: string, pages: string[]): Promise<void> {
  const stream = new SitemapStream({ hostname: `${hostname}${base}` })
  const xml = await streamToPromise(Readable.from(pages.map(url => ({ url }))).pipe(stream))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, xml)
}

/** Builds the app (with its server-side render) for the plugins of every document and the operator's, and copies it into the site. */
async function prepareApp(ctx: RenderContext, documents: readonly BuiltDocument[]): Promise<Built> {
  const dirs = new Map<string, string>()
  for (const { ctx: own } of documents) for (const name of own.plugins) if (own.pluginDirs[name]) dirs.set(name, own.pluginDirs[name]!)
  for (const name of ctx.plugins) if (ctx.pluginDirs[name]) dirs.set(name, ctx.pluginDirs[name]!)
  const plugins = new Map<string, AppPlugin>()
  for (const [name, dir] of dirs) plugins.set(name, await appPlugin(name, dir))
  const started = Date.now()
  const app = await buildViewerApp(viewerAppCache(), [...plugins.values()])
  const server = await import(pathToFileURL(await buildViewerServer(app, [...plugins.values()])).href) as ServerRender
  ctx.log?.(`the viewer app is ready in ${((Date.now() - started) / 1000).toFixed(1)} s`)
  const key = copyApp(app, join(ctx.outDir, APP_DIR))
  return { app, appDir: join(ctx.outDir, APP_DIR, key), appUrl: `${ctx.base}${APP_DIR}/${key}/`, server, plugins }
}

async function renderPage(built: Built, file: string, config: AppConfig, title: string, meta: MetaTag[], doc: IRDocument | undefined, components: string[]): Promise<void> {
  const body = await built.server.render({ config, doc, components })
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, pageHtml({ entry: appEntry(built.app), appUrl: built.appUrl, shared: built.app.manifest.shared, config, title, meta, body }))
}

/** A document's files beside its pages: its own code, its plugins' run-time files, its `public/`, the fonts' license. */
async function documentFiles(ctx: RenderContext, built: Built, entry: BuiltDocument): Promise<{ code?: string, components: string[] }> {
  const { dir, ctx: own } = entry
  const out = own.outDir
  // The document's own code, built to import the app's modules by name.
  const bundle: DocumentBundle | null = await buildDocumentBundle({
    deckDir: own.deckDir,
    workspaceRoot: own.workspaceRoot,
    outDir: join(ctx.workDir, 'bundles', segment(dir)),
    externals: Object.keys(built.app.manifest.shared),
    nodePlugins: entry.nodePlugins.map(({ entry: file, config }) => ({ entry: file, config })),
    components: documentComponents(entry.doc),
  })
  // Named by its content, as the app is: the same in any checkout.
  const code = bundle && contentKey(bundle.dir, file => file === 'bundle.json')
  if (bundle && code) cpSync(bundle.dir, join(out, CODE_DIR, code), { recursive: true, filter: source => !source.endsWith('bundle.json') })
  copyRuntimeAssets(await runtimeAssets(entry.nodePlugins, own), out)
  copyPublic(own.deckDir, out)
  mkdirSync(dirname(join(out, FONT_LICENSE)), { recursive: true })
  writeFileSync(join(out, FONT_LICENSE), fontLicense(import.meta.url))
  const components = [...new Set([...own.plugins.flatMap(name => Object.keys(built.plugins.get(name)?.components ?? {})), ...bundle?.components ?? []])]
  return { ...code ? { code } : {}, components }
}

async function buildDocumentPages(site: SiteSpec, ctx: RenderContext, built: Built, entry: BuiltDocument, docs: ReadonlyMap<string, IRDocument>, workspace: boolean): Promise<void> {
  const { dir, doc, ctx: own } = entry
  const out = own.outDir
  const base = documentBase(ctx.base, dir)
  mkdirSync(out, { recursive: true })
  const linked = workspace ? documentPage(site, ctx.base, docs) : undefined
  const published = publishedDocument(doc, own, out, base, linked)
  const pages = webPages(published)
  const translations = entry.translations.map(({ lang, doc: translated }) => {
    const shown = publishedDocument(translated, own, out, base, linked)
    return { lang, doc: shown, pages: translationPages(shown, pages) }
  })
  const lang = doc.meta.lang ?? own.lang ?? 'zh-CN'
  const { code, components } = await documentFiles(ctx, built, entry)
  const others = workspace ? siteNeighbours(site, ctx.base, dir, docs).search : []
  const shell = siteShellBelow(site, ctx.base)
  const image = headImage(shell, url => publishedFile(own, out, base, { file: resolve(own.deckDir, doc.meta.entry), line: 1 }, url))
  const offline = offlineEnabled(doc.config.presmium)
  const locales = [{ prefix: '', lang, doc: published, pages, translated: false }, ...translations.map(t => ({ prefix: `${t.lang}/`, lang: t.lang, doc: t.doc, pages: t.pages, translated: true }))]
  for (const locale of locales) {
    const root = `${base}${locale.prefix}`
    mkdirSync(join(out, locale.prefix), { recursive: true })
    writeFileSync(join(out, locale.prefix, 'ir.json'), JSON.stringify(locale.doc))
    writeFileSync(join(out, locale.prefix, 'search.json'), searchIndex([...searchDocuments(locale.doc, root, locale.pages), ...others]))
    for (const page of locale.pages) {
      const config: AppConfig = {
        kind: 'document',
        document: dir,
        base,
        lang: locale.lang,
        ir: `${root}ir.json`,
        ...code ? { bundle: `${base}${CODE_DIR}/${code}/${BUNDLE_ENTRY}` } : {},
        search: `${root}search.json`,
        page: page.path,
        ...locale.translated ? { pages: locale.pages } : {},
        site: { ...documentSiteConfig({ site, base: ctx.base, dir, doc, lang: locale.lang, docs, workspace }), brandTitle: workspace ? siteTitle(site, locale.lang) : locale.doc.meta.title, layout: sitePageLayout(isRecord(locale.doc.config.renderers.web) ? locale.doc.config.renderers.web : {}, locale.lang) },
        plugins: [...new Set([...own.plugins, ...ctx.plugins])],
        origins: [],
        ...offline ? { serviceWorker: `${base}${SERVICE_WORKER}` } : {},
        rendered: true,
      }
      const title = pageTitle(page, locale.doc)
      await renderPage(built, join(out, locale.prefix, pageFile(page)), config, title, metaTags(shell, image, title), locale.doc, components)
      if (page.path === 'index' && landingDocument(site)?.dir === dir) {
        const landing = landingConfig(config, locale.doc, site, ctx.base, locale.translated ? locale.lang : '')
        const title = siteTitle(site, locale.lang)
        await renderPage(built, join(ctx.outDir, locale.prefix, 'index.html'), landing, title, metaTags(shell, image, title), locale.doc, components)
      }
    }
    for (const { path, section } of chapterRedirects(published)) writeFileSync(join(out, locale.prefix, `${path}.html`), chapterRedirect(section))
  }
  if (offline) writeServiceWorker(out, base, { dir: built.appDir, url: built.appUrl })
}

/** The page a chapter used to have: it goes on to the chapter's section on the document's page. */
function chapterRedirect(section: string): string {
  const target = `./#${encodeURIComponent(section)}`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${target}"><meta name="robots" content="noindex"></head><body><a href="${target}">${target}</a></body></html>\n`
}

/** A page that shows no document (the home page, a missing page), below the site's path. */
function pageConfig(kind: 'home' | 'missing', base: string, lang: string, site: SiteConfig, extra: Partial<AppConfig> = {}): AppConfig {
  return { kind, document: '', base, lang, site, origins: [], rendered: true, ...extra }
}

async function buildHome(site: SiteSpec, ctx: RenderContext, built: Built, docs: ReadonlyMap<string, IRDocument>): Promise<void> {
  const lang = siteLanguage(site, ctx.lang)
  const shell = siteShellBelow(site, ctx.base)
  const others = siteLanguages(site, lang)
  const locales = [{ lang, label: languageLabel(lang), base: ctx.base }, ...others.map(other => ({ lang: other.lang, label: languageLabel(other.lang), base: `${ctx.base}${other.lang}/` }))]
  const target = homeDocument(site)
  const landing = landingDocument(site)
  const independent = loadLanding(site, ctx)
  const page = independent?.kind === 'page' ? publishLanding(independent, site, ctx) : undefined
  const image = headImage(shell, url => publishedFile(ctx, ctx.outDir, ctx.base, { file: join(ctx.workspaceRoot, 'presmium.workspace.yaml'), line: 1 }, url))
  for (const locale of [{ lang, title: site.title, prefix: '' }, ...others.map(other => ({ ...other, prefix: `${other.lang}/` }))]) {
    const config = pageConfig('home', ctx.base, locale.lang, { title: locale.title, brandTitle: locale.title, root: `${ctx.base}${locale.prefix}`, shell, locales, links: {} }, {
      documents: homeDocuments(site, ctx.base, docs, locale.prefix ? locale.lang : undefined),
      plugins: ctx.plugins,
    })
    const list = join(ctx.outDir, locale.prefix, target || site.config.landing !== undefined ? `${LIST_PAGE}.html` : 'index.html')
    await renderPage(built, list, config, locale.title, metaTags(shell, image, locale.title), undefined, [])
    if (page) {
      const metadata = { ...shell, head: { ...shell.head, description: page.description ?? shell.head?.description } }
      await renderPage(built, join(ctx.outDir, locale.prefix, 'index.html'), { ...config, landingPage: page }, page.title, metaTags(metadata, image, page.title), undefined, [])
    }
    if (independent?.kind === 'template') {
      const output = await buildLandingTemplate(independent.file, join(ctx.workDir, 'landing', locale.lang), ctx.base, siteContent(site, ctx.base, locale.lang, config.documents ?? []), ctx.workspaceRoot)
      writeLandingTemplate(output, ctx.outDir, locale.prefix)
    }
    if (target) {
      const translated = locale.prefix && translationOf(target, locale.lang) ? `${documentBase(ctx.base, target.dir)}${locale.lang}/` : documentBase(ctx.base, target.dir)
      writeFileSync(join(ctx.outDir, locale.prefix, 'index.html'), redirectHtml(translated, target.title, locale.lang))
    }
    if (landing && locale.prefix && !translationOf(landing, locale.lang)) {
      writeFileSync(join(ctx.outDir, locale.prefix, 'index.html'), redirectHtml(ctx.base, site.title, locale.lang))
    }
  }
}

async function buildMissing(site: SiteSpec, ctx: RenderContext, built: Built, title: string, lang: string): Promise<void> {
  const shell = siteShellBelow(site, ctx.base)
  const config = pageConfig('missing', ctx.base, lang, { title, brandTitle: site.title, root: ctx.base, shell, locales: [{ lang, label: languageLabel(lang), base: ctx.base }], links: {} }, { plugins: ctx.plugins })
  await renderPage(built, join(ctx.outDir, '404.html'), config, title, [], undefined, [])
}

/** Builds the site of `documents` into `ctx.outDir`: a workspace's (with its home page), or one document's at the root. */
export async function buildSite(site: SiteSpec, ctx: RenderContext, documents: readonly BuiltDocument[]): Promise<void> {
  const workspace = !isSingle(site)
  // Invalid presentation settings fail before replacing an existing build.
  siteShellBelow(site, ctx.base)
  landingDocument(site)
  loadLanding(site, ctx)
  for (const entry of documents) for (const doc of [entry.doc, ...entry.translations.map(locale => locale.doc)]) sitePageLayout(isRecord(doc.config.renderers.web) ? doc.config.renderers.web : {}, doc.meta.lang)
  // A build starts empty, as the pages and files of an earlier one may be gone from the document.
  rmSync(ctx.outDir, { recursive: true, force: true })
  if (workspace) copyPublic(ctx.workspaceRoot, ctx.outDir)
  site = publishedSite(site, ctx)
  const built = await prepareApp(ctx, documents)
  // Also allow publishing from a branch without Jekyll filtering the viewer's _app and _code directories.
  writeFileSync(join(ctx.outDir, '.nojekyll'), '')
  const docs = new Map(documents.map(entry => [entry.dir, entry.doc] as const))
  if (workspace && ctx.config.home !== false) await buildHome(site, ctx, built, docs)
  for (const entry of documents) {
    try {
      await buildDocumentPages(site, ctx, built, entry, docs, workspace)
    } catch (error) {
      throw new Error(workspace ? `document ${entry.dir || '.'}: ${errorMessage(error)}` : errorMessage(error))
    }
  }
  const lang = siteLanguage(site, ctx.lang)
  await buildMissing(site, ctx, built, workspace ? site.title : documents[0]?.doc.meta.title ?? site.title, lang)
  const { sitemap } = siteShellBelow(site, ctx.base)
  if (sitemap) {
    const pages = workspace ? ['', ...sitemapPages(site)] : documents.flatMap(({ doc, translations }) => [
      ...webPages(doc).map(page => pageLink(page).replace(/^\//, '')),
      ...translations.flatMap(t => translationPages(t.doc, webPages(doc)).map(page => pageLink(page, `/${t.lang}`).replace(/^\//, ''))),
    ])
    await writeSitemap(join(ctx.outDir, 'sitemap.xml'), sitemap.hostname, ctx.base, pages)
  }
}

/**
 * Builds a document's slides into `ctx.outDir`: one page that shows them (the slides form of the viewer), with the
 * document's slides view (`{only} slides`), its code and files, as the web form's are built.
 */
export async function buildSlidesSite(doc: IRDocument, ctx: RenderContext, nodePlugins: readonly NodeVitePlugin[]): Promise<void> {
  rmSync(ctx.outDir, { recursive: true, force: true })
  const entry: BuiltDocument = { dir: '', doc, ctx, nodePlugins, translations: [] }
  const built = await prepareApp(ctx, [entry])
  mkdirSync(ctx.outDir, { recursive: true })
  const published = publishedDocument(doc, ctx, ctx.outDir, ctx.base)
  const { code } = await documentFiles(ctx, built, entry)
  writeFileSync(join(ctx.outDir, 'ir.json'), JSON.stringify(published))
  const lang = doc.meta.lang ?? ctx.lang ?? 'zh-CN'
  const site: SiteSpec = { title: doc.meta.title, documents: [{ dir: '', title: doc.meta.title, doc }], config: ctx.config }
  const config: AppConfig = {
    kind: 'document',
    document: '',
    base: ctx.base,
    lang,
    form: 'slides',
    ir: `${ctx.base}ir.json`,
    ...code ? { bundle: `${ctx.base}${CODE_DIR}/${code}/${BUNDLE_ENTRY}` } : {},
    site: documentSiteConfig({ site, base: ctx.base, dir: '', doc, lang, docs: new Map(), workspace: false }),
    plugins: ctx.plugins,
    origins: [],
  }
  writeFileSync(join(ctx.outDir, 'index.html'), pageHtml({ entry: appEntry(built.app), appUrl: built.appUrl, shared: built.app.manifest.shared, config, title: doc.meta.title }))
}
