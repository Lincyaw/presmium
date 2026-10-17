/**
 * The assistant's routes (design-v0.7 5.3, docs/architecture.md 4.8) under
 * `/__presmium/presmium.assistant/`:
 *
 * - `GET info`: the model's provider (known before any request: in LOCAL
 *   mode the runtime's, in SHARED mode the gateway's), the runtime's name
 *   once an agent started, the kinds of task this member may submit.
 * - `POST tasks`: a task (`AgentTaskRequest`, with the id the page drew);
 *   learners' questions run in `tutor` mode; change tasks (editors and
 *   owners, where `REVISIONS` commits them) one per document at a time.
 *   `GET tasks`: the document's change task under way or waiting for its
 *   review, to the member who sent it and to owners (a page that was
 *   reloaded follows it again).
 * - `GET tasks/<id>/events`: its events (SSE, from the first), to the
 *   member who submitted it and owners; `POST tasks/<id>/cancel`;
 *   `POST tasks/<id>/review`: the decision on a change task's review;
 *   `POST tasks/<id>/restore` (`{ step }`): back to before a step of it.
 * - `POST revert` (`{ task }`): undoes the commit of a change task of this
 *   document; not while the document has a change task.
 * - `GET excerpt?file=&start=&end=`: lines of a source file of the
 *   document, for an annotation.
 *
 * On the workspace's home page (`presmium serve` mounts the operator's
 * plugins there too) only `info` answers: the home page is not a document,
 * and the tasks it sends (drafting a new document) go to their document's
 * routes.
 *
 * Each task opens one agent session (`cwd` the document directory, or the
 * review's root for a change task), with the MCP token `MCP_ENDPOINT`
 * issues for the member and mode (revoked when the session closes). The
 * agent's permission requests of a question are refused, asking no one;
 * those of a change task within its directory were confirmed by sending it,
 * the others go to `APPROVALS` with their scope. The terminal event (`done`
 * or `error`) comes once the session and its tokens are closed.
 *
 * A change task's review is `CHANGE_REVIEW`'s, except under the bundled
 * DeepSeek Harness (always in SHARED mode): its writes fault a deltabox-lite
 * 0.1.1 review (a file it unlinks in the staging directory it made in the
 * session, docs/architecture.md 9.5), so its tasks use the assistant's git
 * review. A git review a crashed server left is rolled back when the
 * document is served again.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AGENT_RUNTIME, APPROVALS, CHANGE_REVIEW, deckLocale, errorMessage, eventStream, isRecord, MCP_ENDPOINT, REVISIONS } from '@presmium/kernel'
import type { AgentEvent, AgentMode, AgentSession, AgentTaskKind, AgentTaskRequest, ApprovalRequest, Member, RequestContext, ServerContext, ServerContribution } from '@presmium/kernel'
import { ASSISTANT_ID, ASSISTANT_MESSAGES, CHANGE_KINDS, restoreStepOf, reviewDecisionOf, runtimeChoice, taskRequestOf } from '../domain/index.ts'
import type { AssistantInfo, PendingChange, RevertAnswer } from '../domain/index.ts'
import { runChange } from './changes.ts'
import { recoverGitReview } from './git-review.ts'
import type { AgentApproval } from './permissions.ts'
import { Tasks } from './tasks.ts'
import type { Task } from './tasks.ts'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

const isOwner = (member: Member) => member.roles.includes('owner')
const mayEdit = (member: Member) => member.roles.some(role => role === 'editor' || role === 'owner')

/** Whether `path` is `dir` or below it. */
function within(path: string, dir: string): boolean {
  const rel = relative(dir, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** The deck entry of a single-deck repository (the workspace's `DECK_ENTRY`). */
const DECK_ENTRY = 'lecture.md'

/** An excerpt is at most this many lines and characters. */
const EXCERPT_LINES = 60
const EXCERPT_CHARS = 4000

let reported = false
let gitReviewed = false

/** A value of `changing` while a commit of the document is being undone. */
const REVERTING = 'revert'

export function assistantServer(ctx: ServerContext): ServerContribution {
  const t = ASSISTANT_MESSAGES[deckLocale(ctx.lang)]
  const tasks = new Tasks()
  /** The change task of each document, while it runs or waits for its review; `REVERTING` while a commit is undone. */
  const changing = new Map<string, string>()
  /**
   * The workspace's home page, which presmium serve mounts at the workspace
   * root: not a document. The root is a document only in a single-deck
   * repository (LOCAL, its deck entry there); where no change is committed
   * (presmium dev) the deck directory is always a document.
   */
  const home = resolve(ctx.deckDir) === resolve(ctx.workspaceRoot)
    && (ctx.trust === 'shared' || (Boolean(ctx.service(REVISIONS)) && !existsSync(join(ctx.deckDir, DECK_ENTRY))))

  // A change task's git review that a crashed server left: the directory as the task found it.
  if (!home) {
    recoverGitReview({
      workspaceRoot: ctx.workspaceRoot,
      deckDir: ctx.deckDir,
      onRestore: paths => ctx.log.warn(`the git directory as a change task found it, put back: ${paths.join(', ')}`),
    }).then((found) => {
      if (found) ctx.log.warn(`task ${found.task} was waiting for its review when the server ended: rolled back (${found.paths.join(', ') || 'no change'})`)
    }, (error: unknown) => ctx.log.warn(`the change task a crashed server left was not rolled back: ${errorMessage(error)}`))
  }

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

  /** Whether the agent is the bundled DeepSeek Harness: agent-host runs only it (SHARED); in LOCAL mode, unless replaced. */
  const bundled = ctx.trust === 'shared' || runtimeChoice(name => ctx.secret(name), ctx.settings).kind === 'bundled'
  /** The change tasks' review service: none (the assistant's git review) under the bundled DeepSeek Harness. */
  const reviews = () => (bundled ? undefined : ctx.service(CHANGE_REVIEW))
  if (bundled && ctx.service(CHANGE_REVIEW) && !gitReviewed) {
    gitReviewed = true
    ctx.log.info(`change tasks use the assistant's git review, not ${ctx.service(CHANGE_REVIEW)!.engine}'s: the bundled DeepSeek Harness's writes fault a deltabox-lite 0.1.1 review`)
  }

  if (!ctx.service(AGENT_RUNTIME) && !reported) {
    reported = true
    const why = ctx.trust === 'shared' ? 'agent-host has no agent runtime' : (() => {
      const choice = runtimeChoice(name => ctx.secret(name), ctx.settings)
      return choice.kind === 'none' ? choice.missing : 'the bundled DeepSeek Harness is not installed'
    })()
    ctx.log.warn(`the assistant is unavailable: ${why}`)
  }

  /**
   * The kinds this member may submit: questions for everyone while there is a runtime and a provider;
   * change tasks for editors and owners where the workspace commits them (`REVISIONS`, presmium serve).
   */
  const kinds = async (member: Member): Promise<AgentTaskKind[]> => {
    if (!(await provider())) return []
    const changes = mayEdit(member) && ctx.service(REVISIONS) ? CHANGE_KINDS : []
    // The home page's tasks go to their documents: drafting a new one.
    return home ? changes : ['question', ...changes]
  }

  /** An approval asked for a task: announced to its page, answered by the members its scope names. */
  const ask = async (task: Task, request: ApprovalRequest): Promise<boolean> => {
    const approvals = ctx.service(APPROVALS)
    if (!approvals) return false
    const asked: ApprovalRequest = { ...request, from: `agent:${task.id}`, member: task.member.id }
    tasks.push(task, { type: 'approval', id: randomUUID(), request: asked })
    return approvals.request(asked, task.abort.signal)
  }

  /**
   * The agent's permission requests: a question's are refused. Of a change task, a write within its
   * directory (`content`) was confirmed by sending the task (N-08); the rest go to the approvals, by
   * scope, and a write outside it that an owner allowed is committed with the task.
   */
  const approve = async (task: Task, request: AgentApproval): Promise<boolean> => {
    if (task.kind === 'question') return false
    const { path, ...rest } = request
    if (rest.scope === 'content') return true
    const allowed = await ask(task, rest)
    if (allowed && rest.kind === 'write' && typeof path === 'string') (task.allowed ??= new Set()).add(path)
    return allowed
  }

  /** The task's agent session in `cwd`: its events (an agent's failure throws), then its messages; closed, with its token, before it resolves. */
  const session = async (task: Task, cwd: string, request: AgentTaskRequest, onEvent: (event: AgentEvent) => Promise<void> | void): Promise<string[]> => {
    const runtime = ctx.service(AGENT_RUNTIME)
    if (!runtime) throw new Error(t.noRuntime)
    const mode: AgentMode = request.kind === 'question' ? 'tutor' : 'author'
    const grant = ctx.service(MCP_ENDPOINT)?.issue(task.member, mode)
    const messages: string[] = []
    let opened: AgentSession | undefined
    try {
      opened = await runtime.open({
        cwd,
        mode,
        member: task.member,
        ...grant ? { mcp: { url: grant.url, token: grant.token } } : {},
        approve: asked => approve(task, asked),
      })
      if (!task.abort.signal.aborted) {
        for await (const event of opened.prompt(request, task.abort.signal)) {
          // agent-host's transport passes its approval events on; this task announces its own (`ask`).
          if (event.type === 'approval' || event.type === 'done') continue
          if (event.type === 'error') throw new Error(event.message)
          if (event.type === 'message') messages.push(event.text)
          await onEvent(event)
        }
      }
    } catch (error) {
      if (!task.abort.signal.aborted) throw error
    } finally {
      grant?.revoke()
      await opened?.close().catch((error: unknown) => ctx.log.warn(`the agent session did not close: ${errorMessage(error)}`))
    }
    return messages
  }

  const question = async (task: Task, request: AgentTaskRequest): Promise<void> => {
    let terminal: AgentEvent = { type: 'done' }
    try {
      await session(task, ctx.deckDir, request, event => tasks.push(task, event))
    } catch (error) {
      terminal = { type: 'error', message: errorMessage(error) }
    }
    tasks.end(task, terminal)
  }

  /** A task the member may follow: theirs, or any for owners. */
  const taskOf = (id: string, member: Member): Task | Response => {
    const task = tasks.get(id)
    if (!task) return json({ error: 'no such task' }, 404)
    if (task.member.id !== member.id && !isOwner(member)) return json({ error: 'not your task' }, 403)
    return task
  }

  /** A file of the document directory, by its path relative to it (its real path inside it). */
  const documentFile = (file: string): string | undefined => {
    const deck = realpathSync(ctx.deckDir)
    const path = resolve(deck, file)
    if (!within(path, deck) || !existsSync(path)) return undefined
    const real = realpathSync(path)
    return within(real, deck) && statSync(real).isFile() ? real : undefined
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
          if (request.method === 'GET') {
            // The change task under way, to its sender and owners: a reloaded page follows it again.
            const task = tasks.get(changing.get(rc.document) ?? '')
            const visible = task && !task.ended && task.request && (task.member.id === rc.member.id || isOwner(rc.member))
            const change: PendingChange | undefined = visible
              ? {
                  id: task.id,
                  kind: task.kind,
                  prompt: task.request!.prompt,
                  ...task.request!.annotations ? { annotations: task.request!.annotations } : {},
                  ...task.request!.track ? { track: task.request!.track } : {},
                  member: { id: task.member.id, name: task.member.name },
                }
              : undefined
            return json(change ? { change } : {})
          }
          if (request.method !== 'POST') return json({ error: 'POST a task' }, 405)
          if (home) return json({ error: t.noDocument }, 400)
          const parsed = taskRequestOf(await request.json().catch(() => undefined))
          if (!parsed) return json({ error: 'a task request: { kind, prompt, context, annotations? (annotations), track? (transcript), id? }' }, 400)
          const { kind } = parsed.request
          const allowed = await kinds(rc.member)
          if (!allowed.length) return json({ error: t.noRuntime }, 503)
          if (CHANGE_KINDS.includes(kind) && !ctx.service(REVISIONS)) return json({ error: t.noChanges }, 501)
          if (!allowed.includes(kind)) return json({ error: t.notAllowed }, 403)
          const id = parsed.id ?? randomUUID()
          if (tasks.has(id)) return json({ error: 'a task with this id exists' }, 409)
          // The document is the one the request belongs to, whatever the page said.
          const document = rc.document
          const taskRequest: AgentTaskRequest = { ...parsed.request, context: { ...parsed.request.context, document } }
          if (kind === 'question') {
            const task = tasks.create(id, rc.member, kind, document)
            task.run = question(task, taskRequest)
            return json({ id }, 201)
          }
          // One change task per document: running, or waiting for its review; none while a commit is undone.
          if (changing.has(document)) return json({ error: changing.get(document) === REVERTING ? t.reverting : t.busy }, 409)
          if (kind === 'transcript' && !documentFile(join('lectures', taskRequest.track!, 'track.json'))) return json({ error: t.noTrack(taskRequest.track!) }, 400)
          const task = tasks.create(id, rc.member, kind, document, taskRequest)
          changing.set(document, id)
          const service = reviews()
          task.run = runChange({ ctx, tasks, ...service ? { reviews: service } : {}, agent: session, ask }, task, taskRequest).finally(() => {
            if (changing.get(document) === id) changing.delete(document)
          })
          return json({ id }, 201)
        },
      },
      'tasks/*': {
        role: 'reader',
        async handle(request, rc: RequestContext) {
          const [id = '', action] = rc.rest.split('/')
          const found = taskOf(id, rc.member)
          if (found instanceof Response) return found
          if (action === 'events' && request.method === 'GET') return eventStream(tasks.follow(found, request.signal), request.signal)
          if (action === 'cancel' && request.method === 'POST') {
            found.abort.abort()
            return new Response(null, { status: 204 })
          }
          if (action === 'review' && request.method === 'POST') {
            const decision = reviewDecisionOf(await request.json().catch(() => undefined))
            if (!decision) return json({ error: 'a review decision: { accept: true, reject?: string[] } or { accept: false }' }, 400)
            if (!found.decide) return json({ error: t.notReviewing }, 409)
            found.decide(decision)
            return new Response(null, { status: 204 })
          }
          if (action === 'restore' && request.method === 'POST') {
            const step = restoreStepOf(await request.json().catch(() => undefined))
            if (!step) return json({ error: 'back to before a step: { step }' }, 400)
            if (!found.decide) return json({ error: t.notReviewing }, 409)
            if (!found.restore) return json({ error: t.noRestore }, 501)
            try {
              await found.restore(step)
            } catch (error) {
              return json({ error: errorMessage(error) }, 409)
            }
            return new Response(null, { status: 204 })
          }
          return json({ error: 'GET tasks/<id>/events, POST tasks/<id>/cancel, tasks/<id>/review or tasks/<id>/restore' }, 404)
        },
      },
      'revert': {
        role: 'editor',
        async handle(request, rc: RequestContext) {
          if (request.method !== 'POST') return json({ error: 'POST { task }' }, 405)
          const body: unknown = await request.json().catch(() => undefined)
          const task = isRecord(body) && typeof body.task === 'string' ? body.task : undefined
          const revisions = ctx.service(REVISIONS)
          if (!task) return json({ error: 'POST { task }' }, 400)
          if (home) return json({ error: t.noDocument }, 400)
          if (!revisions) return json({ error: t.noChanges }, 501)
          // Not while a change task of the document runs or waits: its review would restore files over the undo.
          const document = rc.document
          if (changing.has(document)) return json({ error: changing.get(document) === REVERTING ? t.reverting : t.busy }, 409)
          changing.set(document, REVERTING)
          try {
            const revision = (await revisions.history({ task, ...document ? { document } : {} })).find(found => !found.revertedBy)
            if (!revision) return json({ error: `no commit of task ${task} to undo in this document` }, 404)
            const result = await revisions.revert(revision.id, rc.member)
            const answer: RevertAnswer = result.ok ? { ok: true, revision: result.revision.id } : { ok: false, conflicts: result.conflicts }
            return json(answer, result.ok ? 200 : 409)
          } finally {
            if (changing.get(document) === REVERTING) changing.delete(document)
          }
        },
      },
      'excerpt': {
        role: 'editor',
        async handle(request) {
          if (home) return json({ error: t.noDocument }, 400)
          const params = new URL(request.url).searchParams
          const start = Number(params.get('start'))
          const end = Number(params.get('end') ?? start)
          const file = documentFile(params.get('file') ?? '')
          if (!file || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return json({ error: 'GET excerpt?file=<path in the document>&start=<line>&end=<line>' }, 400)
          const lines = readFileSync(file, 'utf8').split('\n').slice(start - 1, Math.min(end, start + EXCERPT_LINES - 1))
          return json({ text: lines.join('\n').slice(0, EXCERPT_CHARS) })
        },
      },
    },
    close() {
      // Change tasks under way or waiting for their review are rolled back.
      return tasks.close()
    },
  }
}
