import type { Member } from '@lincyaw/kernel/contracts'
import { computed, shallowRef } from 'vue'
import { currentLocale } from './locale.ts'
import type { ServerClient } from './contracts.ts'

export const SERVER_PATH = '/__presmium/presmium.server'

const UNAVAILABLE: ServerClient = {
  available: false,
  member: computed(() => undefined),
  fetch: () => Promise.reject(new Error('no Presmium server serves this page')),
  events() {
    throw new Error('no Presmium server serves this page')
  },
}

const current = shallowRef<ServerClient>(UNAVAILABLE)
const documents = new WeakMap<ServerClient, string>()

/** The document a client from `createServerClient` was created for. */
export function clientDocument(client: ServerClient): string {
  return documents.get(client) ?? ''
}

const facade: ServerClient = {
  get available() {
    return current.value.available
  },
  get member() {
    return current.value.member
  },
  fetch: (plugin, path, init) => current.value.fetch(plugin, path, init),
  events: (plugin, path) => current.value.events(plugin, path),
}

export function useServer(): ServerClient {
  return facade
}

export function provideServer(client: ServerClient | undefined): void {
  current.value = client ?? UNAVAILABLE
}

export function documentHeader(document: string): string {
  return encodeURIComponent(document)
}

export function createServerClient(options: { document?: string } = {}): ServerClient {
  const document = options.document ?? ''
  const member = shallowRef<Member>()
  const url = (plugin: string, path: string) => `/__presmium/${plugin}/${path.replace(/^\//, '')}`
  const client: ServerClient = {
    available: true,
    member: computed(() => member.value),
    fetch(plugin, path, init = {}) {
      const headers = new Headers(init.headers)
      headers.set('Presmium-Document', documentHeader(document))
      if (!headers.has('Accept-Language')) headers.set('Accept-Language', currentLocale())
      return fetch(url(plugin, path), { ...init, headers })
    },
    events(plugin, path) {
      const target = url(plugin, path)
      return new EventSource(`${target}${target.includes('?') ? '&' : '?'}document=${documentHeader(document)}`)
    },
  }
  void fetch(`${SERVER_PATH}/hello`, { headers: { 'Presmium-Document': documentHeader(document) } })
    .then(response => (response.ok ? response.json() : response.text().then(() => undefined)))
    .then((hello: { member?: Member } | undefined) => {
      member.value = hello?.member
    })
    .catch(() => undefined)
  documents.set(client, document)
  return client
}
