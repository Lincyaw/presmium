/**
 * The workspace site as the workspace gives it to the web renderer
 * (`Renderer.buildSite`, `devSite`, docs/architecture.md 4.10): the site's
 * render context, and each document's IR with the plugin packages its
 * compiler loaded named by their directories, so the site loads exactly
 * those (in `presmium serve`, only what the plugin policy admitted, D14).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPlugins, viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import type { Finding, IRDocument, RenderContext, Renderer, SiteDocument, SiteSpec } from '@presmium/kernel'
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
    localAsset(source, url) {
      if (REMOTE.test(url)) return undefined
      const path = url.replace(/[?#].*$/s, '')
      if (!path || path.startsWith('/')) return undefined
      let name = path
      try {
        name = decodeURIComponent(path)
      } catch {
        // Read as written.
      }
      const file = resolve(dirname(source.file), name)
      if (!existsSync(file) || !statSync(file).isFile()) return undefined
      // SHARED: only the workspace's own files, by their real path (a symbolic link out of it is not followed).
      const real = realpathSync(file)
      if (options.scoped && (!inside(real, realpathSync(root)) || relative(realpathSync(root), real).split(sep)[0] === '.git')) return undefined
      return { file, name: `${createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)}-${basename(file)}` }
    },
    report: finding => options.findings.push(finding),
  }
  return ctx
}

/** The site's own plugins in `presmium serve`: the workspace's browser plugin (edit mode, the document operations, the history). */
export function servedPlugins(): Record<string, string> {
  return { [WORKSPACE_PACKAGE]: WORKSPACE_PACKAGE_DIR }
}

export { WORKSPACE_ID }
