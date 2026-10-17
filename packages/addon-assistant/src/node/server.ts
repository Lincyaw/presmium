/**
 * The assistant's routes (design-v0.7 5.3, docs/architecture.md 4.8) under
 * `/__presmium/presmium.assistant/`:
 *
 * - `GET info`: the model's provider (the runtime's, known before any
 *   request), where it comes from, the runtime's name once an agent
 *   started, what to set while it is unavailable, the kinds of task this
 *   member may submit.
 * - `GET settings`, `POST settings`, `DELETE settings` (owners): the model
 *   settings of the page (P-111): which are in effect and where from, and
 *   those the page saved, without the key (only whether one is set);
 *   saving writes them to the user's configuration directory
 *   (./model-settings.ts), and the next agent session uses them. Saved
 *   without a key, they keep the saved key only for the same service and
 *   address; otherwise a key is required (400).
 * - `POST tasks`: a change task (`AgentTaskRequest`, with the id the page
 *   drew), for editors and owners where `REVISIONS` commits them, one per
 *   document at a time. `GET tasks`: the document's change task under way
 *   or waiting for its review, to the member who sent it and to owners (a
 *   page that was reloaded follows it again).
 * - `GET tasks/<id>/events`: its events (SSE, from the first), to the
 *   member who submitted it and owners; `POST tasks/<id>/cancel`;
 *   `POST tasks/<id>/review`: the decision on a change task's review;
 *   `POST tasks/<id>/restore` (`{ step }`): back to before a step of it.
 * - `POST revert` (`{ task }`): undoes the commit of a change task of this
 *   document; not while the document has a change task.
 * - `GET excerpt?file=&start=&end=`: lines of a source file of the
 *   document, for an annotation.
 *
 * Readers' questions are no route of the server's: the page asks the
 * reader's own model (P-112, `ASK`, ../client/ask.ts).
 *
 * On the workspace's home page (`presmium serve` mounts the operator's
 * plugins there too) only `info` and `settings` answer: the home page is not
 * a document, and the tasks it sends (drafting a new document) go to their
 * document's routes.
 *
 * Each task opens one agent session in its review's root, with the MCP
 * token `MCP_ENDPOINT` issues for the member (revoked when the session
 * closes). The agent's permission requests within its directory were
 * confirmed by sending the task, the others go to `APPROVALS` with their
 * scope. The terminal event (`done` or `error`) comes once the session and
 * its tokens are closed.
 *
 * A change task holds its document's lock (`DOCUMENT_LOCKS`, F-09) while it
 * runs and waits for its review, and an undo holds it while it runs: where
 * the workspace provides the locks (`presmium serve`, `presmium dev`) its
 * document operations, its history's undo and the source editor's saves
 * take them too, so none changes the document under the task; elsewhere the
 * assistant keeps its own.
 *
 * A change task's review is `CHANGE_REVIEW`'s, except under the bundled
 * DeepSeek Harness: its writes fault a deltabox-lite
 * 0.1.1 review (a file it unlinks in the staging directory it made in the
 * session, docs/architecture.md 9.5), so its tasks use the assistant's git
 * review. A git review a crashed server left is rolled back when the
 * document is served again.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AGENT_RUNTIME, APPROVALS, CHANGE_REVIEW, deckLocale, DOCUMENT_FILES, DOCUMENT_LOCKS, errorMessage, eventStream, isRecord, json, MCP_ENDPOINT, problem, REVISIONS } from '@presmium/kernel'
import type { AgentEvent, AgentSession, AgentTaskKind, AgentTaskRequest, ApprovalRequest, Member, RequestContext, ServerContext, ServerContribution } from '@presmium/kernel'
import { ASSISTANT_MESSAGES, CHANGE_KINDS, modelSettingsOf, modelSettingsProblem, restoreStepOf, reviewDecisionOf, sameService, taskRequestOf } from '../domain/index.ts'
import type { AssistantInfo, ModelSettingsView, PendingChange, RevertAnswer } from '../domain/index.ts'
import { runChange } from './changes.ts'
import { recoverGitReview } from './git-review.ts'
import { readModelSettings, removeModelSettings, settingsFile, writeModelSettings } from './model-settings.ts'
import { inside } from './paths.ts'
import type { AgentApproval } from './permissions.ts'
import { currentChoice } from './services.ts'
import { Tasks } from './tasks.ts'
import type { Task } from './tasks.ts'

const isOwner = (member: Member) => member.roles.includes('owner')
const mayEdit = (member: Member) => member.roles.some(role => role === 'editor' || role === 'owner')

/** The deck entry of a single-deck repository (the workspace's `DECK_ENTRY`). */
const DECK_ENTRY = 'lecture.md'

