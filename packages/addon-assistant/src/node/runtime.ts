/**
 * `AGENT_RUNTIME` (docs/architecture.md 4.8): the ACP client
 * (`@agentclientprotocol/sdk`). Each session is an agent process of its own
 * (the bundled DeepSeek Harness, or the operator's replacement), started
 * with the environment `launch` gives, initialized, and given one ACP
 * session: `cwd` the session's directory, `mcpServers` Presmium's MCP
 * endpoint with the session's token. A task's prompt goes as text; the
 * agent's committed messages become `message` events (with their
 * citations), its tool calls `progress` events (`call` is the tool call's
 * id). The agent's permission requests are classified by the tool call it
 * announced (./permissions.ts) and confirmed through the session's
 * `approve`; only one-shot options are ever chosen. Cancelling sends
 * `session/cancel`; closing ends the session and the process.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import { errorMessage } from '@presmium/kernel'
import type { AgentEvent, AgentRuntime, AgentSession, AgentSessionOptions, AgentTaskRequest, Logger } from '@presmium/kernel'
import { citationsOf, promptText } from '../domain/index.ts'
import { classify } from './permissions.ts'
import type { ToolCallInfo } from './permissions.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** How a session's agent starts. */
export interface Launch {
  command: string
  args: string[]
  env: Record<string, string>
  /** Called once the process ended, e.g. to stop a model relay. */
  close?(): Promise<void>
}

export interface AcpRuntimeOptions {
  provider: string
  launch(options: AgentSessionOptions): Promise<Launch>
  /** The deck's language: the prompt asks for answers in it; approvals are worded in it. */
  lang?: string
  /** Refused outright. */
  operatorDir?: string
  log: Logger
}

/** An async queue of events, ended or failed once. */
class Channel<T> {
  readonly #items: T[] = []
  #wake?: () => void
  #done = false
  #error: unknown

