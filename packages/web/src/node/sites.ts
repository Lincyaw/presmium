/**
 * The workspace site (P-122, docs/ir.md 6.3, docs/architecture.md 4.10): a
 * home page that lists the documents, and each document under
 * `<base><dir>/`, paged by chapter. The site shell of the workspace's `site`
 * (P-78) is on every page. With `site.home` the home page leads to that
 * document, and the list is `documents.html`. Each document's search box
 * finds the other documents too, under their titles, and the doc footer of a
 * document's first and last pages links the documents before and after it,
 * in the order of the configuration. The site has one sitemap, the home
 * page's, with every document's pages.
 *
 * Each document is the web form of its deck (its plugins, components and
 * search index) under its directory; the home page is one more VitePress
 * site at the base. `buildSite` builds them into one output directory: the
 * home page and each document with its IR (`doc`); a host that builds the
 * documents apart from the home page sets `ctx.config.home` to false.
 * `devSite` is a router: a request under `<base><dir>/` goes to the dev
 * server of that document, started on its first request with the IR
 * `compile` gives; any other path goes to the home page's dev server; the
 * HMR WebSockets follow the same paths. The documents of `SiteSpec` are read
 * at each request, so a host that adds or removes one in that list (and
 * calls `update` for a new one) changes the site without restarting it. The
 * home page's live list (`DOCUMENTS_ENDPOINT`) gives what each compiled
 * document's card shows, and its sections for the launcher's search; asked
 * with `?compile=1`, the documents not compiled yet compile in the
 * background, one at a time, and the list says so meanwhile (`compiling`).
 *
 * A site whose dev servers have previews (`RenderContext.preview`, the
 * workspace service without its interface) gives each document's the
 * preview agent, and its home page is the documents' cards, as when built.
 *
 * A document's plugins are those its IR names (`config.plugins`): a host
 * gives the package directories the compiler loaded as absolute paths, so
 * the site loads exactly those; a name is looked up in `ctx.pluginDirs`, then from
 * the deck's directory. The site's own plugins (`ctx.plugins`, e.g. the
 * workspace's browser plugin) are added to every page; those of the home page
 * only (`ctx.config.homePlugins`, package name to directory: in `presmium
 * serve` the operator plugins, e.g. the assistant's `AGENT` for drafting a
 * document) to the home page.
 *
 * A link of a document to another document's entry file or directory
 * (`../bpe/lecture.md#extend-c`, `RenderContext.documentLink`, C-4) goes to
 * that document's page of the section or label its fragment names
 * (`/bpe/extend.html#extend-c`); a document's source is never published.
 *
 * The translations a document declares (`SiteDocument.translations`, P-123)
 * are published as a build of the document alone publishes them: each under
 * `<base><dir>/<lang>/`, with the document's language menu. The home page
 * has a locale for each language of the translations, `<base><lang>/`, which
 * lists each document in that language when it has a translation in it (its
 * original otherwise); its title is `site.locales.<lang>.title`, else the
 * site's. A link written in a translation to another document goes to that
 * document's translation into the same language when it has one.
 */
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LANG, deckLocale, docBlocks, errorMessage, isRecord, localRequestRefusal, nodeMdast } from '@presmium/kernel'
import type { DocumentLink, Finding, IRDocument, MdastNode, RenderContext, RenderOutput, SiteDevServer, SiteDocument, SiteSpec, SourcePos } from '@presmium/kernel'
import { FONT_LICENSE, fontLicense, optimizeDeps } from '@presmium/kernel/node'
import { createProxyServer } from 'http-proxy-3'
import { pageLink, searchDocuments, sectionLinks, siteShell, SITE_LABELS, toPages, translationPages, urlPath } from '../domain/index.ts'
import type { Neighbour, SearchDocument, WebPage } from '../domain/index.ts'
import { clientModules } from './addons.ts'
import type { ClientModules } from './addons.ts'
import { publishedFile } from './publish.ts'
import type { DocumentPage } from './publish.ts'
import { buildDocument, devDocument } from './renderer.ts'
import type { DocumentDevServer, DocumentSite } from './renderer.ts'
import { browserPackages, languageLabel, linkDependencies, OG_TITLE, SRC_EXCLUDE, write } from './site.ts'
import type { WorkspaceOptions } from './site.ts'
import { vitepressBuild, vitepressDev } from './vitepress.ts'

