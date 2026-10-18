import type { MemberRole } from '@presmium/kernel/contracts'

export function mayEdit(roles: readonly MemberRole[] | undefined): boolean {
  return Boolean(roles?.some(role => role === 'editor' || role === 'owner'))
}
