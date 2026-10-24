import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isRecord } from '@lincyaw/kernel'
import { findInstalledPackage } from '@lincyaw/kernel/node'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { collectBrowserModules, emptyClientModules } from './client-modules.ts'

/**
 * The workbench's viewer app, prebuilt once for a set of plugin packages (as a PDF viewer is for every PDF): the web
 * form's runtime with every browser module of those plugins, lazily loaded, and the modules a document's own bundle may
 * import (Vue, Presmium's packages, the plugins' public subpaths) as entries of their own, which an import map names.
 * A build is kept under the cache by a key of what it was built from, and found again by any later session.
 */

const WEB_DIR = fileURLToPath(new URL('../..', import.meta.url))
const APP_MAIN = fileURLToPath(new URL('../app/main.ts', import.meta.url))
const DOCUMENT_MODULES = fileURLToPath(new URL('../app/document-modules.ts', import.meta.url))
const APP_HTML = fileURLToPath(new URL('../app/index.html', import.meta.url))
const REGISTRY = 'virtual:presmium-app/registry'
const DOCUMENT_MODULE = '\0presmium-document-module:'
export const APP_MANIFEST = 'manifest.json'
const NOT_SOURCE = new Set(['node_modules', 'test', 'dist', '.presmium', '.git'])
const OWN_PACKAGES = ['@lincyaw/host', '@lincyaw/kernel', '@lincyaw/viewer', '@lincyaw/design']
// The subpaths of Presmium's packages that run in the browser (`./node` of the kernel does not).
const OWN_SHARED: Record<string, string[]> = {
  '@lincyaw/host': ['.'],
  '@lincyaw/kernel': ['.', './contracts', './ir', './reading'],
  '@lincyaw/viewer': ['.', './domain'],
  '@lincyaw/design': ['.'],
}
// A plugin package's exports that are not for a document's code (`architecture.md` section 3: the Node entry).
const NOT_SHARED = new Set(['./presmium', './package.json'])
// The files a bundler loads as modules, by their extension.
const MODULE_FILE = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue'])
// Slidev's client and its virtual modules (Slidev's documentation): the slides form's only.
const SLIDES_CLIENT = (id: string) => id === '@slidev/client' || id.startsWith('@slidev/client/') || id.startsWith('#slidev/')
const SHARED = 'virtual:presmium-app/shared:'
// Builds kept unused this long are removed, the newest few always kept.
const KEEP_MS = 7 * 24 * 3600_000
const KEEP_NEWEST = 3

/** What a build's plugin hooks may ask of the bundler (Rolldown's plugin context). */
interface BuildContext {
  resolve(source: string, importer?: string): Promise<{ id: string, external?: boolean | 'absolute' | 'relative' } | null>
  load(options: { id: string, resolveDependencies?: boolean }): Promise<{ importedIds: string[], exports: string[] }>
}

/** A plugin package as the viewer app holds it: its browser modules, its public subpaths, its document modules. */
export interface AppPlugin {
  name: string
  dir: string
  fingerprint: string
  components: Record<string, string>
  plugins: string[]
  viewers: string[]
  /** Its `vite.config.ts`, whose Vite plugins the app is built with, as the dev servers are. */
  vite: string[]
  restartable: boolean
  /** Its exports that a document's own code may import, by specifier, with their files. */
  shared: Record<string, string>
  documentModules: string[]
  /** Whether the viewer app can show its documents: the Vite plugins of its Node entry, if any, only give document modules. */
  supported: boolean
}

export interface ViewerAppManifest {
  key: string
  core: string
  plugins: Record<string, string>
  /** The import map's entries: specifier to the file below the app's directory. */
  shared: Record<string, string>
  documentModules: string[]
  builtAt: string
}

export interface ViewerApp {
  dir: string
  manifest: ViewerAppManifest
}

/** Where viewer apps are kept: the user's cache, shared by every workspace and session. */
export function viewerAppCache(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'presmium', 'viewer-app')
}

export function readPackageManifest(dir: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

/** What a directory of sources is now: its files' paths, sizes and times, or a package's name and version under node_modules. */
export function fingerprint(dir: string): string {
  const real = realpathSync(dir)
  const hash = createHash('sha256')
  if (real.split(sep).includes('node_modules')) {
    const { name, version } = readPackageManifest(real)
    return hash.update(`${String(name)}@${String(version)}`).digest('hex').slice(0, 16)
  }
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (NOT_SOURCE.has(entry.name)) continue
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) {
        const { size, mtimeMs } = statSync(path)
        hash.update(`${relative(real, path)}:${size}:${Math.trunc(mtimeMs)}\n`)
      }
    }
  }
  walk(real)
  return hash.digest('hex').slice(0, 16)
}

