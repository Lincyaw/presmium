/**
 * The least of DeepSeek Harness's host interfaces this bundle uses
 * (docs/design-dsh.md 2.4, seam S1), declared here: the bundle imports no
 * package of DeepSeek Harness, it only receives the context its rows are
 * applied with. Each type names only the members the rows call; the
 * documentation of each is the package's README in the pinned version
 * (`@deepseek-ai/dsh-tools`, `dsh-system-prompt`, `dsh-skill`,
 * `dsh-client-connection`, `dsh-workspace`, `dsh-agent`, `dsh-session`).
 * The upgrade gate's first two groups catch a change of them (section 12).
 */
import type { PresmiumService } from './service.ts'

export interface DshLogger {
  info(format: string, ...args: unknown[]): void
  warn(format: string, ...args: unknown[]): void
  debug(format: string, ...args: unknown[]): void
}

/** A session, as an agent drives it (`dsh-session`). */
export interface DshSession {
  readonly id: string
  readonly header?: { cwd?: string }
}

/** An agent (`dsh-agent`): its session, and its scoped context (registrations through it are the agent's own). */
export interface DshAgent {
  readonly session: DshSession
  readonly ctx: DshContext
}

/** A tool call before it runs (`ToolExecution` of `dsh-tools`). */
export interface DshToolExecution {
  readonly callId: string
  readonly name: string
  readonly arguments: unknown
  readonly agent?: DshAgent
  readonly signal: AbortSignal
}

/** What `tools/pre-execute` decides (`PreToolDecision`). */
export type DshPreDecision =
  | { kind: 'allow' }
  | { kind: 'deny', reason: string }
  | { kind: 'ask', reason?: string, displayReason?: { en: string, [locale: string]: string } }

/** A model-facing tool (`ToolDefinition`): its raw JSON Schema parameters, its output, its execution. */
export interface DshToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: { schema: Record<string, unknown>, render(args: unknown, value: unknown): { type: 'text', text: string }[] }
  execute(args: unknown, exec: DshToolExecution): Promise<unknown>
}

export interface DshTools {
  register(definition: DshToolDefinition): () => void
  /** A monotonic guard after `tools/pre-execute`: a returned reason denies the call. */
  guard(guard: (exec: Readonly<DshToolExecution>) => string | undefined): () => void
}

/** A prompt contribution (`dsh-system-prompt`): a section of the system message, or runtime context. */
export interface DshPromptPart {
  name: string
  order: number
  text: string | (() => string)
  interpolate?: boolean
  required?: boolean
}

export interface DshSystemPrompt {
  section(section: DshPromptPart): () => void
  context(context: DshPromptPart): () => void
}

/** A skill registered at run time (`dsh-skill`). */
export interface DshSkill {
  name: string
  description: string
  content: string
  path: string
  source: 'bundled'
  resourceBase: { kind: 'directory', path: string }
}

/** An exact Fetch route of the web carrier (`dsh-client-connection`), under `/api`. */
export interface DshFetchRoute {
  path: string
  methods: ('GET' | 'HEAD' | 'POST')[]
  requestBody: 'buffered' | 'streaming'
  fetch(request: Request): Promise<Response>
}

/** The workspace registry of the web host (`dsh-workspace`). */
export interface DshWorkspaces {
  create(path: string, title?: string): Promise<{ id: string, path: string, title: string, setTitle(title: string): Promise<void> }>
  list(): { id: string, path: string, title: string, setTitle(title: string): Promise<void> }[]
  delete(id: string): Promise<boolean>
}

/** The context a row is applied with (a Cordis context). */
export interface DshContext {
  get(name: string): unknown
  provide(name: string, value: unknown): void
  on(event: string, listener: (...args: any[]) => unknown): () => void
  effect(effect: () => () => void): void
  logger?: (name: string) => DshLogger
  tools: DshTools
  systemPrompt: DshSystemPrompt
  skills: { register(skill: DshSkill): () => void }
  connection: { fetch: { register(route: DshFetchRoute): () => Promise<void> } }
  workspaceRegistry: DshWorkspaces
  presmium: PresmiumService
}
