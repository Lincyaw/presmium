/**
 * The server (docs/architecture.md 4.7, section 10): what plugins contribute
 * to `presmium dev` and `presmium serve`, members and roles, approvals, MCP
 * access, and the contexts plugins get on the Node side. Route handlers use the Fetch API, so no server framework appears here.
 */
import type { Logger } from '../contracts.ts'
import { defineService } from './service.ts'
import type { ServiceToken } from './service.ts'

export type MemberRole = 'reader' | 'editor' | 'owner'

export interface Member {
  id: string
  name: string
  email?: string
  roles: MemberRole[]
}

export interface RequestContext {
  /** The member who sent the request; in `presmium dev` the local author (`owner`). */
  member: Member
  /** Directory of the document the request belongs to, relative to the workspace root; '' in `presmium dev`. */
  document: string
  /** The path after the route key in a `/*` route (no leading `/`); '' for other routes. */
  rest: string
}

export type RouteHandler = (request: Request, ctx: RequestContext) => Response | Promise<Response>

export interface Route {
  /** The lowest role that may call it, default `editor`; routes learners may use say `reader`. */
  role?: MemberRole
  /**
   * The largest request body it takes, in bytes; default 1 MiB (`MAX_BODY`).
   * The server refuses a larger `Content-Length` before the handler runs,
   * and ends a chunked body at the limit, with 413 (N-08).
   */
  maxBody?: number
  handle: RouteHandler
}

/** The request body a route takes unless it says otherwise (`Route.maxBody`): 1 MiB. */
export const MAX_BODY = 1 << 20

/** A JSON response, never cached. */
export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })
}

/** An error response: `{ error: message }` as JSON. */
export function problem(status: number, message: string): Response {
  return json({ error: message }, status)
}

export interface ProxySpec {
  /** Mounted under `/__presmium/<plugin id>/<path>/`; HTTP and WebSocket are both forwarded. */
  path: string
  target: string
  /** Request headers added when forwarding, e.g. credentials; the browser never sees them. */
  headers?: Record<string, string>
  /** Default `editor`. */
  role?: MemberRole
}

export interface ServerContribution {
  /** Keys are paths after `/__presmium/<plugin id>/`, e.g. `tasks`; one ending in `/*` matches every path under it. Streamed results use SSE. */
  routes?: Record<string, Route>
  proxies?: ProxySpec[]
  /** Called when the server closes. */
  close?(): void | Promise<void>
}

export interface ServerContext {
  deckDir: string
  workspaceRoot: string
  /** This plugin's `presmium.<plugin id>` configuration (the deck's content). */
  config: Record<string, unknown>
  /** The operator's settings for this plugin, as `NodeServiceContext.settings`; never from the deck. */
  settings: Record<string, unknown>
  lang?: string
  /** Node services: the plugins' `services`, the server's `APPROVALS` and `MCP_ENDPOINT`, the workspace's `REVISIONS`. */
  service<T>(token: ServiceToken<T>): T | undefined
  /** The server process's environment variables, as `NodeServiceContext.secret`. */
  secret(name: string): string | undefined
  /** As `NodeServiceContext.operatorDir`: the absolute operator directory. */
  operatorDir?: string
  /**
   * The workspace's home page of `presmium serve`, which is no document: its
   * `deckDir` and `workspaceRoot` are an empty directory outside the
   * workspace. A plugin there answers what needs no document.
   */
  home?: boolean
  log: Logger
}

export interface NodeServiceContext {
  deckDir: string
  workspaceRoot: string
  /** This plugin's `presmium.<plugin id>` configuration (the deck's content). */
  config: Record<string, unknown>
  /**
   * The operator's settings for this plugin: `settings.<plugin id>` of
   * `presmium.workspace.yaml` at the workspace root, read once when the
   * process starts; `{}` when there is none. Never from the deck (docs/ir.md section 10).
   */
  settings: Record<string, unknown>
  lang?: string
  /**
   * The process's environment variables (credentials, and operator settings
   * such as `PRESMIUM_AGENT_COMMAND`); undefined when unset.
   */
  secret(name: string): string | undefined
  /**
   * The absolute operator directory (consent records and other operator
   * data, 10.5): in the user's state directory, by workspace, outside any
   * workspace and document directory; omitted when the one given lies inside
   * the workspace.
   */
  operatorDir?: string
  /**
   * The deck's Node services when called (the host's, e.g. the workspace's
   * `DOCUMENT_FILES`, and the plugins'); optional for compatibility (a plugin
   * writes `ctx.service?.(DOCUMENT_FILES)`).
   */
  service?<T>(token: ServiceToken<T>): T | undefined
  log: Logger
}

