import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { compileTranslations, DECK_ENTRY, directoryAsset, fileHash, frontmatterLine, inside, lineOf, loadPlugins, portable, publishesDirectory, readFrontmatter, viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import type { Finding, IRDocument, RenderContext, Renderer, SiteDocument, SiteSpec, SourcePos } from '@presmium/kernel'
import type { WorkspaceDocument } from '../domain/api.ts'
import type { WorkspaceConfig } from './config.ts'

const WEB_PACKAGE = '@presmium/web'

export async function webRenderer(root: string, bundled?: string): Promise<Renderer> {
  const { plugins, problems } = await loadPlugins(root, [WEB_PACKAGE], { workspaceRoot: root, listed: [], bundled })
  const renderer = plugins[0]?.plugin?.renderer
  if (!renderer?.buildSite || !renderer.devSite) throw new Error(`the web renderer (${WEB_PACKAGE}) is not installed: ${problems.map(p => p.message).join('; ') || 'it has no workspace site'}`)
  return renderer
}

export function siteIR(compilation: Compilation, doc: IRDocument = compilation.doc): IRDocument {
  const dirs = doc.config.plugins.flatMap((name) => {
    const loaded = compilation.plugins.find(plugin => plugin.name === name)
    return loaded ? [loaded.dir] : []
  })
  return viewFor({ ...doc, config: { ...doc.config, plugins: dirs } }, 'web')
}

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

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

export interface SiteContextOptions {
  root: string
  outDir: string
  workDir: string
  base?: string
  findings: Finding[]
}

export function siteContext(options: SiteContextOptions): RenderContext {
  const { root } = options
  const ctx: RenderContext = {
    deckDir: root,
    workspaceRoot: root,
    outDir: options.outDir,
    workDir: options.workDir,
    config: {},
    extensions: [],
    plugins: [],
    pluginDirs: {},
    renderers: ['web'],
    base: options.base ?? '/',
    vitePlugins: [],
    extensionFor: () => undefined,
    portable: (value, from) => portable(value, from, root),
    localAsset: (source, url) => publishedAsset(options, source, url, ctx.report),
    report(finding) {
      if (!options.findings.some(f => JSON.stringify(f) === JSON.stringify(finding))) options.findings.push(finding)
    },
  }
  return ctx
}

function deckOf(file: string, root: string): string | undefined {
  for (let dir = dirname(file); inside(dir, root); dir = dirname(dir)) {
    if (existsSync(join(dir, DECK_ENTRY))) return dir
    if (dir === root) return undefined
  }
  return undefined
}

function publishedAsset(options: SiteContextOptions, source: SourcePos, url: string, report: (finding: Finding) => void): { file: string, name: string } | undefined {
  if (REMOTE.test(url)) return undefined
  const path = url.replace(/[?#].*$/s, '')
  if (!path || path.startsWith('/')) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
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
