/**
 * The classroom document: one Yjs document per room, shared through the
 * classroom server. It holds the classroom record (`session`, see
 * `../domain/room.ts`), the collections of the `classroomStore` service
 * (`store:<name>`) and the presenter's synchronized host state
 * (`sync:<channel>`).
 */
import type { Participant } from '@presmium/kernel'
import type * as Y from 'yjs'
import { changedEntries, cursorOf, ended, samePosition, started } from '../domain/index.ts'
import type { Position, SessionRecord } from '../domain/index.ts'

const SESSION = 'session'

/** The classroom record; observe it for changes. */
export function sessionMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(SESSION)
}

export function readSession(doc: Y.Doc): SessionRecord {
  return sessionMap(doc).toJSON() as SessionRecord
}

function write(doc: Y.Doc, map: Y.Map<unknown>, entries: Iterable<[string, unknown]>): void {
  doc.transact(() => {
    for (const [key, value] of entries) map.set(key, value)
  })
}

export function startSession(doc: Y.Doc, presenter: Participant, now: number): void {
  write(doc, sessionMap(doc), Object.entries(started(presenter, now)))
}

export function endSession(doc: Y.Doc, now: number): void {
  write(doc, sessionMap(doc), Object.entries(ended(now)))
}

/** Records the presenter's position when it changed. */
export function publishCursor(doc: Y.Doc, position: Position): void {
  const session = sessionMap(doc)
  const cursor = cursorOf(position)
  if (!samePosition(session.get('cursor') as Position | undefined, cursor)) session.set('cursor', cursor)
}

/** A collection of the `classroomStore` service. */
export function collection(doc: Y.Doc, name: string): Y.Map<unknown> {
  return doc.getMap(`store:${name}`)
}

/** The state of a synchronized channel of the host (Slidev's navigation, drawings, ...). */
export function channel(doc: Y.Doc, name: string): Y.Map<unknown> {
  return doc.getMap(`sync:${name}`)
}

/** Writes the entries of a channel state that changed, in one transaction. */
export function writeChannel(doc: Y.Doc, name: string, state: Readonly<Record<string, unknown>>): void {
  const map = channel(doc, name)
  write(doc, map, changedEntries(key => map.get(key), state))
}