const HOME_THEME = fileURLToPath(new URL('../client/home.ts', import.meta.url))
const VITE_PLUGIN = fileURLToPath(new URL('./vite.ts', import.meta.url))
/** The dev servers behind the router listen here only. */
const LOOPBACK = '127.0.0.1'
const GENERATED = '// Generated by @presmium/web for a workspace site; do not edit.'
/** The live list of documents a served home page reads, under the site's base. */
export const DOCUMENTS_ENDPOINT = '@presmium/documents.json'
/** The page of the documents list when `site.home` makes a document the home page. */
const LIST_PAGE = 'documents'
/** The workspace's configuration at its root, to which the site's local `head.image` is relative. */
const WORKSPACE_FILE = 'presmium.workspace.yaml'
/** A document's entry file in its directory. */
const DECK_ENTRY = 'lecture.md'
/** URLs that name no file: a scheme, protocol-relative, or a fragment. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i
/** The language of a link to another document found in a translation (`documentContext`), for `documentPage`. */
const LINK_LANGUAGE = new WeakMap<DocumentLink, string>()
/** The options of the workspace's `site` that make the site shell (P-78). */
const SHELL_KEYS = ['nav', 'footer', 'head', 'sitemap']

/** The site shell's options of the workspace's `site`, as a document's renderer options. */
function shellOptions(site: SiteSpec): Record<string, unknown> {
  return Object.fromEntries(SHELL_KEYS.filter(key => key in site.config).map(key => [key, site.config[key]]))
}

/** The document that `site.home` makes the home page, when it is one of the site's. */
function homeDocument(site: SiteSpec): SiteDocument | undefined {
  return site.home === undefined ? undefined : site.documents.find(doc => doc.dir === site.home && doc.dir !== '')
}

/** Where the site's pages link the home page: the documents list. */
function listLink(site: SiteSpec, base: string): string {
  return homeDocument(site) ? `${base}${LIST_PAGE}.html` : base
}

/** A document as the home page lists it. */
export interface HomeDocument {
  dir: string
  title: string
  lang?: string
  tags?: string[]
  href: string
  /** Once the document is compiled: its headmatter's `description`, its number of pages and its findings (the card shows them). */
  description?: string
  pages?: number
  problems?: { errors: number, warnings: number }
  /** Once the document is compiled: its sections with a title, each linked, which the launcher's search finds. */
  sections?: { id: string, title: string, href: string }[]
}

/** The base of a document's pages. */
function documentBase(base: string, dir: string): string {
  return dir ? `${base}${urlPath(dir)}/` : base
}

/** The endpoints of a document's dev server, under its base: `presmium serve` answers `/__presmium/` itself. */
function endpoints(base: string): WorkspaceOptions['endpoints'] {
  return { ir: `${base}@presmium/ir`, source: `${base}@presmium/source` }
}

/** The documents as the home page lists them; `compiled` holds the IR of documents compiled since the site started (dev). */
function homeDocuments(site: SiteSpec, base: string, compiled: ReadonlyMap<string, IRDocument> = new Map()): HomeDocument[] {
  return site.documents.map(({ dir, title, lang, tags, doc }) => ({ dir, title, ...lang ? { lang } : {}, ...tags?.length ? { tags } : {}, href: documentBase(base, dir), ...cardOf(compiled.get(dir) ?? doc, documentBase(base, dir)) }))
}

/** The languages of the documents' translations (P-123) but the site's own, in the order they come: the home page's locales. */
function siteLanguages(site: SiteSpec, lang: string): string[] {
  return [...new Set(site.documents.flatMap(entry => (entry.translations ?? []).map(t => t.lang)))].filter(other => other !== lang)
}

/** A document's translation into `lang`, with its pages, named as the original's (`translationPages`). */
function translationOf(entry: SiteDocument, lang: string): { doc: IRDocument, pages: WebPage[] } | undefined {
  const translated = entry.translations?.find(t => t.lang === lang)
  return translated && entry.doc ? { doc: translated.doc, pages: translationPages(translated.doc, toPages(entry.doc)) } : undefined
}

/** The documents as the home page of the locale `lang` lists them: in that language when translated into it, else the original. */
function localeDocuments(site: SiteSpec, base: string, lang: string): HomeDocument[] {
  return site.documents.map((entry) => {
    const translated = translationOf(entry, lang)
    if (!translated) return homeDocuments({ ...site, documents: [entry] }, base)[0]!
    const root = `${documentBase(base, entry.dir)}${lang}/`
    return { dir: entry.dir, title: translated.doc.meta.title, lang, ...entry.tags?.length ? { tags: entry.tags } : {}, href: root, ...cardOf(translated.doc, root, translated.pages) }
  })
}

/** What a document's card shows of its IR: the headmatter's `description`, the number of pages, the findings by severity; and its sections, linked under `root`. */
function cardOf(doc: IRDocument | undefined, root: string, pages = doc && toPages(doc)): Pick<HomeDocument, 'description' | 'pages' | 'problems' | 'sections'> {
  if (!doc || !pages) return {}
  const description = typeof doc.meta.description === 'string' ? doc.meta.description.trim() : ''
  const count = (severity: Finding['severity']) => doc.diagnostics.filter(finding => finding.severity === severity).length
  const links = sectionLinks(pages)
  const sections = doc.sections.flatMap(section => (section.title && links[section.id] ? [{ id: section.id, title: section.title, href: `${root}${links[section.id]!.slice(1)}` }] : []))
  return { ...description ? { description } : {}, pages: pages.length, problems: { errors: count('error'), warnings: count('warning') }, sections }
}

