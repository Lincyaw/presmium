/**
 * The Node side's connection to a Jupyter Server: `@jupyterlab/services`
 * settings whose HTTP requests and WebSocket handshakes (the `ws` package,
 * which sends headers) carry the connection's headers, so the token is
 * never in a URL. Through the gateway (SHARED mode) the requests are the
 * kernel's `gatewayFetch`, which follows no redirect: the token never goes
 * to another address.
 */
import { gatewayFetch } from '@presmium/kernel'
import type { ServerConnection } from '@jupyterlab/services'
import WebSocket from 'ws'
import type { ClientOptions } from 'ws'
import type { Connection } from '../domain/connection.ts'
import { EXEC_JUPYTER_ID } from '../domain/index.ts'
import { services } from '../jupyter/kernels.ts'

let quiet = false

/**
 * `@jupyterlab/services` prints each kernel WebSocket it opens and each
 * kernel status with `console.debug`, which in Node is stdout, the output
 * of `presmium build` and `presmium ir`: those lines are dropped.
 */
function quietSockets(): void {
  if (quiet) return
  quiet = true
  const debug = console.debug.bind(console)
  console.debug = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && /^(?:Starting WebSocket|Kernel): /.test(args[0])) return
    debug(...args)
  }
}

export async function nodeSettings(connection: Connection): Promise<ServerConnection.ISettings> {
  quietSockets()
  const { ServerConnection } = await services()
  const headers = connection.headers
  class HeaderSocket extends WebSocket {
    constructor(url: string, protocols?: string | string[], options?: ClientOptions) {
      super(url, protocols, { ...options, headers: { ...options?.headers, ...headers } })
    }
  }
  return ServerConnection.makeSettings({
    baseUrl: connection.url,
    wsUrl: connection.url.replace(/^http/, 'ws'),
    token: '',
    appendToken: false,
    WebSocket: HeaderSocket as unknown as typeof globalThis.WebSocket,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      for (const [name, value] of Object.entries(headers)) request.headers.set(name, value)
      const gateway = connection.gateway && `${connection.gateway.url.replace(/\/+$/, '')}/${EXEC_JUPYTER_ID}/`
      const sent = gateway && request.url.startsWith(gateway)
        ? gatewayFetch(connection.gateway!, EXEC_JUPYTER_ID, request.url.slice(gateway.length), {
            method: request.method,
            headers: request.headers,
            body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
            signal: request.signal,
          })
        : fetch(request)
      // Node's `fetch failed` names its cause (ECONNREFUSED, ENOTFOUND) only there; the services keep the message.
      return sent.catch((error: unknown) => {
        const cause = (error as { cause?: { code?: unknown, message?: unknown } }).cause
        const detail = typeof cause?.code === 'string' ? cause.code : typeof cause?.message === 'string' ? cause.message : undefined
        throw detail && error instanceof Error ? new TypeError(`${error.message} (${detail})`) : error
      })
    },
  })
}
