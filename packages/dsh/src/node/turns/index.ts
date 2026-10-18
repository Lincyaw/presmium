/**
 * The `presmium-turns` row (docs/design-dsh.md 6.5, WP-96c): a session's
 * turns, its review and its commits. The review itself is the workspace
 * service's (`review` routes, @presmium/workspace's review/), which keeps it
 * across restarts of this host; this row tells the service what the session
 * does:
 *
 * - Before the session's first call of a tool that writes files (the file
 *   tools, the shell), around its dispatch (`tools/execute`, after the
 *   approvals), the row opens the document's review for the session
 *   (`review/open`): the service takes the document's lock for
 *   `agent:<session>` (the editor's saves get 409 until the review ends). A
 *   lock another holds fails the call, with the reason, and nothing is
 *   written. Later calls and turns find the session's review open. A
 *   subagent's writes (its session's header: `origin: subagent`,
 *   `parentSession`) join the review of the session that delegated.
 * - After each such call, a checkpoint (`review/step` with the call's
 *   label); when a turn that wrote ends (its `turn/end` session event), the
 *   end of the turn (`review/step` with `end`): the service ends a review
 *   with no change, and with `review: auto` commits it.
 * - The author accepts (one commit, with `Presmium-Session` and
 *   `Presmium-Turn`), rejects or goes back to a checkpoint in the workbench,
 *   through the service.
 * - When the author undoes a session's commit, the service says so
 *   (`review/events`); the row injects a message that names its origin
 *   (`source.kind: presmium`) into the session, which the model reads at its
 *   next step. A session whose agent is not live gets it once it is.
 *
 * Presmium does not use DeepSeek Harness's change summaries
 * (`workspace/changes`), which live in the host's memory only.
 */
import { randomUUID } from 'node:crypto'
import type { DshAgent, DshContext, DshToolExecution } from '../dsh.ts'
import type { PresmiumSession } from '../service.ts'

export const name = 'presmium-turns'
export const inject = ['presmium', 'tools']

/** The tools that write files: DeepSeek Harness's file tools and shells. */
export const WRITES = new Set(['write', 'edit', 'str_replace_editor', 'bash', 'pwsh', 'terminal_send'])

const REVIEW = '/__presmium/presmium.workspace/review'
/** How long the row waits before following the service's review events again. */
const RETRY_MS = 2000

/** An agent as this row uses it: its session, and model-facing context it can be given (`Agent.inject`). */
interface LiveAgent extends DshAgent {
  inject(message: unknown): void
}

/** A session event (`session/event`), as far as the row reads it. */
interface SessionEvent {
  type: string
  data?: { turn?: number }
}

/** The service's event of a session's commit undone (`review/events`). */
interface Reverted {
  type: 'reverted'
  session: string
  turns?: string
  revision: string
  subject: string
  revertedBy: string
  files: string[]
}

/** What the row knows of a session: its turn now, and whether that turn wrote (its review is open). */
interface Turns {
  turn?: number
  document?: PresmiumSession
  wrote: boolean
}

/** A label of a call for its checkpoint: the tool and the file or the command. */
function labelOf(exec: Readonly<DshToolExecution>): string {
  const args = (exec.arguments ?? {}) as { file_path?: unknown, path?: unknown, command?: unknown, input?: unknown }
  const what = [args.file_path, args.path, args.command, args.input].find(value => typeof value === 'string' && value.trim())
  return what ? `${exec.name} ${String(what).replace(/\s+/g, ' ').trim().slice(0, 160)}` : exec.name
}

/** The model-facing message about an undone commit: a user-role notice whose source is Presmium. */
export function revertNotice(event: Reverted): unknown {
  const short = (id: string) => id.slice(0, 10)
  const files = event.files.length ? event.files.join(', ') : 'its files'
  const turns = event.turns ? ` (turns ${event.turns})` : ''
  const text = `[Presmium] The author undid the change this session made${turns}: commit ${short(event.revision)} "${event.subject}", undone by commit ${short(event.revertedBy)}. ${files} ${event.files.length === 1 ? 'is' : 'are'} back as before that change. Read a file again before you edit it, and do not make that change again unless the author asks.`
  const summary = `Presmium: the author undid commit ${short(event.revision)}${turns}`
  return Object.freeze({ id: randomUUID(), role: 'user', content: Object.freeze([Object.freeze({ type: 'text', text })]), source: Object.freeze({ kind: 'presmium', form: 'notice', summary: summary.slice(0, 120) }) })
}

