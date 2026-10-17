/**
 * What the process that starts the server gives it (docs/architecture.md
 * 10.2): the documents it serves, with their plugins and Node services, and
 * the host operations (`ServerHost`) that the control channel and MCP use.
 * `presmium dev` implements them on its compiler; `presmium serve` (the
 * workspace) on its own.
 */
import type { Compilation } from '@presmium/compiler'
import { pluginId } from '@presmium/compiler'
import type { Finding, IRDocument, PresmiumNodePlugin, RunResult, ServiceToken } from '@presmium/kernel'

/** A plugin of a served document, with its `presmium.<plugin id>` configuration. */
export interface ServedPlugin {
  id: string
  plugin: PresmiumNodePlugin
  config: Record<string, unknown>
}

/** A document the server serves: its plugins and its Node services (the server adds its own in front). */
export interface ServedDocument {
  deckDir: string
  workspaceRoot: string
  lang?: string
  plugins: ServedPlugin[]
  service<T>(token: ServiceToken<T>): T | undefined
  /** The operator's settings by plugin id, as its compiler read them; `ServerOptions.settings` goes first. */
  settings?: Record<string, Record<string, unknown>>
  /** The LOCAL operator directory, as its compiler found it; `ServerOptions.operatorDir` goes first. */
  operatorDir?: string
}

/** The document of a compilation, as the server serves it. */
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

/** A document of the host, as listed (P-120). */
export interface HostDocument {
  /** Its directory, relative to the workspace root; '' for the deck of `presmium dev`. */
  dir: string
  title: string
  lang?: string
  tags?: string[]
}

/**
 * The host process's operations (10.2): the documents, their compiled IR
 * (the whole deck) with diagnostics, the checks, a build, and a run of one code
 * block (MCP's `run_code`). Builds and runs use the execution options of
 * the host's compiler (10.6).
 */
export interface ServerHost {
  documents(): Promise<HostDocument[]>
  compile(document: string): Promise<{ doc: IRDocument, diagnostics: Finding[] }>
  check(document: string): Promise<Finding[]>
  build(document: string, options?: { to?: string[] }): Promise<{ outputs: { renderer: string, outDir: string }[], findings: Finding[] }>
  run(document: string, target: { section: string, block: string }, signal?: AbortSignal): Promise<RunResult>
}