/** Presmium's packages the app runs, where the web renderer finds them (the design system through the host). */
function ownPackages(): Map<string, string> {
  const found = new Map<string, string>()
  for (const name of OWN_PACKAGES) {
    const dir = findInstalledPackage(name, WEB_DIR) ?? [...found.values()].map(from => findInstalledPackage(name, from)).find(Boolean)
    if (!dir) throw new Error(`${name} is not installed beside @lincyaw/web`)
    found.set(name, dir)
  }
  return found
}

/** The sources of the app itself and of Presmium's packages it runs, with the versions of the tools that build it. */
export function coreFingerprint(): string {
  const require = createRequire(join(WEB_DIR, 'package.json'))
  const versions = ['vite', '@vitejs/plugin-vue', 'vue'].map(name => `${name}@${String((require(`${name}/package.json`) as { version: string }).version)}`)
  const dirs = [WEB_DIR, ...ownPackages().values()]
  return createHash('sha256').update([...versions, ...dirs.map(fingerprint)].join('\n')).digest('hex').slice(0, 16)
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return undefined
  return exportTarget(value.browser) ?? exportTarget(value.import) ?? exportTarget(value.default)
}

/** The node entry of a plugin package (its `./presmium` export), loaded. */
async function nodeEntry(dir: string, exports: Record<string, unknown>): Promise<PresmiumNodePlugin | undefined> {
  const file = exportTarget(exports['./presmium'])
  if (!file) return undefined
  return (await import(pathToFileURL(join(dir, file)).href) as { default?: PresmiumNodePlugin }).default
}

/**
 * The modules of a package's exports, by specifier, with their files: `subpaths` when given, else every one but the Node
 * entry. Pattern subpaths (`./*`) name no module by themselves, and only module files are taken.
 */
function sharedExports(name: string, dir: string, exports: Record<string, unknown>, subpaths?: string[]): Record<string, string> {
  const shared: Record<string, string> = {}
  for (const [subpath, value] of Object.entries(exports)) {
    const target = exportTarget(value)
    if (subpaths ? !subpaths.includes(subpath) : NOT_SHARED.has(subpath) || subpath.includes('*')) continue
    if (!target || !MODULE_FILE.has(extname(target))) continue
    shared[subpath === '.' ? name : `${name}/${subpath.slice(2)}`] = join(dir, target)
  }
  return shared
}

/** A plugin package's browser modules and public subpaths, and its node entry's document modules. */
export async function appPlugin(name: string, dir: string): Promise<AppPlugin> {
  const manifest = readPackageManifest(dir)
  const modules = emptyClientModules()
  collectBrowserModules(dir, name, modules, true)
  const exports = isRecord(manifest.exports) ? manifest.exports : {}
  // A document names a plugin as its configuration does (a path, maybe); its code imports it by its package's name.
  const shared = sharedExports(typeof manifest.name === 'string' ? manifest.name : name, dir, exports)
  let documentModules: string[] = []
  let supported = true
  try {
    const node = await nodeEntry(dir, exports)
    documentModules = Object.keys(node?.documentModules?.({ deckDir: dir, workspaceRoot: dir, config: {} }) ?? {})
    supported = !node?.vitePlugins || documentModules.length > 0
  } catch {
    supported = false
  }
  return {
    name,
    dir,
    fingerprint: fingerprint(dir),
    components: Object.fromEntries(modules.components),
    plugins: modules.plugins,
    viewers: modules.viewers.map(viewer => viewer.file),
    vite: modules.vite,
    restartable: modules.restartable,
    shared,
    documentModules,
    supported,
  }
}

const keyOf = (core: string, plugins: readonly AppPlugin[]) =>
  createHash('sha256').update([core, ...plugins.map(p => `${p.name}:${p.fingerprint}`).sort()].join('\n')).digest('hex').slice(0, 16)

