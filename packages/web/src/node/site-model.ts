import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DEFAULT_LANG, DOCUMENT_ENTRY, deckLocale, docBlocks, isRecord, nodeMdast, NON_FILE_URL, safeDecodeURIComponent } from '@lincyaw/kernel'
import type { DocumentLink, Finding, IRDocument, MdastNode, RenderContext, SiteDocument, SiteSpec, SourcePos } from '@lincyaw/kernel'
import { findInstalledPackage, isInside } from '@lincyaw/kernel/node'
import { crossFormLinks, pageLink, searchDocuments, sectionLinks, sitePageLayout, siteShell, translationPages, urlPath, WEB_MESSAGES, webPages } from '../domain/index.ts'
import type { AppConfig, HomeDocument, NavItem, Neighbour, SearchDocument, SiteConfig, SiteLocale, SiteShell, WebPage } from '../domain/index.ts'
import type { DocumentPage } from './publish.ts'

/**
 * A site of the web form: one document at its root, or a workspace's documents below their directories with a home page
 * that lists them. The links between documents (a link to another document's `lecture.json` goes to its page), the pager
 * that goes on from one to the next and the search that finds the others' sections are the workspace's. The built site
 * (`site-build.ts`) and the dev server (`site-server.ts`) share these.
 */

export const LIST_PAGE = 'documents'
const LINK_LANGUAGE = new WeakMap<DocumentLink, string>()
const SHELL_KEYS = ['nav', 'footer', 'head', 'sitemap', 'theme', 'params']

/** A document's source files: those of its sections and of all their blocks. */
export function documentSourceFiles(doc: IRDocument): Set<string> {
  return new Set([...doc.sections.map(section => section.source.file), ...[...docBlocks(doc)].map(({ block }) => block.source.file)])
}

/** Whether the site is one document at its root, with no home page. */
export function isSingle(site: SiteSpec): boolean {
  return site.documents.length === 1 && site.documents[0]!.dir === ''
}

export function shellOptions(site: SiteSpec): Record<string, unknown> {
  return Object.fromEntries(SHELL_KEYS.filter(key => key in site.config).map(key => [key, site.config[key]]))
}

/** The document the home page goes on to (`site.home`), if any. */
export function homeDocument(site: SiteSpec): SiteDocument | undefined {
  return site.home === undefined ? undefined : site.documents.find(doc => doc.dir === site.home && doc.dir !== '')
}

/** A landing page consumes the canonical document at the root; it does not introduce a second content format. */
export function landingDocument(site: SiteSpec): SiteDocument | undefined {
  const value = site.config.landing
  if (value === undefined) return undefined
  if (site.home !== undefined) throw new Error(WEB_MESSAGES[deckLocale(siteLanguage(site))].invalidLanding)
  if (isRecord(value)) return undefined
  const document = typeof value === 'string' ? site.documents.find(entry => entry.dir !== '' && entry.dir === value) : undefined
  if (!document || site.home !== undefined) throw new Error(WEB_MESSAGES[deckLocale(siteLanguage(site))].invalidLanding)
  return document
}

/** Where the site's list of documents is: its home page, or `documents.html` when the home page is a document. */
export function listLink(site: SiteSpec, base: string): string {
  return homeDocument(site) || site.config.landing !== undefined ? `${base}${LIST_PAGE}.html` : base
}

export function documentBase(base: string, dir: string): string {
  return dir ? `${base}${urlPath(dir)}/` : base
}

/** The site's own language: the workspace's, else its first document's. */
export function siteLanguage(site: SiteSpec, fallback?: string): string {
  return typeof site.config.lang === 'string' ? site.config.lang : site.documents.find(doc => doc.lang)?.lang ?? fallback ?? DEFAULT_LANG
}

export function siteTitle(site: SiteSpec, lang: string): string {
  const locales = isRecord(site.config.locales) ? site.config.locales : {}
  const locale = locales[lang]
  return isRecord(locale) && typeof locale.title === 'string' && locale.title.trim() ? locale.title : site.title
}

/** The other languages of the documents' translations, each with the title the workspace gives its home page. */
export function siteLanguages(site: SiteSpec, lang: string): { lang: string, title: string }[] {
  const titles = isRecord(site.config.locales) ? site.config.locales : {}
  return [...new Set(site.documents.flatMap(entry => (entry.translations ?? []).map(t => t.lang)))].filter(other => other !== lang).map((other) => {
    const own = titles[other]
    return { lang: other, title: isRecord(own) && typeof own.title === 'string' ? own.title : site.title }
  })
}

