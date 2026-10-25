import type { Member } from '@lincyaw/kernel/contracts'
import { currentLocale } from './locale.ts'
import type { ServerClient } from './contracts.ts'
import { createStore, useStore } from './store.ts'
export const SERVER_PATH = '/__presmium/presmium.server'
const UNAVAILABLE: ServerClient = { available: false, member: createStore<Member | undefined>(undefined), fetch: () => Promise.reject(new Error('no Presmium server serves this page')), events() { throw new Error('no Presmium server serves this page') } }
const current = createStore<ServerClient>(UNAVAILABLE)
const documents = new WeakMap<ServerClient, string>()
export function clientDocument(client: ServerClient): string { return documents.get(client) ?? '' }
export function serverClient(): ServerClient { return current.getSnapshot() }
export function useServer(): ServerClient { return useStore(current) }
export function provideServer(client: ServerClient | undefined): void { current.set(client ?? UNAVAILABLE) }
export function documentHeader(document: string): string { return encodeURIComponent(document) }
export function createServerClient(options: { document?: string } = {}): ServerClient {
  const document = options.document ?? ''
  const member = createStore<Member | undefined>(undefined)
  const url = (plugin: string, path: string) => `/__presmium/${plugin}/${path.replace(/^\//, '')}`
  const client: ServerClient = {
    available: true, member,
    fetch(plugin, path, init = {}) { const headers = new Headers(init.headers); headers.set('Presmium-Document', documentHeader(document)); if (!headers.has('Accept-Language')) headers.set('Accept-Language', currentLocale()); return fetch(url(plugin, path), { ...init, headers }) },
    events(plugin, path) { const target = url(plugin, path); return new EventSource(`${target}${target.includes('?') ? '&' : '?'}document=${documentHeader(document)}`) },
  }
  void fetch(`${SERVER_PATH}/hello`, { headers: { 'Presmium-Document': documentHeader(document) } }).then(response => response.ok ? response.json() : undefined).then((hello: { member?: Member } | undefined) => member.set(hello?.member)).catch(() => undefined)
  documents.set(client, document)
  return client
}
