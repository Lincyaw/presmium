import { currentLocale } from '@lincyaw/host'
import type { Navigation, SyncTransport } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import type { ClassroomStore, Participant, ParticipantRole, Unsubscribe } from '@lincyaw/kernel'
import { watch } from 'vue'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { archiveUrl, followTarget, joinRequest, joinUrl, MESSAGES, participantsOf, plain, roomId, samePosition, sessionStatus } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot, FollowMode, Position, SessionMessages } from '../domain/index.ts'
import { channel, collection, endSession, publishCursor, readSession, sessionMap, startSession, writeChannel } from './document.ts'

export interface ClassroomOptions {
  server?: string
  params?: Record<string, string>
  navigation?: Navigation
  base: string
  storage?: Storage
  tabStorage?: Storage
  timeoutMs?: number
}

export interface Classroom {
  session: ClassroomSession
  store: ClassroomStore
  transport: SyncTransport
  resume(search: string): Promise<void>
  serve(server: string, params?: Record<string, string>): void
  dispose(): void
}

interface Membership {
  server: string
  room: string
  me: Participant
  key: string
  claim?: string
  follow?: FollowMode
  at?: number
}

interface Link {
  receive(patch: Record<string, unknown>): void
  state: Readonly<Record<string, unknown>>
}

type TabMessage =
  | { type: 'who' }
  | { type: 'presenter', membership: Membership }
  | { type: 'left', room: string }

const ARCHIVED_CLOSE_CODE = 4410
const REFUSED_CLOSE_CODE = 4403

const messages = (): SessionMessages => MESSAGES[currentLocale()]

function randomId(bytes: number): string {
  return roomId(crypto.getRandomValues(new Uint8Array(bytes)))
}

