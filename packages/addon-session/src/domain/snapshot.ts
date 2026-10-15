import type { ClassroomStore, SessionService, SessionSnapshot, Unsubscribe } from '@presmium/kernel'
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
  /** Why the last attempt to create or join failed. */
  error?: string
  /** The classroom was archived to this file (relative to the deck directory): it has ended and is offline. */
  archive?: string
}

/** The `session` service of this plugin: the kernel's `SessionService` plus following, with archiving and the participant's own store. */
export interface ClassroomSession extends SessionService {
  snapshot(): ClassroomSnapshot
  subscribe(listener: (snapshot: ClassroomSnapshot) => void): Unsubscribe
  /** A learner follows the presenter or browses alone; following goes to the presenter's position at once. */
  setFollow(mode: FollowMode): void
  archive(): Promise<string>
  /**
   * A document on the classroom server in a room named by a key that only
   * this participant's tabs know. Unlike the shared store, it stays writable
   * after the classroom has ended, until the classroom is archived.
   */
  readonly personal: ClassroomStore
}

export function isClassroomSession(service: SessionService | undefined): service is ClassroomSession {
  return typeof (service as Partial<ClassroomSession> | undefined)?.setFollow === 'function'
}

/** One line on the state of the classroom, for the session panel. */
export function statusText(s: ClassroomSnapshot): string {
  if (!s.server) return '未连接：文稿没有配置课堂服务'
  if (s.status === 'idle') {
    if (s.error) return `未连接：${s.error}`
    return s.invitation ? `未连接：受邀加入课堂 ${s.invitation}` : '未连接：尚未加入课堂'
  }
  if (s.status === 'ended') return s.archive ? `课堂已结束并归档到 ${s.archive}` : '课堂已结束'
  if (s.connection !== 'connected') return '正在连接课堂服务…'
  if (s.me?.role === 'presenter') return '课堂进行中，你是主讲'
  return s.follow === 'follow' ? '课堂进行中，正在跟随主讲' : '课堂进行中，自主浏览'
}

/** A word or two for the toolbar button. */
export function shortStatus(s: ClassroomSnapshot): string {
  if (!s.server) return '未连接'
  if (s.status === 'idle') return '未加入'
  if (s.status === 'ended') return s.archive ? '已归档' : '已结束'
  if (s.connection !== 'connected') return '连接中'
  if (s.me?.role === 'presenter') return '主讲'
  return s.follow === 'follow' ? '跟随' : '自主'
}