  push(item: T): void {
    if (this.#done) return
    this.#items.push(item)
    this.#wake?.()
  }

  end(error?: unknown): void {
    if (this.#done) return
    this.#done = true
    this.#error = error
    this.#wake?.()
  }

  async* [Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.#items.length) {
        yield this.#items.shift()!
        continue
      }
      if (this.#done) {
        if (this.#error !== undefined) throw this.#error
        return
      }
      await new Promise<void>(resolve => this.#wake = resolve)
      this.#wake = undefined
    }
  }
}

/** The first start of each DeepSeek Harness home, which sets up its profile alone: the others wait for it. */
const firstStarts = new Map<string, Promise<void>>()

/** `agentInfo` as the runtime's name: its title (or name) and version. */
function runtimeName(info: { name?: string, title?: string | null, version?: string } | null | undefined): string | undefined {
  const name = info?.title || info?.name
  return name ? `${name}${info?.version ? ` ${info.version}` : ''}` : undefined
}

export class AcpRuntime implements AgentRuntime {
  readonly provider: string
  #runtime?: string
  readonly #options: AcpRuntimeOptions

  constructor(options: AcpRuntimeOptions) {
    this.provider = options.provider
    this.#options = options
  }

  get runtime(): string | undefined {
    return this.#runtime
  }

  async open(options: AgentSessionOptions): Promise<AgentSession> {
    const { log, lang, operatorDir } = this.#options
    const launch = await this.#options.launch(options)
    const home = launch.env.DSH_HOME
    const first = home ? firstStarts.get(home) : undefined
    let setUp: (() => void) | undefined
    if (home && !first) firstStarts.set(home, new Promise<void>(done => setUp = done))
    if (first) await first

    const child = spawn(launch.command, launch.args, { cwd: options.cwd, env: launch.env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000)
      for (const line of chunk.split('\n').filter(Boolean)) log.debug(`agent: ${line}`)
    })
    const exited = new Promise<void>(done => child.once('close', () => done()))
    child.once('error', error => log.error(`the agent did not start: ${errorMessage(error)}`))
    // A process that did not start, or ended, takes no more input: the connection reports it.
    child.stdin.on('error', () => undefined)
    const failure = (error: unknown) => new Error(`${errorMessage(error)}${stderr.trim() ? `\n${stderr.trim().split('\n').slice(-5).join('\n')}` : ''}`)

    /** The tool calls the agent announced, by id. */
    const calls = new Map<string, ToolCallInfo>()
    let current: Channel<AgentEvent> | undefined
    let text = ''
    const flush = () => {
      if (!text.trim()) return
      current?.push({ type: 'message', text, citations: citationsOf(text) })
      text = ''
    }

    const app = acp.client({ name: 'presmium' })
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        const update = params.update
        switch (update.sessionUpdate) {
          case 'agent_message_chunk':
            if (update.content.type === 'text') text += update.content.text
            break
          case 'tool_call': {
            flush()
            calls.set(update.toolCallId, { title: update.title, kind: update.kind, rawInput: update.rawInput, locations: update.locations })
            current?.push({ type: 'progress', text: update.title, tool: update.title, call: update.toolCallId, status: 'running' })
            break
          }
          case 'tool_call_update': {
            const known = calls.get(update.toolCallId) ?? {}
            const merged: ToolCallInfo = {
              title: update.title ?? known.title,
              kind: update.kind ?? known.kind,
              rawInput: update.rawInput ?? known.rawInput,
              locations: update.locations ?? known.locations,
            }
            calls.set(update.toolCallId, merged)
            if (update.status === 'completed' || update.status === 'failed') {
              flush()
              const title = merged.title ?? 'tool'
              current?.push({ type: 'progress', text: title, tool: title, call: update.toolCallId, status: update.status })
            }
            break
          }
          default:
            break
        }
      })
      .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
        const announced = calls.get(params.toolCall.toolCallId) ?? {}
        const call: ToolCallInfo = {
          title: params.toolCall.title ?? announced.title,
          kind: params.toolCall.kind ?? announced.kind,
          rawInput: params.toolCall.rawInput ?? announced.rawInput,
          locations: params.toolCall.locations ?? announced.locations,
        }
        const decision = classify(call, { cwd: options.cwd, operatorDir, lang, member: options.member.id })
        let allow = false
        if ('refuse' in decision) log.info(`refused the agent's request: ${decision.refuse}`)
        else allow = await options.approve(decision.request).catch(() => false)
        const kind = allow ? 'allow_once' : 'reject_once'
        const option = params.options.find(o => o.kind === kind) ?? params.options.find(o => o.kind.startsWith(allow ? 'allow_once' : 'reject'))
        return { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } }
      })

    const connection = app.connect(acp.ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>))
    child.once('close', code => connection.close(new Error(`the agent exited (${code ?? 'signal'})`)))
    const stop = async () => {
      connection.close()
      child.stdin.end()
      const timer = setTimeout(() => child.kill('SIGTERM'), 3000)
      const killer = setTimeout(() => child.kill('SIGKILL'), 6000)
      await exited
      clearTimeout(timer)
      clearTimeout(killer)
      await launch.close?.().catch(() => undefined)
    }

    let sessionId: string
    let closable = false
    const started = (async () => {
      const init = await connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: 'presmium', version },
      })
      this.#runtime = runtimeName(init.agentInfo) ?? this.#runtime
      closable = init.agentCapabilities?.sessionCapabilities?.close !== undefined && init.agentCapabilities?.sessionCapabilities?.close !== null
      const mcpServers: acp.McpServer[] = options.mcp ? [{ type: 'http', name: 'presmium', url: options.mcp.url, headers: [{ name: 'Authorization', value: `Bearer ${options.mcp.token}` }] }] : []
      const session = await connection.agent.request(acp.methods.agent.session.new, { cwd: options.cwd, mcpServers })
      sessionId = session.sessionId
    })()
    try {
      await started
    } catch (error) {
      await stop()
      throw failure(error)
    } finally {
      setUp?.()
    }

    let closed = false
    const cancel = async () => {
      await connection.agent.notify(acp.methods.agent.session.cancel, { sessionId }).catch(() => undefined)
    }
    return {
      async* prompt(request: AgentTaskRequest, signal?: AbortSignal): AsyncIterable<AgentEvent> {
        const channel = new Channel<AgentEvent>()
        current = channel
        text = ''
        const onAbort = () => void cancel()
        signal?.addEventListener('abort', onAbort, { once: true })
        connection.agent.request(acp.methods.agent.session.prompt, { sessionId, prompt: [{ type: 'text', text: promptText(request, lang) }] })
          .then(() => {
            flush()
            channel.end()
          }, (error: unknown) => {
            flush()
            channel.end(failure(error))
          })
        try {
          yield* channel
        } finally {
          signal?.removeEventListener('abort', onAbort)
          current = undefined
        }
      },
      cancel,
      async close() {
        if (closed) return
        closed = true
        if (closable) {
          let timer: ReturnType<typeof setTimeout> | undefined
          await Promise.race([
            connection.agent.request(acp.methods.agent.session.close, { sessionId }).catch(() => undefined),
            new Promise(done => timer = setTimeout(done, 3000)),
          ])
          clearTimeout(timer)
        }
        await stop()
      },
    }
  }
}
