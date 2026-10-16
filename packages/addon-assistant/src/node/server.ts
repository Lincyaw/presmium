/**
 * The assistant's routes (design-v0.7 5.3, docs/architecture.md 4.8) under
 * `/__presmium/presmium.assistant/`:
 *
 * - `GET info`: the model's provider (known before any request: in LOCAL
 *   mode the runtime's, in SHARED mode the gateway's), the runtime's name
 *   once an agent started, the kinds of task this member may submit.
 * - `POST tasks`: a task (`AgentTaskRequest`, with the id the page drew);
 *   learners' questions run in `tutor` mode.
 * - `GET tasks/<id>/events`: its events (SSE, from the first), to the
 *   member who submitted it and owners.
 * - `POST tasks/<id>/cancel`.
 *
 * Each task opens one agent session: `cwd` the document directory, the MCP
 * token `MCP_ENDPOINT` issues for the member and mode (revoked when the
 * session closes). The agent's permission requests of a question are
 * refused, asking no one; those of other tasks go to `APPROVALS` with their
 * scope. The terminal event (`done` or `error`) comes once the session and
 * its tokens are closed.
 */
import { randomUUID } from 'node:crypto'
import { AGENT_RUNTIME, APPROVALS, deckLocale, errorMessage, eventStream, MCP_ENDPOINT } from '@presmium/kernel'
import type { AgentEvent, AgentMode, AgentTaskKind, AgentTaskRequest, ApprovalRequest, Member, RequestContext, ServerContext, ServerContribution } from '@presmium/kernel'
import { ASSISTANT_ID, ASSISTANT_MESSAGES, CHANGE_KINDS, runtimeChoice, taskRequestOf } from '../domain/index.ts'
import type { AssistantInfo } from '../domain/index.ts'

interface Task {
  id: string
  member: Member
  kind: AgentTaskKind
  events: AgentEvent[]
  ended: boolean
  wake: Set<() => void>
  abort: AbortController
}

/** How long an ended task's events stay for a page that reconnects. */
const KEPT_MS = 10 * 60_000

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

const isOwner = (member: Member) => member.roles.includes('owner')

let reported = false

