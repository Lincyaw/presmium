import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import type { DshAgent, DshContext, DshToolExecution } from '../dsh.ts'

export const name = 'presmium-turns'
export const inject = ['presmium', 'tools']

export const WRITES = new Set(['write', 'edit', 'str_replace_editor', 'bash', 'pwsh', 'terminal_send'])

const REVIEW = '/__presmium/presmium.workspace/review'
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

interface Turns {
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
  const sessions = new Map<string, Turns>()
  const agents = new Map<string, LiveAgent>()
  const pending = new Map<string, unknown[]>()
  const turnsOf = (id: string) => {
    let known = sessions.get(id)
    if (!known) sessions.set(id, known = { wrote: false })
    return known
  }
  const parents = new Map<string, string>()
  const reviewerOf = (id: string) => {
    let at = id
    for (let depth = 0; depth < 32 && parents.has(at); depth++) at = parents.get(at)!
    return at
  }

  const post = async (document: string, session: string, path: string, body: Record<string, unknown>): Promise<void> => {
    const response = await ctx.presmium.request(`${REVIEW}/${path}`, { body: { session, ...body }, headers: { 'presmium-document': encodeURIComponent(document) } })
    const text = await response.text()
    if (response.ok) return
    if (path === 'open' && response.status === 404) throw new Error('the workspace is not a git repository, so the author cannot review a change: run git init in it')
    let reason = text
    try {
      reason = (JSON.parse(text) as { error?: string, detail?: string }).error ?? reason
    } catch {
    }
    throw new Error(reason || `the review answered ${response.status}`)
  }

  ctx.on('session/event', (session: { id: string }, event: SessionEvent) => {
    if (event.type === 'turn/start' && typeof event.data?.turn === 'number') turnsOf(session.id).turn = event.data.turn
    if (event.type !== 'turn/end') return
    const turns = sessions.get(session.id)
    if (!turns?.wrote || turns.document === undefined) return
    turns.wrote = false
    void post(turns.document, session.id, 'step', { ...turns.turn !== undefined ? { turn: turns.turn } : {}, end: true })
      .catch((error: unknown) => log.warn(`presmium-turns: the end of turn ${turns.turn} of ${session.id} was not told to the review: ${error instanceof Error ? error.message : String(error)}`))
  })

  ctx.on('tools/execute', async (exec: DshToolExecution, next: () => Promise<unknown>) => {
    if (!WRITES.has(exec.name) || !exec.agent) return next()
    const { root } = await ctx.presmium.ready
    const cwd = relative(root, ctx.presmium.directoryOf(exec.agent))
    if (cwd === '..' || cwd.startsWith(`..${sep}`) || isAbsolute(cwd)) return next()
    const document = ctx.presmium.session(exec.agent)?.document.dir ?? ''
    const session = reviewerOf(exec.agent.session.id)
    const turns = turnsOf(session)
    try {
      await post(document, session, 'open', turns.turn !== undefined ? { turn: turns.turn } : {})
    } catch (error) {
      throw new Error(`Presmium: ${error instanceof Error ? error.message : String(error)}. Nothing was changed.`)
    }
    turns.document = document
    turns.wrote = true
    try {
      return await next()
    } finally {
      await post(document, session, 'step', { ...turns.turn !== undefined ? { turn: turns.turn } : {}, label: labelOf(exec), tool: exec.name })
        .catch((error: unknown) => log.warn(`presmium-turns: no checkpoint after ${exec.name} in ${session}: ${error instanceof Error ? error.message : String(error)}`))
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
