import type { Participant } from '@lincyaw/kernel'
import type { FollowMode } from '../domain/index.ts'

export interface Membership {
  server: string
  room: string
  me: Participant
  key: string
  claim?: string
  follow?: FollowMode
  at?: number
}

export function tryStorage<T>(access: () => T): T | undefined {
  try {
    return access()
  } catch {
    return undefined
  }
}

export interface MembershipStorageOptions {
  /** The key prefix: one per deck. */
  prefix: string
  /** Where memberships are kept for every tab (localStorage). */
  storage?: Storage
  /** Where this tab keeps the room it is in (sessionStorage). */
  tabStorage?: Storage
  /** The classroom server memberships are kept for; others are not found. */
  server: () => string | undefined
}

export interface MembershipStorage {
  isUsable(value: Membership | null | undefined): value is Membership
  find(room: string): Membership | undefined
  /** The room this tab was last in. */
  findInTab(): Membership | undefined
  /** The presenter's membership this browser joined last, of `room` when given. */
  lastPresenterMembership(room?: string): Membership | undefined
  remember(membership: Membership): void
  forget(room: string): void
}

export function createMembershipStorage(options: MembershipStorageOptions): MembershipStorage {
  const { prefix, storage, tabStorage } = options
  const isUsable = (value: Membership | null | undefined): value is Membership =>
    Boolean(value && value.server === options.server() && value.room && value.me?.id && value.key)
  const find = (room: string) => tryStorage(() => {
    const value = JSON.parse(storage?.getItem(`${prefix}:${room}`) ?? 'null') as Membership | null
    return isUsable(value) ? value : undefined
  })
  return {
    isUsable,
    find,
    findInTab() {
      const room = tryStorage(() => tabStorage?.getItem(prefix))
      return room ? find(room) : undefined
    },
    lastPresenterMembership(room) {
      const keys = tryStorage(() => Array.from({ length: storage?.length ?? 0 }, (_, i) => storage!.key(i) ?? '')) ?? []
      const rooms = room ? [room] : keys.filter(key => key.startsWith(`${prefix}:`)).map(key => key.slice(prefix.length + 1))
      return rooms.map(find)
        .filter((value): value is Membership => value?.me.role === 'presenter' && value.claim !== undefined)
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0]
    },
    remember(membership) {
      tryStorage(() => storage?.setItem(`${prefix}:${membership.room}`, JSON.stringify(membership)))
      tryStorage(() => tabStorage?.setItem(prefix, membership.room))
    },
    forget(room) {
      tryStorage(() => storage?.removeItem(`${prefix}:${room}`))
      if (tryStorage(() => tabStorage?.getItem(prefix)) === room) tryStorage(() => tabStorage?.removeItem(prefix))
    },
  }
}
