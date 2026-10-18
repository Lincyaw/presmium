import { SESSION } from '@presmium/kernel/contracts'
import type { ApprovalRequest, Member, ServiceToken, Unsubscribe } from '@presmium/kernel/contracts'
import type { Ref } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import { currentLocale } from './locale.ts'
import type { Navigation, NavigationPosition, ServerClient, StatusRegistry, ViewRole } from './types.ts'

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

function documentHeader(document: string): string {
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

export interface PendingApproval {
  id: string
  request: ApprovalRequest
}

export interface ApprovalState {
  pending: Ref<PendingApproval[]>
  answer(id: string, allow: boolean): Promise<void>
}

const pending = shallowRef<PendingApproval[]>([])
let answering: (id: string, allow: boolean) => Promise<void> = async () => {}

export const approvals: ApprovalState = {
  pending,
  answer: (id, allow) => answering(id, allow),
}

function roleOf(position: NavigationPosition): ViewRole {
  if (position.view === 'presenter') return 'presenter'
  if (position.view === 'present') return 'audience'
  if (position.view !== undefined) return 'reader'
  return typeof location !== 'undefined' && /\/presenter(?:\/|$)/.test(location.pathname) ? 'presenter' : 'audience'
}

export function connectControl(client: ServerClient, host: {
  navigation: Navigation
  status: StatusRegistry
  service<T>(token: ServiceToken<T>): T | undefined
}): Unsubscribe {
  const { navigation, status } = host
  const document = documents.get(client) ?? ''
  const id = Math.random().toString(36).slice(2, 12)
  const post = (body: Record<string, unknown>) => fetch(`${SERVER_PATH}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Presmium-Document': documentHeader(document) },
    body: JSON.stringify({ window: id, ...body }),
  }).then(async response => ({ ok: response.ok, status: response.status, text: await response.text() }))
  answering = async (approval, allow) => {
    const response = await post({ type: 'answer', id: approval, allow })
    if (!response.ok) throw new Error(`the server did not take the answer (${response.status})`)
    pending.value = pending.value.filter(p => p.id !== approval)
  }
  const source = new EventSource(`${SERVER_PATH}/control?window=${id}&document=${documentHeader(document)}`)
  const on = <T>(event: string, handle: (data: T) => void) => source.addEventListener(event, (message) => {
    try {
      handle(JSON.parse((message as MessageEvent<string>).data) as T)
    } catch (error) {
      console.error(`[presmium] control channel: bad ${event} message`, error)
    }
  })
  on<PendingApproval>('approval', (approval) => {
    if (!pending.value.some(p => p.id === approval.id)) pending.value = [...pending.value, approval]
  })
  on<{ id: string }>('settled', (settled) => {
    pending.value = pending.value.filter(p => p.id !== settled.id)
  })
  on<NavigationPosition>('go', position => navigation.go(position))
  on<{ action: 'start' | 'end', name?: string }>('session', ({ action, name }) => {
    const session = host.service(SESSION)
    if (!session) return
    void (action === 'start' ? session.create(name ?? '') : session.end()).catch((error: unknown) => {
      console.error('[presmium] the classroom command failed', error)
    })
  })

  let reported = ''
  const report = () => {
    const position = navigation.position.value
    const summaries = Object.fromEntries(status.list().map((provider) => {
      try {
        return [provider.id, provider.read()]
      } catch {
        return [provider.id, null]
      }
    }))
    const body = JSON.stringify({ position, role: roleOf(position), status: summaries })
    if (body === reported) return
    reported = body
    void post({ type: 'report', ...JSON.parse(body) as Record<string, unknown> }).catch(() => undefined)
  }
  source.addEventListener('open', () => {
    reported = ''
    report()
  })
  let soon: ReturnType<typeof setTimeout> | undefined
  const stopWatch = watch(() => navigation.position.value, () => {
    soon ??= setTimeout(() => {
      soon = undefined
      report()
    }, 200)
  }, { deep: true })
  const timer = setInterval(report, 1000)
  return () => {
    stopWatch()
    clearTimeout(soon)
    clearInterval(timer)
    source.close()
    pending.value = []
  }
}
