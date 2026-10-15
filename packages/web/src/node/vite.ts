/**
 * Vite plugin of the generated VitePress project. It runs inside the
 * VitePress process, so it imports Node built-ins only.
 *
 * - `virtual:presmium/ir` is the IR document, read from the file the renderer writes.
 * - In the dev server, live updates arrive from the `presmium dev` process over
 *   the IPC channel and go to the browsers over Vite's WebSocket as the
 *   custom event `presmium:update` (docs/ir.md section 8.3). The module is
 *   invalidated, so a page loaded later gets the new IR, but no reload is sent.
 */
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'

export const IR_MODULE = 'virtual:presmium/ir'
export const UPDATE_EVENT = 'presmium:update'
const RESOLVED = `\0${IR_MODULE}`

/** Messages between `presmium dev` and the VitePress process. */
export type DevMessage =
  | { type: 'presmium:update', update: unknown }
  | { type: 'presmium:ready', port: number }

/** The part of Vite's dev server the plugin uses. */
interface DevServer {
  httpServer: { once(event: 'listening' | 'close', listener: () => void): unknown, address(): AddressInfo | string | null } | null
  moduleGraph: { getModuleById(id: string): unknown, invalidateModule(module: never): void }
  ws: { send(event: string, data: unknown): void }
}

export function presmiumIR(irFile: string) {
  return {
    name: 'presmium:ir',
    resolveId(id: string) {
      return id === IR_MODULE ? RESOLVED : undefined
    },
    load(id: string) {
      return id === RESOLVED ? `export default JSON.parse(${JSON.stringify(readFileSync(irFile, 'utf8'))})` : undefined
    },
    configureServer(server: DevServer) {
      const receive = (message: DevMessage) => {
        if (message?.type !== 'presmium:update') return
        const module = server.moduleGraph.getModuleById(RESOLVED)
        if (module) server.moduleGraph.invalidateModule(module as never)
        server.ws.send(UPDATE_EVENT, message.update)
      }
      process.on('message', receive)
      server.httpServer?.once('close', () => process.off('message', receive))
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        if (address && typeof address === 'object') process.send?.({ type: 'presmium:ready', port: address.port } satisfies DevMessage)
      })
    },
  }
}
