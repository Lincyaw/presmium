/**
 * A classroom in the browser: the `session` and `classroomStore` services
 * over one Yjs document per room, synced with the classroom server by a
 * y-websocket provider. The presenter publishes the position of their window
 * (the hosts' `navigation` service); learners who follow are moved there. In
 * the slides form the presenter's Slidev state (navigation, drawings, ...)
 * also reaches the learners, as a `SyncTransport`. Each participant also has
 * a document of their own (`personal`), in a room named by a key only their
 * tab knows; archiving the classroom frees it. The presenter's window claims
 * the room with a key of its own, which archiving the classroom takes; the
 * classroom server takes the presenter's writes only with that key, and a
 * learner's only under the learner's id, proved by the learner's key. The
 * document's layout is in `./document.ts`.
 *
 * Other tabs of the deck in the presenter's browser, such as a projector
 * window opened by URL, show the classroom as the presenter's windows: a tab
 * in no classroom asks the deck's other tabs (a BroadcastChannel), and an
 * open presenter window answers with its membership. Such a mirror shows
 * what the presenter sees but does not move the learners: only the window
 * that created or rejoined the classroom publishes its position.
 */
import type { Navigation, SyncTransport } from '@presmium/host'
import type { ClassroomStore, Participant, Role, Unsubscribe } from '@presmium/kernel'
import { watch } from 'vue'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { archiveUrl, followTarget, joinRequest, joinUrl, participantsOf, plain, roomId, samePosition, sessionStatus } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot, FollowMode, Position } from '../domain/index.ts'
import { channel, collection, endSession, publishCursor, readSession, sessionMap, startSession, writeChannel } from './document.ts'
import { messages } from './locale.ts'

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
  /** Names the participant's own room, `<room>.<key>`; never shared. */
  key: string
  /** The presenter's key to the room, which the classroom server asks for to archive it. */
  claim?: string
}

/** A synchronized channel of the slides form. */
interface Link {
  receive(patch: Record<string, unknown>): void
  /** The latest local state, written to the room when the presenter starts it. */
  state: Readonly<Record<string, unknown>>
}

const STORAGE_KEY = 'presmium.session'

/** What the deck's tabs in one browser tell each other about the presenter's classroom. */
type TabMessage =
  /** A tab in no classroom asks whether a presenter window is open. */
  | { type: 'who' }
  /** A presenter window answers, or has started or rejoined a classroom. */
  | { type: 'presenter', membership: Membership }
  /** A presenter window has left its classroom. */
  | { type: 'left', room: string }

/** The classroom server closes the connections of an archived classroom with this code. */
const ARCHIVED_CLOSE_CODE = 4410

