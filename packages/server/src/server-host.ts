import type { ProjectAuthoring, DocumentHistory } from '@lincyaw/kernel'
import type { Compilation } from '@lincyaw/compiler'
import { pluginId } from '@lincyaw/compiler'
import type { DocumentSummary, Finding, IRDocument, Member, OutputJobs, PresmiumNodePlugin, RunResult, ServiceToken } from '@lincyaw/kernel'
import type { AgentTool, DocumentAuthoring, DocumentAudioAuthoring, DocumentImageAuthoring, DocumentVoiceAuthoring, DocumentTranscriptionAdoption, DocumentTranscriptions, Route } from '@lincyaw/kernel'

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

/** What the server contributions of a compilation depend on, as a key that changes when they must be made again. */
export function serverConfigKey(compilation: Pick<Compilation, 'doc' | 'plugins'>): string {
  return JSON.stringify([
    compilation.doc.meta.lang,
    compilation.plugins.filter(loaded => loaded.plugin).map(loaded => [pluginId(loaded), loaded.dir, loaded.entry]),
    compilation.doc.config.presmium,
  ])
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

export interface ServerHost {
  projectAuthoring?: ProjectAuthoring
  authoring?: DocumentAuthoring
  documentHistory?: DocumentHistory
  authoringClients?: AuthoringClients
  audioAuthoring?: DocumentAudioAuthoring
  imageAuthoring?: DocumentImageAuthoring
  voiceAuthoring?: DocumentVoiceAuthoring
  transcriptions?: DocumentTranscriptions
  transcriptionAdoption?: DocumentTranscriptionAdoption
  /** Host-owned routes are available before a document's compiled plugin contributions. */
  routes?: Record<string, Record<string, Route>>
  /** Only already compiled plugin tools. This snapshot must never start or wait for compilation. */
  agentTools?(document?: string): { tools: AgentTool[], service<T>(token: ServiceToken<T>): T | undefined }
  watchAgentTools?(listener: (document: string) => void): () => void
  readSource?(path: string, member: Member): Promise<{ content: string }>
  workspaceRoot?: string
  documents(): Promise<DocumentSummary[]>
  compile(document: string): Promise<{ doc: IRDocument, diagnostics: Finding[] }>
  check(document: string): Promise<Finding[]>
  build(document: string, options?: { to?: string[] }): Promise<{ outputs: { renderer: string, outDir: string }[], findings: Finding[] }>
  run(document: string, target: { section: string, block: string }, signal?: AbortSignal): Promise<RunResult>
  /** The documents' builds and exports as jobs, where the host runs them so (the workspace service). */
  jobs?: OutputJobs
}
import type { AuthoringClients } from '@lincyaw/kernel'
