/**
 * Vite plugin of the generated VitePress project. It runs inside the
 * VitePress process, so it imports Node built-ins, MiniSearch and the pure
 * domain only.
 *
 * - `virtual:presmium/ir` is the IR document, read from the file the renderer
 *   writes, and its `revision` (a hash of the file).
 * - In the dev server, live updates arrive from the `presmium dev` process over
 *   the IPC channel and go to the browsers over Vite's WebSocket as the
 *   custom event `presmium:update` (docs/ir.md section 8.3), with the revision
 *   they apply to and the one they make. The module is invalidated, so a page
 *   loaded later gets the new IR, but no reload is sent. A page that missed an
 *   update (loaded while the deck was compiling, or reconnected) gets the
 *   current document from `GET /__presmium/ir` (`{ revision, doc }`).
 * - `GET /__presmium/source?file=&line=` asks the `presmium dev` process to
 *   open a source file in the author's editor (K-11).
 * - The local search index is the renderer's own, of the same shape as
 *   VitePress's: MiniSearch over the documents the renderer writes (a section
 *   each, in document order), with the deck's tokenizer, in the two modules
 *   the search box imports. A build indexes them in that order, so the index,
 *   and with it every chunk and the service worker's cache id, is the same in
 *   every build of the same deck (VitePress indexes its pages concurrently, in
 *   the order they happen to finish). In the dev server the index follows the
 *   edits too (VitePress 1.6 indexes a page only at startup there): the loader
 *   of the index module imports the index under a new URL at each call, so a
 *   search box opened after an update loads the current index (the browser
 *   keeps a module per URL), and each live update hot updates the index
 *   module for a search box that is open (it accepts that module).
 *
 *   Known risk: the two module ids and the search box's hot update are
 *   VitePress 1.6 internals, not its documented API. The search cases of
 *   e2e/web.spec.ts (build) and e2e/viewer.spec.ts (dev) fail when they change.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import MiniSearch from 'minisearch'
import { localRequestRefusal, tokenize } from '@presmium/kernel'
import { IR_ENDPOINT, SOURCE_ENDPOINT } from '../domain/links.ts'

export const IR_MODULE = 'virtual:presmium/ir'
export const UPDATE_EVENT = 'presmium:update'
const RESOLVED = `\0${IR_MODULE}`

/** The revision of a published document: a hash of its JSON, as the renderer writes it. */
export function revisionOf(json: string): string {
  return createHash('sha256').update(json).digest('hex').slice(0, 16)
}

/** A live update as the pages get it: the update, the revision it applies to (`base`) and the one it makes. */
export interface UpdateEvent {
  update: unknown
  base: string
  revision: string
}

/** Messages between `presmium dev` and the VitePress process. */
export type DevMessage =
  | ({ type: 'presmium:update' } & UpdateEvent)
  | { type: 'presmium:ready', port: number }
  /** A file of the published IR (relative to the deck) and a line, to open in the editor. */
  | { type: 'presmium:source', file: string, line: number }
  /** The translations changed, the original did not: pages loaded later get them. */
  | { type: 'presmium:translations' }

interface Request { url?: string, method?: string, headers: Record<string, string | string[] | undefined> }
interface Response { statusCode: number, setHeader(name: string, value: string): void, end(body?: string): void }

interface Module { id: string | null }

/** The part of Vite's dev server the plugin uses. */
interface DevServer {
  config: { server: { allowedHosts?: true | string[] } }
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
 * index of a locale, `root` (the original) or a translation's language;
 * VitePress resolves `@localSearchIndex…` to `/@localSearchIndex…`.
 */
const SEARCH_INDEX = '/@localSearchIndex'

/** The local search index of the documents, as VitePress builds it: title, headings and text of each section. */
function searchIndex(documentsFile: string): string {
  const index = new MiniSearch({ fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'], tokenize })
  index.addAll(JSON.parse(readFileSync(documentsFile, 'utf8')))
  return JSON.stringify(index)
}

/** The file of a translation beside the original's (`ir.json` -> `ir.en.json`), as ./site.ts writes it. */
function localeFile(file: string, lang: string): string {
  return file.replace(/\.json$/, `.${lang}.json`)
}

/** The Vite plugin of a project without an IR (a workspace site's home page): it tells the parent process once the dev server listens. */
export function presmiumReady() {
  return {
    name: 'presmium:ready',
    configureServer(server: DevServer) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        if (address && typeof address === 'object') process.send?.({ type: 'presmium:ready', port: address.port } satisfies DevMessage)
      })
    },
  }
}