export function assistantServer(ctx: ServerContext): ServerContribution {
  const t = ASSISTANT_MESSAGES[deckLocale(ctx.lang)]
  const tasks = new Map<string, Task>()

  // The provider in SHARED mode is the gateway's (its environment has the model access): kept once it
  // answers, asked again a minute after it did not.
  let gatewayProvider: string | undefined
  let asking: Promise<string | undefined> | undefined
  let failed = -Infinity
  const askGateway = async (gateway: NonNullable<ServerContext['gateway']>): Promise<string | undefined> => {
    try {
      const response = await fetch(`${gateway.url.replace(/\/+$/, '')}/${ASSISTANT_ID}/info`, { headers: { Authorization: `Bearer ${gateway.token}` } })
      const body = await response.json().catch(() => ({})) as { provider?: unknown }
      if (response.ok && typeof body.provider === 'string') return gatewayProvider = body.provider
      ctx.log.warn(`the gateway has no model access (${response.status}): the assistant is unavailable`)
    } catch (error) {
      ctx.log.warn(`the gateway did not say its model's provider: ${errorMessage(error)}`)
    }
    failed = Date.now()
    return undefined
  }
  const provider = async (): Promise<string | undefined> => {
    const runtime = ctx.service(AGENT_RUNTIME)
    if (!runtime) return undefined
    if (ctx.trust !== 'shared') return runtime.provider
    if (gatewayProvider || !ctx.gateway) return gatewayProvider
    if (!asking && Date.now() - failed >= 60_000) asking = askGateway(ctx.gateway).finally(() => asking = undefined)
    return asking
  }

  if (!ctx.service(AGENT_RUNTIME) && !reported) {
    reported = true
    const why = ctx.trust === 'shared' ? 'agent-host has no agent runtime' : (() => {
      const choice = runtimeChoice(name => ctx.secret(name), ctx.settings)
      return choice.kind === 'none' ? choice.missing : 'the bundled DeepSeek Harness is not installed'
    })()
    ctx.log.warn(`the assistant is unavailable: ${why}`)
  }

  /** The kinds this member may submit: questions for everyone while there is a runtime and a provider. */
  const kinds = async (_member: Member): Promise<AgentTaskKind[]> => ((await provider()) ? ['question'] : [])

  const push = (task: Task, event: AgentEvent) => {
    task.events.push(event)
    for (const wake of task.wake) wake()
  }
  const end = (task: Task, event: AgentEvent) => {
    push(task, event)
    task.ended = true
    for (const wake of task.wake) wake()
    setTimeout(() => tasks.delete(task.id), KEPT_MS).unref?.()
  }

  /**
   * The agent's permission requests: a question's are refused. Of a change task, a write within its
   * directory (`content`) was confirmed by sending the task (N-08); the rest go to the approvals, by scope.
   */
  const approve = async (task: Task, request: ApprovalRequest): Promise<boolean> => {
    if (task.kind === 'question') return false
    if (request.scope === 'content') return true
    const approvals = ctx.service(APPROVALS)
    if (!approvals) return false
    const asked: ApprovalRequest = { ...request, from: `agent:${task.id}`, member: task.member.id }
    push(task, { type: 'approval', id: randomUUID(), request: asked })
    return approvals.request(asked, task.abort.signal)
  }

  const run = async (task: Task, request: AgentTaskRequest, member: Member): Promise<void> => {
    const runtime = ctx.service(AGENT_RUNTIME)
    if (!runtime) return end(task, { type: 'error', message: t.noRuntime })
    const mode: AgentMode = request.kind === 'question' ? 'tutor' : 'author'
    const grant = ctx.service(MCP_ENDPOINT)?.issue(member, mode)
    let terminal: AgentEvent = { type: 'done' }
    let session: Awaited<ReturnType<typeof runtime.open>> | undefined
    try {
      session = await runtime.open({
        cwd: ctx.deckDir,
        mode,
        member,
        ...grant ? { mcp: { url: grant.url, token: grant.token } } : {},
        approve: asked => approve(task, asked),
      })
      if (!task.abort.signal.aborted) {
        for await (const event of session.prompt(request, task.abort.signal)) {
          // agent-host's transport passes its approval events on; this task announces its own (`approve`).
          if (event.type !== 'approval') push(task, event)
        }
      }
    } catch (error) {
      if (!task.abort.signal.aborted) terminal = { type: 'error', message: errorMessage(error) }
    } finally {
      grant?.revoke()
      await session?.close().catch((error: unknown) => ctx.log.warn(`the agent session did not close: ${errorMessage(error)}`))
      end(task, terminal)
    }
  }

  async function* follow(task: Task, signal: AbortSignal): AsyncIterable<{ data: AgentEvent }> {
    let next = 0
    for (;;) {
      while (next < task.events.length) yield { data: task.events[next++]! }
      if (task.ended || signal.aborted) return
      await new Promise<void>((resolve) => {
        const wake = () => {
          task.wake.delete(wake)
          resolve()
        }
        task.wake.add(wake)
        signal.addEventListener('abort', wake, { once: true })
      })
    }
  }

  /** A task the member may follow: theirs, or any for owners. */
  const taskOf = (id: string, member: Member): Task | Response => {
    const task = tasks.get(id)
    if (!task) return json({ error: 'no such task' }, 404)
    if (task.member.id !== member.id && !isOwner(member)) return json({ error: 'not your task' }, 403)
    return task
  }

  return {
    routes: {
      'info': {
        role: 'reader',
        async handle(_request, rc: RequestContext) {
          const runtime = ctx.service(AGENT_RUNTIME)
          const found = await provider()
          const info: AssistantInfo = { ...found ? { provider: found } : {}, ...found && runtime?.runtime ? { runtime: runtime.runtime } : {}, kinds: await kinds(rc.member) }
          return json(info)
        },
      },
      'tasks': {
        role: 'reader',
        async handle(request, rc: RequestContext) {
          if (request.method !== 'POST') return json({ error: 'POST a task' }, 405)
          const parsed = taskRequestOf(await request.json().catch(() => undefined))
          if (!parsed) return json({ error: 'a task request: { kind, prompt, context, id? }' }, 400)
          const allowed = await kinds(rc.member)
          if (!allowed.length) return json({ error: t.noRuntime }, 503)
          // Change tasks (annotations, chat, transcript) come with the change review (WP-81).
          if (CHANGE_KINDS.includes(parsed.request.kind) || !allowed.includes(parsed.request.kind)) return json({ error: t.noChanges }, 501)
          const id = parsed.id ?? randomUUID()
          if (tasks.has(id)) return json({ error: 'a task with this id exists' }, 409)
          const task: Task = { id, member: rc.member, kind: parsed.request.kind, events: [], ended: false, wake: new Set(), abort: new AbortController() }
          tasks.set(id, task)
          // The document is the one the request belongs to, whatever the page said.
          void run(task, { ...parsed.request, context: { ...parsed.request.context, document: rc.document } }, rc.member)
          return json({ id }, 201)
        },
      },
      'tasks/*': {
        role: 'reader',
        async handle(request, rc: RequestContext) {
          const [id = '', action] = rc.rest.split('/')
          const found = taskOf(id, rc.member)
          if (found instanceof Response) return found
          if (action === 'events' && request.method === 'GET') return eventStream(follow(found, request.signal), request.signal)
          if (action === 'cancel' && request.method === 'POST') {
            found.abort.abort()
            return new Response(null, { status: 204 })
          }
          return json({ error: 'GET tasks/<id>/events or POST tasks/<id>/cancel' }, 404)
        },
      },
    },
    close() {
      for (const task of tasks.values()) task.abort.abort()
    },
  }
}