/** The package directory of `name`, found in `node_modules` up from `from`. */
function packageDir(name: string, from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    if (dirname(dir) === dir) return undefined
  }
}

/**
 * Where Presmium's own packages are installed: the repository of a checkout
 * (it has `pnpm-workspace.yaml`), else the directory that holds the
 * outermost `node_modules` above this package. The dev servers serve its files.
 */
function presmiumRoot(): string {
  const own = realpathSync(fileURLToPath(new URL('../..', import.meta.url)))
  let outermost: string | undefined
  for (let dir = own; dirname(dir) !== dir; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (dir.split(sep).at(-1) === 'node_modules') outermost = dirname(dir)
  }
  return outermost ?? own
}

/**
 * The site's own client modules (`ctx.plugins`, without a deck of their own):
 * the same for every page, with their `vite.config.ts` (e.g. the workspace's,
 * whose source editor's dependencies are not optimized).
 */
function siteModules(ctx: RenderContext): ClientModules {
  const { components, plugins, viewers, vite } = clientModules({ ...ctx, deckDir: join(ctx.workDir, 'site-plugins') }, [])
  return { components, plugins, viewers, vite, nodeVite: [] }
}

/** The plugins of the home page only (`ctx.config.homePlugins`): package name to directory. */
function homePluginDirs(ctx: RenderContext): Record<string, string> {
  const { homePlugins } = ctx.config
  if (!homePlugins || typeof homePlugins !== 'object') return {}
  return Object.fromEntries(Object.entries(homePlugins).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && existsSync(entry[1])))
}

/** The home page's client modules: the site's own, then those of its own plugins (`homePluginDirs`), each once. */
function homeModules(ctx: RenderContext): ClientModules {
  const own = homePluginDirs(ctx)
  const names = Object.keys(own).filter(name => !Object.values(ctx.pluginDirs).includes(own[name]!))
  return siteModules({ ...ctx, plugins: [...ctx.plugins, ...names], pluginDirs: { ...ctx.pluginDirs, ...own } })
}

/** A URL escape decoded; a malformed one stays as written. */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * The document of the workspace a block's URL links to (`RenderContext.documentLink`,
 * C-4): a document's entry file or its directory, by its real path, with the
 * URL's fragment. The site's context gives it when its host does; else it is
 * found here as the compiler finds it: the workspace's site context
 * (`siteContext` of @presmium/workspace, which `presmium build` and `serve`
 * use for a workspace) gives neither `documentLink` nor the compiler's guard
 * against publishing a document's source, so this copy and the guard in
 * `documentContext` stay until it does.
 */
