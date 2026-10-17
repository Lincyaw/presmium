/**
 * The readers' site in SHARED mode (D17, WP-91b, docs/architecture.md 10.10): static, built for the
 * audience `student` by agent-host, never a dev server. A reader's request never reaches the sandbox:
 * serve answers it from the files of a build, which it keeps in a directory of its own (only serve
 * writes there), after scanning them for what its own compilation left out for students; a small
 * static file server on this machine, to which the server forwards readers, answers GET and HEAD with
 * those files and nothing else: no module of a dev server, no source, no WebSocket.
 *
 * A document is built when a reader first asks for it, the home page likewise, one build at a time;
 * then again, debounced, once what it is made of changed (its directory, or a file its compilation
 * read). Until its first build is in place the reader gets a page that says it is being updated and
 * reloads itself; a build that fails leaves the one before served and is logged. The build before the
 * newest stays for the pages loaded from it (their hashed assets).
 */
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, createReadStream, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, rmSync, writeSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, extname, join } from 'node:path'
import type { Duplex } from 'node:stream'
import type { Compilation } from '@presmium/compiler'
import { DEFAULT_LANG, deckLocale, errorMessage } from '@presmium/kernel'
import type { Logger, SiteSpec } from '@presmium/kernel'
import type { SiteState } from '../domain/api.ts'
import { WORKSPACE_MESSAGES } from '../domain/messages.ts'
import type { AgentHostClient } from './agent-client.ts'
import { STUDENT } from './audience.ts'

/** The live list of documents the home page reads (as `@presmium/web`'s served home page asks for it). */
const DOCUMENTS_ENDPOINT = '@presmium/documents.json'
/** How long a document stays quiet after a change before it is built, and the longest a change waits. */
const QUIET_MS = 2000
const LONGEST_MS = 15_000
/** How often the directories of the documents readers asked for are looked at for changes. */
const POLL_MS = 3000
/** Limits of a build serve takes: its files, their bytes, a path. */
const MAX_FILES = 20_000
const MAX_BYTES = 1 << 30
const MAX_PATH = 1024
/** Entries of a document's directory looked at for a change, at most. */
const MAX_ENTRIES = 20_000
/** Directories of a document whose changes do not change its pages: what builds and tools write. */
const UNWATCHED = new Set(['.presmium', 'dist', 'node_modules', '.git'])

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

/** A build of the home page or of a document: its id and directory. */
interface Build {
  id: string
  dir: string
}

/** The readers' site of the home page (`doc` undefined) or of a document. */
interface Entry {
  doc?: string
  /** Newest first: the one served, and the one before for the pages loaded from it. */
  builds: Build[]
  state: 'idle' | 'queued' | 'building'
  /** It changed while it was built: built once more after. */
  again: boolean
  /** A reader asked for it: it is built, and kept up to date. */
  asked: boolean
  /** What it was made of when its last build started (see `#stamp`). */
  stamp?: string
  /** The last build failed. */
  failed: boolean
  timer?: NodeJS.Timeout
  /** When the change the timer waits to build came first. */
  since?: number
}

export interface StudentSiteOptions {
  client: AgentHostClient
  /** The site's documents, kept in place by serve. */
  spec: SiteSpec
  root: string
  /** serve's own directory for the builds. */
  state: string
  /** A document's compilation in serve (the scan of a build reads what it left out for students). */
  compile(dir: string): Promise<Compilation>
  /** A document's latest compilation in serve, if any. */
  latest(dir: string): Compilation | undefined
  /** The plugins a build of a document needs at the gateway. */
  plugins(dir: string): string[]
  log: Logger
}

/** The parts of a request's path, each decoded once; undefined for one a build never holds (`.` or `..`, a separator or NUL in a part). */
export function pathParts(pathname: string): string[] | undefined {
  if (!pathname.startsWith('/') || pathname.length > MAX_PATH) return undefined
  const parts: string[] = []
  const raw = pathname.slice(1).split('/')
  for (const [i, part] of raw.entries()) {
    let name: string
    try {
      name = decodeURIComponent(part)
    } catch {
      return undefined
    }
    // Only the last part may be empty (a directory's index).
    if (name === '' && i < raw.length - 1) return undefined
    if (name === '.' || name === '..' || /[/\\\0]/.test(name)) return undefined
    parts.push(name)
  }
  return parts
}

/** Whether a request is for a page of a site (a directory's index, an `.html` file, a page without its extension), not for a file or a module. */
function pageLike(rest: string[], target: string): boolean {
  const query = target.includes('?') ? target.slice(target.indexOf('?') + 1) : ''
  if (/(?:^|&)(?:raw|import|url|inline|worker|direct)(?:[=&]|$)/.test(query)) return false
  if (rest.some(part => part.startsWith('@') || part.startsWith('__'))) return false
  const last = rest.at(-1) ?? ''
  return last === '' || last.endsWith('.html') || !last.includes('.')
}

