import { currentLocale } from '@lincyaw/host'
import type { Navigation, SyncTransport } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import type { ClassroomStore, ParticipantRole, Unsubscribe } from '@lincyaw/kernel'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { archiveUrl, followTarget, joinRequest, joinUrl, MESSAGES, participantsOf, readableString, samePosition, sessionStatus } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot, FollowMode, JoinRequest, Position, SessionMessages } from '../domain/index.ts'
import { createMembershipStorage } from './membership-storage.ts'
import type { Membership } from './membership-storage.ts'
import { createSyncChannels } from './sync-channels.ts'
import { connectTabs } from './tab-mirror.ts'
import { observe, publishCursor, sessionMap, sessionRecordOf, writeSessionEnd, writeSessionStart } from './ydoc.ts'
import { createYjsStore } from './yjs-store.ts'

export interface ClassroomConnectionOptions {
  server?: string
  params?: Record<string, string>
  navigation?: Navigation
  base: string
  storage?: Storage
  tabStorage?: Storage
  timeoutMs?: number
}

/** The connection of this window to a classroom server: the session service, the shared store and the sync transport. */
export interface ClassroomConnection {
  session: ClassroomSession
  store: ClassroomStore
  transport: SyncTransport
  resume(search: string): Promise<void>
  setServer(url: string, params?: Record<string, string>): void
  dispose(): void
}

const ARCHIVED_CLOSE_CODE = 4410
const REFUSED_CLOSE_CODE = 4403

const messages = (): SessionMessages => MESSAGES[currentLocale()]

function randomString(length: number): string {
  return readableString(crypto.getRandomValues(new Uint8Array(length)))
}

