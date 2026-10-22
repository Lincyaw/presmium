import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import type { WebSocket } from 'ws'
import type * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { Room } from './room.ts'

const MAX_ENTRY = 16 << 10

export interface ClassroomWriter {
  presenter: boolean
  participant?: string
}

export function writerKey(writer: ClassroomWriter): string {
  return writer.presenter ? 'presenter' : `participant:${writer.participant ?? ''}`
}

export function structClients(update: Uint8Array): number[] {
  return [...Y.parseUpdateMeta(update).from.keys()]
}

const PARTICIPANT_FIRST = new Set(['store:questions'])

function isOwnKey(name: string, key: string, participant: string): boolean {
  return PARTICIPANT_FIRST.has(name) ? key.slice(0, key.indexOf(':')) === participant : key.slice(key.lastIndexOf(':') + 1) === participant
}

// Questions of earlier versions name their participant `author`.
function namesParticipant(value: unknown, participant: string): boolean {
  const entry = value as { participant?: unknown, author?: unknown } | null
  return typeof entry === 'object' && entry !== null && !(entry instanceof Y.AbstractType) && (entry.participant === participant || entry.author === participant)
}

function entryRefusal(name: string, key: string | null, before: unknown, value: unknown, participant: string | undefined): string | undefined {
  if (!participant) return 'a write from a connection that proved no participant'
  if (key === null || !name.startsWith('store:') || name === 'store:quizzes') return `a write to ${name}, which is the presenter's`
  if (!key.includes(':') || !isOwnKey(name, key, participant)) return `a write to ${name} under another participant's key`
  if (before !== undefined && !namesParticipant(before, participant)) return `a change to another participant's entry in ${name}`
  if (value === undefined) return undefined
  if (!namesParticipant(value, participant)) return `a value in ${name} that does not name its participant`
  return JSON.stringify(value).length > MAX_ENTRY ? `a value in ${name} over ${MAX_ENTRY} bytes` : undefined
}

function entryBefore(room: Y.Doc, name: string, key: string | null): unknown {
  if (key === null || !room.share.has(name)) return undefined
  try {
    return room.getMap(name).get(key)
  } catch {
    return undefined
  }
}

function pendingUpdates(doc: Y.Doc): [structs: Uint8Array, deletions: Uint8Array] {
  return [doc.store.pendingStructs?.update ?? new Uint8Array(), doc.store.pendingDs ?? new Uint8Array()]
}

export function updateRefusal(room: Room, update: Uint8Array, writer: ClassroomWriter): string | undefined {
  const own = writerKey(writer)
  if (structClients(update).some(client => (room.clientWriters.get(client) ?? own) !== own)) return 'an update in the name of another writer\'s client'
  const probe = new Y.Doc()
  Y.applyUpdate(probe, Y.encodeStateAsUpdate(room))
  const before = pendingUpdates(probe)
  const changes: [type: unknown, keys: Set<string | null>][] = []
  probe.on('afterTransaction', (transaction: Y.Transaction) => changes.push(...transaction.changed))
  Y.applyUpdate(probe, update)
  const after = pendingUpdates(probe)
  let refused = before.every((bytes, i) => Buffer.compare(bytes, after[i]!) === 0) ? undefined : 'an update that does not integrate into the room'
  for (const [type, keys] of changes) {
    const name = [...probe.share].find(([, shared]) => shared === type)?.[0]
    for (const key of keys) {
      refused ??= name === undefined ? 'a change inside a nested type' : entryRefusal(name, key, entryBefore(room, name, key), key === null ? undefined : probe.getMap(name).get(key), writer.participant)
    }
  }
  probe.destroy()
  return refused
}

export function hasChanges(update: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(update)
  return structs.length > 0 || ds.clients.size > 0
}

export function ownAwarenessUpdate(room: Room, awareness: awarenessProtocol.Awareness, conn: WebSocket, update: Uint8Array, writer: ClassroomWriter): { update: Uint8Array, dropped: number } {
  const decoder = decoding.createDecoder(update)
  const kept: [client: number, clock: number, state: string][] = []
  let dropped = 0
  const count = decoding.readVarUint(decoder)
  for (let i = 0; i < count; i++) {
    const entry: [number, number, string] = [decoding.readVarUint(decoder), decoding.readVarUint(decoder), decoding.readVarString(decoder)]
    const [client, clock, state] = entry
    const known = awareness.meta.get(client)?.clock ?? -1
    if (clock < known || (clock === known && !(state === 'null' && awareness.getStates().has(client)))) continue
    if (isOwnClient(room, conn, client, writer) && isOwnState(state, writer)) kept.push(entry)
    else dropped++
  }
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, kept.length)
  for (const [client, clock, state] of kept) {
    encoding.writeVarUint(encoder, client)
    encoding.writeVarUint(encoder, clock)
    encoding.writeVarString(encoder, state)
  }
  return { update: encoding.toUint8Array(encoder), dropped }
}

function isOwnClient(room: Room, conn: WebSocket, client: number, writer: ClassroomWriter): boolean {
  const own = writerKey(writer)
  return (room.clientWriters.get(client) ?? own) === own && ![...room.conns].some(([other, clients]) => other !== conn && clients.has(client))
}

function isOwnState(json: string, writer: ClassroomWriter): boolean {
  if (writer.presenter) return true
  try {
    const participant = (JSON.parse(json) as { participant?: { id?: unknown, role?: unknown } | null } | null)?.participant
    return participant == null || (writer.participant !== undefined && participant.id === writer.participant && participant.role === 'learner')
  } catch {
    return false
  }
}
