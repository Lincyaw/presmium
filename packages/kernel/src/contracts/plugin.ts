import type { CanonicalSource, DirectiveSpec, IRDocument, IRPass, Renderer, RendererContribution, RoleSpec } from '../ir.ts'
import type { AgentTool } from './agent.ts'
import type { AnchorResolver, AnchorString } from './anchors.ts'
import type { Check, CheckContext } from './checks.ts'
import type { EnvironmentProvider, EnvironmentSpec, Executor } from './execution.ts'
import type { NodeServiceContext, ServerContext, ServerContribution } from './server.ts'
import type { ServiceToken } from './service.ts'

export const KERNEL_VERSION = '1.0.0'

export type Capability = 'fs' | 'network' | 'exec' | 'git'

export interface ServiceRequirement {
  token: ServiceToken<unknown>
  optional?: boolean
}

export interface PluginManifest {
  id: string
  version: string
  kernel: string
  provides?: ServiceToken<unknown>[]
  requires?: ServiceRequirement[]
  capabilities?: Capability[]
}

export type PresentationMode = 'slides' | 'document'

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export type Unsubscribe = () => void

export interface DomainEvent<Type extends string = string, Payload = unknown> {
  type: Type
  payload: Payload
}

export interface EventBus {
  emit(event: DomainEvent): void
  on<E extends DomainEvent>(type: E['type'], handler: (event: E) => void): Unsubscribe
}

export interface PluginContext {
  config: Record<string, unknown>
  mode: PresentationMode
  provide<T>(token: ServiceToken<T>, implementation: T): void
  get<T>(token: ServiceToken<T>): T
  tryGet<T>(token: ServiceToken<T>): T | undefined
  events: EventBus
  log: Logger
  environments?: Readonly<Record<string, EnvironmentSpec>>
}

export interface PluginDefinition {
  manifest: PluginManifest
  /** Opt in only when dispose stops every resource and this definition can run setup again. */
  restartable?: boolean
  setup(ctx: PluginContext): void | Promise<void>
  dispose?(): void | Promise<void>
}

export type PluginStatus = 'started' | 'degraded' | 'disabled' | 'failed'

export interface PluginReport {
  id: string
  status: PluginStatus
  reason?: string
  missing?: string[]
}

export interface StartReport {
  order: string[]
  plugins: PluginReport[]
  cycles: string[][]
}

export type KernelEvent =
  | DomainEvent<'kernel.plugin.started', { id: string }>
  | DomainEvent<'kernel.plugin.degraded', { id: string; missing: string[] }>
  | DomainEvent<'kernel.plugin.disabled', { id: string; reason: string }>
  | DomainEvent<'kernel.plugin.failed', { id: string; error: string }>

/**
 * A heavy output of a document that the plugin makes on request, as a job of the workspace service (the slides as a PDF,
 * the lecture as a video): the job shows its progress and log, and keeps the files for the author and the AI.
 */
export interface Exporter {
  /** Unique among the outputs of a document, renderers' ids included (e.g. `pdf`, `video`). */
  id: string
  /** What the author sees, by language (`zh-CN`, `en`). */
  label: Record<string, string>
  /** Whether the document can be exported so (e.g. it has the slides form); every document when left out. */
  available?(doc: IRDocument, config: Record<string, unknown>): boolean
  run(ctx: ExportContext): Promise<ExportOutput>
}

export interface ExportContext {
  deckDir: string
  workspaceRoot: string
  /** The exact canonical source from which the requested compilation was derived. */
  source?: CanonicalSource
  /** The plugin's configuration in the document (`presmium.<plugin id>`). */
  config: Record<string, unknown>
  /** An empty directory, the job's own, for the files. */
  outDir: string
  /** Aborted when the author cancels the job: the exporter stops its processes and rejects. */
  signal: AbortSignal
  /** Where the job is: a phase, and how far through it. */
  progress(phase: string, done?: number, total?: number): void
  /** A line of the job's log (a tool's output, a step). */
  log(line: string): void
  /** What the one who asked for the export chose, as the exporter documents it (`presmium-export`'s `--with-clicks`). */
  options: Record<string, unknown>
  /**
   * Builds the document with renderer `renderer` (at the root path, with `config` over the document's configuration of
   * the renderer) and gives the directory of its output, the job's own: an exporter of the slides prints them from it.
   */
  build(renderer: string, config?: Record<string, unknown>): Promise<string>
}

export interface ExportOutput {
  /** The files made, below `outDir`, the one to show first. */
  files: string[]
  /** The WebVTT captions of the first file (a video), by language, among `files`. */
  captions?: Record<string, string>
  warnings?: string[]
}

/**
 * Files of an installed package that a plugin's browser code loads while it runs (Pyodide, the WASI runtimes): served
 * below the document's site path at `<base><prefix><file>` and copied there into a built site.
 */
export interface RuntimeAssets {
  name: string
  /** The directory below the document's site path, e.g. `pyodide/`. */
  prefix: string
  /** The files that are served, with their content types. */
  types: Readonly<Record<string, string>>
  /** The files a build copies; default: all that are served. */
  emitted?: readonly string[]
  /** The path of a file on disk. */
  source(file: string): string
}

export interface PresmiumNodePlugin {
  id: string
  version?: string
  kernel?: string
  resolvers?: AnchorResolver[]
  checks?: Check[]
  anchors?(ctx: CheckContext): AnchorString[] | Promise<AnchorString[]>
  directives?: DirectiveSpec[]
  passes?: IRPass[]
  executors?: Executor[]
  renderer?: Renderer
  rendererExtensions?: Record<string, RendererContribution>
  /** The files the plugin's browser code loads while it runs (a language runtime), for the document's configuration of the plugin. */
  assets?(ctx: { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }): RuntimeAssets[]
  /**
   * The virtual modules of the plugin's browser code whose content depends on the document (e.g. the list of its scene
   * files), by id, with their source. The viewer app, prebuilt once for all documents, gets them from the document's own
   * bundle, built with this source. Only their default export is read there.
   */
  documentModules?(ctx: { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }): Record<string, string>
  /** The heavy outputs the plugin makes on request, as jobs of the workspace service. */
  exporters?: Exporter[]
  services?(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][]
  environments?: Record<string, EnvironmentProvider>
  server?(ctx: ServerContext): ServerContribution | Promise<ServerContribution>
  roles?: RoleSpec[]
  tools?: AgentTool[]
  operator?: boolean
}
