import type { ClassroomStore, SessionService, SessionSnapshot, Unsubscribe } from '@presmium/kernel'
import type { SessionMessages } from './messages.ts'
import type { FollowMode, Position } from './room.ts'

/** The `session` service's state, with what this plugin adds to the kernel's snapshot. */
export interface ClassroomSnapshot extends SessionSnapshot {
  /** Classroom server from the frontmatter; none: the session cannot connect. */
  server?: string
  /** `connecting` also while reconnecting after the connection dropped. */
  connection: 'offline' | 'connecting' | 'connected'
  follow: FollowMode
  /** The presenter's position, with the view. */
  presenterPosition?: Position
  /** Link and QR code content that joins this classroom. */
  joinUrl?: string
  /** A join link opened without a name: the room to join once the learner gives one. */
  invitation?: string
  /**
   * Outside a classroom: a classroom this browser created, which the window
   * can rejoin as its presenter (`ClassroomSession.rejoin`), e.g. after the
   * presenter's window was closed.
   */
  rejoin?: string
  /** Why the last attempt to create or join failed. */
  error?: string
  /**
   * The classroom server refused a write of this window, which then started
   * again from the classroom's document: that write is gone. Cleared by the
   * next write.
   */
  refused?: boolean
  /** The classroom was archived to this file (relative to the deck directory): it has ended and is offline. */
  archive?: string
}

/** The `session` service of this plugin: the kernel's `SessionService` plus following, with archiving and the participant's own store. */
export interface ClassroomSession extends SessionService {
  snapshot(): ClassroomSnapshot
  subscribe(listener: (snapshot: ClassroomSnapshot) => void): Unsubscribe
  /** A learner follows the presenter or browses alone; following goes to the presenter's position at once. */
  setFollow(mode: FollowMode): void
  /** Rejoins the classroom of the snapshot's `rejoin` as its presenter, with the key that created it. */
  rejoin(): Promise<void>
  archive(): Promise<string>
  /**
   * A document on the classroom server in a room named by a key that only
   * this participant's tab knows. Unlike the shared store, it stays writable
   * after the classroom has ended, until the classroom is archived, which
   * frees it: what must outlast the classroom needs a copy elsewhere.
   */
  readonly personal: ClassroomStore
}

export function isClassroomSession(service: SessionService | undefined): service is ClassroomSession {
  return typeof (service as Partial<ClassroomSession> | undefined)?.setFollow === 'function'
}

/** One line on the state of the classroom, for the session panel. */
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

/** A word or two for the toolbar button. */
export function shortStatus(s: ClassroomSnapshot, t: SessionMessages): string {
  if (!s.server) return t.short.noServer
  if (s.status === 'idle') return t.short.idle
  if (s.status === 'ended') return s.archive ? t.short.archived : t.short.ended
  if (s.connection !== 'connected') return t.short.connecting
  if (s.me?.role === 'presenter') return t.short.presenter
  return s.follow === 'follow' ? t.short.follow : t.short.free
}