function observe(map: Y.Map<unknown>, handler: (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => void): () => void {
  map.observe(handler)
  return () => map.unobserve(handler)
}

function stored<T>(access: () => T): T | undefined {
  try {
    return access()
  } catch {
    return undefined
  }
}

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
  const { navigation } = options
  let server = options.server
  let params = options.params ?? {}
  let doc = new Y.Doc()
  let personalDoc = new Y.Doc()
  let provider: WebsocketProvider | undefined
  let personalProvider: WebsocketProvider | undefined
  let entering: AbortController | undefined
  let membership: Membership | undefined
  let mirror = false
  let connection: ClassroomSnapshot['connection'] = 'offline'
  let follow: FollowMode = 'follow'
  let invitation: string | undefined
  let error: string | undefined
  let refused = false
  let preferred: string | undefined
  let followed: Position | undefined

  const listeners = new Set<(snapshot: ClassroomSnapshot) => void>()
  const links = new Map<string, Link>()
  let detach: (() => void)[] = []

  const prefix = `presmium.session:${new URL(options.base).pathname}`
  const usable = (value: Membership | null | undefined) => (value && value.server === server && value.room && value.me?.id && value.key ? value : undefined)
  const remembered = (room: string) => stored(() => usable(JSON.parse(options.storage?.getItem(`${prefix}:${room}`) ?? 'null') as Membership | null))
  function presented(): Membership | undefined {
    const keys = stored(() => Array.from({ length: options.storage?.length ?? 0 }, (_, i) => options.storage!.key(i) ?? '')) ?? []
    const rooms = preferred ? [preferred] : keys.filter(key => key.startsWith(`${prefix}:`)).map(key => key.slice(prefix.length + 1))
    return rooms.map(remembered)
      .filter((value): value is Membership => value?.me.role === 'presenter' && value.claim !== undefined)
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0]
  }
  function remember(): void {
    if (!membership || mirror) return
    const value: Membership = { ...membership, follow, at: Date.now() }
    stored(() => options.storage?.setItem(`${prefix}:${value.room}`, JSON.stringify(value)))
    stored(() => options.tabStorage?.setItem(prefix, value.room))
  }
  function forget(room: string): void {
    stored(() => options.storage?.removeItem(`${prefix}:${room}`))
    if (stored(() => options.tabStorage?.getItem(prefix)) === room) stored(() => options.tabStorage?.removeItem(prefix))
  }

  function snapshot(): ClassroomSnapshot {
    const record = readSession(doc)
    return {
      server,
      connection,
      follow,
      invitation,
      rejoin: membership || invitation ? undefined : presented()?.room,
      error,
      refused,
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

  const role = (): ParticipantRole | undefined => membership?.me.role
  const active = () => membership !== undefined && sessionStatus(readSession(doc)) === 'active'
  const following = () => role() === 'learner' && follow === 'follow' && active()

  const shared = documentStore(() => doc, () => {
    if (membership && !active()) throw new Error(messages().errors.ended)
    if (refused) {
      refused = false
      notify()
    }
  })
  const personal = documentStore(() => {
    if (membership && server && !personalProvider) personalProvider = new WebsocketProvider(server, `${membership.room}.${membership.key}`, personalDoc, { params })
    return personalDoc
  }, () => {})

  function followPresenter(force = false): void {
    const target = followTarget(membership?.me, follow, readSession(doc))
    if (!target || !navigation || (!force && samePosition(target, followed))) return
    followed = target
    navigation.go(target)
  }

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

  function deliverChannels(): void {
    if (!following()) return
    for (const [name, link] of links) {
      const state = channel(doc, name).toJSON()
      if (Object.keys(state).length > 0) link.receive(state)
    }
  }

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
    entering?.abort()
    entering = undefined
    provider?.destroy()
    personalProvider?.destroy()
    provider = undefined
    personalProvider = undefined
    membership = undefined
    mirror = false
    connection = 'offline'
    followed = undefined
    refused = false
    bind(new Y.Doc())
    bindPersonal(new Y.Doc())
  }

  const tabs = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(prefix)
  const tell = (message: TabMessage) => tabs?.postMessage(message)
  const presenting = () => membership?.me.role === 'presenter' && !mirror

  function synced(connecting: WebsocketProvider, signal: AbortSignal): Promise<void> {
    if (connecting.synced) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer)
        connecting.off('sync', done)
        connecting.off('closed', closed)
        signal.removeEventListener('abort', aborted)
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
      const aborted = () => {
        stop()
        reject(new Error('superseded'))
      }
      const timer = setTimeout(() => {
        stop()
        reject(new Error(messages().errors.unreachable(server ?? '')))
      }, options.timeoutMs ?? 10_000)
      connecting.on('sync', done)
      connecting.on('closed', closed)
      signal.addEventListener('abort', aborted)
    })
  }

  async function enter(next: Membership, start = false, asMirror = false): Promise<void> {
    if (!server) throw new Error(messages().errors.noServer)
    disconnect()
    const attempt = entering = new AbortController()
    const { room, me, key, claim } = next
    const fresh = new Y.Doc()
    const connecting = new WebsocketProvider(server, room, fresh, { disableBc: true, params: { ...params, participant: me.id, key, ...claim ? { claim } : {} } })
    const current = () => provider === connecting
    provider = connecting
    membership = { server, room, me, key, ...claim ? { claim } : {} }
    mirror = asMirror
    connection = 'connecting'
    follow = next.follow ?? 'follow'
    error = undefined
    invitation = undefined
    bind(fresh)
    bindPersonal(new Y.Doc())
    connecting.awareness.setLocalStateField('participant', me)
    connecting.awareness.on('change', () => current() && notify())
    connecting.on('status', ({ status }: { status: string }) => {
      if (!current()) return
      connection = status === 'connected' && connecting.synced ? 'connected' : 'connecting'
      notify()
    })
    connecting.on('sync', (isSynced: boolean) => {
      if (!current()) return
      connection = isSynced ? 'connected' : 'connecting'
      notify()
    })
    connecting.on('closed', ({ code }: { code: number }) => {
      if (!current() || !membership) return
      if (code === REFUSED_CLOSE_CODE) {
        void enter({ ...membership, follow }, false, mirror).then(() => {
          if (membership?.room !== room || membership.me.id !== me.id) return
          refused = true
          notify()
        }, () => {})
        return
      }
      connection = 'offline'
      if (!mirror) forget(room)
      notify()
    })
    notify()
    try {
      await synced(connecting, attempt.signal)
    } catch (failure) {
      if (!current()) return
      disconnect()
      error = errorMessage(failure)
      if (me.role === 'learner') invitation = room
      notify()
      throw failure
    }
    if (!current()) return
    entering = undefined
    if (start) startSession(doc, me, Date.now())
    remember()
    if (mirror) {
    } else if (me.role === 'presenter') {
      tell({ type: 'presenter', membership: membership! })
      publish()
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
      await enter({ server: server ?? '', room, me: { id: randomId(16), name: name.trim() || messages().defaultName.presenter, role: 'presenter' }, key: randomId(24), claim: randomId(24) }, true)
      return room
    },
    async join(room, name) {
      const nickname = name.trim() || messages().defaultName.learner
      const before = remembered(room)
      if (before?.me.role === 'learner' && before.me.name === nickname) return enter(before)
      await enter({ server: server ?? '', room, me: { id: randomId(16), name: nickname, role: 'learner' }, key: randomId(24) })
    },
    async rejoin() {
      const before = presented()
      if (!before) throw new Error(messages().errors.noRoom)
      await enter(before)
      if (membership?.room === before.room && readSession(doc).status === undefined) {
        forget(before.room)
        disconnect()
        error = messages().errors.noRoom
        notify()
        throw new Error(error)
      }
    },
    async end() {
      if (role() !== 'presenter') throw new Error(messages().errors.onlyPresenterEnds)
      endSession(doc, Date.now())
    },
    async archive() {
      const { errors } = messages()
      if (!membership || role() !== 'presenter') throw new Error(errors.onlyPresenterArchives)
      const { server: at, room, claim } = membership
      const response = await fetch(archiveUrl(at, room, params), { method: 'POST', body: claim ?? '' })
        .catch(() => { throw new Error(errors.unreachable(at)) })
      const result = await response.json().catch(() => ({})) as { file?: string }
      const refused: Record<number, string> = { 403: errors.notCreator, 404: errors.noRoom, 410: errors.alreadyArchived }
      if (!response.ok || !result.file) throw new Error(refused[response.status] ?? errors.archiveFailed(response.status))
      forget(room)
      return result.file
    },
    leave() {
      if (membership && !mirror) forget(membership.room)
      if (presenting()) tell({ type: 'left', room: membership!.room })
      disconnect()
      notify()
    },
    setFollow(mode) {
      follow = mode
      remember()
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
      const current = channel(doc, name).toJSON()
      if (following() && Object.keys(current).length > 0) receive(current)
      return (next, fromRemote) => {
        link.state = next
        if (!fromRemote && role() === 'presenter' && !mirror && active()) writeChannel(doc, name, next)
      }
    },
  }

  const stopPublishing: Unsubscribe = navigation ? watch(navigation.position, publish) : () => {}

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
      try {
        if (request) {
          const before = remembered(request.room)
          if (before?.me.role === 'presenter') {
            preferred = request.room
            tell({ type: 'who' })
            notify()
          } else if (before && (!request.name || request.name === before.me.name)) {
            await enter(before)
          } else if (request.name) {
            await session.join(request.room, request.name)
          } else {
            invitation = request.room
            notify()
          }
        } else {
          const room = stored(() => options.tabStorage?.getItem(prefix))
          const before = room ? remembered(room) : undefined
          if (before) await enter(before)
          else tell({ type: 'who' })
        }
      } catch {
      }
    },
    serve(found, given = {}) {
      if (membership) return
      server = found
      params = given
      notify()
    },
    dispose() {
      stopPublishing()
      tabs?.close()
      disconnect()
      listeners.clear()
    },
  }
}
