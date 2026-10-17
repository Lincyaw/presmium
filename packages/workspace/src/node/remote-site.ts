/**
 * A view of the workspace site whose dev server runs in agent-host (SHARED,
 * docs/architecture.md 10.2, 10.8). serve forwards a member's requests to a
 * small router of its own on this machine: it finds the document a path is
 * under, compiles it and sends its IR to agent-host before the first request
 * of it goes there, then proxies the request (and the HMR WebSocket) to the
 * site in agent-host. agent-host never connects to serve.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { posix } from 'node:path'
import type { Duplex } from 'node:stream'
import { errorMessage } from '@presmium/kernel'
import type { IRDocument, Logger, SiteSpec } from '@presmium/kernel'
import type { DocumentView } from '@presmium/server'
import { createProxyServer } from 'http-proxy-3'
import type { AgentHostClient } from './agent-client.ts'

/** Parts of a path in the workspace a reader's site never serves: git's, the execution cache and the lectures, the outputs. */
const SOURCE_DIRS = new Set(['.git', '.presmium', 'lectures', 'dist'])
/** Files a reader's site never serves from the workspace: the documents' Markdown (teachers' parts too), the configuration, notebooks. */
const SOURCE_FILE = /\.(?:md|markdown|mdx|ya?ml|ipynb|txt)$/i

/** The request target decoded as far as it decodes (an encoding inside an encoding too). */
function decoded(target: string): string {
  let value = target
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(value)
      if (next === value) break
      value = next
    } catch {
      break
    }
  }
  return value
}

/**
 * Why a reader's request does not reach the student view's site (P-55, WP-91), or undefined when it
 * does. The site's dev server serves files of the workspace (Vite's `/@fs/`, `/@id/`, `?raw`): a reader
 * may get the modules of a deck's components, never the sources (a document's whole Markdown, with what
 * is for teachers only), the execution cache, the lectures or the outputs. Only GET and HEAD, no fragment.
 */
export function studentRefusal(method: string | undefined, target: string, root: string): string | undefined {
  if (method !== undefined && method !== 'GET' && method !== 'HEAD') return 'a reader\'s site takes GET and HEAD only'
  if (target.includes('#')) return 'a fragment in the request'
  const text = decoded(target).replace(/\\/g, '/')
  const prefix = root.endsWith('/') ? root : `${root}/`
  // Vite reaches a file by its absolute path after `/@fs` (or an id after `/@id/`).
  for (const marker of text.matchAll(/@(?:fs|id)\/+/g)) {
    const file = posix.normalize(`/${text.slice(marker.index! + marker[0].length).split(/[?#&]/)[0]}`)
    if (file !== root && !file.startsWith(prefix)) continue
    const parts = file.slice(prefix.length).split('/')
    if (file === root || parts.some(part => SOURCE_DIRS.has(part)) || SOURCE_FILE.test(parts.at(-1) ?? '') || !parts.at(-1)) return `${file}: not served to readers`
  }
  return undefined
}

/** The document a path of the site is under: the longest listed directory; undefined for the home page. */
export function documentOfPath(site: SiteSpec, path: string): string | undefined {
  let rest = path.replace(/^\/+/, '')
  try {
    rest = decodeURIComponent(rest)
  } catch {
    // As written.
  }
  return site.documents.map(doc => doc.dir).filter(dir => dir === '' || rest === dir || rest.startsWith(`${dir}/`)).sort((a, b) => b.length - a.length)[0]
}

export class RemoteSite {
  readonly view: DocumentView
  readonly #client: AgentHostClient
  readonly #site: SiteSpec
  readonly #compile: (dir: string) => Promise<IRDocument>
  readonly #log: Logger
  /** The workspace root (the student view's site serves none of its sources). */
  readonly #root: string
  #remote?: Promise<{ id: string, target: string }>
  #router?: Promise<{ url: string, server: Server }>
  /** Documents whose IR the site has, and the sending of it. */
  readonly #sent = new Map<string, Promise<void>>()
  #closed = false