function documentLinkOf(ctx: RenderContext): (source: SourcePos, url: string) => DocumentLink | undefined {
  if (ctx.documentLink) return (source, url) => ctx.documentLink!(source, url)
  return (source, url) => {
    const path = url.replace(/[?#].*$/s, '')
    if (REMOTE.test(url) || !path || path.startsWith('/')) return undefined
    let target: string
    try {
      target = realpathSync(resolve(dirname(source.file), decoded(path)))
    } catch {
      return undefined
    }
    const stat = statSync(target)
    const dir = stat.isFile() && basename(target) === DECK_ENTRY ? dirname(target) : stat.isDirectory() && existsSync(join(target, DECK_ENTRY)) ? target : undefined
    const rel = dir === undefined ? undefined : relative(realpathSync(ctx.workspaceRoot), dir)
    if (rel === undefined || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined
    const hash = url.indexOf('#')
    const fragment = hash < 0 ? '' : decoded(url.slice(hash + 1))
    return { dir: rel.split(sep).join('/'), ...fragment ? { fragment } : {} }
  }
}

/** The section of a document that holds a label (a block's id, a figure's or an equation's). */
function labelSection(doc: IRDocument, label: string): string | undefined {
  const named = (node: MdastNode): boolean => node.identifier === label || node.label === label || Boolean(node.children?.some(named))
  for (const { section, block } of docBlocks(doc)) {
    if (block.id === label || nodeMdast(block.node).some(named)) return section.id
  }
  return undefined
}

/**
 * Where a link to a document of the site goes (F-25): that document's page of
 * the section its fragment names (at the section, unless it opens the page),
 * or of the section holding the label, at the label; its first page without a
 * fragment. A document not compiled yet (a dev site) is linked at its
 * directory; one that is not in the site keeps the link as written.
 */
function documentPage(site: SiteSpec, base: string, docs: Map<string, IRDocument>): DocumentPage {
  return (link) => {
    const { dir, fragment } = link
    const entry = site.documents.find(other => other.dir === dir)
    if (!entry) return undefined
    // From a translation, the linked document's translation into its language, at the same page (`translationPages`).
    const lang = LINK_LANGUAGE.get(link)
    const translated = lang ? translationOf(entry, lang) : undefined
    const root = `${documentBase(base, dir)}${translated ? `${lang}/` : ''}`
    const anchor = fragment ? `#${encodeURIComponent(fragment)}` : ''
    const doc = docs.get(dir)
    if (!doc || !fragment) return `${root}${anchor}`
    // Site-relative links of the document's sections: `/`, `/extend.html`, `/extend.html#extend-c`.
    const links = sectionLinks(translated?.pages ?? toPages(doc))
    if (links[fragment]) return `${root}${links[fragment].slice(1)}`
    const section = labelSection(doc, fragment)
    return `${root}${(section ? links[section]!.split('#')[0]! : '/').slice(1)}${anchor}`
  }
}

/** The files of a document's sections and blocks. */
function sourceFiles(doc: IRDocument): Set<string> {
  return new Set([...doc.sections.map(section => section.source.file), ...[...docBlocks(doc)].map(({ block }) => block.source.file)])
}

/** The language of each file that only a translation of `doc` holds (its entry, the files it includes). */
function translatedFiles(doc: IRDocument, translations: SiteDocument['translations'] = []): Map<string, string> {
  const original = sourceFiles(doc)
  const files = new Map<string, string>()
  for (const { lang, doc: translated } of translations) {
    for (const file of sourceFiles(translated)) if (!original.has(file)) files.set(file, lang)
  }
  return files
}

/**
 * The render context of one document of the site: its deck directory, its
 * plugins, its base under the site's, `/…` URLs found in its own `public/`,
 * and its links to documents, whose sources are not published.
 */
function documentContext(ctx: RenderContext, site: SiteSpec, dir: string, doc: IRDocument, outDir: string, workDir: string): RenderContext {
  const linkOf = documentLinkOf(ctx)
  const entry = site.documents.find(other => other.dir === dir)
  const translated = translatedFiles(doc, entry?.translations)
  const documentLink = (source: SourcePos, url: string): DocumentLink | undefined => {
    const link = linkOf(source, url)
    const lang = translated.get(source.file)
    if (link && lang) LINK_LANGUAGE.set(link, lang)
    return link
  }
  const deckDir = join(ctx.workspaceRoot, dir)
  const pluginDirs: Record<string, string> = {}
  for (const name of doc.config.plugins) {
    const found = isAbsolute(name) ? name : ctx.pluginDirs[name] ?? packageDir(name, deckDir)
    if (found && existsSync(found)) pluginDirs[name] = found
  }
  return {
    ...ctx,
    deckDir,
    outDir,
    workDir,
    // The site's options are the site's; a deck's `renderers.web` (its port, its base, its shell) does not apply here.
    config: shellOptions(site),
    plugins: doc.config.plugins.filter(name => pluginDirs[name]),
    pluginDirs,
    lang: doc.meta.lang,
    base: documentBase(ctx.base, dir),
    vitePlugins: [],
    // Its translations (P-123), each a locale of its site under `<lang>/`, as a build of the document alone has them.
    translations: entry?.translations,
    documentLink,
    localAsset(source, url) {
      if (documentLink(source, url)) return undefined
      if (!url.startsWith('/') || url.startsWith('//')) {
        const found = ctx.localAsset(source, url)
        // A document's source under another name (a link to its entry file) is not published either.
        return found && basename(realpathSync(found.file)) === DECK_ENTRY ? undefined : found
      }
      // `/…` is the deck's own public/: named relative to the block's file, which the site's context resolves.
      // Another `/…` is a path of the site, not a file to publish.
      const path = url.replace(/[?#].*$/s, '')
      let file = join(deckDir, 'public', path)
      try {
        file = join(deckDir, 'public', decodeURIComponent(path))
      } catch {
        // As written.
      }
      if (!existsSync(file)) return undefined
      const rel = relative(dirname(source.file), join(deckDir, 'public', path)).split(sep).join('/')
      return ctx.localAsset(source, `${rel}${url.slice(path.length)}`)
    },
  }
}

/** The work directory of a document, under the site's. */
function documentWorkDir(ctx: RenderContext, dir: string): string {
  return join(ctx.workDir, 'documents', dir ? encodeURIComponent(dir) : '_')
}

/** A document's first page, or its directory while it is not compiled; the link relative to the site's base. */
function firstPage(entry: SiteDocument, doc?: IRDocument): Neighbour {
  const page = doc && toPages(doc)[0]
  return { text: page?.title ?? entry.title, link: `${urlPath(entry.dir)}/` }
}

/** A document's last page, or its directory while it is not compiled; the link relative to the site's base. */
function lastPage(entry: SiteDocument, doc?: IRDocument): Neighbour {
  const page = doc && toPages(doc).at(-1)
  return page ? { text: page.title, link: `${urlPath(entry.dir)}${pageLink(page)}` } : { text: entry.title, link: `${urlPath(entry.dir)}/` }
}

/**
 * How a document of the site links the others (P-122): the doc footer of
 * its first and last pages goes to the documents before and after it, and
 * its search box finds the other documents, under their titles. `docs` are
 * the documents compiled so far.
 */
function siteLinks(site: SiteSpec, base: string, dir: string, docs: Map<string, IRDocument>): Pick<WorkspaceOptions, 'neighbours' | 'search'> {
  const listed = site.documents.filter(entry => entry.dir !== '')
  const i = listed.findIndex(entry => entry.dir === dir)
  const before = listed[i - 1]
  const after = listed[i + 1]
  const search: SearchDocument[] = listed.flatMap((entry) => {
    const doc = docs.get(entry.dir)
    return entry.dir === dir || !doc ? [] : searchDocuments(doc, documentBase(base, entry.dir), toPages(doc), [entry.title])
  })
  return {
    neighbours: i < 0 ? {} : { ...before ? { prev: lastPage(before, docs.get(before.dir)) } : {}, ...after ? { next: firstPage(after, docs.get(after.dir)) } : {} },
    search,
  }
}

function documentSite(ctx: RenderContext, site: SiteSpec, dir: string, extra: ClientModules, served: boolean, allow: string[], docs: Map<string, IRDocument>): DocumentSite {
  const base = documentBase(ctx.base, dir)
  const single = site.documents.length === 1 && site.documents[0]!.dir === ''
  return {
    documentPage: documentPage(site, ctx.base, docs),
    workspace: { document: dir, home: single ? base : listLink(site, ctx.base), endpoints: endpoints(base), served, allow, ...siteLinks(site, ctx.base, dir, docs) },
    extra,
    config: join(ctx.workspaceRoot, WORKSPACE_FILE),
  }
}

/** Every page of the site's documents and of their translations, relative to its base, for its sitemap. */
function sitemapPages(site: SiteSpec): string[] {
  return site.documents.flatMap((entry) => {
    if (!entry.doc || !entry.dir) return []
    const translated = (entry.translations ?? []).flatMap(({ lang }) => translationOf(entry, lang)?.pages.map(page => pageLink(page, `/${lang}`)) ?? [])
    return [...toPages(entry.doc).map(page => pageLink(page)), ...translated].map(link => `${urlPath(entry.dir)}${link}`.replace(/^\//, ''))
  })
}

/**
 * The home page's VitePress project: the documents, the site's plugins; in
 * dev, the list comes from the router. With a home document, `index.md`
 * leads to it (a refresh in the page's head, and the theme in the browser)
 * and the list is `documents.md`. The site shell as on every page, and the
 * site's sitemap. `served`: the page has the server (the workbench of
 * `presmium serve`); a dev server's (`allow`) without it shows the
 * documents' cards, as the built site does.
 */
function writeHome(workDir: string, site: SiteSpec, ctx: RenderContext, modules: ClientModules, served: boolean, allow?: string[]): string {
  const root = join(workDir, 'site')
  const lang = typeof site.config.lang === 'string' ? site.config.lang : site.documents.find(doc => doc.lang)?.lang ?? ctx.lang ?? DEFAULT_LANG
  const labels = SITE_LABELS[deckLocale(lang)]
  const shell = siteShell(site.config)
  const dataFile = join(workDir, 'home.json')
  const home = homeDocument(site)
  const target = home && documentBase(ctx.base, home.dir)
  // A locale of the home page for each language of the documents' translations (P-123).
  const titles = isRecord(site.config.locales) ? site.config.locales : {}
  const locales = siteLanguages(site, lang).map((other) => {
    const own = titles[other]
    const translatedHome = home && translationOf(home, other) ? `${target}${other}/` : target
    return {
      lang: other,
      label: languageLabel(other),
      title: isRecord(own) && typeof own.title === 'string' ? own.title : site.title,
      themeConfig: SITE_LABELS[deckLocale(other)].themeConfig,
      documents: localeDocuments(site, ctx.base, other),
      ...translatedHome ? { redirect: translatedHome, list: `${ctx.base}${other}/${LIST_PAGE}.html` } : {},
    }
  })
  write(dataFile, JSON.stringify({ title: site.title, label: languageLabel(lang), documents: homeDocuments(site, ctx.base), locales, sitemap: sitemapPages(site) }))
  write(join(workDir, '.gitignore'), '*\n')
  linkDependencies(root)
  const optimize = optimizeDeps(root, browserPackages(modules))
  const publicDir = join(root, 'public')
  // The fonts the design system bundles go with their license (NOTICE), at the site's root too.
  write(join(publicDir, FONT_LICENSE), fontLicense(import.meta.url))
  const image = shell.head?.image && (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(shell.head.image)
    ? shell.head.image
    : publishedFile(ctx, publicDir, ctx.base, { file: join(ctx.workspaceRoot, WORKSPACE_FILE), line: 1 }, shell.head.image))
  const head: unknown[] = shell.head
    ? [['meta', { property: 'og:type', content: 'website' }], ...shell.head.description ? [['meta', { property: 'og:description', content: shell.head.description }]] : [], ...image ? [['meta', { property: 'og:image', content: shell.sitemap && image.startsWith('/') ? `${shell.sitemap.hostname}${image}` : image }]] : []]
    : []
  const config = {
    lang,
    base: ctx.base,
    cleanUrls: false,
    ignoreDeadLinks: true,
    srcExclude: SRC_EXCLUDE,
    ...shell.head?.description ? { description: shell.head.description } : {},
    head,
    themeConfig: { ...labels.themeConfig, ...shell.nav ? { nav: shell.nav } : {}, ...shell.footer ? { footer: shell.footer } : {} },
  }
  const sitemap = shell.sitemap ? `site.sitemap = { hostname: ${JSON.stringify(`${shell.sitemap.hostname}${ctx.base}`)}, transformItems: items => [...items, ...data.sitemap.map(url => ({ url }))] }\n` : ''
  // The Vite plugins of the site's own plugins (their `vite.config.ts`), as a document's site has them.
  const vite = modules.vite.map((file, i) => `import vite${i} from ${JSON.stringify(file)}\n`).join('')
  write(join(root, '.vitepress/config.mjs'), `${GENERATED}
import { readFileSync } from 'node:fs'
import { presmiumReady } from ${JSON.stringify(VITE_PLUGIN)}
${vite}
const site = ${JSON.stringify(config, null, 2)}
const data = JSON.parse(readFileSync(${JSON.stringify(dataFile)}, 'utf8'))
site.title = data.title
site.themeConfig.presmium = { home: true, documents: data.documents${target ? `, redirect: ${JSON.stringify(target)}, list: ${JSON.stringify(`${ctx.base}${LIST_PAGE}.html`)}` : ''}${served ? `, server: true, endpoint: ${JSON.stringify(`${ctx.base}${DOCUMENTS_ENDPOINT}`)}` : ''} }
// The languages of the documents' translations (P-123): a locale each, which lists the documents in its language.
if (data.locales.length > 0) {
  site.locales = { root: { label: data.label, lang: site.lang } }
  for (const locale of data.locales) {
    const presmium = { ...site.themeConfig.presmium, documents: locale.documents, ...locale.redirect ? { redirect: locale.redirect, list: locale.list } : {} }
    site.locales[locale.lang] = { label: locale.label, lang: locale.lang, title: locale.title, themeConfig: { ...locale.themeConfig, presmium } }
  }
}
site.vite = { plugins: [presmiumReady(), ...[${modules.vite.map((_, i) => `vite${i}`).join(', ')}].flatMap(config => config?.plugins ?? [])], resolve: { dedupe: ['vue'] }${optimize.include.length + optimize.exclude.length > 0 ? `, optimizeDeps: ${JSON.stringify(optimize)}` : ''}${allow ? `, server: { fs: { allow: ${JSON.stringify(allow)} } }` : ''} }
${sitemap}${shell.head ? OG_TITLE : ''}
export default site
`)
  const load = (file: string) => `() => import(${JSON.stringify(file)})`
  write(join(root, '.vitepress/theme/index.ts'), `${GENERATED}
import { createSiteHomeTheme } from ${JSON.stringify(HOME_THEME)}

const ssr = import.meta.env.SSR
export default createSiteHomeTheme({
  plugins: ssr ? [] : [
${modules.plugins.map(file => `    ${load(file)},`).join('\n')}
  ],
})
`)
  writeIndex(root, home?.title, target)
  // The pages of each locale under `<lang>/`; those of languages no longer translated go.
  const langs = new Set(locales.map(locale => locale.lang))
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !['public', 'node_modules'].includes(entry.name) && !langs.has(entry.name)) rmSync(join(root, entry.name), { recursive: true, force: true })
  }
  for (const locale of locales) writeIndex(join(root, locale.lang), locale.documents.find(doc => doc.dir === home?.dir)?.title, locale.redirect, true)
  return root
}

/**
 * The home page in `dir`: the documents list, or, with a home document, a
 * page leading to `target` (its title `title`) and the list in
 * `documents.md`. A locale's list is rendered in the browser only
 * (`clientOnly`): the server render of the home page has the site's
 * language, not the locale's.
 */
function writeIndex(dir: string, title: string | undefined, target: string | undefined, clientOnly = false): void {
  const list = `---\nlayout: page\n---\n\n${clientOnly ? '<ClientOnly><PresmiumSiteHome /></ClientOnly>' : '<PresmiumSiteHome />'}\n`
  if (target) {
    const refresh = JSON.stringify(['meta', { 'http-equiv': 'refresh', 'content': `0; url=${target}` }])
    write(join(dir, 'index.md'), `---\nlayout: page\ntitle: ${JSON.stringify(title ?? '')}\nhead:\n  - ${refresh}\n---\n\n<PresmiumSiteRedirect />\n`)
    write(join(dir, `${LIST_PAGE}.md`), list)
  } else {
    write(join(dir, 'index.md'), list)
    rmSync(join(dir, `${LIST_PAGE}.md`), { force: true })
  }
}

/** Directories a dev server may serve files of: its project, the deck, the plugins, Presmium's packages. */
function allowed(...dirs: (string | undefined)[]): string[] {
  return [...new Set(dirs.filter((dir): dir is string => Boolean(dir)).map(dir => (existsSync(dir) ? realpathSync(dir) : dir)))]
}

export async function buildSite(site: SiteSpec, ctx: RenderContext): Promise<RenderOutput> {
  const extra = siteModules(ctx)
  const single = site.documents.length === 1 && site.documents[0]!.dir === ''
  // The home page first: VitePress empties the directory it builds into, and the documents lie under it.
  if (!single && ctx.config.home !== false) {
    const work = join(ctx.workDir, 'home')
    const root = writeHome(work, site, ctx, homeModules(ctx), false)
    const code = await vitepressBuild(root, ctx.outDir)
    if (code !== 0) throw new Error(`vitepress build of the home page exited with code ${code}`)
  }
  const docs = new Map(site.documents.flatMap(entry => (entry.doc ? [[entry.dir, entry.doc] as const] : [])))
  for (const entry of site.documents) {
    if (!entry.doc) continue
    const workDir = documentWorkDir(ctx, entry.dir)
    const dctx = documentContext(ctx, site, entry.dir, entry.doc, join(ctx.outDir, entry.dir), workDir)
    try {
      await buildDocument(entry.doc, dctx, workDir, documentSite(ctx, site, entry.dir, extra, false, [], docs))
    } catch (error) {
      throw new Error(`document ${entry.dir || '.'}: ${errorMessage(error)}`)
    }
  }
  return { outDir: ctx.outDir, skipped: [] }
}

export async function devSite(site: SiteSpec, ctx: RenderContext, compile: (dir: string) => Promise<IRDocument>): Promise<SiteDevServer> {
  const extra = siteModules(ctx)
  const shared = allowed(presmiumRoot(), ...Object.values(ctx.pluginDirs))
  const latest = new Map<string, IRDocument>()
  const documents = new Map<string, Promise<DocumentDevServer>>()
  /** How each running document's site links the others, refreshed as documents compile (written at its next update). */
  const linking = new Map<string, DocumentSite>()
  let home: Promise<{ port: number, close(): Promise<void> }> | undefined
  let closed = false
  // Stops the dev servers still starting when the site closes.
  const stopping = new AbortController()
  const base = ctx.base

  const startDocument = (dir: string): Promise<DocumentDevServer> => {
    let started = documents.get(dir)
    if (!started) {
      started = (async () => {
        const doc = latest.get(dir) ?? await compile(dir)
        latest.set(dir, doc)
        const workDir = documentWorkDir(ctx, dir)
        mkdirSync(workDir, { recursive: true })
        const dctx = documentContext(ctx, site, dir, doc, workDir, workDir)
        const allow = allowed(join(workDir, 'site'), dctx.deckDir, ...Object.values(dctx.pluginDirs), ...shared)
        const document = documentSite(ctx, site, dir, extra, true, allow, latest)
        linking.set(dir, document)
        return devDocument(doc, dctx, document, 0, { host: LOOPBACK, signal: stopping.signal })
      })()
      started.catch(() => documents.delete(dir))
      documents.set(dir, started)
    }
    return started
  }

  const startHome = () => {
    if (home) return home
    home = (async () => {
      const work = join(ctx.workDir, 'home')
      // The site of previews (the workspace service without its interface): its home page is the documents' cards.
      const root = writeHome(work, site, ctx, homeModules(ctx), !ctx.preview, allowed(join(work, 'site'), ...shared, ...Object.values(homePluginDirs(ctx))))
      const server = await vitepressDev(root, 0, () => {}, { host: LOOPBACK, signal: stopping.signal })
      return { port: server.port, close: () => server.close() }
    })()
    // A home page that failed to start is started again on the next request.
    home.catch(() => {
      home = undefined
    })
    return home
  }

  /** The dev server for a path: its document's, or the home page's; documents no longer listed are closed. */
  const targetOf = async (path: string): Promise<number> => {
    const listed = new Set(site.documents.map(doc => doc.dir))
    for (const [dir, server] of documents) {
      if (listed.has(dir)) continue
      documents.delete(dir)
      latest.delete(dir)
      linking.delete(dir)
      void server.then(s => s.close(), () => undefined)
    }
    let rest = path.startsWith(base) ? path.slice(base.length) : undefined
    if (rest !== undefined) {
      try {
        rest = decodeURIComponent(rest)
      } catch {
        // As written.
      }
    }
    const dir = rest === undefined
      ? undefined
      : [...listed].filter(d => d === '' || rest === d || rest!.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0]
    if (dir !== undefined) return (await startDocument(dir)).port
    return (await startHome()).port
  }

  /** The documents compiling for the home page's list, one at a time: a compilation may run the deck's code. */
  const compiling = new Set<string>()
  const compileListed = () => {
    const waiting = site.documents.map(doc => doc.dir).filter(dir => !latest.has(dir) && !compiling.has(dir))
    if (waiting.length === 0) return
    for (const dir of waiting) compiling.add(dir)
    void (async () => {
      for (const dir of waiting) {
        try {
          // The host's `update` keeps the IR (`latest`); a document gone meanwhile is not compiled.
          if (!closed && site.documents.some(doc => doc.dir === dir)) {
            const doc = await compile(dir)
            if (site.documents.some(entry => entry.dir === dir)) latest.set(dir, doc)
          }
        } catch {
          // Its card stays without what the compilation tells; its page says why.
        } finally {
          compiling.delete(dir)
        }
      }
    })()
  }

  const proxy = createProxyServer({ ws: true, xfwd: false })
  proxy.on('error', (error: Error, _req: unknown, res: unknown) => {
    const response = res as ServerResponse | Duplex | undefined
    if (response && 'writeHead' in response && !response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(`site proxy error: ${error.message}`)
    } else {
      response?.destroy?.()
    }
  })
  const pathOf = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://site').pathname
  // The router and the documents' dev servers are reached through serve with a loopback Host; a page of
  // another site (DNS rebinding, cross-site requests) is refused.
  const server = createServer((req, res) => {
    const refused = localRequestRefusal(req.headers)
    if (refused) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(refused)
      return
    }
    const path = pathOf(req)
    if (path === `${base}${DOCUMENTS_ENDPOINT}`) {
      // `?compile=1` (the launcher's search): the documents not compiled yet compile, so their sections are listed.
      if (new URL(req.url ?? '/', 'http://site').searchParams.get('compile') === '1') compileListed()
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ title: site.title, documents: homeDocuments(site, base, latest), ...compiling.size > 0 ? { compiling: true } : {} }))
      return
    }
    targetOf(path).then(
      port => proxy.web(req, res, { target: `http://${LOOPBACK}:${port}` }),
      (error: unknown) => {
        if (res.headersSent) return res.destroy()
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`the site could not show ${path}: ${errorMessage(error)}`)
      },
    )
  })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (localRequestRefusal(req.headers)) return socket.destroy()
    targetOf(pathOf(req)).then(
      port => proxy.ws(req, socket, head, { target: `http://${LOOPBACK}:${port}` }),
      () => socket.destroy(),
    )
  })
  const host = typeof ctx.config.host === 'string' && ctx.config.host ? ctx.config.host : '127.0.0.1'
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(ctx.config.port) || 0, host, () => resolve((server.address() as AddressInfo).port))
  })

  return {
    url: `http://${host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host}:${port}${base}`,
    async update(dir: string, doc: IRDocument) {
      if (closed) return
      latest.set(dir, doc)
      const entry = site.documents.find(d => d.dir === dir)
      const known: SiteDocument = { dir, title: doc.meta.title, ...doc.meta.lang ? { lang: doc.meta.lang } : {}, ...Array.isArray(doc.meta.tags) ? { tags: (doc.meta.tags as unknown[]).filter((t): t is string => typeof t === 'string') } : {} }
      if (entry) Object.assign(entry, known)
      else site.documents.push(known)
      for (const [other, document] of linking) Object.assign(document.workspace!, siteLinks(site, base, other, latest))
      // A server still starting (perhaps from the compilation that calls this) takes the update once it runs.
      const running = documents.get(dir)
      if (running) void running.then(server => server.update(doc)).catch((error: unknown) => console.error(`[presmium] the site did not update ${dir}: ${errorMessage(error)}`))
    },
    async close() {
      closed = true
      stopping.abort()
      // The router first, with the connections it proxies; then the dev servers.
      proxy.close()
      await new Promise<void>((done) => {
        server.close(() => done())
        server.closeAllConnections()
      })
      const all = [...documents.values(), ...home ? [home] : []]
      documents.clear()
      // A server still compiling its document is not waited for long.
      await Promise.all(all.map(started => Promise.race([started.then(s => s.close(), () => undefined), new Promise(done => setTimeout(done, 10_000).unref())])))
    },
  }
}
