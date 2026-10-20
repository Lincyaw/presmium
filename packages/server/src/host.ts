import type { Compilation } from '@lincyaw/compiler'
import { pluginId } from '@lincyaw/compiler'
import type { Finding, IRDocument, PresmiumNodePlugin, RunResult, ServiceToken } from '@lincyaw/kernel'

export interface ServedPlugin {
  id: string
  plugin: PresmiumNodePlugin
  config: Record<string, unknown>
}

export interface ServedDocument {
  deckDir: string
  workspaceRoot: string
  lang?: string
  plugins: ServedPlugin[]
  service<T>(token: ServiceToken<T>): T | undefined
  settings?: Record<string, Record<string, unknown>>
  operatorDir?: string
  home?: boolean
}

export function servedDocument(compilation: Compilation): ServedDocument {
  const { presmium } = compilation.doc.config
  return {
    deckDir: compilation.deckDir,
    workspaceRoot: compilation.workspaceRoot,
    lang: compilation.doc.meta.lang,
    plugins: compilation.plugins.flatMap((loaded) => {
      if (!loaded.plugin) return []
      const config = presmium[pluginId(loaded)]
      return [{ id: pluginId(loaded), plugin: loaded.plugin, config: config !== null && typeof config === 'object' && !Array.isArray(config) ? config as Record<string, unknown> : {} }]
    }),
    service: compilation.service,
    settings: compilation.settings,
    ...compilation.operatorDir ? { operatorDir: compilation.operatorDir } : {},
  }
}

export interface HostDocument {
  dir: string
  title: string
  lang?: string
  tags?: string[]
}

export interface ServerHost {
  documents(): Promise<HostDocument[]>
  compile(document: string): Promise<{ doc: IRDocument, diagnostics: Finding[] }>
  check(document: string): Promise<Finding[]>
  build(document: string, options?: { to?: string[] }): Promise<{ outputs: { renderer: string, outDir: string }[], findings: Finding[] }>
  run(document: string, target: { section: string, block: string }, signal?: AbortSignal): Promise<RunResult>
}
