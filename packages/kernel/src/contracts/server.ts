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
  member: Member
  document: string
  rest: string
}

export type RouteHandler = (request: Request, ctx: RequestContext) => Response | Promise<Response>

export interface Route {
  role?: MemberRole
  maxBody?: number
  handle: RouteHandler
}

export const MAX_BODY = 1 << 20

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })
}

export function problem(status: number, message: string): Response {
  return json({ error: message }, status)
}

export interface ProxySpec {
  path: string
  target: string
  headers?: Record<string, string>
  role?: MemberRole
}

export interface ServerContribution {
  routes?: Record<string, Route>
  proxies?: ProxySpec[]
  close?(): void | Promise<void>
}

export interface ServerContext {
  deckDir: string
  workspaceRoot: string
  config: Record<string, unknown>
  settings: Record<string, unknown>
  lang?: string
  service<T>(token: ServiceToken<T>): T | undefined
  secret(name: string): string | undefined
  operatorDir?: string
  home?: boolean
  log: Logger
}

export interface NodeServiceContext {
  deckDir: string
  workspaceRoot: string
  config: Record<string, unknown>
  settings: Record<string, unknown>
  lang?: string
  secret(name: string): string | undefined
  operatorDir?: string
  service?<T>(token: ServiceToken<T>): T | undefined
  log: Logger
}

export type ApprovalKind = 'operate' | 'spend' | 'write' | 'agent'

export type ApprovalScope = 'content' | 'workspace'

export interface ApprovalRequest {
  kind: ApprovalKind
  scope?: ApprovalScope
  title: string
  detail?: string
  from: string
  member?: string
}

export interface Approvals {
  request(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean>
}

export const APPROVALS = defineService<Approvals>('presmium.approvals')

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

export type AgentMode = 'author'

export interface McpAccess {
  url: string
  token: string
}

export interface McpGrant extends McpAccess {
  revoke(): void
}

/** @experimental */
export interface McpIssueOptions {
  confirmed?: boolean
  document?: string
}

export interface McpEndpoint {
  issue(member: Member, mode: AgentMode, options?: McpIssueOptions): McpGrant
}

export const MCP_ENDPOINT = defineService<McpEndpoint>('presmium.mcpEndpoint')
