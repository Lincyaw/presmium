import type { DirectiveSpec, IRPass, Renderer, RendererContribution, RoleSpec } from '../ir.ts'
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
  vitePlugins?(ctx: { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }): unknown[]
  services?(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][]
  environments?: Record<string, EnvironmentProvider>
  server?(ctx: ServerContext): ServerContribution | Promise<ServerContribution>
  roles?: RoleSpec[]
  tools?: AgentTool[]
  operator?: boolean
}
