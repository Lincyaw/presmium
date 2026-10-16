/**
 * The workspace site as the workspace gives it to the web renderer
 * (`Renderer.buildSite`, `devSite`, docs/architecture.md 4.10): the site's
 * render context, and each document's IR with the plugin packages its
 * compiler loaded named by their directories, so the site loads exactly
 * those (in `presmium serve`, only what the plugin policy admitted, D14).
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DECK_ENTRY, loadPlugins, readFrontmatter, viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { deckLocale } from '@presmium/kernel'
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

export function siteDocument(document: WorkspaceDocument, doc?: IRDocument): SiteDocument {
  return { dir: document.dir, title: document.title, ...document.lang ? { lang: document.lang } : {}, ...document.tags ? { tags: document.tags } : {}, ...doc ? { doc } : {} }
}

export function siteSpec(config: WorkspaceConfig, documents: SiteDocument[]): SiteSpec {
  return { title: config.title, documents, ...typeof config.site.home === 'string' ? { home: config.site.home } : {}, config: config.site }
}

/** URLs that name no local file. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

function inside(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** As the compiler's `portable`: absolute paths in the workspace made relative to `from`. */
function portable(value: unknown, from: string, root: string): unknown {
  if (typeof value === 'string') return isAbsolute(value) && inside(value, root) ? relative(from, value).split(sep).join('/') || '.' : value
  if (Array.isArray(value)) return value.map(item => portable(item, from, root))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item, from, root)]))
  return value
}

export interface SiteContextOptions {
  root: string
  outDir: string
  /** Where the renderer keeps the projects it generates: outside the workspace in `presmium serve` and agent-host. */
  workDir: string
  /** The site's own plugins (package name to directory): the workspace's browser plugin in `presmium serve`. */
  plugins?: Record<string, string>
  /** The address the dev site listens on (agent-host: the address serve reaches). */
  host?: string
  findings: Finding[]
  /** Files the site may publish: SHARED serve's read scope, also in agent-host (inside the workspace, not in `.git/`). */
  scoped?: boolean
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
    config: options.host ? { host: options.host } : {},
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

/** The line of a block's source that holds `text`, else the block's first line. */
function lineOf(source: SourcePos, text: string): number {
  try {
    const lines = readFileSync(source.file, 'utf8').split(/\r?\n/)
    for (let line = source.line; line <= Math.max(source.line, source.endLine ?? 0); line++) {
      if (lines[line - 1]?.includes(text)) return line
    }
  } catch {
    // The block's line.
  }
  return source.line
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
 * published: a warning on its line. SHARED: only the workspace's own files,
 * by their real path (a symbolic link out of it is not followed).
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
  if (options.scoped && relative(root, real).split(sep)[0] === '.git') return undefined
  if (stat.isFile()) return { file: target, name: `${createHash('sha256').update(readFileSync(target)).digest('hex').slice(0, 8)}-${basename(target)}` }
  const deck = deckOf(source.file, options.root)
  if (!stat.isDirectory() || !deck || target === deck || !inside(target, deck) || existsSync(join(target, DECK_ENTRY)) || lstatSync(target).isSymbolicLink()) return undefined
  const lang = readFrontmatter(readFileSync(join(deck, DECK_ENTRY), 'utf8')).lang
  return publishedDirectory(target, join(options.workDir, 'files'), typeof lang === 'string' ? lang : undefined)
}

/** The files a published directory holds, relative to it: regular files, not hidden, not in `node_modules`, not through symbolic links. */
function directoryFiles(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      return entry.isDirectory() ? directoryFiles(dir, path) : entry.isFile() ? [path] : []
    })
}

/** What a file listing says, in the deck's language. */
const LISTING = {
  'zh-CN': { count: (n: number) => `${n} 个文件，点击下载`, files: '文件' },
  'en': { count: (n: number) => `${n} file${n === 1 ? '' : 's'}; select one to download it`, files: 'Files' },
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * A directory as it is published, as the compiler publishes one for a
 * deck: a copy of its files named `<hash>-<name>` with a file listing,
 * `index.html` (unless it has one of its own), prepared once in `stage`.
 */
function publishedDirectory(dir: string, stage: string, lang?: string): { file: string, name: string } {
  const files = directoryFiles(dir)
  const hash = createHash('sha256')
  for (const file of files) hash.update(file).update('\0').update(readFileSync(join(dir, file))).update('\0')
  const name = `${hash.digest('hex').slice(0, 8)}-${basename(dir)}`
  const target = join(stage, name)
  if (existsSync(target)) return { file: target, name }
  const partial = `${target}.${process.pid}`
  rmSync(partial, { recursive: true, force: true })
  mkdirSync(partial, { recursive: true })
  for (const file of files) cpSync(join(dir, file), join(partial, file))
  if (!files.includes('index.html')) {
    const t = LISTING[deckLocale(lang)]
    const href = (file: string) => file.split('/').map(encodeURIComponent).join('/')
    const items = files.map(file => `<li><a href="${escapeHtml(href(file))}" download>${escapeHtml(file)}</a> <small>${statSync(join(dir, file)).size} B</small></li>`)
    writeFileSync(join(partial, 'index.html'), `<!doctype html>
<html lang="${escapeHtml(lang ?? 'zh-CN')}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(basename(dir))}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem}small{color:#666}</style></head>
<body><h1>${escapeHtml(basename(dir))}/</h1><p>${escapeHtml(t.count(files.length))}</p>
<ul aria-label="${escapeHtml(t.files)}">
${items.join('\n')}
</ul></body></html>
`)
  }
  try {
    renameSync(partial, target)
  } catch {
    rmSync(partial, { recursive: true, force: true })
  }
  return { file: target, name }
}

/** The site's own plugins in `presmium serve`: the workspace's browser plugin (edit mode, the document operations, the history). */
export function servedPlugins(): Record<string, string> {
  return { [WORKSPACE_PACKAGE]: WORKSPACE_PACKAGE_DIR }
}

export { WORKSPACE_ID }
