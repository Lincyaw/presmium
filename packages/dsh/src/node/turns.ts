import { randomUUID } from 'node:crypto'
import { errorMessage } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import type { DshAgent, DshContext, DshToolExecution } from './dsh-types.ts'
import { WORKSPACE_ROUTES } from './server-routes.ts'

// What a writing tool answers when the change cannot be recorded. The AI reads it and tells the author in their own
// language, so it names what the author sees (Version History) and none of the internals behind it.
const NOT_RECORDED = 'Version History is not turned on for this folder, so the change could not be recorded for the author to review. Tell the author to ask their administrator to turn on Version History for this folder.'
const NOTHING_CHANGED = 'Nothing was changed.'

export const name = 'presmium-turns'
export const inject = ['presmium', 'tools']

export const WRITING_TOOLS = new Set(['write', 'edit', 'str_replace_editor', 'bash', 'pwsh', 'terminal_send'])

const REVIEW = `${WORKSPACE_ROUTES}review`
const RETRY_MS = 2000

interface LiveAgent extends DshAgent {
  inject(message: unknown): void
}

interface SessionEvent {
  type: string
  data?: { turn?: number }
}

interface Reverted {
  type: 'reverted'
  session: string
  turns?: string
  revision: string
  subject: string
  revertedBy: string
  files: string[]
}

/** The turn an agent session is in, and whether a tool wrote in it (to which document's review). */
interface TurnState {
  turn?: number
  document?: string
  wrote: boolean
}

function labelOf(exec: Readonly<DshToolExecution>): string {
  const args = (exec.arguments ?? {}) as { file_path?: unknown, path?: unknown, command?: unknown, input?: unknown }
  const what = [args.file_path, args.path, args.command, args.input].find(value => typeof value === 'string' && value.trim())
  return what ? `${exec.name} ${String(what).replace(/\s+/g, ' ').trim().slice(0, 160)}` : exec.name
}

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
  const turnStates = new Map<string, TurnState>()
  const agents = new Map<string, LiveAgent>()
  const pending = new Map<string, unknown[]>()
  const turnStateOf = (id: string) => {
    let known = turnStates.get(id)
    if (!known) turnStates.set(id, known = { wrote: false })
    return known
  }
  const parents = new Map<string, string>()
  /** A subagent's writes go to the review of the session that started it. */
  const rootAgentSessionOf = (id: string) => {
    let at = id
    for (let depth = 0; depth < 32 && parents.has(at); depth++) at = parents.get(at)!
    return at
  }

  const postReview = async (document: string, agentSessionId: string, path: string, body: Record<string, unknown>): Promise<void> => {
    const response = await ctx.presmium.server.request(`${REVIEW}/${path}`, { body: { session: agentSessionId, ...body }, headers: { 'presmium-document': encodeURIComponent(document) } })
    const text = await response.text()
    if (response.ok) return
    if (path === 'open' && response.status === 404) throw new Error(NOT_RECORDED)
    let reason = text
    try {
      reason = (JSON.parse(text) as { error?: string, detail?: string }).error ?? reason
    } catch {
    }
    throw new Error(reason || `the review answered ${response.status}`)
  }

  ctx.on('session/event', (session: { id: string }, event: SessionEvent) => {
    if (event.type === 'turn/start' && typeof event.data?.turn === 'number') turnStateOf(session.id).turn = event.data.turn
    if (event.type !== 'turn/end') return
    const state = turnStates.get(session.id)
    if (!state?.wrote || state.document === undefined) return
    state.wrote = false
    void postReview(state.document, session.id, 'step', { ...state.turn !== undefined ? { turn: state.turn } : {}, end: true })
      .catch((error: unknown) => log.warn(`presmium-turns: the end of turn ${state.turn} of ${session.id} was not told to the review: ${errorMessage(error)}`))
  })

  ctx.on('tools/execute', async (exec: DshToolExecution, next: () => Promise<unknown>) => {
    if (!WRITING_TOOLS.has(exec.name) || !exec.agent) return next()
    const { root } = await ctx.presmium.server.ready
    if (!isInside(ctx.presmium.bindings.workingDirectoryOf(exec.agent), root)) return next()
    const document = ctx.presmium.bindings.bindingOf(exec.agent)?.document.dir ?? ''
    const agentSessionId = rootAgentSessionOf(exec.agent.session.id)
    const state = turnStateOf(agentSessionId)
    try {
      await postReview(document, agentSessionId, 'open', state.turn !== undefined ? { turn: state.turn } : {})
    } catch (error) {
      throw new Error(`${errorMessage(error)} ${NOTHING_CHANGED}`)
    }
    state.document = document
    state.wrote = true
    try {
      return await next()
    } finally {
      await postReview(document, agentSessionId, 'step', { ...state.turn !== undefined ? { turn: state.turn } : {}, label: labelOf(exec), tool: exec.name })
        .catch((error: unknown) => log.warn(`presmium-turns: no checkpoint after ${exec.name} in ${agentSessionId}: ${errorMessage(error)}`))
    }
  })

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
    turnStates.delete(session.id)
    parents.delete(session.id)
  })

  const injectRevertNotice = (event: Reverted) => {
    const notice = revertNotice(event)
    const agent = agents.get(event.session)
    if (agent) agent.inject(notice)
    else pending.set(event.session, [...pending.get(event.session) ?? [], notice])
    log.info(`presmium-turns: told session ${event.session} that commit ${event.revision} was undone`)
  }

  const stop = new AbortController()
  const subscribeReviewEvents = async () => {
    while (!stop.signal.aborted) {
      try {
        const response = await ctx.presmium.server.request(`${REVIEW}/events`, { headers: { accept: 'text/event-stream' }, signal: stop.signal })
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
            if (event.type === 'reverted') injectRevertNotice(event as Reverted)
          }
        }
      } catch (error) {
        if (stop.signal.aborted) return
        log.debug(`presmium-turns: the review events: ${errorMessage(error)}`)
      }
      await new Promise(done => setTimeout(done, RETRY_MS).unref())
    }
  }
  void subscribeReviewEvents()
  ctx.effect(() => () => stop.abort())
}