/**
 * The site's Vite plugin. `endpoints` are the dev server's own paths: the
 * defaults in `presmium dev`; under the document's base in a workspace site,
 * where `presmium serve` answers `/__presmium/` itself. `locales` are the
 * languages of the translations (P-123): `virtual:presmium/ir` loads each one's
 * IR lazily (`translations`, from `virtual:presmium/ir/<lang>`), and each has
 * its search index.
 */
export function presmiumIR(irFile: string, searchDocuments: string, endpoints: { ir: string, source: string } = { ir: IR_ENDPOINT, source: SOURCE_ENDPOINT }, locales: string[] = []) {
  let dev = false
  const names = ['root', ...locales]
  const documentsOf = (name: string) => (name === 'root' ? searchDocuments : localeFile(searchDocuments, name))
  return {
    name: 'presmium:ir',
    // Its search index modules come before VitePress's.
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id === IR_MODULE) return RESOLVED
      return id.startsWith(`${IR_MODULE}/`) && locales.includes(id.slice(IR_MODULE.length + 1)) ? `\0${id}` : undefined
    },
    load(id: string) {
      if (id === RESOLVED) {
        const json = readFileSync(irFile, 'utf8')
        const translations = locales.map(lang => `${JSON.stringify(lang)}: () => import(${JSON.stringify(`${IR_MODULE}/${lang}`)})`)
        return `export default JSON.parse(${JSON.stringify(json)})\nexport const revision = ${JSON.stringify(revisionOf(json))}\nexport const translations = { ${translations.join(', ')} }`
      }
      if (id.startsWith(`${RESOLVED}/`)) return `export default JSON.parse(${JSON.stringify(readFileSync(localeFile(irFile, id.slice(RESOLVED.length + 1)), 'utf8'))})`
      // Hot updates add a timestamp to the module ids.
      const module = id.split('?')[0]!
      if (module === SEARCH_INDEX) {
        // In dev relative to the index module, so under the site's base; Vite drops the `t` query.
        const load = (name: string) => dev ? `import(/* @vite-ignore */ ${JSON.stringify(`.${SEARCH_INDEX}${name}?t=`)} + Date.now())` : `import(${JSON.stringify(`${SEARCH_INDEX.slice(1)}${name}`)})`
        return `export default { ${names.map(name => `${JSON.stringify(name)}: () => ${load(name)}`).join(', ')} }`
      }
      const name = module.startsWith(SEARCH_INDEX) ? module.slice(SEARCH_INDEX.length) : undefined
      if (name && names.includes(name)) return `export default ${JSON.stringify(searchIndex(documentsOf(name)))}`
      return undefined
    },
    configureServer(server: DevServer) {
      dev = true
      const refreshSearch = () => {
        const index = server.moduleGraph.getModuleById(SEARCH_INDEX)
        // Not loaded before a page opens the search box.
        if (!index) return
        for (const name of names) {
          const module = server.moduleGraph.getModuleById(`${SEARCH_INDEX}${name}`)
          if (module) server.moduleGraph.invalidateModule(module, new Set(), Date.now(), true)
        }
        void server.reloadModule(index)
      }
      const receive = (message: DevMessage) => {
        if (message?.type !== 'presmium:update' && message?.type !== 'presmium:translations') return
        // The original's IR and the translations', which the pages read when they load.
        for (const id of [RESOLVED, ...locales.map(lang => `${RESOLVED}/${lang}`)]) {
          const module = server.moduleGraph.getModuleById(id)
          if (module) server.moduleGraph.invalidateModule(module)
        }
        if (message.type === 'presmium:update') server.ws.send(UPDATE_EVENT, { update: message.update, base: message.base, revision: message.revision } satisfies UpdateEvent)
        refreshSearch()
      }
      process.on('message', receive)
      server.httpServer?.once('close', () => process.off('message', receive))
      // These run before Vite's host and CORS checks: refuse other sites' pages (DNS rebinding, cross-site requests).
      const refused = (req: { headers: Record<string, string | string[] | undefined> }, res: { statusCode: number, end(body?: string): void }) => {
        const reason = localRequestRefusal(req.headers, server.config.server.allowedHosts)
        if (reason) {
          res.statusCode = 403
          res.end(reason)
        }
        return reason !== undefined
      }
      server.middlewares.use(endpoints.ir, (req, res) => {
        if (refused(req, res)) return
        const json = readFileSync(irFile, 'utf8')
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(`{"revision":${JSON.stringify(revisionOf(json))},"doc":${json}}`)
      })
      server.middlewares.use(endpoints.source, (req, res) => {
        if (refused(req, res)) return
        // Opening the editor is a POST with Presmium's own header, which a page of another site cannot send without CORS.
        if (req.method !== 'POST' || req.headers['presmium-request'] !== 'source') {
          res.statusCode = 405
          res.end()
          return
        }
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
