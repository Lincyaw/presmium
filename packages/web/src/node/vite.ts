/**
 * Vite plugin of the generated VitePress project. It runs inside the
 * VitePress process, so it imports Node built-ins and the pure domain only.
 *
 * - `virtual:presmium/ir` is the IR document, read from the file the renderer writes.
 * - In the dev server, live updates arrive from the `presmium dev` process over
 *   the IPC channel and go to the browsers over Vite's WebSocket as the
 *   custom event `presmium:update` (docs/ir.md section 8.3). The module is
 *   invalidated, so a page loaded later gets the new IR, but no reload is sent.
 * - `GET /__presmium/source?file=&line=` asks the `presmium dev` process to
 *   open a source file in the author's editor (K-11).
 */
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { SOURCE_ENDPOINT } from '../domain/links.ts'

export const IR_MODULE = 'virtual:presmium/ir'
export const UPDATE_EVENT = 'presmium:update'
const RESOLVED = `\0${IR_MODULE}`

/** Messages between `presmium dev` and the VitePress process. */
export type DevMessage =
  | { type: 'presmium:update', update: unknown }
  | { type: 'presmium:ready', port: number }
  /** A file of the published IR (relative to the deck) and a line, to open in the editor. */
  | { type: 'presmium:source', file: string, line: number }

interface Request { url?: string }
interface Response { statusCode: number, end(): void }

/** The part of Vite's dev server the plugin uses. */
interface DevServer {
  httpServer: { once(event: 'listening' | 'close', listener: () => void): unknown, address(): AddressInfo | string | null } | null
  middlewares: { use(path: string, handler: (req: Request, res: Response) => void): unknown }
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
      server.middlewares.use(SOURCE_ENDPOINT, (req, res) => {
        const params = new URL(req.url ?? '', 'http://localhost').searchParams
        const file = params.get('file')
        const line = Number(params.get('line'))
        if (file) process.send?.({ type: 'presmium:source', file, line: Number.isInteger(line) && line > 0 ? line : 1 } satisfies DevMessage)
        res.statusCode = file ? 204 : 400
        res.end()
      })
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        if (address && typeof address === 'object') process.send?.({ type: 'presmium:ready', port: address.port } satisfies DevMessage)
      })
    },
  }
}