// Approvals ---------------------------------------------------------------------

export type ApprovalKind = 'operate' | 'spend' | 'write' | 'agent'

/**
 * Who may answer an approval (10.4). `content`: only the requesting member's
 * own document and sessions (files in the task's document directory, the
 * operating and paid tools of MCP); it goes to `member`. `workspace`: the
 * workspace configuration `presmium.workspace.yaml` (approval policy,
 * operator settings), consent records, any path outside the
 * document directory, the agent's shell and network permission requests; it
 * goes to the owners only.
 */
export type ApprovalScope = 'content' | 'workspace'

export interface ApprovalRequest {
  kind: ApprovalKind
  /** Default `workspace`: a request that names no scope is answered by an owner only. */
  scope?: ApprovalScope
  /** One sentence on what is to be done, in the deck's language, e.g. "run code-1 of the merge section". */
  title: string
  detail?: string
  /** Who asks: a plugin id, or `agent:<task id>`. */
  from: string
  /**
   * The member it is asked for. A `content` approval goes to this member's
   * windows only (to every editor and owner when absent); a `workspace`
   * approval goes to every owner, and this member shows as the requester
   * only, never answering it, even as an editor.
   */
  member?: string
}

export interface Approvals {
  /** Allows, denies or asks by the approval policy; asking waits for an answer, an abort of `signal` or a timeout (a denial). */
  request(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean>
}

/** Node service, provided by the server. */
export const APPROVALS = defineService<Approvals>('presmium.approvals')

/**
 * An SSE response: each event as `event:` and `data:` (JSON) lines; closed
 * when `signal` aborts or the events end.
 */
export function eventStream(events: AsyncIterable<{ event?: string, data: unknown }>, signal?: AbortSignal): Response {
  const encoder = new TextEncoder()
  const iterator = events[Symbol.asyncIterator]()
  let closed = false
  const stop = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return
    closed = true
    void iterator.return?.()
    try {
      controller?.close()
    } catch {
      // Already closed by the reader.
    }
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) stop(controller)
      else signal?.addEventListener('abort', () => stop(controller), { once: true })
    },
    async pull(controller) {
      if (closed) return
      try {
        const next = await iterator.next()
        if (closed) return
        if (next.done) {
          stop(controller)
          return
        }
        const { event, data } = next.value
        const lines = `${event ? `event: ${event}\n` : ''}${JSON.stringify(data ?? null).split('\n').map(line => `data: ${line}`).join('\n')}\n\n`
        controller.enqueue(encoder.encode(lines))
      } catch (error) {
        closed = true
        controller.error(error)
      }
    },
    cancel() {
      stop()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
}

// MCP access ----------------------------------------------------------------------

/** The mode an MCP token is issued for: `author`, which may write the source; every token reads the whole deck. */
export type AgentMode = 'author'

/** What an agent session uses to reach this process's MCP endpoint. */
export interface McpAccess {
  /** This process's `/mcp`: the server's local address (the agent's child process runs on the same machine). */
  url: string
  /** `Authorization: Bearer` token bound to a member and a mode; it decides which tools there are. */
  token: string
}

export interface McpGrant extends McpAccess {
  /** Revokes the token; called when the session closes, after which requests with it get 401. */
  revoke(): void
}

/**
 * How a token is issued (`McpEndpoint.issue`, WP-96b). A session token of
 * DeepSeek Harness is `confirmed` and bound to the document of its session
 * (docs/design-dsh.md 5.3).
 *
 * @experimental The new workbench's (docs/api.md section 3).
 */
export interface McpIssueOptions {
  /**
   * The host already confirmed the operations of this token's caller (DeepSeek
   * Harness asked, by Presmium's approval policy, before the call): its
   * operate and spend tools ask no window through `APPROVALS`. The kinds whose
   * policy is `off` stay unlisted.
   */
  confirmed?: boolean
  /** The one document (relative to the workspace root) the token's calls may name; its default. */
  document?: string
}

export interface McpEndpoint {
  /** Issues a token for a member and a mode; the member's roles decide which tools there are. */
  issue(member: Member, mode: AgentMode, options?: McpIssueOptions): McpGrant
}

/** Node service, provided by the server where it mounts `/mcp` (`presmium dev` and `presmium serve`); none in `presmium build`. */
export const MCP_ENDPOINT = defineService<McpEndpoint>('presmium.mcpEndpoint')
