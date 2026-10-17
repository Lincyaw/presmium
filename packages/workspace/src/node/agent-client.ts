/**
 * serve's client of agent-host (SHARED, docs/architecture.md 10.8): every
 * request goes from serve to agent-host with its token (`Authorization:
 * Bearer`), never the other way. Runs and builds get a scoped gateway token
 * that serve issues for them and revokes when they end; the workspace site's
 * dev servers run there and get each document's IR from here.
 */
import { errorMessage, isRecord } from '@presmium/kernel'
import type { AgentEvent, AgentRuntime, AgentSession, ApprovalRequest, ChangeReview, ChangeReviewService, Finding, GatewayAccess, IRDocument, Logger, Member, ReviewChange, ReviewStep, RunRequest, RunResult, SiteSpec } from '@presmium/kernel'
import { GatewayTokens } from '@presmium/server'
import type { DocumentView } from '@presmium/server'
import { toWire } from './files.ts'
import type { DocumentWriter } from './files.ts'
import type { RemoteExecution } from './types.ts'

/** What agent-host has (`GET /v1/info`). */
export interface AgentHostInfo {
  /** The review implementation there (`CHANGE_REVIEW`, e.g. deltabox), if any. */
  review?: string
  /** The process sandbox there (`PROCESS_SANDBOX.kind`), if any. */
  sandbox?: string
  /** The agent runtime there: its provider and name, if the operator configured one. */
  agent?: { provider: string, runtime?: string }
}

/** A site in agent-host, without its IR: `SiteSpec` with documents' metadata only. */
export function bareSpec(site: SiteSpec): SiteSpec {
  return { ...site, documents: site.documents.map(({ doc: _doc, ...document }) => document) }
}

export class AgentHostClient {
  readonly url: string
  readonly #token: string
  /** serve's scoped gateway tokens (`GatewayTokens`, F-29); none without a gateway. */
  readonly #tokens?: GatewayTokens
  readonly #log: Logger

  constructor(access: GatewayAccess, gateway: GatewayAccess | undefined, log: Logger) {
    this.url = access.url.replace(/\/+$/, '')
    this.#token = access.token
    this.#tokens = gateway ? new GatewayTokens(gateway, log) : undefined
    this.#log = log
  }

