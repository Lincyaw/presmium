import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from '@lincyaw/kernel'
import type { NodeVitePlugin, RenderContext } from '@lincyaw/kernel'
import { packageOf } from '@lincyaw/kernel/node'

const CLIENT_PLUGIN = 'src/client/plugin.ts'
const VIEWER_PLUGIN = 'src/client/viewer.ts'
const VITE_CONFIG = 'vite.config.ts'
const COMPONENT = /^[^.]+\.(vue|[jt]sx?)$/

export interface ClientModules {
  restartable: boolean
  components: Map<string, string>
  plugins: string[]
  viewers: { name: string, file: string }[]
  vite: string[]
  nodeVite: NodeVitePlugin[]
}

function collect(dir: string, name: string, modules: ClientModules, plugin: boolean): void {
  let browser = false
  const components = join(dir, 'components')
  if (existsSync(components)) {
    for (const file of readdirSync(components).filter(f => COMPONENT.test(f)).sort()) {
      browser = true
      const name = file.replace(/\.[^.]+$/, '')
      if (!plugin || !modules.components.has(name)) modules.components.set(name, join(components, file))
    }
  }
  if (existsSync(join(dir, CLIENT_PLUGIN))) {
    browser = true
    modules.plugins.push(join(dir, CLIENT_PLUGIN))
  }
  if (existsSync(join(dir, VIEWER_PLUGIN))) {
    browser = true
    modules.viewers.push({ name, file: join(dir, VIEWER_PLUGIN) })
  }
  if (plugin && existsSync(join(dir, VITE_CONFIG))) {
    browser = true
    modules.vite.push(join(dir, VITE_CONFIG))
  }
  if (browser && !isRestartablePackage(dir)) modules.restartable = false
}

function readManifest(dir: string): Record<string, unknown> {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return isRecord(pkg) ? pkg : {}
  } catch {
    return {}
  }
}

function isRestartablePackage(dir: string | undefined): boolean {
  if (!dir) return false
  const { presmium } = readManifest(dir)
  return isRecord(presmium) && isRecord(presmium.preview) && presmium.preview.restartable === true
}

/** The browser modules of the document and its plugins: components, browser and viewer plugins, Vite configurations. */
export function clientModules(ctx: RenderContext, nodeVite: NodeVitePlugin[]): ClientModules {
  const modules: ClientModules = { restartable: true, components: new Map(), plugins: [], viewers: [], vite: [], nodeVite }
  for (const { entry } of nodeVite) {
    try {
      if (!isRestartablePackage(packageOf(entry))) modules.restartable = false
    } catch {
      modules.restartable = false
    }
  }
  for (const name of ctx.plugins) {
    const dir = ctx.pluginDirs[name]
    const { name: pkg } = dir ? readManifest(dir) : {}
    if (dir) collect(dir, typeof pkg === 'string' ? pkg : name, modules, true)
  }
  collect(ctx.deckDir, 'deck', modules, false)
  return modules
}
