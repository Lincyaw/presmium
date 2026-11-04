import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { createProxyServer } from 'http-proxy-3'

export interface ProxyOptions {
  host: string
  port: number
  target: string
}

export interface Proxy {
  close(): Promise<void>
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

export async function startProxy(options: ProxyOptions): Promise<Proxy> {
  const proxy = createProxyServer({ ws: true, xfwd: false })
  proxy.on('error', (error: Error, _request: unknown, response: unknown) => {
    const answer = response as { writeHead?: (status: number, headers: Record<string, string>) => void, end?: (body: string) => void, destroy?: () => void, headersSent?: boolean } | undefined
    if (answer?.writeHead && answer.end && !answer.headersSent) {
      answer.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      answer.end(`proxy error: ${error.message}`)
    } else {
      answer?.destroy?.()
    }
  })
  const upgrades = new Set<Duplex>()
  const server: Server = createServer((request, response) => {
    request.url = request.url ?? '/'
    proxy.web(request, response, { target: options.target })
  })
  server.on('upgrade', (request, socket, head) => {
    upgrades.add(socket)
    socket.once('close', () => upgrades.delete(socket))
    request.url = request.url ?? '/'
    proxy.ws(request, socket, head, { target: options.target })
  })
  try {
    await listen(server, options.port, options.host)
  } catch (error) {
    proxy.close()
    throw error
  }
  return {
    close: () => new Promise((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
      for (const socket of upgrades) socket.destroy()
      proxy.close()
    }),
  }
}
