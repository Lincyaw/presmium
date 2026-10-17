/**
 * The server's HTTP: the Node server whose handlers are Fetch API functions
 * (`@hono/node-server`), reverse proxies for HTTP and WebSocket upgrades
 * (`http-proxy-3`), and the small checks of requests.
 */
import { createServer } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { getRequestListener } from '@hono/node-server'
import { json, problem } from '@presmium/kernel'
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

/** The bearer token of an `Authorization` header. */
export function bearer(value: string | null | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(value?.trim() ?? '')
  return match?.[1]
}

export { json, problem }

/**
 * The request with its body read, at most `limit` bytes (N-08, F-02): 413
 * when its `Content-Length` says more, before reading anything, or once a
 * body without one (chunked) passes the limit. The request a handler gets
 * holds the body read, so it can read it as it likes.
 *
 * What the client still sends after a 413 is read and dropped, never kept:
 * a server that closed at once would reset a connection whose sender is
 * still writing, and the client would see the reset instead of the answer
 * (RFC 9112, 9.6). The Node adapter ends such a connection after a moment
 * (its `autoCleanupIncoming`), so a body sent on and on is not read for long.
 */
export async function limitBody(request: Request, limit: number): Promise<Request | Response> {
  const tooLarge = () => json({ error: `the request body is larger than this route takes (${limit} bytes)` }, 413)
  // Before the body is touched: Node then reads and drops it on its own once the answer is sent.
  const declared = Number(request.headers.get('content-length') ?? Number.NaN)
  if (declared > limit) return tooLarge()
  if (!request.body) return request
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = request.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      void drop(reader)
      return tooLarge()
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.byteLength
  }
  return new Request(request.url, { method: request.method, headers: request.headers, body, signal: request.signal })
}

/** Reads the rest of a refused body and keeps none of it, until it ends or the connection does. */
async function drop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    while (!(await reader.read()).done) { /* dropped */ }
  } catch { /* the connection ended */ }
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
      req.url = to.path
      proxy.web(req, res, { target: to.target, headers: to.headers })
    },
    ws(req: IncomingMessage, socket: Duplex, head: Buffer, to: ProxyTarget): void {
      req.url = to.path
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
