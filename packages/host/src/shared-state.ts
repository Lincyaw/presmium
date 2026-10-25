import type { SharedStateScope, SyncPublish, SyncTransport, SyncTransports } from './contracts.ts'
import { createStore } from './store.ts'
import type { Store } from './store.ts'
import { joinWindows } from './windows.ts'
interface Channel { name: string, receive(patch: Record<string, unknown>): void, value(): unknown, publishers: Map<SyncTransport, SyncPublish> }
export interface SharedStates { sharedState<T>(key: string, initial: T, scope: SharedStateScope): Store<T>, transports: SyncTransports }
const plain = (value: unknown): unknown => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
export function createSharedStates(deck: string): SharedStates {
  const states = new Map<string, Store<unknown>>()
  const channels = new Map<string, Channel>()
  const transports = new Set<SyncTransport>()
  const connect = (transport: SyncTransport, channel: Channel) => { const publish = transport.connect(channel.name, channel.receive, { value: channel.value() }, false); if (publish) channel.publishers.set(transport, publish) }
  function make(id: string, initial: unknown, scope: SharedStateScope): Store<unknown> {
    const state = createStore(plain(initial))
    if (scope === 'view') return state
    const name = `presmium.shared:${deck}:${id}`
    let from: 'window' | 'remote' | undefined
    let changed = false
    const apply = (value: unknown, source: 'window' | 'remote') => { from = source; state.set(value); from = undefined }
    const windows = joinWindows(name, value => apply(value, 'window'), () => changed ? plain(state.getSnapshot()) : undefined)
    const channel: Channel = { name, receive(patch) { if ('value' in patch) apply(patch.value, 'remote') }, value: () => plain(state.getSnapshot()), publishers: new Map() }
    state.subscribe(() => { changed = true; const value = plain(state.getSnapshot()); if (!from) windows?.send(value); channel.publishers.forEach(publish => publish({ value }, from !== undefined)) })
    if (scope === 'remote') { channels.set(id, channel); transports.forEach(transport => connect(transport, channel)) }
    return state
  }
  return {
    sharedState<T>(key: string, initial: T, scope: SharedStateScope) { const id = `${scope}:${key}`; let state = states.get(id); if (!state) { state = make(id, initial, scope); states.set(id, state) } return state as Store<T> },
    transports: { add(transport) { transports.add(transport); channels.forEach(channel => connect(transport, channel)); return () => { transports.delete(transport); channels.forEach(channel => channel.publishers.delete(transport)) } } },
  }
}