function randomId(bytes: number): string {
  return roomId(crypto.getRandomValues(new Uint8Array(bytes)))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function observe(map: Y.Map<unknown>, handler: (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => void): () => void {
  map.observe(handler)
  return () => map.unobserve(handler)
}

/**
 * A `classroomStore` over the document that `doc` returns; `rebind` moves its
 * subscribers to a new document. `checkWrite` throws when writing is refused.
 */
function documentStore(doc: () => Y.Doc, checkWrite: () => void): { store: ClassroomStore, rebind(): void } {
  const listeners = new Map<string, Set<() => void>>()
  let detach: (() => void)[] = []
  const attach = (name: string) => detach.push(observe(collection(doc(), name), () => listeners.get(name)?.forEach(listener => listener())))
  return {
    store: {
      list: <T>(name: string) => [...collection(doc(), name).entries()].map(([id, value]) => ({ id, value: value as T })),
      get: <T>(name: string, id: string) => collection(doc(), name).get(id) as T | undefined,
      put(name, id, value) {
        checkWrite()
        collection(doc(), name).set(id, plain(value))
      },
      remove(name, id) {
        checkWrite()
        collection(doc(), name).delete(id)
      },
      subscribe(name, listener) {
        let set = listeners.get(name)
        if (!set) {
          listeners.set(name, set = new Set())
          attach(name)
        }
        set.add(listener)
        return () => {
          set.delete(listener)
        }
      },
    },
    rebind() {
      detach.forEach(stop => stop())
      detach = []
      for (const name of listeners.keys()) attach(name)
      listeners.forEach(set => set.forEach(listener => listener()))
    },
  }
}

export function createClassroom(options: ClassroomOptions): Classroom {
  const { server, navigation } = options
  let doc = new Y.Doc()
  let personalDoc = new Y.Doc()
  let provider: WebsocketProvider | undefined
  let personalProvider: WebsocketProvider | undefined
  let membership: Membership | undefined
  /** This tab shows the classroom of the presenter's window in this browser and publishes nothing. */
  let mirror = false
  let connection: ClassroomSnapshot['connection'] = 'offline'
  let follow: FollowMode = 'follow'
  let invitation: string | undefined
  let error: string | undefined
  /** The presenter position this window last went to. */
  let followed: Position | undefined

  const listeners = new Set<(snapshot: ClassroomSnapshot) => void>()
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
      archive: membership ? record.archive : undefined,
    }
  }

  function notify(): void {
    const next = snapshot()
    listeners.forEach(listener => listener(next))
  }

  const role = (): Role | undefined => membership?.me.role
  const active = () => membership !== undefined && sessionStatus(readSession(doc)) === 'active'
  const following = () => role() === 'learner' && follow === 'follow' && active()

  // The shared collections take no writes once the classroom has ended (the server refuses them too).
  const shared = documentStore(() => doc, () => {
    if (membership && !active()) throw new Error(messages().errors.ended)
  })
  const personal = documentStore(() => personalDoc, () => {})

  /** Moves a following learner to the presenter's position when it changed (or always, when `force`). */
  function followPresenter(force = false): void {
    const target = followTarget(membership?.me, follow, readSession(doc))
    if (!target || !navigation || (!force && samePosition(target, followed))) return
    followed = target
    navigation.go(target)
  }

  /** The presenter's position goes to the room. */
  function publish(): void {
    if (navigation && role() === 'presenter' && !mirror && active()) publishCursor(doc, navigation.position.value)
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

  /** Makes `next` the classroom document: observers move to it, store subscribers see its content. */
  function bind(next: Y.Doc): void {
    detach.forEach(stop => stop())
    detach = []
    doc = next
    detach.push(observe(sessionMap(doc), () => {
      notify()
      followPresenter()
    }))
    for (const [name, link] of links) attachChannel(name, link)
    shared.rebind()
  }

  function bindPersonal(next: Y.Doc): void {
    personalDoc = next
    personal.rebind()
  }

  function disconnect(): void {
    provider?.destroy()
    personalProvider?.destroy()
    provider = undefined
    personalProvider = undefined
    membership = undefined
    mirror = false
    connection = 'offline'
    followed = undefined
    bind(new Y.Doc())
    bindPersonal(new Y.Doc())
  }

  /** This tab's classroom, for a reload; a mirror finds the presenter's window again instead. */
  function remember(value: Membership | undefined): void {
    if (mirror) return
    try {
      if (value) options.storage?.setItem(STORAGE_KEY, JSON.stringify(value))
      else options.storage?.removeItem(STORAGE_KEY)
    } catch {}
  }

  const usable = (value: Membership | null | undefined) => (value && value.server === server && value.room && value.me?.id && value.key ? value : undefined)

  function remembered(): Membership | undefined {
    try {
      return usable(JSON.parse(options.storage?.getItem(STORAGE_KEY) ?? 'null') as Membership | null)
    } catch {
      return undefined
    }
  }

  /** The deck's other tabs in this browser; none where BroadcastChannel is missing. */
  const tabs = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`presmium.session:${new URL(options.base).pathname}`)
  const tell = (message: TabMessage) => tabs?.postMessage(message)
  /** This window presents the classroom: it created or rejoined it, and is no mirror. */
  const presenting = () => membership?.me.role === 'presenter' && !mirror

  /** Waits until the provider has synced with the server, at most `timeoutMs`; fails at once for an archived classroom. */
  function synced(connecting: WebsocketProvider): Promise<void> {
    if (connecting.synced) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer)
        connecting.off('sync', done)
        connecting.off('closed', closed)
      }
      const done = (isSynced: boolean) => {
        if (!isSynced) return
        stop()
        resolve()
      }
      const closed = ({ code }: { code: number }) => {
        stop()
        reject(new Error(code === ARCHIVED_CLOSE_CODE ? messages().errors.archived : messages().errors.closed(code)))
      }
      const timer = setTimeout(() => {
        stop()
        reject(new Error(messages().errors.unreachable(server ?? '')))
      }, options.timeoutMs ?? 10_000)
      connecting.on('sync', done)
      connecting.on('closed', closed)
    })
  }

  /**
   * Connects to a room as `me`; `start` makes it a new classroom with `me` as
   * presenter, `asMirror` shows the presenter's classroom of another tab.
   */
  async function enter({ room, me, key, claim }: Omit<Membership, 'server'>, start = false, asMirror = false): Promise<void> {
    if (!server) throw new Error(messages().errors.noServer)
    disconnect()
    const next = new Y.Doc()
    // Every update goes through the classroom server, which checks who may write it.
    const connecting = new WebsocketProvider(server, room, next, { disableBc: true, params: { participant: me.id, key, ...claim ? { claim } : {} } })
    provider = connecting
    membership = { server, room, me, key, ...claim ? { claim } : {} }
    mirror = asMirror
    connection = 'connecting'
    follow = 'follow'
    error = undefined
    invitation = undefined
    bind(next)
    const own = new Y.Doc()
    personalProvider = new WebsocketProvider(server, `${room}.${key}`, own)
    bindPersonal(own)
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
    // An archived classroom: the server is done with it, the document stays readable here.
    connecting.on('closed', () => {
      if (provider !== connecting) return
      connection = 'offline'
      remember(undefined)
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
    if (mirror) {
      // Shows the presenter's classroom; its windows publish.
    } else if (me.role === 'presenter') {
      tell({ type: 'presenter', membership: membership! })
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
      await enter({ room, me: { id: randomId(16), name: name.trim() || messages().defaultName.presenter, role: 'presenter' }, key: randomId(24), claim: randomId(24) }, true)
      return room
    },
    async join(room, name) {
      await enter({ room, me: { id: randomId(16), name: name.trim() || messages().defaultName.learner, role: 'learner' }, key: randomId(24) })
    },
    async end() {
      if (role() !== 'presenter') throw new Error(messages().errors.onlyPresenterEnds)
      endSession(doc, Date.now())
    },
    async archive() {
      const { errors } = messages()
      if (!membership || role() !== 'presenter') throw new Error(errors.onlyPresenterArchives)
      const response = await fetch(archiveUrl(membership.server, membership.room), { method: 'POST', body: membership.claim ?? '' })
        .catch(() => { throw new Error(errors.unreachable(membership?.server ?? '')) })
      const result = await response.json().catch(() => ({})) as { file?: string }
      // The classroom server's statuses: not the creator's key, no such room, archived before.
      const refused: Record<number, string> = { 403: errors.notCreator, 404: errors.noRoom, 410: errors.alreadyArchived }
      if (!response.ok || !result.file) throw new Error(refused[response.status] ?? errors.archiveFailed(response.status))
      return result.file
    },
    leave() {
      if (presenting()) tell({ type: 'left', room: membership!.room })
      remember(undefined)
      disconnect()
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
    personal: personal.store,
  }

  const transport: SyncTransport = {
    connect(name, receive, state) {
      const link: Link = { receive, state }
      links.set(name, link)
      attachChannel(name, link)
      return (next, fromRemote) => {
        link.state = next
        // Learners only receive; what another window sent is not the presenter's own change.
        if (!fromRemote && role() === 'presenter' && !mirror && active()) writeChannel(doc, name, next)
      }
    },
  }

  const stopPublishing: Unsubscribe = navigation ? watch(navigation.position, publish) : () => {}

  // A presenter window tells the tabs that ask; a tab in no classroom of its own shows the
  // presenter's, until the presenter leaves it.
  if (tabs) {
    tabs.onmessage = ({ data }: MessageEvent<TabMessage>) => {
      if (data.type === 'who' && presenting()) tell({ type: 'presenter', membership: membership! })
      else if (data.type === 'presenter' && !membership && !invitation && usable(data.membership)) void enter(data.membership, false, true).catch(() => {})
      else if (data.type === 'left' && mirror && membership?.room === data.room) {
        disconnect()
        notify()
      }
    }
  }

  return {
    session,
    store: shared.store,
    transport,
    async resume(search) {
      const request = joinRequest(search)
      const before = remembered()
      try {
        // A reload of the page keeps this tab's place in its classroom.
        if (before && (!request || (request.room === before.room && (!request.name || request.name === before.me.name)))) {
          await enter(before)
        } else if (request?.name) {
          await session.join(request.room, request.name)
        } else if (request) {
          invitation = request.room
          notify()
        } else {
          tell({ type: 'who' })
        }
      } catch {
        // Reported in the snapshot.
      }
    },
    dispose() {
      stopPublishing()
      tabs?.close()
      disconnect()
      listeners.clear()
    },
  }
}
