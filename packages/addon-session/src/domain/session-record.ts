import type { Participant, SessionStatus } from '@lincyaw/kernel'

export interface Position {
  slide: number
  step: number
  view?: string
  section?: string
  trail?: string[]
  back?: string
}

export type FollowMode = 'follow' | 'free'

export interface SessionRecord {
  status?: 'active' | 'ended'
  presenter?: string
  presenterName?: string
  cursor?: Position
  startedAt?: number
  endedAt?: number
  archive?: string
  archivedAt?: number
}

export function sessionStatus(record: SessionRecord): Exclude<SessionStatus, 'idle'> {
  return record.status === 'ended' ? 'ended' : 'active'
}

export function startRecord(presenter: Participant, now: number): SessionRecord {
  return { status: 'active', presenter: presenter.id, presenterName: presenter.name, startedAt: now }
}

export function endRecord(now: number): SessionRecord {
  return { status: 'ended', endedAt: now }
}

export function samePosition(a: Position | undefined, b: Position | undefined): boolean {
  return a?.slide === b?.slide && a?.step === b?.step && a?.view === b?.view && a?.section === b?.section
    && a?.trail?.join('\n') === b?.trail?.join('\n') && a?.back === b?.back
}

export function clonePosition(position: Position): Position {
  const { slide, step, view, section, trail, back } = position
  return { slide, step, ...view ? { view } : {}, ...section ? { section } : {}, ...trail ? { trail: [...trail] } : {}, ...back ? { back } : {} }
}

export function followTarget(me: Participant | undefined, follow: FollowMode, record: SessionRecord): Position | undefined {
  if (me?.role !== 'learner' || follow !== 'follow' || sessionStatus(record) !== 'active') return undefined
  return record.cursor
}

export function jsonClone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

export function changedEntries(current: (key: string) => unknown, next: Readonly<Record<string, unknown>>): [string, unknown][] {
  return Object.entries(jsonClone(next)).filter(([key, value]) => value !== undefined && JSON.stringify(current(key)) !== JSON.stringify(value))
}

function isParticipant(value: unknown): value is Participant {
  const p = value as Partial<Participant> | null | undefined
  return typeof p?.id === 'string' && typeof p.name === 'string' && (p.role === 'presenter' || p.role === 'learner')
}

export function participantsOf(states: Iterable<unknown>): Participant[] {
  const byId = new Map<string, Participant>()
  for (const state of states) {
    const participant = (state as { participant?: unknown } | null)?.participant
    if (isParticipant(participant)) byId.set(participant.id, { id: participant.id, name: participant.name, role: participant.role })
  }
  return [...byId.values()].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'zh') : a.role === 'presenter' ? -1 : 1))
}
