import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorMessage, isRecord, kernelIncompatibility } from '@lincyaw/kernel'
import type { PresmiumNodePlugin, Severity } from '@lincyaw/kernel'
import { createJiti } from 'jiti'
import { satisfies, validRange } from 'semver'

export const NODE_PLUGIN_EXPORT = './presmium'

export interface LoadedPlugin {
  name: string
  dir: string
  plugin?: PresmiumNodePlugin
  entry?: string
}

export interface PluginProblem {
  name: string
  severity: Severity
  message: string
}

const BUNDLED = new Set(['@lincyaw/web', '@lincyaw/render-slides', '@lincyaw/render-notebook'])

export interface PluginSources {
  workspaceRoot: string
  listed: string[]
  bundled?: string
}

const jiti = createJiti(import.meta.url)

export async function loadPlugin(name: string, deckDir: string, sources?: PluginSources): Promise<{ loaded?: LoadedPlugin, problem?: PluginProblem }> {
  const problem = (severity: Severity, message: string): PluginProblem => ({ name, severity, message })
  const dir = findPackageDir(name, resolve(deckDir)) ?? bundledDir(name, sources)
  if (!dir) return { problem: problem('error', `cannot load plugin "${name}": package not found from ${deckDir}`) }
  return loadFrom(name, dir, problem)
}

function bundledDir(name: string, sources?: PluginSources): string | undefined {
  if (!sources?.bundled) return undefined
  return BUNDLED.has(name) || dependsOn(sources.bundled, name) ? findPackageDir(name, sources.bundled) : undefined
}

function dependsOn(dir: string, name: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
    return Object.hasOwn(pkg.dependencies ?? {}, name)
  } catch {
    return false
  }
}

interface PluginPackage {
  name?: unknown
  version?: unknown
  exports?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
}

const PRESMIUM_SCOPE = '@lincyaw/'

// The official plugins were named after Slidev's addons; a headmatter that still lists them gets the current packages.
const LEGACY_PLUGIN = '@lincyaw/slidev-addon-'
const PLUGIN = '@lincyaw/addon-'

/** A plugin's package as the headmatter lists it, under its current name. */
export function currentPluginName(name: string): string {
  return name.startsWith(LEGACY_PLUGIN) ? PLUGIN + name.slice(LEGACY_PLUGIN.length) : name
}

// Plugins whose work the viewer does itself (the slides' host adapter, Slidev's); a headmatter may still list them.
const RETIRED_PLUGINS: ReadonlySet<string> = new Set(['@lincyaw/addon-core'])

export function isRetiredPlugin(name: string): boolean {
  return RETIRED_PLUGINS.has(currentPluginName(name))
}

/** The plugins a headmatter lists, under their current names, the retired ones left out. */
export function listedPlugins(names: readonly string[]): string[] {
  return names.filter(name => !isRetiredPlugin(name)).map(currentPluginName)
}

const COMPILER_DIR = fileURLToPath(new URL('..', import.meta.url))
const COMPILER_PACKAGE = JSON.parse(readFileSync(join(COMPILER_DIR, 'package.json'), 'utf8')) as { name: string, version: string }

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

function installedVersion(name: string, dir: string): string | undefined {
  const found = findPackageDir(name, dir) ?? (name === COMPILER_PACKAGE.name ? COMPILER_DIR : findPackageDir(name, COMPILER_DIR))
  if (!found) return undefined
  const { version } = JSON.parse(readFileSync(join(found, 'package.json'), 'utf8')) as { version?: unknown }
  return typeof version === 'string' ? version : undefined
}

async function loadFrom(name: string, dir: string, problem: (severity: Severity, message: string) => PluginProblem): Promise<{ loaded?: LoadedPlugin, problem?: PluginProblem }> {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as PluginPackage
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
    const incompatible = plugin.kernel === undefined ? undefined : kernelIncompatibility(plugin.kernel)
    if (incompatible) {
      const version = plugin.version ? ` ${plugin.version}` : ''
      return { problem: problem('error', `plugin "${name}" (${plugin.id}${version}) is not loaded: ${incompatible}`) }
    }
    return { loaded: { name, dir, plugin, entry: file } }
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

export async function loadOperatorPlugins(sources: PluginSources): Promise<{ plugins: LoadedPlugin[], problems: PluginProblem[] }> {
  const plugins: LoadedPlugin[] = []
  const problems: PluginProblem[] = []
  for (const name of listedPlugins(sources.listed)) {
    const dir = findPackageDir(name, resolve(sources.workspaceRoot), false) ?? bundledDir(name, sources)
    if (!dir) {
      problems.push({ name, severity: 'error', message: `operator plugin "${name}" (settings.presmium.workspace.plugins) is not installed at the workspace root ${sources.workspaceRoot}` })
      continue
    }
    const { loaded, problem } = await loadFrom(name, dir, (severity, message) => ({ name, severity, message }))
    if (problem) problems.push(problem)
    if (loaded?.plugin?.operator === true) plugins.push(loaded)
  }
  return { plugins, problems }
}

export const DECK_PLUGIN = 'deck'

const COMPONENT = /^[^.]+\.(?:[jt]sx?)$/

export async function directoryComponents(dir: string): Promise<string[]> {
  const files = await readdir(join(dir, 'components')).catch(() => [])
  return files.filter(f => COMPONENT.test(f)).map(f => f.replace(/\.[^.]+$/, '')).sort()
}

export function pluginId(plugin: LoadedPlugin): string {
  return plugin.plugin?.id ?? plugin.name
}

export function findPackageDir(name: string, from: string, up = true): string | undefined {
  if (name.startsWith('.') || isAbsolute(name)) {
    const dir = resolve(from, name)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
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
