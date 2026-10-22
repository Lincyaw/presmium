export type LockKind = 'agent' | 'revert' | 'operation'

export function lockKind(holder: string): LockKind {
  return holder.startsWith('agent:') ? 'agent' : holder.endsWith(':revert') ? 'revert' : 'operation'
}