  async #call(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(`${this.url}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${this.#token}`, ...body === undefined ? {} : { 'Content-Type': 'application/json' } },
      ...body === undefined ? {} : { body: JSON.stringify(body) },
      ...signal ? { signal } : {},
      // The token goes to agent-host only.
      redirect: 'error',
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let message = text
      try {
        const parsed: unknown = JSON.parse(text)
        if (isRecord(parsed) && typeof parsed.error === 'string') message = parsed.error
      } catch {
        // Not JSON.
      }
      throw new Error(`agent-host ${method} ${path}: ${response.status} ${message}`)
    }
    return response
  }

  async #json<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return (await (await this.#call(method, path, body, signal)).json()) as T
  }

  info(): Promise<AgentHostInfo> {
    return this.#json('GET', '/v1/info')
  }

  /** A scoped gateway token for one run, build or session; revoked by the function returned with it. */
  async #scoped(plugins: string[], purpose: string, member?: Member): Promise<{ access?: GatewayAccess, revoke(): Promise<void> }> {
    if (!this.#tokens) return { revoke: async () => {} }
    try {
      return await this.#tokens.issue({ plugins, purpose, ...member ? { member: member.id } : {} })
    } catch (error) {
      this.#log.warn(`no scoped gateway token for ${purpose}: ${errorMessage(error)}`)
      return { revoke: async () => {} }
    }
  }

  /**
   * The compiler's `remote` for a document: every run and end of session goes to agent-host. The
   * environment the compiler made here is not sent: agent-host makes the code's `RunContext.env` itself,
   * the one place it is made in SHARED mode (WP-91).
   */
  remote(document: string, plugins: (executor: string) => string[], member: () => Member | undefined): RemoteExecution {
    const path = `/v1/documents/${encodeURIComponent(document)}`
    return {
      run: async (executor: string, request: RunRequest, _env: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<RunResult> => {
        const token = await this.#scoped(plugins(executor), `run:${document}`, member())
        try {
          return await this.#json<RunResult>('POST', `${path}/run`, { executor, request, ...token.access ? { gateway: token.access } : {} }, signal)
        } finally {
          await token.revoke()
        }
      },
      endSession: async (executor: string, session: string): Promise<void> => {
        await this.#call('POST', `${path}/end-session`, { executor, session })
      },
    }
  }

  /**
   * Runs and records there the runs of a document with these keys (`runKey`): agent-host compiles the
   * document, runs them and writes their recordings in its execution cache as the sandbox (WP-91).
   */
  async record(document: string, runs: string[], plugins: string[], member?: Member): Promise<{ executed: number, refused: number }> {
    const token = await this.#scoped(plugins, `record:${document}`, member)
    try {
      return await this.#json('POST', `/v1/documents/${encodeURIComponent(document)}/record`, { runs, ...token.access ? { gateway: token.access } : {} })
    } finally {
      await token.revoke()
    }
  }

  /** The document writer: what is inside the document directories is written there, as the sandbox (WP-91). */
  writer(): DocumentWriter {
    const files = (body: Record<string, unknown>) => this.#call('POST', '/v1/files', body)
    return {
      write: async (changes) => {
        await files({ op: 'write', changes: changes.map(toWire) })
      },
      template: async (dir, template, title) => {
        await files({ op: 'template', dir, template, title })
      },
      copy: async (from, to) => {
        await files({ op: 'copy', from, to })
      },
      relink: async (from, to) => ((await (await files({ op: 'relink', from, to })).json()) as { changed: string[] }).changed,
      empty: async (dir) => {
        await files({ op: 'empty', dir })
      },
    }
  }

  /**
   * Builds a document there (the deck's code and the server render of its components run in the sandbox),
   * into agent-host's state directory, outside the document (F-51); the outputs name where.
   */
  async build(document: string, options: { to?: string[], view?: DocumentView, run: 'all' | 'none' }, plugins: string[], member?: Member): Promise<{ outputs: { renderer: string, outDir: string }[], findings: Finding[] }> {
    const token = await this.#scoped(plugins, `build:${document}`, member)
    try {
      return await this.#json('POST', `/v1/documents/${encodeURIComponent(document)}/build`, { ...options, into: 'state', ...token.access ? { gateway: token.access } : {} })
    } finally {
      await token.revoke()
    }
  }

  /**
   * Builds the readers' static site of a document there, for the audience `student` (or, without a
   * document, the home page; WP-91b), and hands each file's content to `write` as it comes, a file's
   * pieces in order. Resolves once the whole build came; rejects when it failed or came only in part.
   */
  async studentSite(site: SiteSpec, document: string | undefined, plugins: string[], write: (path: string, chunk: Buffer) => void, signal?: AbortSignal): Promise<{ files: number, bytes: number }> {
    const token = await this.#scoped(plugins, `student:${document ?? ''}`)
    try {
      const response = await this.#call('POST', '/v1/student-sites', { site: bareSpec(site), ...document === undefined ? {} : { document }, ...token.access ? { gateway: token.access } : {} }, signal)
      for await (const line of lines(response)) {
        const value: unknown = JSON.parse(line)
        if (!isRecord(value) || value.wait === true) continue
        if (typeof value.error === 'string') throw new Error(value.error)
        if (value.end === true) return { files: Number(value.files), bytes: Number(value.bytes) }
        if (typeof value.path !== 'string' || typeof value.data !== 'string') throw new Error('a line of the build is no file')
        write(value.path, Buffer.from(value.data, 'base64'))
      }
      throw new Error('the build ended before all of it came')
    } finally {
      await token.revoke()
    }
  }

  /** Starts a workspace site's dev server there; returns its id and port (on agent-host's address). */
  createSite(site: SiteSpec, view: DocumentView): Promise<{ id: string, port: number }> {
    return this.#json('POST', '/v1/sites', { site: bareSpec(site), view })
  }

  /** The site's documents changed (created, renamed, copied, deleted). */
  async updateSite(id: string, site: SiteSpec): Promise<void> {
    await this.#call('PUT', `/v1/sites/${encodeURIComponent(id)}`, { site: bareSpec(site) })
  }

  /** A document's IR, after it compiled. */
  async putDocument(id: string, dir: string, doc: IRDocument): Promise<void> {
    await this.#call('PUT', `/v1/sites/${encodeURIComponent(id)}/documents/${encodeURIComponent(dir)}`, doc)
  }

  async closeSite(id: string): Promise<void> {
    await this.#call('DELETE', `/v1/sites/${encodeURIComponent(id)}`).catch(() => undefined)
  }

  /** `AGENT_RUNTIME` in serve: sessions run in agent-host; the model access is a scoped gateway token of `presmium.assistant`. */
  agentRuntime(info: NonNullable<AgentHostInfo['agent']>, document: string): AgentRuntime {
    const client = this
    return {
      provider: info.provider,
      ...info.runtime ? { runtime: info.runtime } : {},
      async open(options): Promise<AgentSession> {
        const model = await client.#scoped(['presmium.assistant'], `agent:${document}`, options.member)
        const { id } = await client.#json<{ id: string }>('POST', '/v1/sessions', {
          document,
          mode: options.mode,
          member: options.member,
          cwd: options.cwd,
          ...options.mcp ? { mcp: options.mcp } : {},
          ...model.access ? { model: model.access } : {},
        })
        const path = `/v1/sessions/${encodeURIComponent(id)}`
        return {
          async* prompt(request, signal) {
            const response = await client.#call('POST', `${path}/prompt`, request, signal)
            for await (const event of sse(response)) {
              if (event.type === 'approval') {
                // The agent's permission request: confirmed here, by scope, then answered there.
                const allow = await options.approve(event.request as ApprovalRequest)
                await client.#call('POST', `${path}/approvals/${encodeURIComponent(event.id)}`, { allow }).catch(() => undefined)
              }
              yield event
            }
          },
          async cancel() {
            await client.#call('POST', `${path}/cancel`).catch(() => undefined)
          },
          async close() {
            await client.#call('DELETE', path).catch(() => undefined)
            await model.revoke()
          },
        }
      },
    }
  }

  /** `CHANGE_REVIEW` in serve when agent-host has deltabox (10.7). */
  changeReview(engine: string): ChangeReviewService {
    const client = this
    return {
      engine,
      async open(options): Promise<ChangeReview> {
        const opened = await client.#json<{ id: string, root: string, visibility: ChangeReview['visibility'] }>('POST', '/v1/reviews', options)
        const path = `/v1/reviews/${encodeURIComponent(opened.id)}`
        const steps: ReviewStep[] = []
        return {
          root: opened.root,
          visibility: opened.visibility,
          async step(label, tool) {
            const step = await client.#json<ReviewStep>('POST', `${path}/step`, { label, ...tool ? { tool } : {} })
            steps.push(step)
            return step
          },
          steps: () => steps,
          diff: () => client.#json<ReviewChange[]>('GET', `${path}/diff`),
          accept: reject => client.#json<string[]>('POST', `${path}/accept`, { reject: reject ?? [] }),
          rollback: async () => {
            await client.#call('POST', `${path}/rollback`)
          },
          close: async () => {
            await client.#call('DELETE', path).catch(() => undefined)
          },
        }
      },
    }
  }
}

/** The lines of a response, as they come. */
async function* lines(response: Response): AsyncIterable<string> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      if (line) yield line
    }
  }
}

/** The events of an SSE response (`event:` and `data:` lines, JSON data). */
async function* sse(response: Response): AsyncIterable<AgentEvent> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!data) continue
      try {
        yield JSON.parse(data) as AgentEvent
      } catch {
        // A malformed event is left out.
      }
    }
  }
}
