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
import { existsSync, realpathSync } from 'node:fs'
import { posix } from 'node:path'
import type { Duplex } from 'node:stream'
import { errorMessage } from '@presmium/kernel'
import type { IRDocument, Logger, SiteSpec } from '@presmium/kernel'
import type { DocumentView } from '@presmium/server'
import { createProxyServer } from 'http-proxy-3'
import type { AgentHostClient } from './agent-client.ts'

/** A document's directories whose files a reader's site serves: its components and browser code (the conventions the site loads them by). */
const DECK_BROWSER = new Set(['components', 'src'])

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

/** The nearest directory above `file` with a package.json; undefined for none (or the file system's root). */
function packageOf(file: string): string | undefined {
  for (let dir = posix.dirname(file); dir !== '/'; dir = posix.dirname(dir)) {
    if (existsSync(posix.join(dir, 'package.json'))) return dir
  }
  return undefined
}

/** The parts of `file` below one of `roots`; undefined when it is under none. */
function below(file: string, roots: readonly string[]): string[] | undefined {
  const root = roots.find(r => file === r || file.startsWith(`${r}/`))
  return root === undefined ? undefined : file.slice(root.length).split('/').filter(Boolean)
}

/**
 * Whether a reader's site serves the file at `file` (absolute, normalized; the workspace root is one
 * of `roots`): an allow-list of what the student view's pages load (WP-91).
 * - In the workspace: the operator's packages at its root (`node_modules/`, D14), and in a document
 *   its components and browser code (`components/`, `src/` but not `src/node/`), with what they import
 *   beside them; nothing else (the Markdown, notebooks and data files, solutions, the execution cache,
 *   the lectures, the configuration, git's).
 * - Elsewhere (Presmium's installation, the plugins): installed dependencies (`node_modules/`), and in a
 *   package (the nearest directory with a package.json) its browser parts: `src/` but not `src/node/`,
 *   `components/`, `media/`, a `.vue` or `.css` file at its top; nothing else of the installation.
 */
function servedToReaders(file: string, roots: readonly string[], documents: readonly string[]): boolean {
  if (file.split('/').includes('.git')) return false
  const parts = below(file, roots)
  if (parts) {
    if (parts[0] === 'node_modules') return parts.length > 1
    const rel = parts.join('/')
    const dir = documents.filter(d => d !== '' && rel.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0]
    if (dir === undefined) return false
    const inner = rel.slice(dir.length + 1).split('/')
    return inner.length > 1 && DECK_BROWSER.has(inner[0]!) && !(inner[0] === 'src' && inner[1] === 'node')
  }
  if (file.split('/').includes('node_modules')) return true
  const pkg = packageOf(file)
  if (!pkg) return false
  const [top = '', next] = file.slice(pkg.length + 1).split('/')
  if (next === undefined) return /\.(?:vue|css)$/i.test(top)
  return top === 'components' || top === 'media' || (top === 'src' && next !== 'node')
}

/**
 * Why a reader's request does not reach the student view's site (P-55, WP-91), or undefined when it
 * does. The site's dev server serves files by their absolute paths (Vite's `/@fs/`, an id after
 * `/@id/`, with `?raw`): a reader gets only what the student view's pages load (`servedToReaders`, for
 * the path asked for and for the file it really is, so a link leads no further), never a document's
 * source with what is for teachers only. Only GET and HEAD, no fragment.
 */
export function studentRefusal(method: string | undefined, target: string, roots: readonly string[], documents: readonly string[]): string | undefined {
  if (method !== undefined && method !== 'GET' && method !== 'HEAD') return 'a reader\'s site takes GET and HEAD only'
  if (target.includes('#')) return 'a fragment in the request'
  const text = decoded(target).replace(/\\/g, '/')
  // A browser sends no `..`; the dev server would resolve one, out of its project into the documents.
  if (text.split(/[?#]/)[0]!.split('/').includes('..')) return 'a path with ..'
  for (const marker of text.matchAll(/@(fs|id)\/(\/*)/g)) {
    let rest = text.slice(marker.index! + marker[0].length).split(/[?#]/)[0]!
    if (marker[1] === 'id' && !marker[2]) {
      // An id after `/@id/`: a virtual module, or a bare import the site resolves in its own packages;
      // one that is a path is a file, and a relative one is refused.
      rest = rest.replace(/^(?:__x00__|\0)/, '')
      if (rest.startsWith('.') || rest.split('/').includes('..')) return `${rest}: not served to readers`
      if (!rest.startsWith('/')) continue
    }
    const file = posix.normalize(`/${rest}`)
    let real = file
    try {
      real = realpathSync(file)
    } catch {
      // Not there: the site has nothing to give either.
    }
    if (!servedToReaders(file, roots, documents) || !servedToReaders(real, roots, documents)) return `${file}: not served to readers`
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
  /** The workspace root, as given and as it really is (the student view's site serves none of its sources). */
  readonly #roots: string[]
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
    this.#roots = [...new Set([root, realpathSync(root)])]
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
    const refused = (req: IncomingMessage) => (this.view === 'student' ? studentRefusal(req.method, req.url ?? '/', this.#roots, this.#site.documents.map(doc => doc.dir)) : undefined)
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