/** An excerpt is at most this many lines and characters. */
const EXCERPT_LINES = 60
const EXCERPT_CHARS = 4000

let gitReviewed = false

/** The model settings a page sends: a few short fields. */
const SETTINGS_BODY = 16 * 1024

/** The prefix of an agent task's lock holder (`agent:<task id>`). */
const AGENT_HOLDER = 'agent:'

export function assistantServer(ctx: ServerContext): ServerContribution {
  const t = ASSISTANT_MESSAGES[deckLocale(ctx.lang)]
  const tasks = new Tasks()
  /**
   * The workspace's home page, which presmium serve mounts at the workspace
   * root: not a document. The root is a document only in a single-deck
   * repository, or a deck of presmium dev at its repository's root (its deck
   * entry there); where no change is committed the deck directory is always
   * a document.
   */
  const home = resolve(ctx.deckDir) === resolve(ctx.workspaceRoot)
    && Boolean(ctx.service(REVISIONS)) && !existsSync(join(ctx.deckDir, DECK_ENTRY))

  /** The documents' locks: the workspace's where it provides them (`DOCUMENT_LOCKS`), else these. */
  const own = new Map<string, string>()
  const claim = (document: string, holder: string): (() => void) | undefined => {
    const locks = ctx.service(DOCUMENT_LOCKS)
    if (locks) return locks.claim(document, holder)
    if (own.has(document)) return undefined
    own.set(document, holder)
    return () => {
      if (own.get(document) === holder) own.delete(document)
    }
  }
  const holderOf = (document: string) => ctx.service(DOCUMENT_LOCKS)?.holder(document) ?? own.get(document)
  /** Why the document takes no change now, by who holds its lock. */
  const refusal = (document: string) => {
    const holder = holderOf(document) ?? ''
    return holder.startsWith(AGENT_HOLDER) ? t.busy : holder.endsWith(':revert') ? t.reverting : t.operating
  }

  // A change task's git review that a crashed server left: the directory as the task found it.
  if (!home) {
    recoverGitReview({
      workspaceRoot: ctx.workspaceRoot,
      deckDir: ctx.deckDir,
      ...ctx.service(DOCUMENT_FILES) ? { files: ctx.service(DOCUMENT_FILES)! } : {},
      onRestore: paths => ctx.log.warn(`the git directory as a change task found it, put back: ${paths.join(', ')}`),
    }).then((found) => {
      if (found) ctx.log.warn(`task ${found.task} was waiting for its review when the server ended: rolled back (${found.paths.join(', ') || 'no change'})`)
    }, (error: unknown) => ctx.log.warn(`the change task a crashed server left was not rolled back: ${errorMessage(error)}`))
  }

  /** The model's provider: the runtime's, as the operator's settings are now; none without a runtime. */
  const provider = (): string | undefined => ctx.service(AGENT_RUNTIME)?.provider

  /**
   * The change tasks' review service: none (the assistant's git review) under the bundled DeepSeek
   * Harness, which the operator may choose in the page at any time: asked for each task.
   */
  const reviews = () => {
    const service = ctx.service(CHANGE_REVIEW)
    if (!service || currentChoice(ctx).kind !== 'bundled') return service
    if (!gitReviewed) {
      gitReviewed = true
      ctx.log.info(`change tasks use the assistant's git review, not ${service.engine}'s: the bundled DeepSeek Harness's writes fault a deltabox-lite 0.1.1 review`)
    }
    return undefined
  }

  /** The kinds this member may submit: change tasks, for editors and owners, while there is a runtime and the workspace commits them (`REVISIONS`: a document in a git repository). */
  const kinds = (member: Member): AgentTaskKind[] => (provider() && mayEdit(member) && ctx.service(REVISIONS) ? CHANGE_KINDS : [])

  /** The model settings as the page shows them: in effect and saved, never the key. */
  const settingsView = (): ModelSettingsView => {
    const file = settingsFile(name => ctx.secret(name))
    const { key, ...saved } = readModelSettings(file) ?? {}
    const choice = currentChoice(ctx)
    const found = provider()
    return {
      source: choice.kind === 'none' ? 'none' : choice.source,
      ...found ? { provider: found } : {},
      ...choice.kind !== 'none' && choice.from.length ? { from: choice.from } : {},
      ...choice.kind === 'none' ? { missing: choice.missing } : {},
      saved: { ...saved, key: Boolean(key) },
      file,
    }
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
   * The agent's permission requests: a write within the task's directory (`content`) was confirmed by
   * sending the task (N-08); the rest go to the approvals, by scope, and a write outside it that an
   * owner allowed is committed with the task.
   */
  const approve = async (task: Task, request: AgentApproval): Promise<boolean> => {
    const { path, ...rest } = request
    if (rest.scope === 'content') return true
    const allowed = await ask(task, rest)
    if (allowed && rest.kind === 'write' && typeof path === 'string') (task.allowed ??= new Set()).add(path)
    return allowed
  }

  /** The task's agent session in `cwd`: its events (an agent's failure throws), then its messages; closed, with its token, before it resolves. */
  const session = async (task: Task, cwd: string, request: AgentTaskRequest, onEvent: (event: AgentEvent) => Promise<void> | void): Promise<string[]> => {
    const runtime = ctx.service(AGENT_RUNTIME)
    if (!runtime?.provider) throw new Error(t.noRuntime)
    const grant = ctx.service(MCP_ENDPOINT)?.issue(task.member, 'author')
    const messages: string[] = []
    let opened: AgentSession | undefined
    try {
      opened = await runtime.open({
        cwd,
        member: task.member,
        ...grant ? { mcp: { url: grant.url, token: grant.token } } : {},
        approve: asked => approve(task, asked),
      })
      if (!task.abort.signal.aborted) {
        for await (const event of opened.prompt(request, task.abort.signal)) {
          // A transport's approval events are not passed on; this task announces its own (`ask`).
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

  /** A task the member may follow: theirs, or any for owners. */
  const taskOf = (id: string, member: Member): Task | Response => {
    const task = tasks.get(id)
    if (!task) return problem(404, 'no such task')
    if (task.member.id !== member.id && !isOwner(member)) return problem(403, 'not your task')
    return task
  }

  /** A file of the document directory, by its path relative to it (its real path inside it). */
  const documentFile = (file: string): string | undefined => {
    const deck = realpathSync(ctx.deckDir)
    const path = resolve(deck, file)
    if (!inside(path, deck) || !existsSync(path)) return undefined
    const real = realpathSync(path)
    return inside(real, deck) && statSync(real).isFile() ? real : undefined
  }

  return {
    routes: {
      'info': {
        role: 'reader',
        async handle(_request, rc: RequestContext) {
          const runtime = ctx.service(AGENT_RUNTIME)
          const found = provider()
          const choice = currentChoice(ctx)
          const info: AssistantInfo = {
            ...found ? { provider: found, ...choice.kind !== 'none' ? { source: choice.source } : {} } : {},
            ...found && runtime?.runtime ? { runtime: runtime.runtime } : {},
            ...!found ? { missing: choice.kind === 'none' ? choice.missing : { code: 'harness' } } : {},
            kinds: kinds(rc.member),
            changes: Boolean(ctx.service(REVISIONS)),
            ...home ? { home: true } : {},
          }
          return json(info)
        },
      },
      'settings': {
        role: 'owner',
        maxBody: SETTINGS_BODY,
        async handle(request) {
          const file = settingsFile(name => ctx.secret(name))
          if (request.method === 'DELETE') {
            removeModelSettings(file)
            return json(settingsView())
          }
          if (request.method === 'POST') {
            const given = modelSettingsOf(await request.json().catch(() => undefined))
            if (!given) return problem(400, 'model settings: { provider?, url?, key?, model? }')
            // No key given: the one saved stays (the page never has it), only for the same service and address,
            // so a key never goes to another service; otherwise a key is needed.
            const saved = readModelSettings(file)
            const kept = given.key || !saved?.key || !sameService(saved, given) ? undefined : saved.key
            if (!given.key && !kept) return problem(400, saved?.key ? 'the service or its address changed: give its key (the saved key is not sent to another service)' : 'model settings: the key is required')
            const settings = { ...given, ...kept ? { key: kept } : {} }
            const why = modelSettingsProblem(settings)
            if (why) return problem(400, why)
            try {
              writeModelSettings(file, settings)
            } catch (error) {
              return problem(500, `the model settings were not saved: ${errorMessage(error)}`)
            }
            ctx.log.info(`the model settings saved in the page (${file}) apply to the next agent session`)
            return json(settingsView())
          }
          if (request.method !== 'GET') return problem(405, 'GET, POST or DELETE')
          return json(settingsView())
        },
      },
      'tasks': {
        role: 'reader',
        async handle(request, rc: RequestContext) {
          if (request.method === 'GET') {
            // The change task under way, to its sender and owners: a reloaded page follows it again.
            const holder = holderOf(rc.document)
            const task = holder?.startsWith(AGENT_HOLDER) ? tasks.get(holder.slice(AGENT_HOLDER.length)) : undefined
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
          if (request.method !== 'POST') return problem(405, 'POST a task')
          if (home) return problem(400, t.noDocument)
          const parsed = taskRequestOf(await request.json().catch(() => undefined))
          if (!parsed) return problem(400, 'a task request: { kind, prompt, context, annotations? (annotations), track? (transcript), id? }')
          const { kind } = parsed.request
          if (!provider()) return problem(503, t.noRuntime)
          if (!ctx.service(REVISIONS)) return problem(501, t.noChanges)
          if (!kinds(rc.member).includes(kind)) return problem(403, t.notAllowed)
          const id = parsed.id ?? randomUUID()
          if (tasks.has(id)) return problem(409, 'a task with this id exists')
          // The document is the one the request belongs to, whatever the page said.
          const document = rc.document
          const taskRequest: AgentTaskRequest = { ...parsed.request, context: { ...parsed.request.context, document } }
          if (kind === 'transcript' && !documentFile(join('lectures', taskRequest.track!, 'track.json'))) return problem(400, t.noTrack(taskRequest.track!))
          // One change task per document, running or waiting for its review; none while the document is operated on or a commit undone.
          const release = claim(document, `${AGENT_HOLDER}${id}`)
          if (!release) return problem(409, refusal(document))
          const task = tasks.create(id, rc.member, kind, document, taskRequest)
          const service = reviews()
          task.run = runChange({ ctx, tasks, ...service ? { reviews: service } : {}, agent: session, ask }, task, taskRequest).finally(release)
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
            if (!decision) return problem(400, 'a review decision: { accept: true, reject?: string[] } or { accept: false }')
            if (!found.decide) return problem(409, t.notReviewing)
            found.decide(decision)
            return new Response(null, { status: 204 })
          }
          if (action === 'restore' && request.method === 'POST') {
            const step = restoreStepOf(await request.json().catch(() => undefined))
            if (!step) return problem(400, 'back to before a step: { step }')
            if (!found.decide) return problem(409, t.notReviewing)
            if (!found.restore) return problem(501, t.noRestore)
            try {
              await found.restore(step)
            } catch (error) {
              return problem(409, errorMessage(error))
            }
            return new Response(null, { status: 204 })
          }
          return problem(404, 'GET tasks/<id>/events, POST tasks/<id>/cancel, tasks/<id>/review or tasks/<id>/restore')
        },
      },
      'revert': {
        role: 'editor',
        async handle(request, rc: RequestContext) {
          if (request.method !== 'POST') return problem(405, 'POST { task }')
          const body: unknown = await request.json().catch(() => undefined)
          const task = isRecord(body) && typeof body.task === 'string' ? body.task : undefined
          const revisions = ctx.service(REVISIONS)
          if (!task) return problem(400, 'POST { task }')
          if (home) return problem(400, t.noDocument)
          if (!revisions) return problem(501, t.noChanges)
          // Not while a change task of the document runs or waits: its review would restore files over the undo.
          const document = rc.document
          const release = claim(document, 'assistant:revert')
          if (!release) return problem(409, refusal(document))
          try {
            const revision = (await revisions.history({ task, ...document ? { document } : {} })).find(found => !found.revertedBy)
            if (!revision) return problem(404, `no commit of task ${task} to undo in this document`)
            const result = await revisions.revert(revision.id, rc.member)
            const answer: RevertAnswer = result.ok ? { ok: true, revision: result.revision.id } : { ok: false, conflicts: result.conflicts }
            return json(answer, result.ok ? 200 : 409)
          } finally {
            release()
          }
        },
      },
      'excerpt': {
        role: 'editor',
        async handle(request) {
          if (home) return problem(400, t.noDocument)
          const params = new URL(request.url).searchParams
          const start = Number(params.get('start'))
          const end = Number(params.get('end') ?? start)
          const file = documentFile(params.get('file') ?? '')
          if (!file || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return problem(400, 'GET excerpt?file=<path in the document>&start=<line>&end=<line>')
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
