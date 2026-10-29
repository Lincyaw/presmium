export type CloudRole = 'reader' | 'editor' | 'owner'
export type CloudCapability = 'read' | 'write' | 'execute' | 'spend' | 'manage'
export interface Plan {
  id: string
  collaborators: number
  storageBytes: number
  monthlyAllowanceMinor: number
  historyDays: number | null
  concurrentEnvironments: number
}

/** These are service entitlements, not public retail prices; the operator binds real payment prices. */
export const PLANS: Record<string, Plan> = {
  free: { id: 'free', collaborators: 2, storageBytes: 2 * 1024 ** 3, monthlyAllowanceMinor: 100, historyDays: 7, concurrentEnvironments: 1 },
  pro: { id: 'pro', collaborators: 10, storageBytes: 20 * 1024 ** 3, monthlyAllowanceMinor: 1000, historyDays: null, concurrentEnvironments: 2 },
  team: { id: 'team', collaborators: 50, storageBytes: 100 * 1024 ** 3, monthlyAllowanceMinor: 5000, historyDays: null, concurrentEnvironments: 5 },
}

export function planOf(id: string): Plan { return PLANS[id] ?? PLANS.free! }

export interface Membership {
  spaceId: string
  userId: string
  role: CloudRole
  canExecute: boolean
  canSpend: boolean
  billingAccountId: string
  plan: string
}

export function allows(member: Membership, capability: CloudCapability): boolean {
  if (member.role === 'owner') return true
  if (capability === 'read') return true
  if (capability === 'write') return member.role === 'editor'
  if (capability === 'execute') return member.role === 'editor' && member.canExecute
  if (capability === 'spend') return member.role === 'editor' && member.canSpend
  return false
}
