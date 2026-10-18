/**
 * Another implementation of the `session` and `classroomStore` services (K-08), in place of
 * @presmium/slidev-addon-session: no server, the classroom lives in memory and reaches the deck's
 * other tabs in the same browser through a BroadcastChannel. `?as=presenter` opens a tab as the
 * presenter, `?as=<name>` as a learner of that name, no `as` outside the classroom. The web form
 * registers this file as it registers every plugin's `src/client/plugin.ts`. It imports nothing
 * at run time: service tokens are matched by id, and this package lives outside the workspace.
 */
import type {
  ClassroomStore,
  Participant,
  PluginDefinition,
  ServiceToken,
  SessionService,
  SessionSnapshot,
  StoredItem,
} from '../../../../../../packages/kernel/src/contracts.ts'

const SESSION = { id: 'presmium.session' } as ServiceToken<SessionService>
const CLASSROOM_STORE = { id: 'presmium.classroomStore' } as ServiceToken<ClassroomStore>

type Message =
  | { type: 'hello' }
  | { type: 'state', data: Record<string, Record<string, unknown>> }
  | { type: 'put', collection: string, id: string, value: unknown }
  | { type: 'remove', collection: string, id: string }

function memoryClassroom(): { session: SessionService, store: ClassroomStore } {
  const channel = new BroadcastChannel('presmium-fixture-memory-session')
  const data = new Map<string, Map<string, unknown>>()
  const listeners = new Map<string, Set<() => void>>()
  const as = new URLSearchParams(location.search).get('as')
  const me: Participant | undefined = as ? { id: `${as}-${crypto.randomUUID()}`, name: as, role: as === 'presenter' ? 'presenter' : 'learner' } : undefined
  const snapshot: SessionSnapshot = { sessionId: me && 'memory', status: me ? 'active' : 'idle', me, participants: me ? [me] : [] }

  const items = (collection: string) => {
    let map = data.get(collection)
    if (!map) data.set(collection, map = new Map())
    return map
  }
  const changed = (collection: string) => listeners.get(collection)?.forEach(listener => listener())
  /** Applies a change here, and with `share` in the other tabs too. */
  function apply(message: Message, share: boolean): void {
    if (message.type === 'put') items(message.collection).set(message.id, message.value)
    else if (message.type === 'remove') items(message.collection).delete(message.id)
    else return
    changed(message.collection)
    if (share) channel.postMessage(message)
  }

  channel.onmessage = ({ data: message }: MessageEvent<Message>) => {
    if (message.type === 'hello') {
      channel.postMessage({ type: 'state', data: Object.fromEntries([...data].map(([name, map]) => [name, Object.fromEntries(map)])) })
    } else if (message.type === 'state') {
      for (const [name, entries] of Object.entries(message.data)) {
        for (const [id, value] of Object.entries(entries)) items(name).set(id, value)
        changed(name)
      }
    } else {
      apply(message, false)
    }
  }
  // A tab that opens later gets what the others have.
  channel.postMessage({ type: 'hello' })

  const store: ClassroomStore = {
    list: <T>(collection: string): StoredItem<T>[] => [...items(collection)].map(([id, value]) => ({ id, value: value as T })),
    get: <T>(collection: string, id: string) => items(collection).get(id) as T | undefined,
    put: (collection, id, value) => apply({ type: 'put', collection, id, value: JSON.parse(JSON.stringify(value)) }, true),
    remove: (collection, id) => apply({ type: 'remove', collection, id }, true),
    subscribe(collection, listener) {
      let set = listeners.get(collection)
      if (!set) listeners.set(collection, set = new Set())
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
  }
  const session: SessionService = {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    create: () => Promise.reject(new Error('the memory classroom opens with ?as=presenter')),
    join: () => Promise.reject(new Error('the memory classroom opens with ?as=<name>')),
    end: async () => {},
    leave: () => {},
  }
  return { session, store }
}

const plugin: PluginDefinition = {
  manifest: { id: 'fixture.memory-session', version: '0.0.0', kernel: '^1.0.0', provides: [SESSION, CLASSROOM_STORE] },
  setup(ctx) {
    const { session, store } = memoryClassroom()
    ctx.provide(SESSION, session)
    ctx.provide(CLASSROOM_STORE, store)
  },
}

export default plugin
