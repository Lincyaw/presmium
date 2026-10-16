/**
 * Members and their roles (docs/architecture.md 10.3): `members` of the
 * workspace configuration names owners and editors by email, or by a group
 * the login proxy passes (`group:<name>`); every other member who logged in
 * is a reader.
 */
import type { MemberRole } from '@presmium/kernel/contracts'

export interface MembersConfig {
  owners: string[]
  editors: string[]
}

/** The identity a login proxy passes. */
export interface ProxyIdentity {
  user?: string
  email?: string
  groups: string[]
}

function names(identity: ProxyIdentity, entry: string): boolean {
  const value = entry.trim().toLowerCase()
  if (value.startsWith('group:')) return identity.groups.some(group => group.toLowerCase() === value.slice(6))
  return [identity.email, identity.user].some(own => own?.toLowerCase() === value)
}

/** The roles of a member; an empty list is a reader. */
export function rolesOf(identity: ProxyIdentity, members: MembersConfig): MemberRole[] {
  if (members.owners.some(entry => names(identity, entry))) return ['owner']
  if (members.editors.some(entry => names(identity, entry))) return ['editor']
  return []
}

/** Whether a member with these roles may edit (editors and owners). */
export function mayEdit(roles: readonly MemberRole[] | undefined): boolean {
  return Boolean(roles?.some(role => role === 'editor' || role === 'owner'))
}
