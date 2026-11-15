import type { Member } from './server.ts'

export type AgentActivityOperation = 'read' | 'edit' | 'navigate' | 'preview' | 'build' | 'voice' | 'workspace'
export interface AgentActivityTarget { section?: string, block?: string, step?: string }
/** Ephemeral UI presence. Never contains tool arguments, document text, credentials or failure details. */
export interface AgentActivity {
  id: string
  operation: AgentActivityOperation
  document?: string
  targets: AgentActivityTarget[]
  state: 'running' | 'done' | 'failed' | 'cancelled'
  startedAt: number
  finishedAt?: number
}
export interface AgentActivitySnapshot { activities: AgentActivity[] }
export interface AgentActivityObserver {
  begin(input: Pick<AgentActivity, 'operation' | 'document' | 'targets'>, member: Member): (state: Exclude<AgentActivity['state'], 'running'>) => void
}