/** The newest app under `cacheDir` built with every one of `plugins` as they are now, if there is one. */
export function findViewerApp(cacheDir: string, core: string, plugins: readonly AppPlugin[]): ViewerApp | undefined {
  if (!existsSync(cacheDir)) return undefined
  let found: ViewerApp | undefined
  for (const entry of readdirSync(cacheDir)) {
    const file = join(cacheDir, entry, APP_MANIFEST)
    if (entry.startsWith('.') || !existsSync(file)) continue
    try {
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as ViewerAppManifest
      if (manifest.core !== core || !plugins.every(p => manifest.plugins[p.name] === p.fingerprint)) continue
      if (!found || manifest.builtAt > found.manifest.builtAt) found = { dir: join(cacheDir, entry), manifest }
    } catch {}
  }
  // Marked as used, so that the cleaning of another session keeps it.
  if (found) {
    const now = new Date()
    try { utimesSync(join(found.dir, APP_MANIFEST), now, now) } catch {}
  }
  return found
}

/** Removes the apps no session used for a week, keeping the newest. */
function cleanViewerApps(cacheDir: string, keep: string): void {
  const builds = readdirSync(cacheDir).flatMap((entry) => {
    const dir = join(cacheDir, entry)
    try {
      return [{ dir, used: statSync(join(dir, APP_MANIFEST)).mtimeMs }]
    } catch {
      // A build another process left unfinished a day ago.
      try {
        return entry.startsWith('.build-') && Date.now() - statSync(dir).mtimeMs > 24 * 3600_000 ? [{ dir, used: 0 }] : []
      } catch {
        return []
      }
    }
  }).sort((a, b) => b.used - a.used)
  for (const [i, build] of builds.entries()) {
    if (build.dir !== keep && (build.used === 0 || (i >= KEEP_NEWEST && Date.now() - build.used > KEEP_MS))) rmSync(build.dir, { recursive: true, force: true })
  }
}

function registrySource(plugins: readonly AppPlugin[]): string {
  const load = (file: string) => `() => import(${JSON.stringify(file)})`
  const entries = plugins.map(p => `  ${JSON.stringify(p.name)}: {
    components: {${Object.entries(p.components).map(([name, file]) => `\n      ${JSON.stringify(name)}: ${load(file)},`).join('')}
    },
    plugins: [${p.plugins.map(load).join(', ')}],
    viewers: [${p.viewers.map(load).join(', ')}],
    restartable: ${p.restartable},
  },`)
  return `export const packages = {\n${entries.join('\n')}\n}\n`
}

/** Leaves out the bundler's notes on "use client" (Remotion's modules start with it; it means nothing here). */
export function quietDirectives(_level: string, log: { code?: string, message?: string }): false | undefined {
  return log.code === 'MODULE_LEVEL_DIRECTIVE' || /module level directive/i.test(log.message ?? '') ? false : undefined
}

const sharedName = (specifier: string) => `shared/${specifier.replace(/^@/, '').replace(/[^\w.-]+/g, '_')}`

/**
 * The modules the app's import map names, by specifier, with their sources: Vue by its name, resolved as every other import
 * of it; Presmium's packages and the plugins' public subpaths by their files. A document's bundle imports these by name.
 */
export function sharedSpecifiers(plugins: readonly AppPlugin[]): Record<string, string> {
  const specifiers: Record<string, string> = { vue: 'vue' }
  for (const [name, dir] of ownPackages()) {
    const { exports } = readPackageManifest(dir)
    Object.assign(specifiers, sharedExports(name, dir, isRecord(exports) ? exports : {}, OWN_SHARED[name]))
  }
  for (const plugin of plugins) Object.assign(specifiers, plugin.shared)
  return specifiers
}

