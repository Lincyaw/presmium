/**
 * Presmium shared kernel contracts.
 *
 * Every bounded context depends only on these types. Adding fields is allowed;
 * changing or removing existing signatures requires updating docs/architecture.md.
 */

import type { AgentTool } from './contracts/agent.ts'
import type { EnvironmentProvider, EnvironmentSpec, Executor } from './contracts/execution.ts'
import type { NodeServiceContext, ServerContext, ServerContribution } from './contracts/server.ts'
import { defineService } from './contracts/service.ts'
import type { ServiceToken } from './contracts/service.ts'
import type { DirectiveSpec, IRDocument, IRPass, Renderer, RendererContribution, RoleSpec } from './ir.ts'

// The business contracts, by domain (docs/architecture.md 9.2), all exported from this entry.
export * from './contracts/agent.ts'
export * from './contracts/execution.ts'
export * from './contracts/operations.ts'
export * from './contracts/server.ts'
export * from './contracts/service.ts'
export * from './contracts/speech.ts'

export const KERNEL_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export type Capability = 'fs' | 'network' | 'exec' | 'git'

export interface ServiceRequirement {
  token: ServiceToken<unknown>
  /** Optional requirements degrade the plugin instead of disabling it. */
  optional?: boolean
}

export interface PluginManifest {
  /** Reverse-DNS style id, e.g. 'presmium.code'. */
  id: string
  version: string
  /** Semver range of compatible kernel versions, e.g. '^1.0.0'. */
  kernel: string
  provides?: ServiceToken<unknown>[]
  requires?: ServiceRequirement[]
  /** Declared only; not enforced in v0.x. */
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
  /** headmatter `presmium.<plugin id>` merged with defaults. */
  config: Record<string, unknown>
  mode: PresentationMode
  provide<T>(token: ServiceToken<T>, impl: T): void
  /** Returns a required service; throws if the manifest did not require it or it is missing. */
  get<T>(token: ServiceToken<T>): T
  tryGet<T>(token: ServiceToken<T>): T | undefined
  events: EventBus
  log: Logger
  /** The named environments the deck declares (from `KernelOptions.environments`); a provider plugin registers browser executors for those of its `kind`. */
  environments?: Readonly<Record<string, EnvironmentSpec>>
}

export interface PluginDefinition {
  manifest: PluginManifest
  setup(ctx: PluginContext): void | Promise<void>
  dispose?(): void | Promise<void>
}

export type PluginStatus = 'started' | 'degraded' | 'disabled' | 'failed'

export interface PluginReport {
  id: string
  status: PluginStatus
  reason?: string
  /** Service ids that were required or optional but unavailable. */
  missing?: string[]
}

export interface StartReport {
  /** Initialization order actually used. */
  order: string[]
  plugins: PluginReport[]
  /** Dependency cycles, each listed as plugin ids. */
  cycles: string[][]
}

export type KernelEvent =
  | DomainEvent<'kernel.plugin.started', { id: string }>
  | DomainEvent<'kernel.plugin.degraded', { id: string; missing: string[] }>
  | DomainEvent<'kernel.plugin.disabled', { id: string; reason: string }>
  | DomainEvent<'kernel.plugin.failed', { id: string; error: string }>

// ---------------------------------------------------------------------------
// Language (N-07)
// ---------------------------------------------------------------------------

/** The UI languages Presmium has messages for. */
export type Locale = 'zh-CN' | 'en'

/** Language of a deck that names none (its `lang`); both forms put it in `<html lang>`. */
export const DEFAULT_LANG = 'zh-CN'

/** The UI language for a language tag such as `en-US` or `zh-Hans`; undefined when Presmium has no messages for it. */
export function localeOf(lang: string | null | undefined): Locale | undefined {
  const tag = lang?.trim().toLowerCase() ?? ''
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-CN'
  if (tag === 'en' || tag.startsWith('en-')) return 'en'
  return undefined
}