export function createClassroomConnection(options: ClassroomConnectionOptions): ClassroomConnection {
  const { navigation } = options
  let server = options.server
  let params = options.params ?? {}
  let doc = new Y.Doc()
  let personalDoc = new Y.Doc()
  let provider: WebsocketProvider | undefined
  let personalProvider: WebsocketProvider | undefined
  let entering: AbortController | undefined
  let membership: Membership | undefined
  let isMirrorTab = false
  let connection: ClassroomSnapshot['connection'] = 'offline'
  let follow: FollowMode = 'follow'
  let invitation: string | undefined
  let error: string | undefined
  let refused = false
  let preferred: string | undefined
  let followed: Position | undefined

  const listeners = new Set<(snapshot: ClassroomSnapshot) => void>()
  let detach: (() => void)[] = []

  const prefix = `presmium.session:${new URL(options.base).pathname}`
  const memberships = createMembershipStorage({ prefix, storage: options.storage, tabStorage: options.tabStorage, server: () => server })

  function remember(): void {
    if (membership && !isMirrorTab) memberships.remember({ ...membership, follow, at: Date.now() })
  }

  function snapshot(): ClassroomSnapshot {
    const record = sessionRecordOf(doc)
    return {
      server,
      connection,
      follow,
      invitation,
      rejoin: membership || invitation ? undefined : memberships.findLastPresenterMembership(preferred)?.room,
      error,
      refused,
      sessionId: membership?.room,
      status: membership ? sessionStatus(record) : 'idle',
      me: membership?.me,
      participants: provider ? participantsOf(provider.awareness.getStates().values()) : [],
      presenterCursor: record.cursor && { slide: record.cursor.slide, step: record.cursor.step },
      joinUrl: membership && joinUrl(options.base, membership.room),
      archive: membership ? record.archive : undefined,
    }
  }

  function notify(): void {
    const next = snapshot()
    listeners.forEach(listener => listener(next))
  }

  const role = (): ParticipantRole | undefined => membership?.me.role
  const active = () => membership !== undefined && sessionStatus(sessionRecordOf(doc)) === 'active'
  const presenting = () => role() === 'presenter' && !isMirrorTab
  const following = () => role() === 'learner' && follow === 'follow' && active()

  const shared = createYjsStore(() => doc, () => {
    if (membership && !active()) throw new Error(messages().errors.ended)
    if (refused) {
      refused = false
      notify()
    }
  })
  const personal = createYjsStore(() => {
    if (membership && server && !personalProvider) personalProvider = new WebsocketProvider(server, `${membership.room}.${membership.key}`, personalDoc, { params })
    return personalDoc
  }, () => {})
  const channels = createSyncChannels(() => doc, { following, publishing: () => presenting() && active() })

  function followPresenter(force = false): void {
    const target = followTarget(membership?.me, follow, sessionRecordOf(doc))
    if (!target || !navigation || (!force && samePosition(target, followed))) return
    followed = target
    navigation.go(target)
  }

  function publishPosition(): void {
    if (navigation && presenting() && active()) publishCursor(doc, navigation.position.getSnapshot())
  }

  function bind(next: Y.Doc): void {
    detach.forEach(stop => stop())
    detach = []
    doc = next
    detach.push(observe(sessionMap(doc), () => {
      notify()
      followPresenter()
    }))
    channels.rebind()
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
    isMirrorTab = false
    connection = 'offline'
    followed = undefined
    refused = false
    bind(new Y.Doc())
    bindPersonal(new Y.Doc())
  }

  function waitForSync(connecting: WebsocketProvider, signal: AbortSignal): Promise<void> {
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
    isMirrorTab = asMirror
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
        void enter({ ...membership, follow }, false, isMirrorTab).then(() => {
          if (membership?.room !== room || membership.me.id !== me.id) return
          refused = true
          notify()
        }, () => {})
        return
      }
      connection = 'offline'
      if (!isMirrorTab) memberships.forget(room)
      notify()
    })
    notify()
    try {
      await waitForSync(connecting, attempt.signal)
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
    if (start) writeSessionStart(doc, me, Date.now())
    remember()
    if (!isMirrorTab && me.role === 'presenter') {
      tabs.announce(membership!)
      publishPosition()
      channels.publishAll()
    } else if (!isMirrorTab) {
      followPresenter(true)
      channels.deliver()
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
      const room = randomString(8)
      await enter({ server: server ?? '', room, me: { id: randomString(16), name: name.trim() || messages().defaultName.presenter, role: 'presenter' }, key: randomString(24), claim: randomString(24) }, true)
      return room
    },
    async join(room, name) {
      const nickname = name.trim() || messages().defaultName.learner
      const before = memberships.find(room)
      if (before?.me.role === 'learner' && before.me.name === nickname) return enter(before)
      await enter({ server: server ?? '', room, me: { id: randomString(16), name: nickname, role: 'learner' }, key: randomString(24) })
    },
    async rejoin() {
      const before = memberships.findLastPresenterMembership(preferred)
      if (!before) throw new Error(messages().errors.noRoom)
      await enter(before)
      if (membership?.room === before.room && sessionRecordOf(doc).status === undefined) {
        memberships.forget(before.room)
        disconnect()
        error = messages().errors.noRoom
        notify()
        throw new Error(error)
      }
    },
    async end() {
      if (role() !== 'presenter') throw new Error(messages().errors.onlyPresenterEnds)
      writeSessionEnd(doc, Date.now())
    },
    async archive() {
      const { errors } = messages()
      if (!membership || role() !== 'presenter') throw new Error(errors.onlyPresenterArchives)
      const { server: at, room, claim } = membership
      const response = await fetch(archiveUrl(at, room, params), { method: 'POST', body: claim ?? '' })
        .catch(() => { throw new Error(errors.unreachable(at)) })
      const result = await response.json().catch(() => ({})) as { file?: string }
      const reasons: Record<number, string> = { 403: errors.notCreator, 404: errors.noRoom, 410: errors.alreadyArchived }
      if (!response.ok || !result.file) throw new Error(reasons[response.status] ?? errors.archiveFailed(response.status))
      memberships.forget(room)
      return result.file
    },
    leave() {
      if (membership && !isMirrorTab) memberships.forget(membership.room)
      if (presenting()) tabs.leave(membership!.room)
      disconnect()
      notify()
    },
    setFollow(mode) {
      follow = mode
      remember()
      if (mode === 'follow') {
        followPresenter(true)
        channels.deliver()
      }
      notify()
    },
    personal: personal.store,
  }

  async function resumeFrom(request: JoinRequest | undefined): Promise<void> {
    if (!request) {
      const before = memberships.findInTab()
      if (before) await enter(before)
      else tabs.ask()
      return
    }
    const before = memberships.find(request.room)
    if (before?.me.role === 'presenter') {
      preferred = request.room
      tabs.ask()
      notify()
    } else if (before && (!request.name || request.name === before.me.name)) {
      await enter(before)
    } else if (request.name) {
      await session.join(request.room, request.name)
    } else {
      invitation = request.room
      notify()
    }
  }

  const stopPublishing: Unsubscribe = navigation ? navigation.position.subscribe(publishPosition) : () => {}

  const tabs = connectTabs(prefix, {
    asked() {
      if (presenting()) tabs.announce(membership!)
    },
    presenting(other) {
      if (!membership && !invitation && memberships.isUsable(other)) void enter(other, false, true).catch(() => {})
    },
    left(room) {
      if (!isMirrorTab || membership?.room !== room) return
      disconnect()
      notify()
    },
  })

  return {
    session,
    store: shared.store,
    transport: channels.transport,
    async resume(search) {
      // A failed entry shows in the snapshot's error; resuming does not throw it.
      await resumeFrom(joinRequest(search)).catch(() => {})
    },
    setServer(url, given = {}) {
      if (membership) return
      server = url
      params = given
      notify()
    },
    dispose() {
      stopPublishing()
      tabs.close()
      disconnect()
      listeners.clear()
    },
  }
}
