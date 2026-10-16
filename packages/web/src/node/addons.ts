import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isRecord } from '@presmium/kernel'
import type { PresmiumNodePlugin, RenderContext } from '@presmium/kernel'

/** Browser entry that registers a plugin's kernel plugins in the web form (docs/architecture.md section 5.1). */
const CLIENT_PLUGIN = 'src/client/plugin.ts'
/** Browser entry that extends the IR runtime: its default export is a `ViewerPlugin` (@presmium/viewer). */
const VIEWER_PLUGIN = 'src/client/viewer.ts'
/** Vite configuration of a plugin package, as Slidev reads it from an addon; the web form takes its Vite plugins. */
const VITE_CONFIG = 'vite.config.ts'
const COMPONENT = /^[^.]+\.(vue|[jt]sx?)$/

/** A plugin's Node entry (`./presmium`) whose `vitePlugins` the site's Vite runs, with the plugin's configuration. */
export interface VitePluginsEntry {
  /** Absolute path of the entry. */
  file: string
  config: Record<string, unknown>
}

/** Client modules of the deck's plugins (and of the deck itself) that the web theme loads. */
export interface ClientModules {
  /** Component name to absolute file, from the `components/` convention. */
  components: Map<string, string>
  /** Absolute paths of `src/client/plugin.ts` modules. */
  plugins: string[]
  /** `src/client/viewer.ts` modules (absolute paths) by package name: views and renderers for the IR runtime. */
  viewers: { name: string, file: string }[]
  /** Absolute paths of the plugin packages' `vite.config.ts`, e.g. one that serves a runtime (Pyodide). */
  vite: string[]
  /** Node entries of plugins that add Vite plugins (`PresmiumNodePlugin.vitePlugins`). */
  nodeVite: VitePluginsEntry[]
}

function collect(dir: string, name: string, modules: ClientModules, plugin: boolean): void {
  const components = join(dir, 'components')
  if (existsSync(components)) {
    for (const file of readdirSync(components).filter(f => COMPONENT.test(f)).sort()) {
      modules.components.set(file.replace(/\.[^.]+$/, ''), join(components, file))
    }
  }
  if (existsSync(join(dir, CLIENT_PLUGIN))) modules.plugins.push(join(dir, CLIENT_PLUGIN))
  if (existsSync(join(dir, VIEWER_PLUGIN))) modules.viewers.push({ name, file: join(dir, VIEWER_PLUGIN) })
  if (plugin && existsSync(join(dir, VITE_CONFIG))) modules.vite.push(join(dir, VITE_CONFIG))
}

/** The package.json of the plugin package in `dir`; empty when it cannot be read. */
function manifest(dir: string): Record<string, unknown> {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return isRecord(pkg) ? pkg : {}
  } catch {
    return {}
  }
}

/** The Node entry (`./presmium`) of the plugin package in `dir`, if it has one. */
function nodeEntry(dir: string): string | undefined {
  const { exports } = manifest(dir)
  const entry = isRecord(exports) ? exports['./presmium'] : undefined
  return typeof entry === 'string' ? resolve(dir, entry) : undefined
}

/**
 * The plugins whose Node entry adds Vite plugins, with their configuration
 * (`presmium.<id>`). The site's Vite runs in a process of its own, where the
 * site's configuration imports these entries and calls their `vitePlugins`.
 */
export async function nodeVitePlugins(ctx: RenderContext, presmium: Record<string, unknown>): Promise<VitePluginsEntry[]> {
  if (ctx.vitePlugins.length === 0) return []
  const entries: VitePluginsEntry[] = []
  for (const name of ctx.plugins) {
    const dir = ctx.pluginDirs[name]
    const file = dir && nodeEntry(dir)
    if (!file) continue
    // The compiler has loaded the module already: this is the same one.
    const plugin = (await import(pathToFileURL(file).href).catch(() => ({}))).default as PresmiumNodePlugin | undefined
    if (typeof plugin?.vitePlugins !== 'function') continue
    const config = presmium[plugin.id]
    entries.push({ file, config: isRecord(config) ? config : {} })
  }
  return entries
}

/**
 * The components, kernel plugins, viewer plugins and Vite plugins of the
 * deck's plugins, in declaration order, with the Node entries that add Vite
 * plugins (`nodeVitePlugins`); the deck's own `components/` override them.
 * The plugin packages are where the compiler loaded them
 * (`RenderContext.pluginDirs`); one it could not load is left out (the
 * compiler reports it). The directories are read at each call, so a dev
 * server that calls it at every update registers a component added meanwhile.
 */
export function clientModules(ctx: RenderContext, nodeVite: VitePluginsEntry[]): ClientModules {
  const modules: ClientModules = { components: new Map(), plugins: [], viewers: [], vite: [], nodeVite }
  for (const name of ctx.plugins) {
    const dir = ctx.pluginDirs[name]
    // The package's own name, also for a plugin the deck names by its path.
    const { name: pkg } = dir ? manifest(dir) : {}
    if (dir) collect(dir, typeof pkg === 'string' ? pkg : name, modules, true)
  }
  collect(ctx.deckDir, 'deck', modules, false)
  return modules
}
