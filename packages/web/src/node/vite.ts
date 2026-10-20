import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import MiniSearch from 'minisearch'
import { localRequestRefusal, tokenize } from '@lincyaw/kernel'
import { IR_ENDPOINT, SOURCE_ENDPOINT } from '../domain/links.ts'

export const IR_MODULE = 'virtual:presmium/ir'
export const UPDATE_EVENT = 'presmium:update'
const RESOLVED = `\0${IR_MODULE}`

export function revisionOf(json: string): string {
  return createHash('sha256').update(json).digest('hex').slice(0, 16)
}

export interface UpdateEvent {
  update: unknown
  base: string
  revision: string
}

export type DevMessage =
  | ({ type: 'presmium:update' } & UpdateEvent)
  | { type: 'presmium:ready', port: number }
  | { type: 'presmium:source', file: string, line: number }
  | { type: 'presmium:translations' }

interface Request { url?: string, method?: string, headers: Record<string, string | string[] | undefined> }
interface Response { statusCode: number, setHeader(name: string, value: string): void, end(body?: string): void }

interface Module { id: string | null }

interface DevServer {
  config: { server: { allowedHosts?: true | string[] } }
  httpServer: { once(event: 'listening' | 'close', listener: () => void): unknown, address(): AddressInfo | string | null } | null
  middlewares: { use(path: string, handler: (req: Request, res: Response, next?: () => void) => void): unknown }
  moduleGraph: {
    getModuleById(id: string): Module | undefined
    invalidateModule(module: Module, seen?: Set<Module>, timestamp?: number, isHmr?: boolean): void
  }
  ws: { send(event: string, data: unknown): void }
  reloadModule(module: Module): Promise<void>
}

const SEARCH_INDEX = '/@localSearchIndex'

function searchIndex(documentsFile: string): string {
  const index = new MiniSearch({ fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'], tokenize })
  index.addAll(JSON.parse(readFileSync(documentsFile, 'utf8')))
  return JSON.stringify(index)
}

function localeFile(file: string, lang: string): string {
  return file.replace(/\.json$/, `.${lang}.json`)
}

export function presmiumFrame(policy: string) {
  return {
    name: 'presmium:frame',
    configureServer(server: DevServer) {
      server.middlewares.use('/', (_req, res, next) => {
        res.setHeader('Content-Security-Policy', policy)
        next?.()
      })
    },
  }
}

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

export function presmiumIR(irFile: string, searchDocuments: string, endpoints: { ir: string, source: string } = { ir: IR_ENDPOINT, source: SOURCE_ENDPOINT }, locales: string[] = []) {
  let dev = false
  const names = ['root', ...locales]
  const documentsOf = (name: string) => (name === 'root' ? searchDocuments : localeFile(searchDocuments, name))
  return {
    name: 'presmium:ir',
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
      const module = id.split('?')[0]!
      if (module === SEARCH_INDEX) {
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
        if (!index) return
        for (const name of names) {
          const module = server.moduleGraph.getModuleById(`${SEARCH_INDEX}${name}`)
          if (module) server.moduleGraph.invalidateModule(module, new Set(), Date.now(), true)
        }
        void server.reloadModule(index)
      }
      const receive = (message: DevMessage) => {
        if (message?.type !== 'presmium:update' && message?.type !== 'presmium:translations') return
        for (const id of [RESOLVED, ...locales.map(lang => `${RESOLVED}/${lang}`)]) {
          const module = server.moduleGraph.getModuleById(id)
          if (module) server.moduleGraph.invalidateModule(module)
        }
        if (message.type === 'presmium:update') server.ws.send(UPDATE_EVENT, { update: message.update, base: message.base, revision: message.revision } satisfies UpdateEvent)
        refreshSearch()
      }
      process.on('message', receive)
      server.httpServer?.once('close', () => process.off('message', receive))
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
