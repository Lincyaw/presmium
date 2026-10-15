/**
 * A classroom in the browser: the `session` and `classroomStore` services
 * over one Yjs document per room, synced with the classroom server by a
 * y-websocket provider. The presenter publishes the position of their window
 * (the hosts' `navigation` service); learners who follow are moved there. In
 * the slides form the presenter's Slidev state (navigation, drawings, ...)
 * also reaches the learners, as a `SyncTransport`. The document's layout is
 * in `./document.ts`.
 */
import type { Navigation, SyncTransport } from '@presmium/host'
import type { ClassroomStore, Participant, Role, Unsubscribe } from '@presmium/kernel'
import { watch } from 'vue'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { followTarget, joinRequest, joinUrl, participantsOf, plain, roomId, samePosition, sessionStatus } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot, FollowMode, Position } from '../domain/index.ts'
import { channel, collection, endSession, publishCursor, readSession, sessionMap, startSession, writeChannel } from './document.ts'

export interface ClassroomOptions {
  /** WebSocket URL of the classroom server; none: creating and joining fail. */
  server?: string
  /** This window's position; without it nobody follows. */
  navigation?: Navigation
  /** The deck's base URL, for join links. */
  base: string
  /** Remembers this tab's classroom across reloads (`sessionStorage`). */
  storage?: Storage
  /** How long creating or joining waits for the server. Default 10 s. */
  timeoutMs?: number
}

export interface Classroom {
  session: ClassroomSession
  store: ClassroomStore
  /** Joins the host's synchronized state to the classroom (the `syncTransports` service). */
  transport: SyncTransport
  /** Joins the classroom of a join link (`?room=&name=`), or the one this tab was in before a reload. */
  resume(search: string): Promise<void>
  dispose(): void
}

interface Membership {
  server: string
  room: string
  me: Participant
}

/** A synchronized channel of the slides form. */
interface Link {
  receive(patch: Record<string, unknown>): void
  /** The latest local state, written to the room when the presenter starts it. */
  state: Readonly<Record<string, unknown>>
}

const STORAGE_KEY = 'presmium.session'