/**
 * The UI language of a deck whose `lang` is `lang` (`IRDocument.meta.lang`,
 * the contexts' `lang`): its messages when Presmium has them, the default
 * language's when it names none, else English. Text written at compile time
 * (notes in a notebook, the slides' own words) follows it.
 */
export function deckLocale(lang?: string): Locale {
  return localeOf(lang || DEFAULT_LANG) ?? 'en'
}

// ---------------------------------------------------------------------------
// Steps (form-neutral)
// ---------------------------------------------------------------------------

/** Active while `from <= step < to`; `to` undefined means open-ended. */
export interface StepRange {
  from: number
  to?: number
}

export interface StepState {
  /** step is inside the range */
  active: boolean
  /** step has reached `from` (stays true after the range ends) */
  reached: boolean
  /** step has passed the end of the range */
  done: boolean
}

export function stepStateAt(range: StepRange, step: number): StepState {
  const reached = step >= range.from
  const done = range.to !== undefined && step >= range.to
  return { active: reached && !done, reached, done }
}

export interface Cursor {
  /** 1-based slide number, equal to the section number in the document form. */
  slide: number
  step: number
}

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

/** `scheme:target`, e.g. `region:src/math.py#add`, `symbol:src/a.py#Parser.parse`. */
export type AnchorString = `${string}:${string}`

export type ResolutionStatus = 'exact' | 'moved' | 'fuzzy' | 'lost'

export interface ResolvedLocation {
  /** Path relative to the workspace root. */
  file: string
  /** 1-based, inclusive. */
  startLine: number
  endLine: number
  text: string
}

export interface Resolution {
  status: ResolutionStatus
  location?: ResolvedLocation
  fingerprint?: string
  /** Candidate matches when status is 'fuzzy'. */
  candidates?: ResolvedLocation[]
  message?: string
}

