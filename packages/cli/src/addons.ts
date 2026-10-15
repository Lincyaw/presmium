import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { PresmiumNodePlugin, Severity } from '@presmium/kernel'
import { createJiti } from 'jiti'
import { errorMessage } from './errors.ts'

/** Package export that holds an addon's node plugin (docs/architecture.md section 3). */
export const NODE_PLUGIN_EXPORT = './presmium'

export interface LoadedPlugin {
  /** Addon name as written in the headmatter. */
  addon: string
  plugin: PresmiumNodePlugin
}

export interface AddonProblem {
  addon: string
  severity: Severity
  message: string
}

export interface NodePlugins {
  plugins: LoadedPlugin[]
  problems: AddonProblem[]
}

const jiti = createJiti(import.meta.url)

/**
 * Loads the `./presmium` entry of every addon in the headmatter `addons` list.
 * Addons without that export are plain Slidev addons and are skipped; an addon
 * that cannot be found or whose entry fails to load is an `error` problem.
 */
export async function loadNodePlugins(deckDir: string, addons: unknown): Promise<NodePlugins> {
  const result: NodePlugins = { plugins: [], problems: [] }
  const names = Array.isArray(addons) ? addons.filter((a): a is string => typeof a === 'string') : []
  for (const addon of names) {
    const problem = (severity: Severity, message: string) => result.problems.push({ addon, severity, message })
    const dir = findAddonDir(addon, resolve(deckDir))
    if (!dir) {
      problem('error', `cannot load addon "${addon}": package not found from ${deckDir}`)
      continue
    }
    try {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> }
      const target = exportTarget(pkg.exports?.[NODE_PLUGIN_EXPORT])
      if (!target) continue
      const file = join(dir, target)
      if (!existsSync(file)) {
        problem('warning', `addon "${addon}": ${NODE_PLUGIN_EXPORT} points to missing file ${target}; its checks are skipped`)
        continue
      }
      const plugin = await jiti.import(file, { default: true })
      if (!isNodePlugin(plugin)) throw new Error(`default export of ${NODE_PLUGIN_EXPORT} is not a PresmiumNodePlugin`)
      result.plugins.push({ addon, plugin })
    } catch (error) {
      problem('error', `cannot load addon "${addon}": ${errorMessage(error)}`)
    }
  }
  return result
}

/** Package directory of an addon: a path relative to the deck, or a package found in node_modules. */
function findAddonDir(addon: string, deckDir: string): string | undefined {
  if (addon.startsWith('.') || isAbsolute(addon)) {
    const dir = resolve(deckDir, addon)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
  // Like Slidev, a bare name may omit the `slidev-addon-` prefix.
  const names = addon.startsWith('@') || addon.startsWith('slidev-addon-') ? [addon] : [`slidev-addon-${addon}`, addon]
  for (let d = deckDir; ; d = dirname(d)) {
    const dir = names.map(name => join(d, 'node_modules', name)).find(dir => existsSync(join(dir, 'package.json')))
    if (dir) return dir
    if (dirname(d) === d) return undefined
  }
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  const conditions = value as Record<string, unknown>
  return exportTarget(conditions.import) ?? exportTarget(conditions.node) ?? exportTarget(conditions.default)
}

function isNodePlugin(value: unknown): value is PresmiumNodePlugin {
  const plugin = value as Partial<PresmiumNodePlugin> | undefined
  return typeof plugin === 'object' && plugin !== null && typeof plugin.id === 'string'
    && (plugin.resolvers === undefined || Array.isArray(plugin.resolvers))
    && (plugin.checks === undefined || Array.isArray(plugin.checks))
}
