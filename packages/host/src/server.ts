/**
 * The page's side of the server (docs/architecture.md 4.7, 10.4): the client
 * of `/__presmium/` that `useServer()` returns, and the control channel. A
 * host adapter gives the client when `presmium dev` or `presmium serve`
 * serves the page; in static output there is none and `available` is false.
 *
 * The control channel (`/__presmium/presmium.server/control`): the page
 * reports its position, view role and the plugins' status summaries (POST),
 * and gets (SSE) `go` (moves through the `navigation` service), `session`
 * (starts or ends the classroom through the `session` service) and the
 * approval requests it may answer, which the toolbar shows (`PmApprovals`).
 */
import { SESSION } from '@presmium/kernel/contracts'
import type { ApprovalRequest, Member, ServiceToken, Unsubscribe } from '@presmium/kernel/contracts'
import type { Ref } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import { currentLocale } from './locale.ts'
import type { Navigation, NavigationPosition, ServerClient, StatusRegistry, ViewRole } from './types.ts'

/** Path of the server's own routes. */
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
/** The document directory of each client `createServerClient` made. */
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

/**
 * The server's access (4.7): `available`, the current member, `fetch` and
 * `events` of the plugins' routes. Callable outside components; `available`
 * is reactive, so a component that renders before the host gave the client
 * renders again once it has.
 */
export function useServer(): ServerClient {
  return facade
}

/** Gives the page's server client; the host adapters call it as early as they can, and `startHost` with `server`. */
export function provideServer(client: ServerClient | undefined): void {
  current.value = client ?? UNAVAILABLE
}

/** The `Presmium-Document` header value: the document directory, URI-encoded (header values are Latin-1). */
function documentHeader(document: string): string {
  return encodeURIComponent(document)
}

/**
 * The client of a page served by `presmium dev` or `presmium serve`.
 * `document` is the page's document directory relative to the workspace
 * root ('' in `presmium dev`).
 */
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
      // EventSource sends no headers of its own: the document goes in the query.
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

// Control channel ------------------------------------------------------------------

/** An approval this window may answer. */
export interface PendingApproval {
  id: string
  request: ApprovalRequest
}

/** What the toolbar shows: the approvals to answer here. */
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

/** The view role a window has, from its view (web form) or its route (the slides form's `/presenter/`). */
function roleOf(position: NavigationPosition): ViewRole {
  if (position.view === 'presenter') return 'presenter'
  if (position.view === 'present') return 'audience'
  if (position.view !== undefined) return 'reader'
  return typeof location !== 'undefined' && /\/presenter(?:\/|$)/.test(location.pathname) ? 'presenter' : 'audience'
}

/**
 * Connects the window to the server's control channel. Reports the position
 * shortly after it changes and the status summaries when they change (at
 * most once a second); follows `go` and `session`; keeps the approvals to
 * answer. Returns the function that disconnects it. Browser only.
 */
export function connectControl(client: ServerClient, host: {
  navigation: Navigation
  status: StatusRegistry
  service<T>(token: ServiceToken<T>): T | undefined
}): Unsubscribe {
  const { navigation, status } = host
  const document = documents.get(client) ?? ''
  const id = Math.random().toString(36).slice(2, 12)
  // The answer's body is read, so the request ends in the browser too (a test's wait for an idle network sees it end).
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
  // Reported once the channel is open, so the server knows the window when the report arrives.
  source.addEventListener('open', () => {
    reported = ''
    report()
  })
  // A position is reported shortly after it changes (scrolling a page view changes it often); the status every second.
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
