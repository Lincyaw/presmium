import type { ApprovalKind, Member, MemberRole } from './contracts.ts'

const RANK: Record<MemberRole, number> = { reader: 0, editor: 1, owner: 2 }

export const APPROVAL_KINDS: readonly ApprovalKind[] = ['operate', 'spend', 'write', 'agent']

/** The person who runs presmium dev, presmium serve or presmium-mcp on their own machine. */
export const LOCAL_AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }

/** Whether the member has the role or one above it (reader, editor, owner). */
export function hasRole(member: Member, role: MemberRole): boolean {
  return member.roles.some(own => RANK[own] >= RANK[role])
}

/** Whether a window that reports this view role shows the presentation: the presenter view or the audience's. */
export function isPresentingRole(role: string | undefined): boolean {
  return role === 'presenter' || role === 'audience'
}