/** A regular file of a build at `parts` (a directory's `index.html`, a page without its `.html`); undefined for none. */
function buildFile(dir: string, parts: string[]): string | undefined {
  const names = parts.at(-1) === '' ? [...parts.slice(0, -1), 'index.html'] : parts
  const kind = (file: string) => lstatSync(file, { throwIfNoEntry: false })
  let file = join(dir, ...names)
  let found = kind(file)
  if (found?.isDirectory()) {
    file = join(file, 'index.html')
    found = kind(file)
  } else if (!found && !extname(file)) {
    file = `${file}.html`
    found = kind(file)
  }
  return found?.isFile() ? file : undefined
}

/** A file, whole or the byte range the request asks for, with the headers of a static file. */
function sendFile(req: IncomingMessage, res: ServerResponse, file: string, status = 200): void {
  // Opened without following a link (serve wrote regular files only); what is sent is what was opened.
  let fd: number
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  } catch {
    return notFound(res)
  }
  const { size } = fstatSync(fd)
  const assets = /\/assets\//.test(file.replaceAll('\\', '/'))
  const headers: Record<string, string> = {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    // Hashed assets never change; the rest may with the next build.
    'Cache-Control': assets && status === 200 ? 'public, max-age=31536000, immutable' : 'no-cache',
  }
  const range = status === 200 ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '') : null
  let start = 0
  let end = size - 1
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start >= size || start > end) {
      closeSync(fd)
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end()
      return
    }
    status = 206
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  }
  headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1)
  res.writeHead(status, headers)
  if (req.method === 'HEAD' || size === 0) {
    closeSync(fd)
    res.end()
    return
  }
  createReadStream('', { fd, start, end }).pipe(res)
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' })
  res.end('not found')
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
}

/** Writes a build's files as they come into a new directory of serve's, each path checked, within the limits. */
class Received {
  readonly dir: string
  #path?: string
  #fd?: number
  #files = 0
  #bytes = 0

  constructor(dir: string) {
    this.dir = dir
    mkdirSync(dir, { recursive: true })
  }

