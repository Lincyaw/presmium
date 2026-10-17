/**
 * `AGENT` in the page (docs/architecture.md 4.8): the client of the
 * assistant's routes. `available`, `provider` and `runtime` read `info`,
 * asked when the plugin starts and again after each task (the runtime is
 * known once an agent started). A task's id is drawn here, so `submit`
 * returns at once; its events come from `tasks/<id>/events` (SSE), each
 * once even when the stream reconnects (the server sends them from the
 * first), until `done` or `error`. A task whose context names a document
 * goes to that document's routes: the workspace's new-document form drafts
 * the document it created (P-121) from the home page. A task's `revert`
 * undoes its commit through its document's `revert` route. Besides the
 * contract, the page's own panels may ask for the document's change task under way
 * (`pending`) and follow it again (`attach`), after the page was reloaded.
 */
import { createServerClient } from '@presmium/host'
import type { ServerClient } from '@presmium/host'
import type { AgentClient, AgentEvent, AgentTask, AgentTaskKind, AgentTaskRequest, ReviewDecision, TaskRevertResult } from '@presmium/kernel'
import { shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import { ASSISTANT_ID } from '../domain/index.ts'
import type { AssistantInfo, PendingChange } from '../domain/index.ts'

export interface AssistantClient {
  client: AgentClient
  info: Readonly<ShallowRef<AssistantInfo | undefined>>
  refresh(): Promise<void>
  /** The page's document's change task under way or waiting for its review, when this member sent it or owns the workspace. */
  pending(): Promise<PendingChange | undefined>
  /** A task submitted before (by this page before it was reloaded, or another): its events from the first, its cancel and review. */
  attach(id: string): AgentTask
}

const terminal = (event: AgentEvent) => event.type === 'done' || event.type === 'error'

function taskId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** The server clients of the other documents the page's tasks went to (the home page drafting a new one). */
const others = new Map<string, ServerClient>()

/** The server client of the page's document, or of another document of the workspace. */
function serverOf(server: ServerClient, document: string | undefined): ServerClient {
  if (!document) return server
  let other = others.get(document)
  if (!other) others.set(document, other = createServerClient({ document }))
  return other
}

/** The events of a submitted task, from its SSE route. */
async function* follow(server: ServerClient, id: string, posted: Promise<Response>): AsyncIterable<AgentEvent> {
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
  const source = server.events(ASSISTANT_ID, `tasks/${encodeURIComponent(id)}/events`)
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
  /** A task of `target` whose submission is `posted` (an accepted one for a task submitted before). */
  const task = (target: ServerClient, id: string, posted: Promise<Response>): AgentTask => {
    const events: AsyncIterable<AgentEvent> = {
      async* [Symbol.asyncIterator]() {
        try {
          yield* follow(target, id, posted)
        } finally {
          void refresh()
        }
      },
    }
    const after = (path: string, body?: unknown) => posted.then(() => target.fetch(ASSISTANT_ID, `tasks/${encodeURIComponent(id)}/${path}`, {
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
      // The undo of the task's commit, through the assistant's `revert` route of the task's document.
      async revert(): Promise<TaskRevertResult> {
        await posted
        const response = await target.fetch(ASSISTANT_ID, 'revert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: id }) })
        const answer = await response.json().catch(() => ({})) as { ok?: boolean, revision?: string, conflicts?: string[], error?: string }
        if (answer.ok === true && typeof answer.revision === 'string') return { ok: true, revision: answer.revision }
        if (answer.ok === false && Array.isArray(answer.conflicts)) return { ok: false, conflicts: answer.conflicts }
        throw new Error(answer.error ?? `${response.status}`)
      },
    }
  }
  const client: AgentClient = {
    available: (kind: AgentTaskKind) => info.value?.kinds.includes(kind) ?? false,
    provider: () => info.value?.provider,
    runtime: () => info.value?.runtime,
    submit(request: AgentTaskRequest): AgentTask {
      const id = taskId()
      const target = serverOf(server, request.context.document || undefined)
      return task(target, id, target.fetch(ASSISTANT_ID, 'tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, id }) }))
    },
  }
  const pending = async (): Promise<PendingChange | undefined> => {
    try {
      const response = await server.fetch(ASSISTANT_ID, 'tasks')
      const body = await response.json().catch(() => ({})) as { change?: PendingChange }
      return response.ok ? body.change : undefined
    } catch {
      return undefined
    }
  }
  return { client, info, refresh, pending, attach: id => task(server, id, Promise.resolve(new Response(null, { status: 200 }))) }
}
