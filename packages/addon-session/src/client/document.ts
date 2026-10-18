import type { Participant } from '@presmium/kernel'
import type * as Y from 'yjs'
import { changedEntries, cursorOf, ended, samePosition, started } from '../domain/index.ts'
import type { Position, SessionRecord } from '../domain/index.ts'

const SESSION = 'session'

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

export function publishCursor(doc: Y.Doc, position: Position): void {
  const session = sessionMap(doc)
  const cursor = cursorOf(position)
  if (!samePosition(session.get('cursor') as Position | undefined, cursor)) session.set('cursor', cursor)
}

export function collection(doc: Y.Doc, name: string): Y.Map<unknown> {
  return doc.getMap(`store:${name}`)
}

export function channel(doc: Y.Doc, name: string): Y.Map<unknown> {
  return doc.getMap(`sync:${name}`)
}

export function writeChannel(doc: Y.Doc, name: string, state: Readonly<Record<string, unknown>>): void {
  const map = channel(doc, name)
  write(doc, map, changedEntries(key => map.get(key), state))
}
