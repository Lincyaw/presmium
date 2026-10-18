import type { ClassroomStore, SessionService, SessionSnapshot, Unsubscribe } from '@presmium/kernel'
import type { SessionMessages } from './messages.ts'
import type { FollowMode, Position } from './room.ts'

export interface ClassroomSnapshot extends SessionSnapshot {
  server?: string
  connection: 'offline' | 'connecting' | 'connected'
  follow: FollowMode
  presenterPosition?: Position
  joinUrl?: string
  invitation?: string
  rejoin?: string
  error?: string
  refused?: boolean
  archive?: string
}

export interface ClassroomSession extends SessionService {
  snapshot(): ClassroomSnapshot
  subscribe(listener: (snapshot: ClassroomSnapshot) => void): Unsubscribe
  setFollow(mode: FollowMode): void
  rejoin(): Promise<void>
  archive(): Promise<string>
  readonly personal: ClassroomStore
}

export function isClassroomSession(service: SessionService | undefined): service is ClassroomSession {
  return typeof (service as Partial<ClassroomSession> | undefined)?.setFollow === 'function'
}

export function statusText(s: ClassroomSnapshot, t: SessionMessages): string {
  if (!s.server) return t.status.noServer
  if (s.status === 'idle') {
    if (s.error) return t.status.failed(s.error)
    return s.invitation ? t.status.invited(s.invitation) : t.status.idle
  }
  if (s.status === 'ended') return s.archive ? t.status.archived(s.archive) : t.status.ended
  if (s.connection !== 'connected') return t.status.connecting
  if (s.me?.role === 'presenter') return t.status.presenting
  return s.follow === 'follow' ? t.status.following : t.status.browsing
}

export function shortStatus(s: ClassroomSnapshot, t: SessionMessages): string {
  if (!s.server) return t.short.noServer
  if (s.status === 'idle') return t.short.idle
  if (s.status === 'ended') return s.archive ? t.short.archived : t.short.ended
  if (s.connection !== 'connected') return t.short.connecting
  if (s.me?.role === 'presenter') return t.short.presenter
  return s.follow === 'follow' ? t.short.follow : t.short.free
}
