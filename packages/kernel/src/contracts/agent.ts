import type { Member } from './server.ts'
import { defineService } from './service.ts'
import type { ServiceToken } from './service.ts'
import type { Locale } from './locale.ts'

export interface SourceRange { file: string, startLine: number, endLine: number }

/** @experimental */
export interface Focus {
  id: string
  from: 'source' | 'web' | 'slides'
  document: string
  scope?: 'document' | 'workspace'
  source: SourceRange
  excerpt: string
  section?: string
  block?: string
  step?: number
  quote?: string
}

/** @experimental */
export interface FocusReport {
  id: string
  from: Focus['from']
  scope?: Focus['scope']
  section?: string
  block?: string
  step?: number
  quote?: string
  source?: SourceRange
}

export interface AgentContext {
  document: string
  section?: string
  step?: number
  block?: string
  view?: string
  selection?: string
  source?: SourceRange
  focus?: Focus[]
}

export interface Citation {
  label: string
  section: string
  step?: number
  block?: string
}

export interface AskClient {
  provider(): string | undefined
  ask(question: string, context: AgentContext, signal?: AbortSignal): AsyncIterable<string>
}

export const ASK = defineService<AskClient>('presmium.ask')

export type AgentToolKind = 'read' | 'operate' | 'spend'

export interface AgentToolContext {
  document: string
  member: Member
  service<T>(token: ServiceToken<T>): T | undefined
  signal: AbortSignal
}

export interface AgentTool {
  name: string
  description: string
  input: Record<string, unknown>
  kind: AgentToolKind
  run(input: Record<string, unknown>, ctx: AgentToolContext): Promise<unknown>
  /** Text for the codes `run` throws as error messages, in the document's language; other messages pass on as they are. */
  errors?: Record<Locale, Record<string, string>>
}
