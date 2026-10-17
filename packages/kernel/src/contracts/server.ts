/**
 * The server (docs/architecture.md 4.7, section 10): what plugins contribute
 * to `presmium dev` and `presmium serve` and to `presmium gateway`, members
 * and roles, approvals, MCP access, and the contexts plugins get on the Node
 * side. Route handlers use the Fetch API, so no server framework appears here.
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
  /**
   * The lowest role that may call it, default `editor`; routes learners may
   * use say `reader`. In SHARED mode an `owner` route is mounted only on the
   * origin of the owner console; on the workspace site's origin it is 404 (10.4).
   */
  role?: MemberRole
  handle: RouteHandler
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

/**
 * Trust mode (D13, 10.1). `local`: `presmium dev`, `build`, `check` and a
 * `presmium serve` that listens on this machine only, without a login; the
 * one user is the operator, and the executed code and the agent are trusted
 * as that user. `shared`: `presmium serve` with a login, supported only in
 * the repository's compose layout (serve, gateway and sandbox containers).
 */
export type TrustMode = 'local' | 'shared'

export interface ServerContext {
  deckDir: string
  workspaceRoot: string
  /** This plugin's `presmium.<plugin id>` configuration (the deck's content). */
  config: Record<string, unknown>
  /** The operator's settings for this plugin, as `NodeServiceContext.settings`; never from the deck. */
  settings: Record<string, unknown>
  lang?: string
  /** As `NodeServiceContext.trust`. */
  trust: TrustMode
  /** Node services: the plugins' `services`, the server's `APPROVALS` and `MCP_ENDPOINT`, the workspace's `REVISIONS` (in SHARED mode also the agent-host clients). */
  service<T>(token: ServiceToken<T>): T | undefined
  /** The server process's environment variables, as `NodeServiceContext.secret`; no third-party credentials in SHARED mode. */
  secret(name: string): string | undefined
  /** SHARED mode: the gateway access (serve's service token), e.g. as the target of a remote environment's proxy; omitted in LOCAL mode. */
  gateway?: GatewayAccess
  /** As `NodeServiceContext.operatorDir`: the absolute operator directory in LOCAL mode; omitted in SHARED mode. */
  operatorDir?: string
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
  /** The trust mode of the process (4.7, 10.1). */
  trust: TrustMode
  /**
   * The process's environment variables (credentials in LOCAL mode, and
   * operator settings such as `PRESMIUM_AGENT_COMMAND`); undefined when
   * unset. In SHARED mode the environments of serve and agent-host hold no
   * third-party credentials.
   */
  secret(name: string): string | undefined
  /**
   * SHARED mode: the gateway access, in serve the service token, in
   * agent-host the scoped token serve issued for this build or run; services
   * that need third-party credentials (speech) call this plugin's
   * contribution in the gateway through it. Omitted in LOCAL mode.
   */
  gateway?: GatewayAccess
  /**
   * LOCAL mode: the absolute operator directory (consent records and other
   * operator data, 10.5): in the user's state directory, by workspace,
   * outside any workspace and document directory. Omitted in SHARED mode:
   * the operator directory is in the gateway only (`GatewayContext.operatorDir`).
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
 * workspace configuration `presmium.workspace.yaml` (members, approval
 * policy, operator settings), consent records, any path outside the
 * document directory, the agent's shell and network permission requests,
 * and in SHARED mode running code an editor or the agent wrote (compile-time
 * execution without a recording; MCP's `run_code` with `compile: approve`,
 * 10.6); it goes to the owners only.
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

/** The agent runtime's mode: `author` may write the source; `tutor` reads only and has no operating tools. */
export type AgentMode = 'author' | 'tutor'

/** What an agent session uses to reach this process's MCP endpoint. */
export interface McpAccess {
  /**
   * This process's `/mcp`: in LOCAL mode the server's local address (the
   * agent's child process runs on the same machine); in SHARED mode the
   * gateway's forwarding `/mcp` (the sandbox's network reaches the gateway only, 10.9).
   */
  url: string
  /** `Authorization: Bearer` token bound to a member and a mode; it decides which tools there are. */
  token: string
}

export interface McpGrant extends McpAccess {
  /** Revokes the token; called when the session closes, after which requests with it get 401. */
  revoke(): void
}

export interface McpEndpoint {
  /** Issues a token for a member and a mode: a `tutor` token sees the reading tools only. */
  issue(member: Member, mode: AgentMode): McpGrant
}

/** Node service, provided by the server where it mounts `/mcp` (`presmium dev` and `presmium serve`); none in `presmium build`. */
export const MCP_ENDPOINT = defineService<McpEndpoint>('presmium.mcpEndpoint')

// Gateway (D13, 10.9) ---------------------------------------------------------------

/** Access to the gateway: a plugin's routes lie under `<url>/<plugin id>/`. */
export interface GatewayAccess {
  /** The gateway's internal address (in compose, serve and sandbox both use it, e.g. `http://gateway:4320`). */
  url: string
  /** `Authorization: Bearer` token: serve's service token, or a scoped token serve issued for a run, a build or an agent session. */
  token: string
}

/** What a token grants; the gateway checks the token and gives this to the route. */
export interface GatewayGrant {
  /** `service`: serve's service token; `scoped`: a scoped token. */
  kind: 'service' | 'scoped'
  /** Plugin ids a scoped token may reach (the service token reaches all). */
  plugins: string[]
  /** What it was issued for, e.g. `agent:<task id>`, `run:<document>`; written to the gateway's log. */
  purpose: string
  /** The member it acts for. */
  member?: string
  /** ISO 8601; once expired or revoked, requests get 401. */
  expires: string
}

export interface GatewayRequestContext {
  grant: GatewayGrant
  /** The path after the route key in a `/*` route. */
  rest: string
}

export interface GatewayRoute {
  /** Takes serve's service token only (e.g. an owner registering a consent record); by default scoped tokens that include this plugin are taken too. */
  service?: boolean
  handle(request: Request, ctx: GatewayRequestContext): Response | Promise<Response>
}

export interface GatewayProxy {
  /** Mounted under `<url>/<plugin id>/<path>/`; HTTP and WebSocket are both forwarded. */
  path: string
  target: string
  /** Request headers added when forwarding (third-party credentials); the caller never sees them. */
  headers?: Record<string, string>
}

export interface GatewayContribution {
  routes?: Record<string, GatewayRoute>
  proxies?: GatewayProxy[]
  close?(): void | Promise<void>
}

export interface GatewayContext {
  /** The operator's settings for this plugin: `settings.<plugin id>` of the workspace configuration `presmium.workspace.yaml`, read when the gateway starts. */
  settings: Record<string, unknown>
  /** The gateway process's environment variables: in SHARED mode the only place of third-party credentials. */
  secret(name: string): string | undefined
  /** The operator directory (consent records and other operator data): mounted in the gateway container only, out of reach of decks, agents and executed code. */
  operatorDir: string
  log: Logger
}
