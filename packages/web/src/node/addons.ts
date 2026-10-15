import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Browser entry that registers a plugin's kernel plugins in the web form (docs/architecture.md section 5.1). */
const CLIENT_PLUGIN = 'src/client/plugin.ts'
const COMPONENT = /^[^.]+\.(vue|[jt]sx?)$/

/** Client modules of the deck's plugins (and of the deck itself) that the web theme registers. */
export interface ClientModules {
  /** Component name to absolute file, from the `components/` convention. */
  components: Map<string, string>
  /** Absolute paths of `src/client/plugin.ts` modules. */
  plugins: string[]
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

function collect(dir: string, modules: ClientModules): void {
  const components = join(dir, 'components')
  if (existsSync(components)) {
    for (const file of readdirSync(components).filter(f => COMPONENT.test(f)).sort()) {
      modules.components.set(file.replace(/\.[^.]+$/, ''), join(components, file))
    }
  }
  if (existsSync(join(dir, CLIENT_PLUGIN))) modules.plugins.push(join(dir, CLIENT_PLUGIN))
}

/**
 * The components and kernel plugins of the deck's plugins, in declaration
 * order; the deck's own `components/` override them. Packages that cannot be
 * found are left out (the compiler reports them).
 */
export function clientModules(deckDir: string, plugins: readonly string[]): ClientModules {
  const modules: ClientModules = { components: new Map(), plugins: [] }
  for (const name of plugins) {
    const dir = packageDir(name, deckDir)
    if (dir) collect(dir, modules)
  }
  collect(deckDir, modules)
  return modules
}
