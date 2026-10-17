/**
 * A member's roles (docs/architecture.md 10.3): the one member of `presmium
 * serve` is the local author, an owner.
 */
import type { MemberRole } from '@presmium/kernel/contracts'

/** Whether a member with these roles may edit (editors and owners). */
export function mayEdit(roles: readonly MemberRole[] | undefined): boolean {
  return Boolean(roles?.some(role => role === 'editor' || role === 'owner'))
}