  write(path: string, chunk: Buffer): void {
    if (path !== this.#path) {
      this.close()
      const parts = path.length <= MAX_PATH ? pathParts(`/${path}`) : undefined
      if (!parts || parts.at(-1) === '') throw new Error(`the build sent a file at ${JSON.stringify(path)}`)
      if (++this.#files > MAX_FILES) throw new Error(`the build has more than ${MAX_FILES} files`)
      const file = join(this.dir, ...parts)
      mkdirSync(dirname(file), { recursive: true })
      // A new file: a path the build sent before is refused (`wx`).
      this.#fd = openSync(file, 'wx', 0o644)
      this.#path = path
    }
    this.#bytes += chunk.length
    if (this.#bytes > MAX_BYTES) throw new Error(`the build has more than ${MAX_BYTES} bytes`)
    if (chunk.length > 0) writeSync(this.#fd!, chunk)
  }

  close(): void {
    if (this.#fd !== undefined) closeSync(this.#fd)
    this.#fd = undefined
  }
}

export class StudentSite {
  readonly #options: StudentSiteOptions
  readonly #home: Entry = { builds: [], state: 'idle', again: false, asked: false, failed: false }
  readonly #documents = new Map<string, Entry>()
  #queue: Promise<void> = Promise.resolve()
  readonly #stop = new AbortController()
  #poll?: NodeJS.Timeout
  #server?: Promise<{ url: string, server: Server }>

  constructor(options: StudentSiteOptions) {
    this.#options = options
    rmSync(join(options.state, 'builds'), { recursive: true, force: true })
  }

  /** The address serve forwards readers to (the static file server, on this machine). */
  url(): Promise<string> {
    this.#server ??= this.#listen()
    return this.#server.then(started => started.url)
  }

  /** How a reader's pages of a document (or of the home page, '') are now. */
  status(dir: string): SiteState {
    const entry = dir === '' ? this.#home : this.#documents.get(dir)
    if (!entry) return { kind: 'static' }
    const updating = entry.state !== 'idle' || entry.timer !== undefined
    return { kind: 'static', updating, ...entry.builds[0] ? { version: entry.builds[0].id } : {} }
  }

  /** A document's compilation in serve changed: built again if a reader has it and what it is made of changed. */
  compiled(dir: string): void {
    const entry = this.#documents.get(dir)
    if (entry?.asked) this.#changed(entry)
  }

  /** The list of documents changed: those removed go; the home page is built again. */
  documentsChanged(removed: string[]): void {
    for (const dir of removed) {
      const entry = this.#documents.get(dir)
      if (!entry) continue
      clearTimeout(entry.timer)
      this.#documents.delete(dir)
      for (const build of entry.builds) rmSync(build.dir, { recursive: true, force: true })
    }
    if (this.#home.asked) this.#schedule(this.#home)
  }

  async close(): Promise<void> {
    this.#stop.abort()
    clearInterval(this.#poll)
    for (const entry of [this.#home, ...this.#documents.values()]) clearTimeout(entry.timer)
    const started = await this.#server?.catch(() => undefined)
    if (started) {
      await new Promise<void>((done) => {
        started.server.close(() => done())
        started.server.closeAllConnections()
      })
    }
    await this.#queue
  }

  /** The entry of the document a request's path is under (the longest listed directory), with the rest of the path; else the home page's. */
  #entryOf(parts: string[]): { entry: Entry, rest: string[], dir?: string } {
    const dir = this.#options.spec.documents.map(doc => doc.dir).filter((d) => {
      const own = d.split('/')
      return d !== '' && own.length <= parts.length && own.every((part, i) => parts[i] === part)
    }).sort((a, b) => b.length - a.length)[0]
    if (dir === undefined) return { entry: this.#home, rest: parts }
    let entry = this.#documents.get(dir)
    if (!entry) {
      entry = { doc: dir, builds: [], state: 'idle', again: false, asked: false, failed: false }
      this.#documents.set(dir, entry)
    }
    return { entry, rest: parts.slice(dir.split('/').length), dir }
  }

  /** A reader asked for it: built now when it has no build yet (one that failed waits for a change). */
  #ask(entry: Entry): void {
    if (entry.asked) return
    entry.asked = true
    this.#schedule(entry)
    this.#poll ??= setInterval(() => this.#look(), POLL_MS)
  }

  /** What a document is made of now, cheaply: its directory's entries (not through links) and its compilation's student view. */
  #stamp(entry: Entry): string {
    if (entry.doc === undefined) return ''
    const hash = createHash('sha256')
    let seen = 0
    const walk = (dir: string, rel: string) => {
      let names: string[]
      try {
        names = readdirSync(dir).sort()
      } catch {
        return
      }
      for (const name of names) {
        if (++seen > MAX_ENTRIES) return
        if (rel === '' && UNWATCHED.has(name)) continue
        const path = join(dir, name)
        const stat = lstatSync(path, { throwIfNoEntry: false })
        if (!stat) continue
        hash.update(`${rel}/${name}\0${stat.mode}\0${stat.size}\0${stat.mtimeMs}\0${stat.ino}\n`)
        if (stat.isDirectory()) walk(path, `${rel}/${name}`)
      }
    }
    walk(join(this.#options.root, entry.doc), '')
    const latest = this.#options.latest(entry.doc)
    if (latest) hash.update(this.#viewDigest(latest))
    return hash.digest('hex')
  }

  /** The digest of a compilation's student view, made once per compilation. */
  readonly #views = new WeakMap<Compilation, string>()
  #viewDigest(compilation: Compilation): string {
    let digest = this.#views.get(compilation)
    if (digest === undefined) {
      digest = createHash('sha256').update(JSON.stringify(compilation.forAudience(STUDENT))).digest('hex')
      this.#views.set(compilation, digest)
    }
    return digest
  }

  /** The documents readers asked for whose directory changed since their last build. */
  #look(): void {
    for (const entry of this.#documents.values()) {
      if (entry.asked && entry.state === 'idle' && entry.timer === undefined && this.#stamp(entry) !== entry.stamp) this.#changed(entry)
    }
  }

  /** A change: the entry is built once it stayed quiet a moment (at most `LONGEST_MS` after the first change). */
  #changed(entry: Entry): void {
    if (this.#stop.signal.aborted) return
    clearTimeout(entry.timer)
    entry.since ??= Date.now()
    const wait = Math.max(0, Math.min(QUIET_MS, entry.since + LONGEST_MS - Date.now()))
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      entry.since = undefined
      if (this.#stamp(entry) !== entry.stamp || entry.doc === undefined) this.#schedule(entry)
    }, wait)
  }

  #schedule(entry: Entry): void {
    if (this.#stop.signal.aborted) return
    if (entry.state === 'building') {
      entry.again = true
      return
    }
    if (entry.state === 'queued') return
    entry.state = 'queued'
    this.#queue = this.#queue.then(() => this.#build(entry))
  }

  async #build(entry: Entry): Promise<void> {
    const { client, spec, state, log } = this.#options
    const name = entry.doc === undefined ? 'the home page' : entry.doc
    if (this.#stop.signal.aborted) return
    entry.state = 'building'
    entry.again = false
    const id = randomUUID()
    const dir = join(state, 'builds', id)
    let received: Received | undefined
    try {
      // serve's compilation first: the build's scan reads it, and what the document is made of includes it.
      const compilation = entry.doc === undefined ? undefined : await this.#options.compile(entry.doc)
      entry.stamp = this.#stamp(entry)
      received = new Received(dir)
      const plugins = entry.doc === undefined ? [] : this.#options.plugins(entry.doc)
      await client.studentSite(spec, entry.doc, plugins, (path, chunk) => received!.write(path, chunk), this.#stop.signal)
      received.close()
      // serve's own scan: no sentence of what its compilation leaves out for students reaches them.
      const leaks = compilation ? await compilation.audienceOf(STUDENT).scan(dir, undefined, { quote: false }) : []
      if (leaks.length > 0) throw new Error(`it holds content not for students: ${leaks.map(f => f.message).join('; ')}`)
      // In place from now on; the build before stays for the pages loaded from it, the others go.
      for (const old of entry.builds.splice(1)) rmSync(old.dir, { recursive: true, force: true })
      entry.builds.unshift({ id, dir })
      entry.failed = false
      log.info(`the readers' site of ${name} is built`)
    } catch (error) {
      received?.close()
      rmSync(dir, { recursive: true, force: true })
      if (this.#stop.signal.aborted) return
      entry.failed = true
      log.error(`the readers' site of ${name} was not built (readers keep ${entry.builds.length > 0 ? 'the build before' : 'the page that says it is being updated'}): ${errorMessage(error)}`)
    } finally {
      entry.state = 'idle'
      if (entry.again) this.#schedule(entry)
    }
  }

  /** The page a reader gets before a document's first build is in place (or when none succeeded): it reloads itself. */
  #pending(req: IncomingMessage, res: ServerResponse, dir: string | undefined, entry: Entry): void {
    const lang = this.#options.spec.documents.find(doc => doc.dir === dir)?.lang
      ?? (typeof this.#options.spec.config.lang === 'string' ? this.#options.spec.config.lang : DEFAULT_LANG)
    const t = WORKSPACE_MESSAGES[deckLocale(lang)]
    const failed = entry.failed && entry.state === 'idle'
    const text = failed ? t.siteUnavailable : t.sitePreparing
    const wait = failed ? 30 : 3
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(wait), 'X-Content-Type-Options': 'nosniff' })
    if (req.method === 'HEAD') return void res.end()
    res.end(`<!doctype html>\n<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta http-equiv="refresh" content="${wait}"><title>${escapeHtml(this.#options.spec.title)}</title></head>\n<body><p class="pm-site-pending" data-state="${failed ? 'failed' : 'building'}">${escapeHtml(text)}</p></body></html>\n`)
  }

  #handle(req: IncomingMessage, res: ServerResponse): void {
    // GET and HEAD of a path: nothing else is here.
    const target = req.url ?? '/'
    if ((req.method !== 'GET' && req.method !== 'HEAD') || target.includes('#')) return notFound(res)
    const pathname = target.split('?')[0]!
    if (pathname === `/${DOCUMENTS_ENDPOINT}`) {
      const { spec } = this.#options
      const documents = spec.documents.filter(doc => doc.dir !== '').map(({ dir, title, lang, tags }) => ({ dir, title, ...lang ? { lang } : {}, ...tags?.length ? { tags } : {}, href: `/${encodeURI(dir).replace(/[#?]/g, char => encodeURIComponent(char))}/` }))
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      return void res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ title: spec.title, documents }))
    }
    const parts = pathParts(pathname)
    if (!parts) return notFound(res)
    const { entry, rest, dir } = this.#entryOf(parts)
    // A document's directory without its final slash: its pages are under it.
    if (dir !== undefined && rest.length === 0) {
      res.writeHead(301, { 'Location': `${pathname}/`, 'Cache-Control': 'no-cache' })
      return void res.end()
    }
    this.#ask(entry)
    const [current, before] = entry.builds
    // Before the first build only a page gets the page that says it is being updated; an asset, a dev server's
    // module (`@id`, `@fs`, `?raw`, ...) or any other file is not there.
    if (!current) return pageLike(rest, target) ? this.#pending(req, res, dir, entry) : notFound(res)
    const file = buildFile(current.dir, rest) ?? (before && rest[0] === 'assets' ? buildFile(before.dir, rest) : undefined)
    if (file) return sendFile(req, res, file)
    const missing = buildFile(current.dir, ['404.html'])
    return missing ? sendFile(req, res, missing, 404) : notFound(res)
  }

  async #listen(): Promise<{ url: string, server: Server }> {
    const server = createServer((req, res) => {
      try {
        this.#handle(req, res)
      } catch (error) {
        this.#options.log.error(`the readers' site: ${errorMessage(error)}`)
        if (!res.headersSent) notFound(res)
        else res.destroy()
      }
    })
    // No WebSocket here (no dev server, no HMR).
    server.on('upgrade', (_req: IncomingMessage, socket: Duplex) => {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    })
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })
    return { url: `http://127.0.0.1:${port}`, server }
  }
}
