import { createServer } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { getRequestListener } from '@hono/node-server'
import { jsonResponse } from '@lincyaw/kernel'
import { bracketIPv6 } from '@lincyaw/kernel/node'
import { createProxyServer } from 'http-proxy-3'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export function hostname(host: string | null | undefined): string {
  if (!host) return ''
  const value = host.trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1)
  if (value.indexOf(':') !== value.lastIndexOf(':')) return `[${value}]`
  return value.replace(/:\d+$/, '')
}

export function isLoopback(host: string | null | undefined): boolean {
  return LOOPBACK.has(hostname(host))
}

export function originHost(origin: string | null | undefined): string | undefined {
  if (origin === null || origin === undefined) return undefined
  try {
    return hostname(new URL(origin).host)
  } catch {
    return ''
  }
}

export function bearer(value: string | null | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(value?.trim() ?? '')
  return match?.[1]
}

export async function limitBody(request: Request, limit: number): Promise<Request | Response> {
  const tooLarge = () => jsonResponse({ error: `the request body is larger than this route takes (${limit} bytes)` }, 413)
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

async function drop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    while (!(await reader.read()).done) {}
  } catch {}
}

export function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export async function send(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}

export function refuseUpgrade(socket: Duplex, status: number): void {
  socket.end(`HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Not Found'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

export interface ProxyTarget {
  target: string
  path: string
  headers?: Record<string, string>
}

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

export type Decision =
  | { kind: 'fetch' }
  | { kind: 'proxy', to: ProxyTarget }
  | { kind: 'answer', response: Response }

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

export function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  })
}

export function urlHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return '127.0.0.1'
  return bracketIPv6(host)
}
