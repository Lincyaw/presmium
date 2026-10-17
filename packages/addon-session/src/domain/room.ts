/**
 * The classroom record and its rules, as plain data. The classroom document
 * that holds it (one Yjs document per room) is in `../client/document.ts`.
 * Who is connected is not in the record but in the clients' awareness.
 */
import type { Participant, SessionStatus } from '@presmium/kernel'

/**
 * A place in the deck, as the hosts' navigation service gives it: section
 * (slide) number, step, view, and the place by ids (D-4, F-85): the full and
 * the student build number their sections and steps apart, so a learner of
 * one follows a presenter of the other by the section's id, the keys of the
 * steps reached in it (`trail`) and, for a section only some audiences have,
 * the section to go back to (`back`), which the hosts' navigation resolves in
 * the learner's own build.
 */
export interface Position {
  slide: number
  step: number
  view?: string
  section?: string
  trail?: string[]
  back?: string
}

/** A learner follows the presenter, or browses on their own. */
export type FollowMode = 'follow' | 'free'

export interface SessionRecord {
  status?: 'active' | 'ended'
  /** Participant id of the presenter. */
  presenter?: string
  presenterName?: string
  /** The presenter's position, as long as the classroom is active. */
  cursor?: Position
  startedAt?: number
  endedAt?: number
  /** Set by the classroom server when it archived the classroom (P-60): the file, relative to the deck directory. */
  archive?: string
  archivedAt?: number
}

/** A room the presenter has not started yet counts as active, so learners who come early stay in. */
export function sessionStatus(record: SessionRecord): Exclude<SessionStatus, 'idle'> {
  return record.status === 'ended' ? 'ended' : 'active'
}

/** The entries a presenter writes when starting a classroom. */
export function started(presenter: Participant, now: number): SessionRecord {
  return { status: 'active', presenter: presenter.id, presenterName: presenter.name, startedAt: now }
}

/** The entries written when the classroom ends. */
export function ended(now: number): SessionRecord {
  return { status: 'ended', endedAt: now }
}

export function samePosition(a: Position | undefined, b: Position | undefined): boolean {
  return a?.slide === b?.slide && a?.step === b?.step && a?.view === b?.view && a?.section === b?.section
    && a?.trail?.join('\n') === b?.trail?.join('\n') && a?.back === b?.back
}

/** A position as the record keeps it: no other fields, no empty view, section or section to go back to. */
export function cursorOf(position: Position): Position {
  const { slide, step, view, section, trail, back } = position
  return { slide, step, ...view ? { view } : {}, ...section ? { section } : {}, ...trail ? { trail: [...trail] } : {}, ...back ? { back } : {} }
}

/** Where a learner should be now: the presenter's position while following an active classroom. */
export function followTarget(me: Participant | undefined, follow: FollowMode, record: SessionRecord): Position | undefined {
  if (me?.role !== 'learner' || follow !== 'follow' || sessionStatus(record) !== 'active') return undefined
  return record.cursor
}

/** JSON copy of a value, e.g. of a reactive state, as the document stores it. */
export function plain<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

/** The entries of `next` that differ from what `current` gives for their key (undefined values left out). */
export function changedEntries(current: (key: string) => unknown, next: Readonly<Record<string, unknown>>): [string, unknown][] {
  return Object.entries(plain(next)).filter(([key, value]) => value !== undefined && JSON.stringify(current(key)) !== JSON.stringify(value))
}

function isParticipant(value: unknown): value is Participant {
  const p = value as Partial<Participant> | null | undefined
  return typeof p?.id === 'string' && typeof p.name === 'string' && (p.role === 'presenter' || p.role === 'learner')
}

/** The connected participants, from the awareness states of the room's clients: the presenter first, then by name. */
export function participantsOf(states: Iterable<unknown>): Participant[] {
  const byId = new Map<string, Participant>()
  for (const state of states) {
    const participant = (state as { participant?: unknown } | null)?.participant
    if (isParticipant(participant)) byId.set(participant.id, { id: participant.id, name: participant.name, role: participant.role })
  }
  return [...byId.values()].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'zh') : a.role === 'presenter' ? -1 : 1))
}
