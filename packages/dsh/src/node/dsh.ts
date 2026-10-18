import type { PresmiumService } from './service.ts'

export interface DshLogger {
  info(format: string, ...args: unknown[]): void
  warn(format: string, ...args: unknown[]): void
  debug(format: string, ...args: unknown[]): void
}

export interface DshSession {
  readonly id: string
  readonly header?: { cwd?: string }
}

export interface DshAgent {
  readonly session: DshSession
  readonly ctx: DshContext
  whenIdle(): Promise<void>
}

export interface DshToolExecution {
  readonly callId: string
  readonly name: string
  readonly arguments: unknown
  readonly agent?: DshAgent
  readonly signal: AbortSignal
}

export type DshPreDecision =
  | { kind: 'allow' }
  | { kind: 'deny', reason: string }
  | { kind: 'ask', reason?: string, displayReason?: { en: string, [locale: string]: string } }

export interface DshToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: { schema: Record<string, unknown>, render(args: unknown, value: unknown): { type: 'text', text: string }[] }
  execute(args: unknown, exec: DshToolExecution): Promise<unknown>
}

export interface DshTools {
  register(definition: DshToolDefinition): () => void
  guard(guard: (exec: Readonly<DshToolExecution>) => string | undefined): () => void
}

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

export interface DshSkill {
  name: string
  description: string
  content: string
  path: string
  source: 'bundled'
  resourceBase: { kind: 'directory', path: string }
}

export interface DshFetchRoute {
  path: string
  methods: ('GET' | 'HEAD' | 'POST')[]
  requestBody: 'buffered' | 'streaming'
  fetch(request: Request): Promise<Response>
}

export interface DshWorkspaces {
  create(path: string, title?: string): Promise<{ id: string, path: string, title: string, setTitle(title: string): Promise<void> }>
  list(): { id: string, path: string, title: string, setTitle(title: string): Promise<void> }[]
  delete(id: string): Promise<boolean>
}

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