export function apply(ctx: DshContext): void {
  const log = ctx.logger?.('presmium') ?? console
  const sessions = new Map<string, Turns>()
  const agents = new Map<string, LiveAgent>()
  /** Notices for sessions whose agent is not live yet. */
  const pending = new Map<string, unknown[]>()
  const turnsOf = (id: string) => {
    let known = sessions.get(id)
    if (!known) sessions.set(id, known = { wrote: false })
    return known
  }
  /** A subagent's session, by its parent's: its writes join the review of the session that delegated. */
  const parents = new Map<string, string>()
  const reviewerOf = (id: string) => {
    let at = id
    for (let depth = 0; depth < 32 && parents.has(at); depth++) at = parents.get(at)!
    return at
  }

  /** A route of the review of `session` in the document of `presmium`, with the service token. */
  const post = async (presmium: PresmiumSession, session: string, path: string, body: Record<string, unknown>): Promise<void> => {
    const response = await ctx.presmium.request(`${REVIEW}/${path}`, { body: { session, ...body }, headers: { 'presmium-document': encodeURIComponent(presmium.document.dir) } })
    const text = await response.text()
    if (response.ok) return
    // No review routes: the service reviews and commits with git, and the workspace is no git repository.
    if (path === 'open' && response.status === 404) throw new Error('the workspace is not a git repository, so the author cannot review a change: run git init in it')
    let reason = text
    try {
      reason = (JSON.parse(text) as { error?: string, detail?: string }).error ?? reason
    } catch {
      // Not JSON.
    }
    throw new Error(reason || `the review answered ${response.status}`)
  }

  ctx.on('session/event', (session: { id: string }, event: SessionEvent) => {
    if (event.type === 'turn/start' && typeof event.data?.turn === 'number') turnsOf(session.id).turn = event.data.turn
    if (event.type !== 'turn/end') return
    const turns = sessions.get(session.id)
    if (!turns?.wrote || !turns.document) return
    turns.wrote = false
    void post(turns.document, session.id, 'step', { ...turns.turn !== undefined ? { turn: turns.turn } : {}, end: true })
      .catch((error: unknown) => log.warn(`presmium-turns: the end of turn ${turns.turn} of ${session.id} was not told to the review: ${error instanceof Error ? error.message : String(error)}`))
  })

  ctx.on('tools/execute', async (exec: DshToolExecution, next: () => Promise<unknown>) => {
    const presmium = WRITES.has(exec.name) ? ctx.presmium.session(exec.agent) : undefined
    if (!presmium) return next()
    const session = reviewerOf(presmium.id)
    const turns = turnsOf(session)
    try {
      await post(presmium, session, 'open', turns.turn !== undefined ? { turn: turns.turn } : {})
    } catch (error) {
      // Thrown here, the call fails with this reason and its tool never runs.
      throw new Error(`Presmium: ${error instanceof Error ? error.message : String(error)}. Nothing was changed.`)
    }
    turns.document = presmium
    turns.wrote = true
    try {
      return await next()
    } finally {
      await post(presmium, session, 'step', { ...turns.turn !== undefined ? { turn: turns.turn } : {}, label: labelOf(exec), tool: exec.name })
        .catch((error: unknown) => log.warn(`presmium-turns: no checkpoint after ${exec.name} in ${session}: ${error instanceof Error ? error.message : String(error)}`))
    }
  })

  // The live agents, to tell their sessions what the author undid; the subagents' parents.
  ctx.on('agent/created', ({ agent }: { agent: LiveAgent }) => {
    const header = agent.session.header as { origin?: string, parentSession?: string } | undefined
    if (header?.origin === 'subagent' && header.parentSession) parents.set(agent.session.id, header.parentSession)
    agents.set(agent.session.id, agent)
    for (const notice of pending.get(agent.session.id) ?? []) agent.inject(notice)
    pending.delete(agent.session.id)
  })
  ctx.on('agent/disposed', ({ agent }: { agent: LiveAgent }) => {
    if (agents.get(agent.session.id) === agent) agents.delete(agent.session.id)
  })
  ctx.on('session/disposed', (session: { id: string }) => {
    sessions.delete(session.id)
    parents.delete(session.id)
  })

  const tell = (event: Reverted) => {
    const notice = revertNotice(event)
    const agent = agents.get(event.session)
    if (agent) agent.inject(notice)
    else pending.set(event.session, [...pending.get(event.session) ?? [], notice])
    log.info(`presmium-turns: told session ${event.session} that commit ${event.revision} was undone`)
  }

  // The service's review events, followed while the row is active (again after the service restarted).
  const stop = new AbortController()
  const follow = async () => {
    while (!stop.signal.aborted) {
      try {
        const response = await ctx.presmium.request(`${REVIEW}/events`, { headers: { accept: 'text/event-stream' }, signal: stop.signal })
        if (!response.ok || !response.body) throw new Error(`review/events answered ${response.status}`)
        const decoder = new TextDecoder()
        let buffer = ''
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk as Uint8Array, { stream: true })
          let end: number
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
            if (!data) continue
            const event = JSON.parse(data) as { type?: string }
            if (event.type === 'reverted') tell(event as Reverted)
          }
        }
      } catch (error) {
        if (stop.signal.aborted) return
        log.debug(`presmium-turns: the review events: ${error instanceof Error ? error.message : String(error)}`)
      }
      await new Promise(done => setTimeout(done, RETRY_MS).unref())
    }
  }
  void follow()
  ctx.effect(() => () => stop.abort())
}
