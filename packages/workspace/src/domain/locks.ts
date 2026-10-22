export const WORKSPACE_ID = 'presmium.workspace'

export type LockKind = 'agent' | 'revert' | 'operation'
export function lockKind(holder: string): LockKind {
  return holder.startsWith('agent:') ? 'agent' : holder.endsWith(':revert') ? 'revert' : 'operation'
}

export const WORKSPACE_FILE = 'presmium.workspace.yaml'
