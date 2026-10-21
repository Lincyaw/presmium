import type { AgentTool } from './contracts/agent.ts'
import type { EnvironmentProvider, EnvironmentSpec, Executor } from './contracts/execution.ts'
import type { NodeServiceContext, ServerContext, ServerContribution } from './contracts/server.ts'
import { defineService } from './contracts/service.ts'
import type { ServiceToken } from './contracts/service.ts'
import type { DirectiveSpec, IRDocument, IRPass, Renderer, RendererContribution, RoleSpec } from './ir.ts'

export * from './contracts/agent.ts'
export * from './contracts/diagnostics.ts'
export * from './contracts/execution.ts'
export * from './contracts/operations.ts'
export * from './contracts/preview.ts'
export * from './contracts/server.ts'
export * from './contracts/service.ts'
export * from './contracts/speech.ts'

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
  provide<T>(token: ServiceToken<T>, impl: T): void
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

export type Locale = 'zh-CN' | 'en'

export const DEFAULT_LANG = 'zh-CN'

export function localeOf(lang: string | null | undefined): Locale | undefined {
  const tag = lang?.trim().toLowerCase() ?? ''
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-CN'
  if (tag === 'en' || tag.startsWith('en-')) return 'en'
  return undefined
}

export function deckLocale(lang?: string): Locale {
  return localeOf(lang || DEFAULT_LANG) ?? 'en'
}

export interface StepRange {
  from: number
  to?: number
}

export interface StepState {
  active: boolean
  reached: boolean
  done: boolean
}

export function stepStateAt(range: StepRange, step: number): StepState {
  const reached = step >= range.from
  const done = range.to !== undefined && step >= range.to
  return { active: reached && !done, reached, done }
}

export interface Cursor {
  slide: number
  step: number
}

export type AnchorString = `${string}:${string}`

export type ResolutionStatus = 'exact' | 'moved' | 'fuzzy' | 'lost'

export interface ResolvedLocation {
  file: string
  startLine: number
  endLine: number
  text: string
}

export interface Resolution {
  status: ResolutionStatus
  location?: ResolvedLocation
  fingerprint?: string
  candidates?: ResolvedLocation[]
  message?: string
}

export interface SourceReader {
  read(file: string, ref?: string): Promise<string | undefined>
}

export interface RecordedAnchor {
  fingerprint: string
  file: string
  startLine: number
}

export interface AnchorResolver {
  scheme: string
  resolve(anchor: AnchorString, src: SourceReader, recorded?: RecordedAnchor, ref?: string): Promise<Resolution>
}

export interface AnchorResolverRegistry {
  register(resolver: AnchorResolver): Unsubscribe
  resolve(anchor: AnchorString, src: SourceReader, recorded?: RecordedAnchor, ref?: string): Promise<Resolution>
  schemes(): string[]
}

export interface AnchorLockFile {
  version: 1
  anchors: Record<string, RecordedAnchor>
}

export function isRenderable(resolution: Resolution): boolean {
  return resolution.status === 'exact' || resolution.status === 'moved'
}

export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  checkId: string
  severity: Severity
  message: string
  source?: { file: string; line?: number }
  hint?: string
}

export interface CheckContext {
  deckDir: string
  workspaceRoot: string
  headmatter: Record<string, unknown>
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLockFile
  ir: IRDocument
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface Check {
  id: string
  run(ctx: CheckContext): Promise<Finding[]>
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
  vitePlugins?(ctx: { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }): unknown[]
  services?(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][]
  environments?: Record<string, EnvironmentProvider>
  server?(ctx: ServerContext): ServerContribution | Promise<ServerContribution>
  roles?: RoleSpec[]
  tools?: AgentTool[]
  operator?: boolean
}

export type Role = 'presenter' | 'learner'

export interface Participant {
  id: string
  name: string
  role: Role
}

export type SessionStatus = 'idle' | 'active' | 'ended'

export interface SessionSnapshot {
  sessionId?: string
  status: SessionStatus
  me?: Participant
  participants: Participant[]
  presenterCursor?: Cursor
}

export interface SessionService {
  snapshot(): SessionSnapshot
  subscribe(listener: (snapshot: SessionSnapshot) => void): Unsubscribe
  create(name: string): Promise<string>
  join(sessionId: string, name: string): Promise<void>
  end(): Promise<void>
  leave(): void
  archive?(): Promise<string>
  readonly personal?: ClassroomStore
}

export const SESSION = defineService<SessionService>('presmium.session')

export interface StoredItem<T> {
  id: string
  value: T
}

export interface ClassroomStore {
  list<T>(collection: string): StoredItem<T>[]
  get<T>(collection: string, id: string): T | undefined
  put<T>(collection: string, id: string, value: T): void
  remove(collection: string, id: string): void
  subscribe(collection: string, listener: () => void): Unsubscribe
}

export const CLASSROOM_STORE = defineService<ClassroomStore>('presmium.classroomStore')

export interface PresenterPanel {
  id: string
  title: string
  component: unknown
  order?: number
}

export interface PresenterPanels {
  register(panel: PresenterPanel): Unsubscribe
  list(): PresenterPanel[]
  subscribe(listener: () => void): Unsubscribe
}

export const PRESENTER_PANELS = defineService<PresenterPanels>('presmium.presenterPanels')
