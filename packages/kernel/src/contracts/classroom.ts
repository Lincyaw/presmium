import type { Unsubscribe } from './plugin.ts'
import { defineService } from './service.ts'
import type { Cursor } from './steps.ts'

export type ParticipantRole = 'presenter' | 'learner'

export interface Participant {
  id: string
  name: string
  role: ParticipantRole
}

export type SessionStatus = 'idle' | 'active' | 'ended'

export interface SessionSnapshot {
  sessionId?: string
  status: SessionStatus
  me?: Participant
  participants: Participant[]
  presenterCursor?: Cursor
}

export interface SessionService {
  snapshot(): SessionSnapshot
  subscribe(listener: (snapshot: SessionSnapshot) => void): Unsubscribe
  create(name: string): Promise<string>
  join(sessionId: string, name: string): Promise<void>
  end(): Promise<void>
  leave(): void
  archive?(): Promise<string>
  readonly personal?: ClassroomStore
}

export const SESSION = defineService<SessionService>('presmium.session')

export interface StoredItem<T> {
  id: string
  value: T
}

export interface ClassroomStore {
  list<T>(collection: string): StoredItem<T>[]
  get<T>(collection: string, id: string): T | undefined
  put<T>(collection: string, id: string, value: T): void
  remove(collection: string, id: string): void
  subscribe(collection: string, listener: () => void): Unsubscribe
}

export const CLASSROOM_STORE = defineService<ClassroomStore>('presmium.classroomStore')
