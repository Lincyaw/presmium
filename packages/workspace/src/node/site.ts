/**
 * The workspace site as the workspace gives it to the web renderer
 * (`Renderer.buildSite`, `devSite`, docs/architecture.md 4.10): the site's
 * render context, and each document's IR with the plugin packages its
 * compiler loaded named by their directories, so the site loads exactly
 * those.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileTranslations, DECK_ENTRY, directoryAsset, fileHash, frontmatterLine, inside, lineOf, loadPlugins, portable, publishesDirectory, readFrontmatter, viewFor } from '@presmium/compiler'
import type { Compilation, LoadedPlugin } from '@presmium/compiler'
import type { Finding, IRDocument, RenderContext, Renderer, SiteDocument, SiteSpec, SourcePos } from '@presmium/kernel'
import type { WorkspaceDocument } from '../domain/api.ts'
import { WORKSPACE_ID } from '../domain/api.ts'
import type { WorkspaceConfig } from './config.ts'

/** This package: its browser plugin (`src/client/plugin.ts`) is the site's own plugin in `presmium serve`. */
export const WORKSPACE_PACKAGE = '@presmium/workspace'
export const WORKSPACE_PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))

/** The package of the web renderer, Presmium's own. */
const WEB_PACKAGE = '@presmium/web'

/**
 * The web renderer: Presmium's own package, installed at the workspace root
 * or with the CLI (`bundled`), else found up from the workspace root.
 */
export async function webRenderer(root: string, bundled?: string): Promise<Renderer> {
  const { plugins, problems } = await loadPlugins(root, [WEB_PACKAGE], { workspaceRoot: root, listed: [], bundled })
  const renderer = plugins[0]?.plugin?.renderer
  if (!renderer?.buildSite || !renderer.devSite) throw new Error(`the web renderer (${WEB_PACKAGE}) is not installed: ${problems.map(p => p.message).join('; ') || 'it has no workspace site'}`)
  return renderer
}

/** A document's IR as the site gets it: the web renderer's view, its plugins named by the directories its compiler loaded. */
export function siteIR(compilation: Compilation, doc: IRDocument = compilation.doc): IRDocument {
  const dirs = doc.config.plugins.flatMap((name) => {
    const loaded = compilation.plugins.find(plugin => plugin.name === name)
    return loaded ? [loaded.dir] : []
  })
  return viewFor({ ...doc, config: { ...doc.config, plugins: dirs } }, 'web')
}

/**
 * The translations a document declares (P-123), compiled as `presmium build`
 * of the document alone compiles them (the original's plugins and renderer
 * configuration, each from its own entry file), as the site gets them
 * (`siteIR`); with the findings of their compilations.
 */
export async function siteTranslations(compilation: Compilation): Promise<{ translations: NonNullable<SiteDocument['translations']>, findings: Finding[] }> {
  if (!compilation.doc.config.translations) return { translations: [], findings: [] }
  const { translations, findings } = await compileTranslations(compilation)
  return { translations: translations.map(({ lang, doc }) => ({ lang, doc: siteIR(compilation, doc) })), findings }
}

export function siteDocument(document: WorkspaceDocument, doc?: IRDocument, translations?: SiteDocument['translations']): SiteDocument {
  return { dir: document.dir, title: document.title, ...document.lang ? { lang: document.lang } : {}, ...document.tags ? { tags: document.tags } : {}, ...doc ? { doc } : {}, ...translations?.length ? { translations } : {} }
}

export function siteSpec(config: WorkspaceConfig, documents: SiteDocument[]): SiteSpec {
  return { title: config.title, documents, ...typeof config.site.home === 'string' ? { home: config.site.home } : {}, config: config.site }
}

/** URLs that name no local file. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

export interface SiteContextOptions {
  root: string
  outDir: string
  /** Where the renderer keeps the projects it generates: outside the workspace in `presmium serve`. */
  workDir: string
  /** The site's own plugins (package name to directory): the workspace's browser plugin in `presmium serve`. */
  plugins?: Record<string, string>
  /** The plugins of the home page only (package name to directory): the operator plugins in `presmium serve` (`homePlugins`). */
  home?: Record<string, string>
  findings: Finding[]
}