/** Builds the viewer app for `plugins` into `cacheDir`, unless one is there already, and returns it. */
export async function buildViewerApp(cacheDir: string, plugins: readonly AppPlugin[]): Promise<ViewerApp> {
  const core = coreFingerprint()
  const known = findViewerApp(cacheDir, core, plugins)
  if (known) return known
  const key = keyOf(core, plugins)
  const out = join(cacheDir, key)
  const work = join(cacheDir, `.build-${key}-${process.pid}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  // The generated files resolve `vue` as the web renderer does: from the node_modules that holds its Vue (its own in a
  // checkout, its siblings' in an installed project).
  const vueDir = findInstalledPackage('vue', WEB_DIR)
  if (!vueDir) throw new Error('vue is not installed beside @lincyaw/web')
  symlinkSync(dirname(vueDir), join(work, 'node_modules'), 'junction')
  writeFileSync(join(work, 'index.html'), readFileSync(APP_HTML, 'utf8'))
  writeFileSync(join(work, 'main.ts'), `import ${JSON.stringify(APP_MAIN)}\n`)
  const specifiers = sharedSpecifiers(plugins)
  const input: Record<string, string> = { index: join(work, 'index.html') }
  const shared: Record<string, string> = {}
  for (const specifier of Object.keys(specifiers)) {
    const name = sharedName(specifier)
    input[name] = `${SHARED}${specifier}`
    shared[specifier] = `${name}.js`
  }
  const documentModules = [...new Set(plugins.flatMap(p => p.documentModules))]
  const viteConfigs = await Promise.all(plugins.flatMap(p => p.vite).map(async file => (await import(pathToFileURL(file).href) as { default?: { plugins?: unknown[] } }).default))
  const importer = join(work, 'main.ts')
  /**
   * The module the import map names for `specifier`: all the exports of its source, as the bundler finds them (its
   * default export too when it has one). One whose modules import Slidev's client is the slides form's only: it throws.
   */
  const sharedModule = async (ctx: BuildContext, specifier: string): Promise<string> => {
    const resolved = await ctx.resolve(specifiers[specifier]!, importer)
    if (!resolved || resolved.external) throw new Error(`${specifier} cannot be resolved for the viewer app`)
    const seen = new Set<string>()
    const reaches = async (id: string): Promise<boolean> => {
      if (seen.has(id)) return false
      seen.add(id)
      if (SLIDES_CLIENT(id)) return true
      if (id.startsWith('\0')) return false
      const info = await ctx.load({ id, resolveDependencies: true })
      for (const imported of info.importedIds) if (await reaches(imported)) return true
      return false
    }
    if (await reaches(resolved.id)) return `throw new Error(${JSON.stringify(`${specifier} is the slides form's only: it cannot run in the web form`)})\n`
    const source = JSON.stringify(resolved.id)
    const { exports } = await ctx.load({ id: resolved.id })
    return `export * from ${source}\n${exports.includes('default') ? `export { default } from ${source}\n` : ''}`
  }
  const { build } = await import('vite')
  const { default: vue } = await import('@vitejs/plugin-vue')
  await build({
    configFile: false,
    root: work,
    base: './',
    logLevel: 'warn',
    mode: 'production',
    plugins: [
      vue(),
      {
        name: 'presmium:viewer-app',
        // Before Vite's resolution: Slidev's client stays an import, which the shared modules are checked for.
        enforce: 'pre' as const,
        resolveId(id: string) {
          if (id === REGISTRY) return `\0${REGISTRY}`
          if (id.startsWith(SHARED)) return `\0${id}`
          if (documentModules.includes(id)) return `${DOCUMENT_MODULE}${id}`
          if (SLIDES_CLIENT(id)) return { id, external: true }
          return undefined
        },
        onLog: quietDirectives,
        async load(id: string) {
          if (id.startsWith(`\0${SHARED}`)) return await sharedModule(this, id.slice(SHARED.length + 1))
          if (id === `\0${REGISTRY}`) return registrySource(plugins)
          if (id.startsWith(DOCUMENT_MODULE)) return `import { documentModule } from ${JSON.stringify(DOCUMENT_MODULES)}\nexport default documentModule(${JSON.stringify(id.slice(DOCUMENT_MODULE.length))})\n`
          return undefined
        },
      },
      ...viteConfigs.flatMap(config => config?.plugins ?? []) as never[],
    ],
    resolve: { dedupe: ['vue'] },
    build: {
      outDir: join(work, 'out'),
      emptyOutDir: true,
      target: 'es2022',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 100_000,
      rollupOptions: {
        input,
        preserveEntrySignatures: 'exports-only',
        output: {
          entryFileNames: chunk => (chunk.name.startsWith('shared/') ? '[name].js' : 'assets/[name]-[hash].js'),
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  })
  const manifest: ViewerAppManifest = { key, core, plugins: Object.fromEntries(plugins.map(p => [p.name, p.fingerprint])), shared, documentModules, builtAt: new Date().toISOString() }
  writeFileSync(join(work, 'out', APP_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  // Another session may have built the same app meanwhile: its build stays, since its pages may be loading from it.
  if (!existsSync(join(out, APP_MANIFEST))) {
    rmSync(out, { recursive: true, force: true })
    renameSync(join(work, 'out'), out)
  }
  rmSync(work, { recursive: true, force: true })
  cleanViewerApps(cacheDir, out)
  return { dir: out, manifest: JSON.parse(readFileSync(join(out, APP_MANIFEST), 'utf8')) as ViewerAppManifest }
}