export function translationOf(entry: SiteDocument, lang: string): { doc: IRDocument, pages: WebPage[] } | undefined {
  const translated = entry.translations?.find(t => t.lang === lang)
  return translated && entry.doc ? { doc: translated.doc, pages: translationPages(translated.doc, webPages(entry.doc)) } : undefined
}

export function languageLabel(lang: string): string {
  const primary = lang.split('-')[0]!
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(primary) ?? lang
  } catch {
    return lang
  }
}

/** A document's languages: its own, then its translations', each below its site path. */
export function documentLocales(lang: string, base: string, translations: readonly { lang: string }[] = []): SiteLocale[] {
  return [{ lang, label: languageLabel(lang), base }, ...translations.map(t => ({ lang: t.lang, label: languageLabel(t.lang), base: `${base}${t.lang}/` }))]
}

function cardOf(doc: IRDocument | undefined, root: string, pages = doc && webPages(doc)): Pick<HomeDocument, 'description' | 'pages' | 'problems' | 'sections'> {
  if (!doc || !pages) return {}
  const description = typeof doc.meta.description === 'string' ? doc.meta.description.trim() : ''
  const count = (severity: Finding['severity']) => doc.diagnostics.filter(finding => finding.severity === severity).length
  const links = sectionLinks(pages)
  const sections = doc.sections.flatMap(section => (section.title && links[section.id] ? [{ id: section.id, title: section.title, href: `${root}${links[section.id]!.slice(1)}` }] : []))
  return { ...description ? { description } : {}, pages: pages.length, problems: { errors: count('error'), warnings: count('warning') }, sections }
}

/** The home page's cards, in the site's language or in `lang` (a translation's, where a document has one). */
export function homeDocuments(site: SiteSpec, base: string, compiled: ReadonlyMap<string, IRDocument> = new Map(), lang?: string): HomeDocument[] {
  return site.documents.map((entry) => {
    const translated = lang ? translationOf(entry, lang) : undefined
    if (translated) {
      const root = `${documentBase(base, entry.dir)}${lang}/`
      return { dir: entry.dir, title: translated.doc.meta.title, lang, ...entry.tags?.length ? { tags: entry.tags } : {}, href: root, ...cardOf(translated.doc, root, translated.pages) }
    }
    const { dir, title, description, lang: own, tags, doc } = entry
    const snapshot = compiled.get(dir) ?? doc
    const root = documentBase(base, dir)
    const card = snapshot ? cardOf(snapshot, root) : description?.trim() ? { description: description.trim() } : {}
    return { dir, title, ...own ? { lang: own } : {}, ...tags?.length ? { tags } : {}, href: root, ...card }
  })
}

