import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
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

/** Adds the browser modules of the package at `dir` to `modules` (a plugin's components do not replace those already there). */
export function collectBrowserModules(dir: string, name: string, modules: ClientModules, plugin: boolean, manifestDir: string | undefined = dir): void {
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
  if (browser && !isRestartablePackage(manifestDir)) modules.restartable = false
}

/** The directory of the document's own package: its own `package.json`, else the nearest one up to the workspace's root. */
export function deckPackage(deckDir: string, workspaceRoot: string): string | undefined {
  for (let dir = deckDir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir
    if (dir === workspaceRoot || relative(workspaceRoot, dir).startsWith('..') || dirname(dir) === dir) return undefined
  }
}

function readManifest(dir: string): Record<string, unknown> {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return isRecord(pkg) ? pkg : {}
  } catch {
    return {}
  }
}

export function isRestartablePackage(dir: string | undefined): boolean {
  if (!dir) return false
  const { presmium } = readManifest(dir)
  return isRecord(presmium) && isRecord(presmium.preview) && presmium.preview.restartable === true
}

/** No browser modules yet. */
export function emptyClientModules(nodeVite: NodeVitePlugin[] = []): ClientModules {
  return { restartable: true, components: new Map(), plugins: [], viewers: [], vite: [], nodeVite }
}

/** The browser modules of the document and its plugins: components, browser and viewer plugins, Vite configurations. */
export function clientModules(ctx: RenderContext, nodeVite: NodeVitePlugin[]): ClientModules {
  const modules = emptyClientModules(nodeVite)
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
    if (dir) collectBrowserModules(dir, typeof pkg === 'string' ? pkg : name, modules, true)
  }
  collectBrowserModules(ctx.deckDir, 'deck', modules, false, deckPackage(ctx.deckDir, ctx.workspaceRoot))
  return modules
}
