import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { errorMessage, localRequestRefusal } from '@lincyaw/kernel'
import { createProxyServer } from 'http-proxy-3'

export interface WorkspaceDevProxy {
  port: number
  close(): Promise<void>
}

/**
 * Serves the workspace site in development on one port: each request, WebSockets included, goes to the dev server of the
 * path's document or of the home page (`portFor`), on the loopback address `target`; requests from other sites are refused.
 */
export async function startWorkspaceDevProxy(portFor: (path: string) => Promise<number>, listen: { address: string, port: number, target: string }): Promise<WorkspaceDevProxy> {
  const proxy = createProxyServer({ ws: true, xfwd: false })
  proxy.on('error', (error: Error, _req: unknown, res: unknown) => {
    const response = res as ServerResponse | Duplex | undefined
    if (response && 'writeHead' in response && !response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(`site proxy error: ${error.message}`)
    } else {
      response?.destroy?.()
    }
  })
  const pathOf = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://site').pathname
  const server = createServer((req, res) => {
    const refused = localRequestRefusal(req.headers)
    if (refused) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(refused)
      return
    }
    const path = pathOf(req)
    portFor(path).then(
      port => proxy.web(req, res, { target: `http://${listen.target}:${port}` }),
      (error: unknown) => {
        if (res.headersSent) return res.destroy()
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`the site could not show ${path}: ${errorMessage(error)}`)
      },
    )
  })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (localRequestRefusal(req.headers)) return socket.destroy()
    portFor(pathOf(req)).then(
      port => proxy.ws(req, socket, head, { target: `http://${listen.target}:${port}` }),
      () => socket.destroy(),
    )
  })
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(listen.port, listen.address, () => resolve((server.address() as AddressInfo).port))
  })
  return {
    port,
    async close() {
      proxy.close()
      await new Promise<void>((done) => {
        server.close(() => done())
        server.closeAllConnections()
      })
    },
  }
}
