/**
 * `AGENT` in the page (docs/architecture.md 4.8): the client of the
 * assistant's routes. `available`, `provider` and `runtime` read `info`,
 * asked when the plugin starts and again after each task (the runtime is
 * known once an agent started). A task's id is drawn here, so `submit`
 * returns at once; its events come from `tasks/<id>/events` (SSE), each
 * once even when the stream reconnects (the server sends them from the
 * first), until `done` or `error`. A task whose context names a document
 * goes to that document's routes: the workspace's new-document form drafts
 * the document it created (P-121) from the home page.
 */
import { currentLocale } from '@presmium/host'
import type { ServerClient } from '@presmium/host'
import type { AgentClient, AgentEvent, AgentTask, AgentTaskKind, AgentTaskRequest, ReviewDecision } from '@presmium/kernel'
import { shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import { ASSISTANT_ID } from '../domain/index.ts'
import type { AssistantInfo } from '../domain/index.ts'

export interface AssistantClient {
  client: AgentClient
  info: Readonly<ShallowRef<AssistantInfo | undefined>>
  refresh(): Promise<void>
}

const terminal = (event: AgentEvent) => event.type === 'done' || event.type === 'error'

function taskId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** The assistant's routes of the page's document, or of another document of the workspace. */
interface Routes {
  fetch(path: string, init?: RequestInit): Promise<Response>
  events(path: string): EventSource
}

function routesOf(server: ServerClient, document: string | undefined): Routes {
  if (!document) return { fetch: (path, init) => server.fetch(ASSISTANT_ID, path, init), events: path => server.events(ASSISTANT_ID, path) }
  // As the server client addresses its own document: the header, or the query of an event stream.
  const named = encodeURIComponent(document)
  const url = (path: string) => `/__presmium/${ASSISTANT_ID}/${path}`
  return {
    fetch(path, init = {}) {
      const headers = new Headers(init.headers)
      headers.set('Presmium-Document', named)
      if (!headers.has('Accept-Language')) headers.set('Accept-Language', currentLocale())
      return fetch(url(path), { ...init, headers })
    },
    events: path => new EventSource(`${url(path)}?document=${named}`),
  }
}

/** The events of a submitted task, from its SSE route. */
async function* follow(routes: Routes, id: string, posted: Promise<Response>): AsyncIterable<AgentEvent> {
  const response = await posted.catch((error: unknown) => error)
  if (!(response instanceof Response) || !response.ok) {
    const body = response instanceof Response ? await response.json().catch(() => ({})) as { error?: string } : {}
    yield { type: 'error', message: body.error ?? (response instanceof Response ? `${response.status}` : String(response)) }
    return
  }
  await response.text()
  const queue: AgentEvent[] = []
  let wake: (() => void) | undefined
  let seen = 0
  let index = 0
  let lost = false
  const source = routes.events(`tasks/${encodeURIComponent(id)}/events`)
  source.addEventListener('open', () => index = 0)
  source.addEventListener('message', (message) => {
    if (index++ < seen) return
    seen++
    queue.push(JSON.parse((message as MessageEvent<string>).data) as AgentEvent)
    wake?.()
  })
  source.addEventListener('error', () => {
    if (source.readyState !== EventSource.CLOSED) return
    lost = true
    wake?.()
  })
  try {
    for (;;) {
      const event = queue.shift()
      if (event) {
        yield event
        if (terminal(event)) return
        continue
      }
      if (lost) {
        yield { type: 'error', message: 'the connection to the server was lost' }
        return
      }
      await new Promise<void>(resolve => wake = resolve)
      wake = undefined
    }
  } finally {
    source.close()
  }
}

export function createAgentClient(server: ServerClient): AssistantClient {
  const info = shallowRef<AssistantInfo>()
  const refresh = async () => {
    try {
      const response = await server.fetch(ASSISTANT_ID, 'info')
      if (response.ok) info.value = await response.json() as AssistantInfo
      else await response.text()
    } catch {
      // The server is gone; what was known stays.
    }
  }
  const client: AgentClient = {
    available: (kind: AgentTaskKind) => info.value?.kinds.includes(kind) ?? false,
    provider: () => info.value?.provider,
    runtime: () => info.value?.runtime,
    submit(request: AgentTaskRequest): AgentTask {
      const id = taskId()
      const routes = routesOf(server, request.context.document || undefined)
      const posted = routes.fetch('tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, id }) })
      const events: AsyncIterable<AgentEvent> = {
        async* [Symbol.asyncIterator]() {
          try {
            yield* follow(routes, id, posted)
          } finally {
            void refresh()
          }
        },
      }
      const after = (path: string, body?: unknown) => posted.then(() => routes.fetch(`tasks/${encodeURIComponent(id)}/${path}`, {
        method: 'POST',
        ...body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      }))
      return {
        id,
        events,
        cancel() {
          void after('cancel').then(response => response.text()).catch(() => undefined)
        },
        async review(decision: ReviewDecision) {
          const response = await after('review', decision)
          if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `${response.status}`)
          await response.text()
        },
      }
    },
  }
  return { client, info, refresh }
}
