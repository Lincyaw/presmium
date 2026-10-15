/**
 * The classroom document: one Yjs document per room, shared through the
 * classroom server. It holds the classroom record (`session`), the
 * collections of the `classroomStore` service (`store:<name>`) and, in the
 * slides form, the presenter's synchronized Slidev state (`sync:<channel>`).
 * Who is connected is not in the document but in the clients' awareness.
 */
import type { Participant, SessionStatus } from '@presmium/kernel'
import type * as Y from 'yjs'

/** A place in the deck, as the hosts' navigation service gives it: section (slide) number, step, view. */
export interface Position {
  slide: number
  step: number
  view?: string
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
}

const SESSION = 'session'

/** The classroom record; observe it for changes. */
export function sessionMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(SESSION)
}

export function readSession(doc: Y.Doc): SessionRecord {
  return doc.getMap(SESSION).toJSON() as SessionRecord
}

/** A room the presenter has not started yet counts as active, so learners who come early stay in. */
export function sessionStatus(record: SessionRecord): Exclude<SessionStatus, 'idle'> {
  return record.status === 'ended' ? 'ended' : 'active'
}

export function startSession(doc: Y.Doc, presenter: Participant, now: number): void {
  const session = doc.getMap(SESSION)
  doc.transact(() => {
    session.set('status', 'active')
    session.set('presenter', presenter.id)
    session.set('presenterName', presenter.name)
    session.set('startedAt', now)
  })
}

export function endSession(doc: Y.Doc, now: number): void {
  const session = doc.getMap(SESSION)
  doc.transact(() => {
    session.set('status', 'ended')
    session.set('endedAt', now)
  })
}

export function samePosition(a: Position | undefined, b: Position | undefined): boolean {
  return a?.slide === b?.slide && a?.step === b?.step && a?.view === b?.view
}

/** Records the presenter's position when it changed. */
export function publishCursor(doc: Y.Doc, position: Position): void {
  const session = doc.getMap(SESSION)
  const cursor: Position = { slide: position.slide, step: position.step, ...position.view ? { view: position.view } : {} }
  if (!samePosition(session.get('cursor') as Position | undefined, cursor)) session.set('cursor', cursor)
}

/** Where a learner should be now: the presenter's position while following an active classroom. */
export function followTarget(me: Participant | undefined, follow: FollowMode, record: SessionRecord): Position | undefined {
  if (me?.role !== 'learner' || follow !== 'follow' || sessionStatus(record) !== 'active') return undefined
  return record.cursor
}

/** A collection of the `classroomStore` service. */
export function collection(doc: Y.Doc, name: string): Y.Map<unknown> {
  return doc.getMap(`store:${name}`)
}

/** The state of a synchronized channel of the slides form (Slidev's navigation, drawings, ...). */
export function channel(doc: Y.Doc, name: string): Y.Map<unknown> {
  return doc.getMap(`sync:${name}`)
}

/** JSON copy of a value, e.g. of a reactive state, as the document stores it. */
export function plain<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

/** Writes the entries of a channel state that changed, in one transaction. */
export function writeChannel(doc: Y.Doc, name: string, state: Readonly<Record<string, unknown>>): void {
  const map = channel(doc, name)
  const next = plain(state)
  doc.transact(() => {
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue
      if (JSON.stringify(map.get(key)) !== JSON.stringify(value)) map.set(key, value)
    }
  })
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
