import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Browser entry that registers a plugin's kernel plugins in the web form (docs/architecture.md section 5.1). */
const CLIENT_PLUGIN = 'src/client/plugin.ts'
/** Browser entry that extends the IR runtime: its default export is a `ViewerPlugin` (@presmium/viewer). */
const VIEWER_PLUGIN = 'src/client/viewer.ts'
/** Vite configuration of a plugin package, as Slidev reads it from an addon; the web form takes its Vite plugins. */
const VITE_CONFIG = 'vite.config.ts'
const COMPONENT = /^[^.]+\.(vue|[jt]sx?)$/

/** Client modules of the deck's plugins (and of the deck itself) that the web theme loads. */
export interface ClientModules {
  /** Component name to absolute file, from the `components/` convention. */
  components: Map<string, string>
  /** Absolute paths of `src/client/plugin.ts` modules. */
  plugins: string[]
  /** Absolute paths of `src/client/viewer.ts` modules: views and renderers for the IR runtime. */
  viewers: string[]
  /** Absolute paths of the plugin packages' `vite.config.ts`, e.g. one that serves a runtime (Pyodide). */
  vite: string[]
}

/** Package directory of a plugin: a path relative to the deck, or a package found in node_modules. */
function packageDir(name: string, deckDir: string): string | undefined {
  if (name.startsWith('.') || isAbsolute(name)) {
    const dir = resolve(deckDir, name)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
  for (let d = deckDir; ; d = dirname(d)) {
    const dir = join(d, 'node_modules', name)
    if (existsSync(join(dir, 'package.json'))) return realpathSync(dir)
    if (dirname(d) === d) return undefined
  }
}

function collect(dir: string, modules: ClientModules, plugin: boolean): void {
  const components = join(dir, 'components')
  if (existsSync(components)) {
    for (const file of readdirSync(components).filter(f => COMPONENT.test(f)).sort()) {
      modules.components.set(file.replace(/\.[^.]+$/, ''), join(components, file))
    }
  }
  if (existsSync(join(dir, CLIENT_PLUGIN))) modules.plugins.push(join(dir, CLIENT_PLUGIN))
  if (existsSync(join(dir, VIEWER_PLUGIN))) modules.viewers.push(join(dir, VIEWER_PLUGIN))
  if (plugin && existsSync(join(dir, VITE_CONFIG))) modules.vite.push(join(dir, VITE_CONFIG))
}

/**
 * The components, kernel plugins, viewer plugins and Vite configurations of
 * the deck's plugins, in declaration order; the deck's own `components/`
 * override them. Packages that cannot be found are left out (the compiler
 * reports them).
 */
export function clientModules(deckDir: string, plugins: readonly string[]): ClientModules {
  const modules: ClientModules = { components: new Map(), plugins: [], viewers: [], vite: [] }
  for (const name of plugins) {
    const dir = packageDir(name, deckDir)
    if (dir) collect(dir, modules, true)
  }
  collect(deckDir, modules, false)
  return modules
}
