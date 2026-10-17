import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorMessage, isRecord, kernelIncompatibility } from '@presmium/kernel'
import type { PresmiumNodePlugin, Severity } from '@presmium/kernel'
import { createJiti } from 'jiti'
import { satisfies, validRange } from 'semver'

/** Package export that holds a plugin's Node entry (docs/architecture.md section 3). */
export const NODE_PLUGIN_EXPORT = './presmium'

export interface LoadedPlugin {
  /** Package name as written in the frontmatter. */
  name: string
  /** Absolute package directory. */
  dir: string
  /** Default export of the `./presmium` entry; undefined for a package without one. */
  plugin?: PresmiumNodePlugin
}

export interface PluginProblem {
  name: string
  severity: Severity
  message: string
}

/** Package of the operator plugin installed with the CLI (D13, docs/architecture.md 10.6). */
export const DELTABOX_PACKAGE = '@presmium/slidev-addon-deltabox'

/** Presmium's own packages installed with the CLI: the default renderers and the deltabox plugin. */
const BUNDLED = new Set(['@presmium/web', '@presmium/render-slides', '@presmium/render-notebook', DELTABOX_PACKAGE])

/**
 * Where plugins come from (docs/architecture.md 4.2, 10.2). `listed` is the
 * operator's list (`settings.presmium.workspace.plugins`), installed at the
 * workspace root; `bundled` the directory from which Presmium's own packages
 * installed with the CLI resolve. The deck's `plugins` and
 * `renderers.<id>.package` load from the deck's directory up, else with the CLI.
 */
export interface PluginSources {
  workspaceRoot: string
  listed: string[]
  bundled?: string
}

const jiti = createJiti(import.meta.url)

/**
 * Loads one plugin package: a path relative to the deck, or a package found in
 * node_modules. A package without a usable `./presmium` entry is a browser-only plugin.
 */
export async function loadPlugin(name: string, deckDir: string, sources?: PluginSources): Promise<{ loaded?: LoadedPlugin, problem?: PluginProblem }> {
  const problem = (severity: Severity, message: string): PluginProblem => ({ name, severity, message })
  const dir = findPackageDir(name, resolve(deckDir)) ?? bundledDir(name, sources)
  if (!dir) return { problem: problem('error', `cannot load plugin "${name}": package not found from ${deckDir}`) }
  return loadFrom(name, dir, problem)
}

/** The directory of one of Presmium's own packages installed with the CLI. */
function bundledDir(name: string, sources?: PluginSources): string | undefined {
  return sources?.bundled && BUNDLED.has(name) ? findPackageDir(name, sources.bundled) : undefined
}

/** The fields of a plugin's `package.json` the loader reads. */
interface PluginPackage {
  name?: unknown
  version?: unknown
  exports?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
}

/** The scope of Presmium's packages, which a plugin names as peer dependencies with the versions it supports (P-143). */
const PRESMIUM_SCOPE = '@presmium/'

/** This package's directory, where the Presmium the compiler runs with resolves. */
const COMPILER_DIR = fileURLToPath(new URL('..', import.meta.url))
const COMPILER_PACKAGE = JSON.parse(readFileSync(join(COMPILER_DIR, 'package.json'), 'utf8')) as { name: string, version: string }

/**
 * Why the installed Presmium does not satisfy a plugin's peer dependencies on
 * Presmium's packages (`peerDependencies`, P-143); undefined when it does. Each
 * is the package the plugin's imports get: found from the plugin's directory,
 * else the one the compiler runs with. One that is not installed is left to
 * the plugin's import (an optional peer may well be missing), and so is a
 * range with a protocol (`workspace:^` of a plugin in Presmium's own workspace).
 */
function peerIncompatibility(pkg: PluginPackage, dir: string): string | undefined {
  const problems: string[] = []
  for (const [dependency, range] of Object.entries(pkg.peerDependencies ?? {})) {
    if (!dependency.startsWith(PRESMIUM_SCOPE) || typeof range !== 'string' || /^[a-z]+:/i.test(range)) continue
    const installed = installedVersion(dependency, dir)
    if (installed === undefined) continue
    if (validRange(range) === null) problems.push(`its peer dependency ${dependency} has an invalid range "${range}"`)
    else if (!satisfies(installed, range, { includePrerelease: true })) problems.push(`it needs ${dependency} ${range} (peerDependencies), and ${installed} is installed`)
  }
  return problems.length > 0 ? problems.join('; ') : undefined
}

/** The version of Presmium's package `name` that code in `dir` imports, else the one the compiler runs with. */
function installedVersion(name: string, dir: string): string | undefined {
  const found = findPackageDir(name, dir) ?? (name === COMPILER_PACKAGE.name ? COMPILER_DIR : findPackageDir(name, COMPILER_DIR))
  if (!found) return undefined
  const { version } = JSON.parse(readFileSync(join(found, 'package.json'), 'utf8')) as { version?: unknown }
  return typeof version === 'string' ? version : undefined
}

