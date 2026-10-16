/**
 * What the server and the gateway share: the Node server whose handlers are
 * Fetch API functions (`@hono/node-server`), reverse proxies for HTTP and
 * WebSocket upgrades (`http-proxy-3`), and the small checks of requests.
 */
import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { getRequestListener } from '@hono/node-server'
import { createProxyServer } from 'http-proxy-3'

/** Host names of this machine. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** The host name of a `Host` header or a URL's host, lowercase, without the port. */
export function hostname(host: string | null | undefined): string {
  if (!host) return ''
  const value = host.trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1)
  return value.replace(/:\d+$/, '')
}

export function isLoopback(host: string | null | undefined): boolean {
  return LOOPBACK.has(hostname(host))
}

/** The host name of an `Origin` header; undefined when there is none, '' when it is malformed (`null`, garbage). */
export function originHost(origin: string | null | undefined): string | undefined {
  if (origin === null || origin === undefined) return undefined
  try {
    return hostname(new URL(origin).host)
  } catch {
    return ''
  }
}

/** Compares two secrets in constant time. */
export function sameSecret(given: string | null | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The bearer token of an `Authorization` header. */
export function bearer(value: string | null | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(value?.trim() ?? '')
  return match?.[1]
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })
}

export function problem(status: number, message: string): Response {
  return json({ error: message }, status)
}

/** A header of a Node request as one string. */
export function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/** Writes a Fetch response to a Node response (for answers made before a request reaches the Fetch handler). */
export async function send(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}

/** Refuses a WebSocket upgrade with an HTTP status. */
export function refuseUpgrade(socket: Duplex, status: number): void {
  socket.end(`HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Not Found'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

/** Where a proxied request goes: the target and the path after the mount point, with its query. */
export interface ProxyTarget {
  target: string
  path: string
  headers?: Record<string, string>
  /** Request headers not passed on (lowercase), e.g. the caller's token or the login proxy's secret. */
  strip?: string[]
}

function prepare(req: IncomingMessage, to: ProxyTarget): void {
  req.url = to.path
  for (const name of to.strip ?? []) delete req.headers[name]
}

/**
 * One reverse proxy for every target: HTTP requests and WebSocket upgrades,
 * with the headers of the target added (credentials the client never sees).
 * The `Host` header is kept.
 */
export function createProxy() {
  const proxy = createProxyServer({ ws: true, xfwd: false })
  proxy.on('error', (error: Error, _req: unknown, res: unknown) => {
    const response = res as ServerResponse | Duplex | undefined
    if (response && 'writeHead' in response && !response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(`proxy error: ${error.message}`)
    } else {
      response?.destroy?.()
    }
  })
  return {
    web(req: IncomingMessage, res: ServerResponse, to: ProxyTarget): void {
      prepare(req, to)
      proxy.web(req, res, { target: to.target, headers: to.headers })
    },
    ws(req: IncomingMessage, socket: Duplex, head: Buffer, to: ProxyTarget): void {
      prepare(req, to)
      proxy.ws(req, socket, head, { target: to.target, headers: to.headers })
    },
    close: () => proxy.close(),
  }
}

export type Proxy = ReturnType<typeof createProxy>

/** What a Node request handler decides: answer it with the Fetch handler, proxy it, or answer at once. */
export type Decision =
  | { kind: 'fetch' }
  | { kind: 'proxy', to: ProxyTarget }
  | { kind: 'answer', response: Response }

/**
 * A Node HTTP server: `decide` looks at each request first (and each
 * WebSocket upgrade, which is proxied or refused); requests it gives to the
 * Fetch handler are converted by `@hono/node-server`.
 */
export function nodeServer(options: {
  decide(req: IncomingMessage): Promise<Decision>
  decideUpgrade(req: IncomingMessage): Promise<{ to?: ProxyTarget, status?: number }>
  fetch(request: Request, req: IncomingMessage): Promise<Response>
  proxy: Proxy
}): Server {
  const listener = getRequestListener((request, env) => options.fetch(request, (env as { incoming: IncomingMessage }).incoming))
  const server = createServer((req, res) => {
    void options.decide(req).then((decision) => {
      if (decision.kind === 'fetch') return listener(req, res)
      if (decision.kind === 'proxy') return options.proxy.web(req, res, decision.to)
      return send(res, decision.response)
    }).catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(error instanceof Error ? error.message : String(error))
    })
  })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void options.decideUpgrade(req).then(({ to, status }) => {
      if (to) options.proxy.ws(req, socket, head, to)
      else refuseUpgrade(socket, status ?? 404)
    }, () => refuseUpgrade(socket, 500))
  })
  return server
}

/** Listens and resolves with the port. */
export function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

/** Closes a server and the connections still open (SSE streams, kept-alive sockets). */
export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  })
}

/** A URL's host for a listening address (`0.0.0.0` is reached as `127.0.0.1`). */
export function urlHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return '127.0.0.1'
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}