export interface SourceReader {
  /** Reads a workspace-relative file; `ref` is a git revision, omitted for the working tree. */
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

/** Content of `.presmium/anchors.lock.json`. */
export interface AnchorLockFile {
  version: 1
  anchors: Record<string, RecordedAnchor>
}

export function isRenderable(resolution: Resolution): boolean {
  return resolution.status === 'exact' || resolution.status === 'moved'
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  checkId: string
  severity: Severity
  message: string
  source?: { file: string; line?: number }
  hint?: string
}

export interface CheckContext {
  /** Absolute deck directory. */
  deckDir: string
  /** Absolute workspace root (git root, or deckDir when not in git). */
  workspaceRoot: string
  headmatter: Record<string, unknown>
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLockFile
  /** The compiled deck (docs/ir.md section 7). */
  ir: IRDocument
  /** Node services (docs/architecture.md 4.6); the compiler always gives it, optional for compatibility. */
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface Check {
  id: string
  run(ctx: CheckContext): Promise<Finding[]>
}

/** Default export of each addon's `./presmium` entry. */
export interface PresmiumNodePlugin {
  id: string
  /** The plugin's own version, reported with problems. */
  version?: string
  /**
   * Semver range of compatible kernel versions, e.g. '^1.0.0'; the compiler
   * does not load a plugin whose range excludes `KERNEL_VERSION`.
   */
  kernel?: string
  resolvers?: AnchorResolver[]
  checks?: Check[]
  /**
   * Anchors the deck references through this plugin's syntax. `presmium check
   * --update-lock` resolves them in the working tree and records them in the lock.
   */
  anchors?(ctx: CheckContext): AnchorString[] | Promise<AnchorString[]>
  /** MyST directives this plugin adds to the source syntax. */
  directives?: DirectiveSpec[]
  /** IR passes run after the built-in passes, ordered by `order`. */
  passes?: IRPass[]
  /** Node-side executors for compile-time execution. */
  executors?: Executor[]
  /** A renderer this plugin provides (e.g. the web, slides or notebook renderer). */
  renderer?: Renderer
  /** Contributions to renderers provided by other plugins, keyed by renderer id. */
  rendererExtensions?: Record<string, RendererContribution>
  /**
   * Vite plugins the dev servers and builds of the browser renderers add
   * (`RenderContext.vitePlugins`), e.g. a server endpoint the plugin's
   * components call. `config` is the plugin's `presmium.<id>` configuration.
   * Typed loosely to keep the kernel free of Vite.
   */
  vitePlugins?(ctx: { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }): unknown[]
  /** Node service implementations, e.g. `[[SPEECH, speech]]`; one implementation per token, a later plugin's duplicate is ignored and reported. */
  services?(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][]
  /** Providers of named environments, by `EnvironmentSpec.kind`. */
  environments?: Record<string, EnvironmentProvider>
  /** Server contribution; once per deck in `presmium dev`, once per document requested in `presmium serve` (docs/architecture.md section 10). */
  server?(ctx: ServerContext): ServerContribution | Promise<ServerContribution>
  /** MyST inline roles (docs/architecture.md 4.10, docs/ir.md 2.8). */
  roles?: RoleSpec[]
  /** Agent tools, which the MCP service exposes as tools (docs/architecture.md 4.8). */
  tools?: AgentTool[]
  /**
   * An operator plugin: listed in `settings.presmium.workspace.plugins`, it is
   * loaded for every document (every command) without the deck listing it in
   * `plugins`; e.g. `addon-deltabox`, which provides `CHANGE_REVIEW` and
   * `PROCESS_SANDBOX` (installed with the CLI, loaded without being listed).
   */
  operator?: boolean
}

// ---------------------------------------------------------------------------
// Public services
// ---------------------------------------------------------------------------

// Session ---------------------------------------------------------------------

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
  /** Creates a session with the caller as presenter; returns the session id. */
  create(name: string): Promise<string>
  join(sessionId: string, name: string): Promise<void>
  end(): Promise<void>
  leave(): void
  /**
   * Presenter only (P-60): ends the classroom if it is still active, exports
   * its document to a file in the deck directory and frees it on the server;
   * nobody can write to or join it afterwards. Resolves with the file written.
   * Optional: a session without a server to archive to leaves it out.
   */
  archive?(): Promise<string>
  /**
   * The participant's own collections in the classroom (e.g. notes, P-63):
   * no other participant receives them. Empty outside a classroom; freed when
   * the classroom is archived, so data that must outlast it needs a copy of
   * its own. Optional: without it, such data stays in the browser.
   */
  readonly personal?: ClassroomStore
}

export const SESSION = defineService<SessionService>('presmium.session')

export interface StoredItem<T> {
  id: string
  value: T
}

/**
 * The classroom's shared collections (P-60 to P-65). Write rules, which the
 * classroom server enforces: the presenter may write anything; a learner may
 * write only entries of their own, whose key contains their participant id
 * (e.g. `<quiz>:<participant>`, `<participant>:<question>`) and whose value
 * is an object that names them in `participant` or `author`. The `quizzes`
 * collection is the presenter's alone. A learner's write that breaks these
 * rules is dropped by the server, which closes that window's connection: the
 * session plugin starts the window again from the classroom's document and
 * tells the learner, but `put` itself does not report it, so a plugin that
 * stores learners' data must give it this shape.
 */
export interface ClassroomStore {
  list<T>(collection: string): StoredItem<T>[]
  get<T>(collection: string, id: string): T | undefined
  put<T>(collection: string, id: string, value: T): void
  remove(collection: string, id: string): void
  subscribe(collection: string, listener: () => void): Unsubscribe
}

export const CLASSROOM_STORE = defineService<ClassroomStore>('presmium.classroomStore')

// Presenter panels --------------------------------------------------------------

export interface PresenterPanel {
  id: string
  title: string
  /** A Vue component; typed loosely to keep the kernel framework-free. */
  component: unknown
  order?: number
}

export interface PresenterPanels {
  register(panel: PresenterPanel): Unsubscribe
  list(): PresenterPanel[]
  subscribe(listener: () => void): Unsubscribe
}

export const PRESENTER_PANELS = defineService<PresenterPanels>('presmium.presenterPanels')
