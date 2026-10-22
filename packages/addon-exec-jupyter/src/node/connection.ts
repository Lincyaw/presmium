import type { ServerConnection } from '@jupyterlab/services'
import WebSocket from 'ws'
import type { ClientOptions } from 'ws'
import type { Connection } from '../domain/connection.ts'
import { loadJupyterServices } from '../shared/load-services.ts'

let quiet = false

function quietSockets(): void {
  if (quiet) return
  quiet = true
  const debug = console.debug.bind(console)
  console.debug = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && /^(?:Starting WebSocket|Kernel): /.test(args[0])) return
    debug(...args)
  }
}

/** Settings of a connection from Node: `ws` WebSockets and `fetch`, both with the connection's headers. */
export async function nodeSettings(connection: Connection, signal?: AbortSignal): Promise<ServerConnection.ISettings> {
  quietSockets()
  const { ServerConnection } = await loadJupyterServices()
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
      return fetch(request, signal ? { signal: AbortSignal.any([request.signal, signal]) } : undefined).catch((error: unknown) => {
        const cause = (error as { cause?: { code?: unknown, message?: unknown } }).cause
        const detail = typeof cause?.code === 'string' ? cause.code : typeof cause?.message === 'string' ? cause.message : undefined
        throw detail && error instanceof Error ? new TypeError(`${error.message} (${detail})`) : error
      })
    },
  })
}
