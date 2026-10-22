import * as encoding from 'lib0/encoding'
import { WebSocket } from 'ws'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'

export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
export const ROOM = /^[\w.-]{1,128}$/

export class Room extends Y.Doc {
  readonly conns = new Map<WebSocket, Set<number>>()
  readonly writers = new Map<WebSocket, string>()
  readonly clientWriters = new Map<number, string>()
  readonly awareness?: awarenessProtocol.Awareness
  archived = false
  claim?: Buffer
  readonly participants = new Map<string, Buffer>()
  readonly personal: boolean

  constructor(name: string) {
    super({ gc: true })
    this.clientWriters.set(this.clientID, '')
    this.personal = name.includes('.')
    this.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      this.broadcast(encoding.toUint8Array(encoder))
    })
    if (this.personal) return
    const awareness = this.awareness = new awarenessProtocol.Awareness(this)
    awareness.setLocalState(null)
    awareness.on('update', ({ added, updated, removed }: Record<'added' | 'updated' | 'removed', number[]>, conn: WebSocket | null) => {
      const changed = [...added, ...updated, ...removed]
      const controlled = conn && this.conns.get(conn)
      if (controlled) {
        added.forEach(id => controlled.add(id))
        removed.forEach(id => controlled.delete(id))
        const writer = this.writers.get(conn)!
        for (const id of added) if (!this.clientWriters.has(id)) this.clientWriters.set(id, writer)
      }
      this.broadcast(awarenessMessage(awareness, changed))
    })
  }

  get session(): Y.Map<unknown> {
    return this.getMap('session')
  }

  get ended(): boolean {
    return this.session.get('status') === 'ended'
  }

  broadcast(message: Uint8Array): void {
    for (const conn of this.conns.keys()) send(conn, message)
  }

  content(): Record<string, unknown> {
    return Object.fromEntries([...this.share.keys()].map(key => [key, this.getMap(key).toJSON()]))
  }

  override destroy(): void {
    this.awareness?.destroy()
    super.destroy()
  }
}

export function awarenessMessage(awareness: awarenessProtocol.Awareness, clients: number[]): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients))
  return encoding.toUint8Array(encoder)
}

export function send(conn: WebSocket, message: Uint8Array): void {
  if (conn.readyState !== WebSocket.OPEN) return
  conn.send(message, error => error && conn.close())
}