function randomId(bytes: number): string {
  return roomId(crypto.getRandomValues(new Uint8Array(bytes)))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createClassroom(options: ClassroomOptions): Classroom {
  const { server, navigation } = options
  let doc = new Y.Doc()
  let provider: WebsocketProvider | undefined
  let membership: Membership | undefined
  let connection: ClassroomSnapshot['connection'] = 'offline'
  let follow: FollowMode = 'follow'
  let invitation: string | undefined
  let error: string | undefined
  /** The presenter position this window last went to. */
  let followed: Position | undefined

  const listeners = new Set<(snapshot: ClassroomSnapshot) => void>()
  const storeListeners = new Map<string, Set<() => void>>()
  const links = new Map<string, Link>()
  /** Observers on the current document, removed when it is replaced. */
  let detach: (() => void)[] = []

  function snapshot(): ClassroomSnapshot {
    const record = readSession(doc)
    return {
      server,
      connection,
      follow,
      invitation,
      error,
      sessionId: membership?.room,
      status: membership ? sessionStatus(record) : 'idle',
      me: membership?.me,
      participants: provider ? participantsOf(provider.awareness.getStates().values()) : [],
      presenterCursor: record.cursor && { slide: record.cursor.slide, step: record.cursor.step },
      presenterPosition: record.cursor,
      joinUrl: membership && joinUrl(options.base, membership.room),
    }
  }

  function notify(): void {
    const next = snapshot()
    listeners.forEach(listener => listener(next))
  }

  const role = (): Role | undefined => membership?.me.role
  const active = () => membership !== undefined && sessionStatus(readSession(doc)) === 'active'
  const following = () => role() === 'learner' && follow === 'follow' && active()

  /** Moves a following learner to the presenter's position when it changed (or always, when `force`). */
  function followPresenter(force = false): void {
    const target = followTarget(membership?.me, follow, readSession(doc))
    if (!target || !navigation || (!force && samePosition(target, followed))) return
    followed = target
    navigation.go(target)
  }

  /** The presenter's position goes to the room. */
  function publish(): void {
    if (navigation && role() === 'presenter' && active()) publishCursor(doc, navigation.position.value)
  }

  function observe(map: Y.Map<unknown>, handler: (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => void): () => void {
    map.observe(handler)
    return () => map.unobserve(handler)
  }

  function attachChannel(name: string, link: Link): void {
    const map = channel(doc, name)
    detach.push(observe(map, (event, transaction) => {
      if (transaction.local || !following()) return
      link.receive(Object.fromEntries([...event.keysChanged].map(key => [key, plain(map.get(key))])))
    }))
  }

  /** A learner who starts or resumes following gets the presenter's state of every channel. */
  function deliverChannels(): void {
    if (!following()) return
    for (const [name, link] of links) {
      const state = channel(doc, name).toJSON()
      if (Object.keys(state).length > 0) link.receive(state)
    }
  }

  function attachCollection(name: string): void {
    detach.push(observe(collection(doc, name), () => storeListeners.get(name)?.forEach(listener => listener())))
  }

  /** Makes `next` the classroom document: observers move to it, store subscribers see its content. */
  function bind(next: Y.Doc): void {
    detach.forEach(stop => stop())
    detach = []
    doc = next
    detach.push(observe(sessionMap(doc), () => {
      notify()
      followPresenter()
    }))
    for (const name of storeListeners.keys()) attachCollection(name)
    for (const [name, link] of links) attachChannel(name, link)
    storeListeners.forEach(set => set.forEach(listener => listener()))
  }

  function disconnect(): void {
    provider?.destroy()
    provider = undefined
    membership = undefined
    connection = 'offline'
    followed = undefined
    bind(new Y.Doc())
  }

  function remember(value: Membership | undefined): void {
    try {
      if (value) options.storage?.setItem(STORAGE_KEY, JSON.stringify(value))
      else options.storage?.removeItem(STORAGE_KEY)
    } catch {}
  }

  function remembered(): Membership | undefined {
    try {
      const value = JSON.parse(options.storage?.getItem(STORAGE_KEY) ?? 'null') as Membership | null
      return value && value.server === server && value.room && value.me?.id ? value : undefined
    } catch {
      return undefined
    }
  }

  /** Waits until the provider has synced with the server, at most `timeoutMs`. */
  function synced(connecting: WebsocketProvider): Promise<void> {
    if (connecting.synced) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const done = (isSynced: boolean) => {
        if (!isSynced) return
        clearTimeout(timer)
        connecting.off('sync', done)
        resolve()
      }
      const timer = setTimeout(() => {
        connecting.off('sync', done)
        reject(new Error(`无法连接课堂服务 ${server}`))
      }, options.timeoutMs ?? 10_000)
      connecting.on('sync', done)
    })
  }

  /** Connects to a room as `me`; `start` makes it a new classroom with `me` as presenter. */
  async function enter(room: string, me: Participant, start = false): Promise<void> {
    if (!server) throw new Error('文稿没有配置课堂服务')
    disconnect()
    const next = new Y.Doc()
    const connecting = new WebsocketProvider(server, room, next)
    provider = connecting
    membership = { server, room, me }
    connection = 'connecting'
    follow = 'follow'
    error = undefined
    invitation = undefined
    bind(next)
    connecting.awareness.setLocalStateField('participant', me)
    connecting.awareness.on('change', () => provider === connecting && notify())
    connecting.on('status', ({ status }: { status: string }) => {
      if (provider !== connecting) return
      connection = status === 'connected' && connecting.synced ? 'connected' : 'connecting'
      notify()
    })
    connecting.on('sync', (isSynced: boolean) => {
      if (provider !== connecting) return
      connection = isSynced ? 'connected' : 'connecting'
      notify()
    })
    notify()
    try {
      await synced(connecting)
    } catch (failure) {
      disconnect()
      error = message(failure)
      // A learner can try again from the join form.
      if (me.role === 'learner') invitation = room
      notify()
      throw failure
    }
    if (start) startSession(doc, me, Date.now())
    remember(membership)
    if (me.role === 'presenter') {
      publish()
      // State the presenter's windows had before the classroom started.
      for (const [name, link] of links) writeChannel(doc, name, link.state)
    } else {
      followPresenter(true)
      deliverChannels()
    }
    notify()
  }

  const session: ClassroomSession = {
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async create(name) {
      const room = randomId(8)
      await enter(room, { id: randomId(16), name: name.trim() || '主讲', role: 'presenter' }, true)
      return room
    },
    async join(room, name) {
      await enter(room, { id: randomId(16), name: name.trim() || '学习者', role: 'learner' })
    },
    async end() {
      if (role() !== 'presenter') throw new Error('只有主讲可以结束课堂')
      endSession(doc, Date.now())
    },
    leave() {
      disconnect()
      remember(undefined)
      notify()
    },
    setFollow(mode) {
      follow = mode
      if (mode === 'follow') {
        followPresenter(true)
        deliverChannels()
      }
      notify()
    },
  }

  const store: ClassroomStore = {
    list: <T>(name: string) => [...collection(doc, name).entries()].map(([id, value]) => ({ id, value: value as T })),
    get: <T>(name: string, id: string) => collection(doc, name).get(id) as T | undefined,
    put(name, id, value) {
      collection(doc, name).set(id, plain(value))
    },
    remove(name, id) {
      collection(doc, name).delete(id)
    },
    subscribe(name, listener) {
      let set = storeListeners.get(name)
      if (!set) {
        storeListeners.set(name, set = new Set())
        attachCollection(name)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
  }

  const transport: SyncTransport = {
    connect(name, receive, state) {
      const link: Link = { receive, state }
      links.set(name, link)
      attachChannel(name, link)
      return (next, fromRemote) => {
        link.state = next
        // Learners only receive; what another window sent is not the presenter's own change.
        if (!fromRemote && role() === 'presenter' && active()) writeChannel(doc, name, next)
      }
    },
  }

  const stopPublishing: Unsubscribe = navigation ? watch(navigation.position, publish) : () => {}

  return {
    session,
    store,
    transport,
    async resume(search) {
      const request = joinRequest(search)
      const before = remembered()
      try {
        // A reload of the page keeps this tab's place in its classroom.
        if (before && (!request || (request.room === before.room && (!request.name || request.name === before.me.name)))) {
          await enter(before.room, before.me)
        } else if (request?.name) {
          await session.join(request.room, request.name)
        } else if (request) {
          invitation = request.room
          notify()
        }
      } catch {
        // Reported in the snapshot.
      }
    },
    dispose() {
      stopPublishing()
      disconnect()
      listeners.clear()
    },
  }
}