async function loadFrom(name: string, dir: string, problem: (severity: Severity, message: string) => PluginProblem): Promise<{ loaded?: LoadedPlugin, problem?: PluginProblem }> {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as PluginPackage
    // A plugin for another Presmium is not loaded, nor imported (P-143): its import alone may fail.
    const peers = peerIncompatibility(pkg, dir)
    if (peers) {
      const label = typeof pkg.name === 'string' ? ` (${pkg.name}${typeof pkg.version === 'string' ? ` ${pkg.version}` : ''})` : ''
      return { problem: problem('error', `plugin "${name}"${label} is not loaded: ${peers}`) }
    }
    const target = exportTarget(pkg.exports?.[NODE_PLUGIN_EXPORT])
    if (!target) return { loaded: { name, dir } }
    const file = join(dir, target)
    if (!existsSync(file)) {
      return { loaded: { name, dir }, problem: problem('warning', `plugin "${name}": ${NODE_PLUGIN_EXPORT} points to missing file ${target}; only its components are used`) }
    }
    const plugin = await jiti.import(file, { default: true })
    if (!isNodePlugin(plugin)) throw new Error(`default export of ${NODE_PLUGIN_EXPORT} is not a PresmiumNodePlugin`)
    // A plugin built for another kernel is not loaded: its directives, passes and renderer are left out.
    const incompatible = plugin.kernel === undefined ? undefined : kernelIncompatibility(plugin.kernel)
    if (incompatible) {
      const version = plugin.version ? ` ${plugin.version}` : ''
      return { problem: problem('error', `plugin "${name}" (${plugin.id}${version}) is not loaded: ${incompatible}`) }
    }
    return { loaded: { name, dir, plugin } }
  } catch (error) {
    return { problem: problem('error', `cannot load plugin "${name}": ${errorMessage(error)}`) }
  }
}

export async function loadPlugins(deckDir: string, names: string[], sources?: PluginSources): Promise<{ plugins: LoadedPlugin[], problems: PluginProblem[] }> {
  const plugins: LoadedPlugin[] = []
  const problems: PluginProblem[] = []
  for (const name of names) {
    const { loaded, problem } = await loadPlugin(name, deckDir, sources)
    if (loaded) plugins.push(loaded)
    if (problem) problems.push(problem)
  }
  return { plugins, problems }
}

/**
 * The operator plugins of every deck: those of the operator's list
 * that declare `operator: true`, in its order, found at the workspace root
 * (or with the CLI), then the deltabox plugin installed with the CLI, so an
 * implementation of the same token the operator lists comes first. The
 * deltabox plugin is skipped when the CLI does not have it.
 */
export async function loadOperatorPlugins(sources: PluginSources): Promise<{ plugins: LoadedPlugin[], problems: PluginProblem[] }> {
  const plugins: LoadedPlugin[] = []
  const problems: PluginProblem[] = []
  for (const name of sources.listed) {
    const dir = findPackageDir(name, resolve(sources.workspaceRoot), false) ?? bundledDir(name, sources)
    if (!dir) {
      problems.push({ name, severity: 'error', message: `operator plugin "${name}" (settings.presmium.workspace.plugins) is not installed at the workspace root ${sources.workspaceRoot}` })
      continue
    }
    const { loaded, problem } = await loadFrom(name, dir, (severity, message) => ({ name, severity, message }))
    if (problem) problems.push(problem)
    if (loaded?.plugin?.operator === true) plugins.push(loaded)
  }
  const deltabox = !sources.listed.includes(DELTABOX_PACKAGE) && bundledDir(DELTABOX_PACKAGE, sources)
  if (deltabox) {
    const { loaded, problem } = await loadFrom(DELTABOX_PACKAGE, deltabox, (severity, message) => ({ name: DELTABOX_PACKAGE, severity, message }))
    if (problem) problems.push(problem)
    if (loaded?.plugin) plugins.push(loaded)
  }
  return { plugins, problems }
}

/** Plugin id of the components in the deck's own `components/` directory (R-47). */
export const DECK_PLUGIN = 'deck'

/** A component file of the `components/` convention, as the web form registers it: `Name.vue`, `Name.ts`, ... */
const COMPONENT = /^[^.]+\.(?:vue|[jt]sx?)$/

/** Components a package or the deck registers by convention (`components/*.vue`), by name. */
export async function directoryComponents(dir: string): Promise<string[]> {
  const files = await readdir(join(dir, 'components')).catch(() => [])
  return files.filter(f => COMPONENT.test(f)).map(f => f.replace(/\.[^.]+$/, '')).sort()
}

/** The plugin id: the Node entry's id, or the package name for a browser-only plugin. */
export function pluginId(plugin: LoadedPlugin): string {
  return plugin.plugin?.id ?? plugin.name
}

/** The package directory of `name` from `from`: a path relative to it, or found in `node_modules` up from it (only its own with `up` false). */
export function findPackageDir(name: string, from: string, up = true): string | undefined {
  if (name.startsWith('.') || isAbsolute(name)) {
    const dir = resolve(from, name)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
  // The real directory, as the browser renderers name it to their bundlers.
  for (let d = from; ; d = dirname(d)) {
    const dir = join(d, 'node_modules', name)
    if (existsSync(join(dir, 'package.json'))) return realpathSync(dir)
    if (!up || dirname(d) === d) return undefined
  }
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return undefined
  return exportTarget(value.import) ?? exportTarget(value.node) ?? exportTarget(value.default)
}

function isNodePlugin(value: unknown): value is PresmiumNodePlugin {
  if (!isRecord(value) || typeof value.id !== 'string') return false
  const lists = ['resolvers', 'checks', 'directives', 'passes', 'executors', 'roles', 'tools'] as const
  const renderer = value.renderer
  return lists.every(key => value[key] === undefined || Array.isArray(value[key]))
    && ['version', 'kernel'].every(key => value[key] === undefined || typeof value[key] === 'string')
    && (renderer === undefined || (isRecord(renderer) && typeof renderer.id === 'string' && typeof renderer.build === 'function'))
}
