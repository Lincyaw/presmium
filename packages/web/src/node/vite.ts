/**
 * Vite plugin of the generated VitePress project. It runs inside the
 * VitePress process, so it imports Node built-ins, MiniSearch and the pure
 * domain only.
 *
 * - `virtual:presmium/ir` is the IR document, read from the file the renderer writes.
 * - In the dev server, live updates arrive from the `presmium dev` process over
 *   the IPC channel and go to the browsers over Vite's WebSocket as the
 *   custom event `presmium:update` (docs/ir.md section 8.3). The module is
 *   invalidated, so a page loaded later gets the new IR, but no reload is sent.
 * - `GET /__presmium/source?file=&line=` asks the `presmium dev` process to
 *   open a source file in the author's editor (K-11).
 * - In the dev server the local search index follows the edits too. VitePress
 *   1.6 indexes a page only at startup there (its update of a changed page
 *   reads the wrong path and keeps the old entries), so the dev server serves
 *   its own index of the same shape: MiniSearch over the documents the
 *   renderer writes (a section each), with the deck's tokenizer, in the two
 *   modules the search box imports. Each live update hot updates them through
 *   the search box, which accepts its index module. Builds index with
 *   VitePress (`_render`).
 */
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import MiniSearch from 'minisearch'
import { SOURCE_ENDPOINT } from '../domain/links.ts'
import { tokenize } from '../domain/search.ts'

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

interface Module { id: string | null }

/** The part of Vite's dev server the plugin uses. */
interface DevServer {
  httpServer: { once(event: 'listening' | 'close', listener: () => void): unknown, address(): AddressInfo | string | null } | null
  middlewares: { use(path: string, handler: (req: Request, res: Response) => void): unknown }
  moduleGraph: {
    getModuleById(id: string): Module | undefined
    invalidateModule(module: Module, seen?: Set<Module>, timestamp?: number, isHmr?: boolean): void
  }
  ws: { send(event: string, data: unknown): void }
  reloadModule(module: Module): Promise<void>
}

/**
 * The search box's index module (the index of each locale, lazily) and the
 * index of the site's only locale; VitePress resolves `@localSearchIndex…` to `/@localSearchIndex…`.
 */
const SEARCH_INDEX = '/@localSearchIndex'
const SEARCH_INDEX_ROOT = `${SEARCH_INDEX}root`

/** The local search index of the documents, as VitePress builds it: title, headings and text of each section. */
function searchIndex(documentsFile: string): string {
  const index = new MiniSearch({ fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'], tokenize })
  index.addAll(JSON.parse(readFileSync(documentsFile, 'utf8')))
  return JSON.stringify(index)
}

export function presmiumIR(irFile: string, searchDocuments: string) {
  let dev = false
  return {
    name: 'presmium:ir',
    // Its search index modules come before VitePress's.
    enforce: 'pre' as const,
    resolveId(id: string) {
      return id === IR_MODULE ? RESOLVED : undefined
    },
    load(id: string) {
      if (id === RESOLVED) return `export default JSON.parse(${JSON.stringify(readFileSync(irFile, 'utf8'))})`
      // Hot updates add a timestamp to the module ids.
      const module = dev ? id.split('?')[0] : undefined
      if (module === SEARCH_INDEX) return `export default { root: () => import(${JSON.stringify(SEARCH_INDEX_ROOT.slice(1))}) }`
      if (module === SEARCH_INDEX_ROOT) return `export default ${JSON.stringify(searchIndex(searchDocuments))}`
      return undefined
    },
    configureServer(server: DevServer) {
      dev = true
      const refreshSearch = () => {
        const index = server.moduleGraph.getModuleById(SEARCH_INDEX)
        // Not loaded before a page opens the search box.
        if (!index) return
        const root = server.moduleGraph.getModuleById(SEARCH_INDEX_ROOT)
        if (root) server.moduleGraph.invalidateModule(root, new Set(), Date.now(), true)
        void server.reloadModule(index)
      }
      const receive = (message: DevMessage) => {
        if (message?.type !== 'presmium:update') return
        const module = server.moduleGraph.getModuleById(RESOLVED)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send(UPDATE_EVENT, message.update)
        refreshSearch()
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
