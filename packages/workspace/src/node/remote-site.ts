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
import type { Duplex } from 'node:stream'
import { errorMessage } from '@presmium/kernel'
import type { IRDocument, Logger, SiteSpec } from '@presmium/kernel'
import type { DocumentView } from '@presmium/server'
import { createProxyServer } from 'http-proxy-3'
import type { AgentHostClient } from './agent-client.ts'

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
  #remote?: Promise<{ id: string, target: string }>
  #router?: Promise<{ url: string, server: Server }>
  /** Documents whose IR the site has, and the sending of it. */
  readonly #sent = new Map<string, Promise<void>>()
  #closed = false

  constructor(client: AgentHostClient, site: SiteSpec, view: DocumentView, compile: (dir: string) => Promise<IRDocument>, log: Logger) {
    this.#client = client
    this.#site = site
    this.view = view
    this.#compile = compile
    this.#log = log
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
    const server = createServer((req, res) => {
      prepare(req).then(
        target => proxy.web(req, res, { target }),
        (error: unknown) => {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(`the site could not be prepared: ${errorMessage(error)}`)
        },
      )
    })
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
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
