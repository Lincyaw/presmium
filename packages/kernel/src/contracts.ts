/**
 * Presmium shared kernel contracts.
 *
 * Every bounded context depends only on these types. Adding fields is allowed;
 * changing or removing existing signatures requires updating docs/architecture.md.
 */

export const KERNEL_VERSION = '0.1.0'

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ServiceToken<T> {
  readonly id: string
  /** Phantom field that carries the service type. Never set at runtime. */
  readonly __service?: T
}

export function defineService<T>(id: string): ServiceToken<T> {
  return Object.freeze({ id }) as ServiceToken<T>
}

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
  /** Semver range of compatible kernel versions, e.g. '^0.1.0'. */
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

export interface DeckSlide {
  /** 1-based slide number. */
  index: number
  /** Absolute path of the file that contains the slide. */
  file: string
  /** 1-based line where the slide starts in `file`. */
  line: number
  frontmatter: Record<string, unknown>
  content: string
  note?: string
}

export interface CheckContext {
  /** Absolute deck directory. */
  deckDir: string
  /** Absolute workspace root (git root, or deckDir when not in git). */
  workspaceRoot: string
  headmatter: Record<string, unknown>
  slides: DeckSlide[]
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLockFile
}

export interface Check {
  id: string
  run(ctx: CheckContext): Promise<Finding[]>
}

export interface MarkdownTransformInput {
  /** Markdown of one slide, without frontmatter. */
  content: string
  /** Absolute path of the source file. */
  file: string
  /** 1-based slide number. */
  slide: number
  mode: PresentationMode
  deckDir: string
  workspaceRoot: string
  headmatter: Record<string, unknown>
  frontmatter: Record<string, unknown>
}

/** Default export of each addon's `./presmium` entry. */
export interface PresmiumNodePlugin {
  id: string
  resolvers?: AnchorResolver[]
  checks?: Check[]
  transformMarkdown?(input: MarkdownTransformInput): string | Promise<string>
}

// ---------------------------------------------------------------------------
// Public services
// ---------------------------------------------------------------------------

// Execution -----------------------------------------------------------------

export interface RunRequest {
  lang: string
  code: string
  /** Named parameters injected by the runtime (e.g. as variables). */
  args?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  /** Extra files available to the program, path -> content. */
  files?: Record<string, string>
}

export interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  timedOut: boolean
  /** 'recorded' when the output is a fallback recording. */
  source: 'live' | 'recorded'
  executorId: string
}

export interface Executor {
  readonly id: string
  supports(lang: string): boolean
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>
}

/** Routes requests to registered executors; higher priority wins. */
export interface ExecutorRouter extends Executor {
  register(executor: Executor, priority?: number): Unsubscribe
  list(): Executor[]
}

export const EXECUTOR = defineService<ExecutorRouter>('presmium.executor')

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