  constructor(client: AgentHostClient, site: SiteSpec, view: DocumentView, compile: (dir: string) => Promise<IRDocument>, log: Logger, root: string) {
    this.#client = client
    this.#site = site
    this.view = view
    this.#compile = compile
    this.#log = log
    this.#root = root
  }

  /** The site in agent-host, created on first use. */
  #remoteSite(): Promise<{ id: string, target: string }> {
    this.#remote ??= this.#client.createSite(this.#site, this.view).then(({ id, port }) => {
      const target = new URL(this.#client.url)
      target.port = String(port)
      target.pathname = ''
      return { id, target: target.origin }
    })
    this.#remote.catch(() => {
      this.#remote = undefined
    })
    return this.#remote
  }

  /** Sends a document's IR before the first request of it reaches the site. */
  #ensure(dir: string): Promise<void> {
    let sent = this.#sent.get(dir)
    if (!sent) {
      sent = (async () => {
        const [{ id }, doc] = await Promise.all([this.#remoteSite(), this.#compile(dir)])
        await this.#client.putDocument(id, dir, doc)
      })()
      sent.catch(() => this.#sent.delete(dir))
      this.#sent.set(dir, sent)
    }
    return sent
  }

  /** A document compiled again: the site gets its IR when it has the document already. */
  async update(dir: string, doc: IRDocument): Promise<void> {
    if (this.#closed || !this.#sent.has(dir)) return
    const { id } = await this.#remoteSite()
    await this.#client.putDocument(id, dir, doc).catch((error: unknown) => this.#log.warn(`the ${this.view} site did not take ${dir}: ${errorMessage(error)}`))
  }

  /** The list of documents changed. */
  async documentsChanged(removed: string[]): Promise<void> {
    for (const dir of removed) this.#sent.delete(dir)
    if (!this.#remote) return
    const { id } = await this.#remoteSite()
    await this.#client.updateSite(id, this.#site).catch((error: unknown) => this.#log.warn(`the ${this.view} site did not take the documents: ${errorMessage(error)}`))
  }

  /** The address serve forwards this view's members to (the router, on this machine). */
  url(): Promise<string> {
    this.#router ??= this.#startRouter()
    return this.#router.then(router => router.url)
  }

  async #startRouter(): Promise<{ url: string, server: Server }> {
    const proxy = createProxyServer({ ws: true, xfwd: false })
    proxy.on('error', (error: Error, _req: unknown, res: unknown) => {
      const response = res as ServerResponse | Duplex | undefined
      if (response && 'writeHead' in response && !response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end(`the site in agent-host did not answer: ${error.message}`)
      } else {
        response?.destroy?.()
      }
    })
    const prepare = async (req: IncomingMessage): Promise<string> => {
      const path = new URL(req.url ?? '/', 'http://site').pathname
      const dir = documentOfPath(this.#site, path)
      const remote = await this.#remoteSite()
      if (dir !== undefined) await this.#ensure(dir)
      return remote.target
    }
    const refused = (req: IncomingMessage) => (this.view === 'student' ? studentRefusal(req.method, req.url ?? '/', this.#root) : undefined)
    const server = createServer((req, res) => {
      const refusal = refused(req)
      if (refusal) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(refusal)
        return
      }
      prepare(req).then(
        target => proxy.web(req, res, { target }),
        (error: unknown) => {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(`the site could not be prepared: ${errorMessage(error)}`)
        },
      )
    })
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (refused(req)) {
        socket.destroy()
        return
      }
      prepare(req).then(target => proxy.ws(req, socket, head, { target }), () => socket.destroy())
    })
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })
    server.once('close', () => proxy.close())
    return { url: `http://127.0.0.1:${port}`, server }
  }

  async close(): Promise<void> {
    this.#closed = true
    const router = await this.#router?.catch(() => undefined)
    if (router) {
      await new Promise<void>((done) => {
        router.server.close(() => done())
        router.server.closeAllConnections()
      })
    }
    const remote = await this.#remote?.catch(() => undefined)
    if (remote) await this.#client.closeSite(remote.id)
  }
}