/** The render context of the whole site; the web renderer makes each document's from it. */
export function siteContext(options: SiteContextOptions): RenderContext {
  const { root } = options
  const plugins = options.plugins ?? {}
  const ctx: RenderContext = {
    deckDir: root,
    workspaceRoot: root,
    outDir: options.outDir,
    workDir: options.workDir,
    config: options.home ? { homePlugins: options.home } : {},
    extensions: [],
    plugins: Object.keys(plugins),
    pluginDirs: plugins,
    renderers: ['web'],
    base: '/',
    vitePlugins: [],
    extensionFor: () => undefined,
    portable: (value, from) => portable(value, from, root),
    localAsset: (source, url) => publishedAsset(options, source, url, ctx.report),
    // A file the renderer asks for again (each document, each dev update) is reported once.
    report(finding) {
      if (!options.findings.some(f => JSON.stringify(f) === JSON.stringify(finding))) options.findings.push(finding)
    },
  }
  return ctx
}

/** The deck a source file belongs to: the nearest directory above it with a `lecture.md`. */
function deckOf(file: string, root: string): string | undefined {
  for (let dir = dirname(file); inside(dir, root); dir = dirname(dir)) {
    if (existsSync(join(dir, DECK_ENTRY))) return dir
    if (dir === root) return undefined
  }
  return undefined
}

/**
 * The local file a block's URL names, as the compiler gives it to the
 * renderers (docs/ir.md 6.2): a file in the workspace, or a directory
 * strictly inside the block's deck that is not a deck itself (a link to
 * another document stays a link), published with a file listing. A relative
 * reference to nothing, or to a file outside the workspace, cannot be
 * published: a warning on its line. Only the workspace's own files, by their
 * real path (a symbolic link out of it is not followed).
 */
function publishedAsset(options: SiteContextOptions, source: SourcePos, url: string, report: (finding: Finding) => void): { file: string, name: string } | undefined {
  if (REMOTE.test(url)) return undefined
  const path = url.replace(/[?#].*$/s, '')
  if (!path || path.startsWith('/')) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
    // Read as written.
  }
  const warn = (message: string) => report({ checkId: 'presmium.links', severity: 'warning', message, source: { file: source.file, line: lineOf(source, url) } })
  const target = resolve(dirname(source.file), name)
  const stat = statSync(target, { throwIfNoEntry: false })
  if (!stat) {
    warn(`${url} is not published: there is no such file`)
    return undefined
  }
  const root = realpathSync(options.root)
  const real = realpathSync(target)
  if (!inside(real, root)) {
    if (stat.isFile()) warn(`${url} is not published: the file lies outside the workspace`)
    return undefined
  }
  if (stat.isFile()) return { file: target, name: `${fileHash(target).slice(0, 8)}-${basename(target)}` }
  const deck = deckOf(source.file, options.root)
  if (!deck || !publishesDirectory(target, deck)) return undefined
  const lang = readFrontmatter(readFileSync(join(deck, DECK_ENTRY), 'utf8')).lang
  return directoryAsset(target, deck, join(options.workDir, 'files'), typeof lang === 'string' ? lang : undefined, message => warn(`${url} is not published: ${message}`))
}

/**
 * The translations a document of the workspace at `root` declares, which the
 * site of `presmium serve` leaves out (`presmium.translations`, a warning at
 * its headmatter): its pages are the originals, compiled as they are edited;
 * `presmium build` at the workspace root publishes the translations
 * (`siteTranslations`), as a build of the document alone does.
 */
export function untranslated(compilation: Compilation, root: string): Finding[] {
  const { translations } = compilation.doc.config
  if (!translations) return []
  const text = readFileSync(compilation.entry, 'utf8')
  return Object.entries(translations).map(([lang, entry]) => ({
    checkId: 'presmium.translations',
    severity: 'warning' as const,
    message: `translation "${lang}" (${entry}) is not in the workspace site of presmium serve, which shows the originals; presmium build at the workspace root publishes it (or presmium build ${relative(root, compilation.deckDir).split(sep).join('/') || '.'} for this document alone)`,
    source: { file: compilation.entry, line: frontmatterLine(text, entry) },
  }))
}

/** The site's own plugins in `presmium serve`: the workspace's browser plugin (edit mode, the document operations, the history). */
export function servedPlugins(): Record<string, string> {
  return { [WORKSPACE_PACKAGE]: WORKSPACE_PACKAGE_DIR }
}

/**
 * The home page's own plugins in `presmium serve`: the operator plugins
 * (`settings.presmium.workspace.plugins`, as the documents' compilers load
 * them), whose browser parts the home page loads, e.g. the assistant's
 * `AGENT`, with which the new document form drafts a document. A document's
 * pages load the plugins its deck lists.
 */
export function homePlugins(plugins: LoadedPlugin[]): Record<string, string> {
  return Object.fromEntries(plugins.map(loaded => [loaded.name, loaded.dir]))
}

export { WORKSPACE_ID }