export function documentLinkOf(ctx: RenderContext): (source: SourcePos, url: string) => DocumentLink | undefined {
  if (ctx.documentLink) return (source, url) => ctx.documentLink!(source, url)
  return (source, url) => {
    const path = url.replace(/[?#].*$/s, '')
    if (NON_FILE_URL.test(url) || !path || path.startsWith('/')) return undefined
    let target: string
    try {
      target = realpathSync(resolve(dirname(source.file), safeDecodeURIComponent(path)))
    } catch {
      return undefined
    }
    const stat = statSync(target)
    const dir = stat.isFile() && basename(target) === DOCUMENT_ENTRY ? dirname(target) : stat.isDirectory() && existsSync(join(target, DOCUMENT_ENTRY)) ? target : undefined
    const root = realpathSync(ctx.workspaceRoot)
    if (dir === undefined || !isInside(dir, root)) return undefined
    const rel = relative(root, dir)
    const hash = url.indexOf('#')
    const fragment = hash < 0 ? '' : safeDecodeURIComponent(url.slice(hash + 1))
    return { dir: rel.split(sep).join('/'), ...fragment ? { fragment } : {} }
  }
}

function labelSection(doc: IRDocument, label: string): string | undefined {
  const named = (node: MdastNode): boolean => node.identifier === label || node.label === label || Boolean(node.children?.some(named))
  for (const { section, block } of docBlocks(doc)) {
    if (block.id === label || nodeMdast(block.node).some(named)) return section.id
  }
  return undefined
}

/** The page of a link to another document of the site, in the linking page's language when that document has it. */
export function documentPage(site: SiteSpec, base: string, docs: ReadonlyMap<string, IRDocument>): DocumentPage {
  return (link) => {
    const { dir, fragment } = link
    const entry = site.documents.find(other => other.dir === dir)
    if (!entry) return undefined
    const lang = LINK_LANGUAGE.get(link)
    const translated = lang ? translationOf(entry, lang) : undefined
    const root = `${documentBase(base, dir)}${translated ? `${lang}/` : ''}`
    const anchor = fragment ? `#${encodeURIComponent(fragment)}` : ''
    const doc = docs.get(dir)
    if (!doc || !fragment) return `${root}${anchor}`
    const links = sectionLinks(translated?.pages ?? webPages(doc))
    if (links[fragment]) return `${root}${links[fragment].slice(1)}`
    const section = labelSection(doc, fragment)
    return `${root}${(section ? links[section]!.split('#')[0]! : '/').slice(1)}${anchor}`
  }
}

function translatedFiles(doc: IRDocument, translations: SiteDocument['translations'] = []): Map<string, string> {
  const original = documentSourceFiles(doc)
  const files = new Map<string, string>()
  for (const { lang, doc: translated } of translations) {
    for (const file of documentSourceFiles(translated)) if (!original.has(file)) files.set(file, lang)
  }
  return files
}

/** The render context of the document at `dir`: below its own site path, with the workspace's shell and links. */
export function documentContext(ctx: RenderContext, site: SiteSpec, dir: string, doc: IRDocument, outDir: string, workDir: string): RenderContext {
  const linkOf = documentLinkOf(ctx)
  const entry = site.documents.find(other => other.dir === dir)
  const translated = translatedFiles(doc, entry?.translations)
  const localeTargets = new Map<string, { dir: string, lang: string }>()
  for (const target of site.documents) for (const locale of target.translations ?? []) {
    const variant = { dir: target.dir, lang: locale.lang }
    localeTargets.set(resolve(locale.doc.meta.entry), variant)
    localeTargets.set(dirname(resolve(locale.doc.meta.entry)), variant)
  }
  const documentLink = (source: SourcePos, url: string): DocumentLink | undefined => {
    const path = url.replace(/[?#].*$/s, '')
    const locale = path && !NON_FILE_URL.test(url) && !path.startsWith('/') ? localeTargets.get(resolve(dirname(source.file), safeDecodeURIComponent(path))) : undefined
    const hash = url.indexOf('#')
    const link = locale ? { dir: locale.dir, ...hash >= 0 ? { fragment: safeDecodeURIComponent(url.slice(hash + 1)) } : {} } : linkOf(source, url)
    const lang = locale?.lang ?? translated.get(source.file)
    if (link && lang) LINK_LANGUAGE.set(link, lang)
    return link
  }
  const deckDir = join(ctx.workspaceRoot, dir)
  const pluginDirs: Record<string, string> = {}
  for (const name of doc.config.plugins) {
    const found = isAbsolute(name) ? name : ctx.pluginDirs[name] ?? findInstalledPackage(name, deckDir)
    if (found && existsSync(found)) pluginDirs[name] = found
  }
  return {
    ...ctx,
    deckDir,
    outDir,
    workDir,
    config: shellOptions(site),
    plugins: doc.config.plugins.filter(name => pluginDirs[name]),
    pluginDirs,
    lang: doc.meta.lang,
    base: documentBase(ctx.base, dir),
    translations: entry?.translations,
    documentLink,
    localAsset(source, url) {
      if (documentLink(source, url)) return undefined
      if (!url.startsWith('/') || url.startsWith('//')) {
        const found = ctx.localAsset(source, url)
        return found && basename(realpathSync(found.file)) === DOCUMENT_ENTRY ? undefined : found
      }
      const path = url.replace(/[?#].*$/s, '')
      let file = join(deckDir, 'public', path)
      try {
        file = join(deckDir, 'public', decodeURIComponent(path))
      } catch {
      }
      if (!existsSync(file)) return undefined
      const rel = relative(dirname(source.file), join(deckDir, 'public', path)).split(sep).join('/')
      return ctx.localAsset(source, `${rel}${url.slice(path.length)}`)
    },
  }
}

function firstPage(base: string, entry: SiteDocument, doc?: IRDocument): Neighbour {
  const page = doc && webPages(doc)[0]
  return { text: page?.title ?? entry.title, link: documentBase(base, entry.dir) }
}

function lastPage(base: string, entry: SiteDocument, doc?: IRDocument): Neighbour {
  const page = doc && webPages(doc).at(-1)
  const root = documentBase(base, entry.dir)
  return page ? { text: page.title, link: pageLink(page, root.replace(/\/$/, '')) } : { text: entry.title, link: root }
}

/** The documents before and after `dir` (the pager goes on to them) and the other documents' sections, for its search. */
export function siteNeighbours(site: SiteSpec, base: string, dir: string, docs: ReadonlyMap<string, IRDocument>): { neighbours: NonNullable<SiteConfig['neighbours']>, search: SearchDocument[] } {
  const listed = site.documents.filter(entry => entry.dir !== '')
  const i = listed.findIndex(entry => entry.dir === dir)
  const before = listed[i - 1]
  const after = listed[i + 1]
  const search: SearchDocument[] = listed.flatMap((entry) => {
    const doc = docs.get(entry.dir)
    return entry.dir === dir || !doc ? [] : searchDocuments(doc, documentBase(base, entry.dir), webPages(doc), [entry.title])
  })
  return {
    neighbours: i < 0 ? {} : { ...before ? { prev: lastPage(base, before, docs.get(before.dir)) } : {}, ...after ? { next: firstPage(base, after, docs.get(after.dir)) } : {} },
    search,
  }
}

/** The site's navigation with its links below the site's path: a link the configuration writes as `/…` is the site's. */
export function navBelow(base: string, items: readonly NavItem[] = []): NavItem[] {
  return items.map(item => ({
    ...item,
    ...item.link?.startsWith('/') && !item.link.startsWith('//') ? { link: `${base}${item.link.slice(1)}` } : {},
    ...item.items ? { items: navBelow(base, item.items) } : {},
  }))
}

/** The shell of the site's pages, its navigation below the site's path. */
export function siteShellBelow(site: SiteSpec, base: string): SiteShell {
  const shell = siteShell(shellOptions(site), siteLanguage(site))
  return shell.nav ? { ...shell, nav: navBelow(base, shell.nav) } : shell
}

/** The site around a document's pages: its title, shell, languages, the workspace's list and neighbours. */
export function documentSiteConfig(input: { site: SiteSpec, base: string, dir: string, doc: IRDocument, lang: string, docs: ReadonlyMap<string, IRDocument>, workspace: boolean }): SiteConfig {
  const { site, base, dir, doc } = input
  const shell = siteShellBelow(site, base)
  const entry = site.documents.find(other => other.dir === dir)
  const links = crossFormLinks(doc.config.presmium, doc.config.renderers)
  const locales = documentLocales(doc.meta.lang ?? input.lang, documentBase(base, dir), entry?.translations).map(locale => {
    const shown = entry?.translations?.find(translated => translated.lang === locale.lang)?.doc ?? doc
    return { ...locale, layout: sitePageLayout(isRecord(shown.config.renderers.web) ? shown.config.renderers.web : {}, locale.lang) }
  })
  const own = siteLanguage(site)
  const prefix = input.lang !== own && siteLanguages(site, own).some(locale => locale.lang === input.lang) ? `${input.lang}/` : ''
  const root = input.workspace ? `${base}${prefix}` : locales.find(locale => locale.lang === input.lang)?.base ?? base
  return {
    title: doc.meta.title,
    brandTitle: input.workspace ? siteTitle(site, input.lang) : doc.meta.title,
    root,
    layout: sitePageLayout(isRecord(doc.config.renderers.web) ? doc.config.renderers.web : {}, doc.meta.lang),
    shell,
    locales,
    links: input.workspace ? { ...links, slides: Boolean(links.slidesUrl) } : links,
    ...input.workspace ? {
      home: listLink(site, root),
      neighbours: siteNeighbours(site, base, dir, input.docs).neighbours,
      documents: site.documents.filter(other => other.dir !== '').map(other => ({ dir: other.dir, title: other.title, href: documentBase(base, other.dir), ...other.tags?.[0] ? { group: other.tags[0] } : {} })),
    } : {},
  }
}

/** Reuse a document's IR, bundle and media, with a root-level route that displays all of its sections. */
export function landingConfig(config: AppConfig, doc: IRDocument, site: SiteSpec, base: string, lang = ''): AppConfig {
  const root = `${base}${lang ? `${lang}/` : ''}`
  const own = config.site.locales[0]?.lang ?? doc.meta.lang
  return {
    ...config,
    page: 'index',
    landing: true,
    site: {
      ...config.site,
      brandTitle: siteTitle(site, config.lang),
      root,
      layout: 'landing',
      home: `${root}${LIST_PAGE}.html`,
      locales: config.site.locales.map(locale => ({ ...locale, base: `${base}${locale.lang === own ? '' : `${locale.lang}/`}`, layout: 'landing' })),
    },
  }
}

/** The pages of the site for its sitemap, below its path: every document's pages and their translations'. */
export function sitemapPages(site: SiteSpec): string[] {
  return site.documents.flatMap((entry) => {
    if (!entry.doc) return []
    const root = entry.dir ? `/${urlPath(entry.dir)}` : ''
    const translated = (entry.translations ?? []).flatMap(({ lang }) => translationOf(entry, lang)?.pages.map(page => pageLink(page, `${root}/${lang}`)) ?? [])
    return [...webPages(entry.doc).map(page => pageLink(page, root)), ...translated].map(link => link.replace(/^\//, ''))
  })
}
