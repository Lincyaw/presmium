import { existsSync, realpathSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { errorMessage, isRecord, kernelIncompatibility } from '@presmium/kernel'
import type { PresmiumNodePlugin, Severity } from '@presmium/kernel'
import { createJiti } from 'jiti'

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

const jiti = createJiti(import.meta.url)

/**
 * Loads one plugin package: a path relative to the deck, or a package found in
 * node_modules. A package without a usable `./presmium` entry is a browser-only plugin.
 */
export async function loadPlugin(name: string, deckDir: string): Promise<{ loaded?: LoadedPlugin, problem?: PluginProblem }> {
  const problem = (severity: Severity, message: string): PluginProblem => ({ name, severity, message })
  const dir = findPackageDir(name, resolve(deckDir))
  if (!dir) return { problem: problem('error', `cannot load plugin "${name}": package not found from ${deckDir}`) }
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> }
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

export async function loadPlugins(deckDir: string, names: string[]): Promise<{ plugins: LoadedPlugin[], problems: PluginProblem[] }> {
  const plugins: LoadedPlugin[] = []
  const problems: PluginProblem[] = []
  for (const name of names) {
    const { loaded, problem } = await loadPlugin(name, deckDir)
    if (loaded) plugins.push(loaded)
    if (problem) problems.push(problem)
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

function findPackageDir(name: string, deckDir: string): string | undefined {
  if (name.startsWith('.') || isAbsolute(name)) {
    const dir = resolve(deckDir, name)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
  // The real directory, as the browser renderers name it to their bundlers.
  for (let d = deckDir; ; d = dirname(d)) {
    const dir = join(d, 'node_modules', name)
    if (existsSync(join(dir, 'package.json'))) return realpathSync(dir)
    if (dirname(d) === d) return undefined
  }
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return undefined
  return exportTarget(value.import) ?? exportTarget(value.node) ?? exportTarget(value.default)
}

function isNodePlugin(value: unknown): value is PresmiumNodePlugin {
  if (!isRecord(value) || typeof value.id !== 'string') return false
  const lists = ['resolvers', 'checks', 'directives', 'passes', 'executors'] as const
  const renderer = value.renderer
  return lists.every(key => value[key] === undefined || Array.isArray(value[key]))
    && ['version', 'kernel'].every(key => value[key] === undefined || typeof value[key] === 'string')
    && (renderer === undefined || (isRecord(renderer) && typeof renderer.id === 'string' && typeof renderer.build === 'function'))
}
