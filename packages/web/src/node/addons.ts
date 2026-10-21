import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isRecord } from '@lincyaw/kernel'
import type { PresmiumNodePlugin, RenderContext } from '@lincyaw/kernel'
import { packageOf } from '@lincyaw/kernel/node'

const CLIENT_PLUGIN = 'src/client/plugin.ts'
const VIEWER_PLUGIN = 'src/client/viewer.ts'
const VITE_CONFIG = 'vite.config.ts'
const COMPONENT = /^[^.]+\.(vue|[jt]sx?)$/

export interface VitePluginsEntry {
  file: string
  config: Record<string, unknown>
}

export interface ClientModules {
  restartable: boolean
  components: Map<string, string>
  plugins: string[]
  viewers: { name: string, file: string }[]
  vite: string[]
  nodeVite: VitePluginsEntry[]
}

function collect(dir: string, name: string, modules: ClientModules, plugin: boolean): void {
  let browser = false
  const components = join(dir, 'components')
  if (existsSync(components)) {
    for (const file of readdirSync(components).filter(f => COMPONENT.test(f)).sort()) {
      browser = true
      modules.components.set(file.replace(/\.[^.]+$/, ''), join(components, file))
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
  if (browser && !restartablePackage(dir)) modules.restartable = false
}

function manifest(dir: string): Record<string, unknown> {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return isRecord(pkg) ? pkg : {}
  } catch {
    return {}
  }
}

function restartablePackage(dir: string | undefined): boolean {
  if (!dir) return false
  const { presmium } = manifest(dir)
  return isRecord(presmium) && isRecord(presmium.preview) && presmium.preview.restartable === true
}

function nodeEntry(dir: string): string | undefined {
  const { exports } = manifest(dir)
  const entry = isRecord(exports) ? exports['./presmium'] : undefined
  return typeof entry === 'string' ? resolve(dir, entry) : undefined
}

export async function nodeVitePlugins(ctx: RenderContext, presmium: Record<string, unknown>, always = false): Promise<VitePluginsEntry[]> {
  if (ctx.vitePlugins.length === 0 && !always) return []
  const entries: VitePluginsEntry[] = []
  for (const name of ctx.plugins) {
    const dir = ctx.pluginDirs[name]
    const file = dir && nodeEntry(dir)
    if (!file) continue
    const plugin = (await import(pathToFileURL(file).href).catch(() => ({}))).default as PresmiumNodePlugin | undefined
    if (typeof plugin?.vitePlugins !== 'function') continue
    const config = presmium[plugin.id]
    entries.push({ file, config: isRecord(config) ? config : {} })
  }
  return entries
}

export function clientModules(ctx: RenderContext, nodeVite: VitePluginsEntry[]): ClientModules {
  const modules: ClientModules = { restartable: true, components: new Map(), plugins: [], viewers: [], vite: [], nodeVite }
  for (const { file } of nodeVite) {
    try {
      if (!restartablePackage(packageOf(file))) modules.restartable = false
    } catch {
      modules.restartable = false
    }
  }
  for (const name of ctx.plugins) {
    const dir = ctx.pluginDirs[name]
    const { name: pkg } = dir ? manifest(dir) : {}
    if (dir) collect(dir, typeof pkg === 'string' ? pkg : name, modules, true)
  }
  collect(ctx.deckDir, 'deck', modules, false)
  return modules
}
