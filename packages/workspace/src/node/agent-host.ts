/**
 * `presmium agent-host` (SHARED, D13, docs/architecture.md 10.8): in the
 * sandbox container, everything serve hands over that runs a deck's code:
 * compile-time execution, builds, the workspace site's dev servers, agent
 * sessions and deltabox reviews. It holds no secret: started as root it
 * reads its token file and becomes `--user`; its token leaves its
 * environment, so its children never get it. serve calls it over HTTP/SSE
 * with that token; it never calls serve. It loads the same operator plugins
 * as serve (D14) and builds a Node service registry for each document.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { build, Compiler, loadPlugins, operatorPlugins, pluginId } from '@presmium/compiler'
import type { Compilation, CompilerOptions, LoadedPlugin } from '@presmium/compiler'
import { AGENT_RUNTIME, CHANGE_REVIEW, errorMessage, isRecord, PROCESS_SANDBOX } from '@presmium/kernel'
import type { AgentEvent, AgentSession, ApprovalRequest, ChangeReview, Finding, GatewayAccess, IRDocument, Logger, Member, NodeServiceContext, RunRequest, ServiceToken, SiteDevServer, SiteSpec } from '@presmium/kernel'
import { readSecret } from '@presmium/server'
import type { DocumentView } from '@presmium/server'
import type { AgentHostInfo } from './agent-client.ts'
import { listDocuments, readWorkspace } from './config.ts'
import { STUDENT } from './audience.ts'
import { homePlugins, servedPlugins, siteContext, webRenderer } from './site.ts'

export interface AgentHostOptions {
  /** The workspace root (the shared volume, at the same path as in serve). */
  root: string
  /** Default 127.0.0.1; in compose the address serve reaches on the `agents` network. */
  host?: string
  /** Default 4330. */
  port?: number
  /** Host names it answers to besides this machine's and `host` (compose: `sandbox`). */
  hostnames?: string[]
  /** Started as root: the user to become once the token file is read. */
  user?: string
  bundled?: string
  env?: NodeJS.ProcessEnv
  log?: Logger
}

export interface AgentHost {
  url: string
  port: number
  close(): Promise<void>
}

const STDERR: Logger = {
  debug: () => {},
  info: (...args) => console.error('[presmium agent-host]', ...args),
  warn: (...args) => console.error('[presmium agent-host]', ...args),
  error: (...args) => console.error('[presmium agent-host]', ...args),
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** `process.initgroups` (POSIX only; not in every version of Node's types). */
export function initGroups(user: string | number): void {
  (process as { initgroups?: (user: string | number, group: string | number) => void }).initgroups?.(user, user)
}

function hostnameOf(host: string | undefined): string {
  const value = (host ?? '').trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1)
  return value.replace(/:\d+$/, '')
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function sameSecret(given: string | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'the body is not JSON')
  }
}

function send(res: ServerResponse, status: number, data?: unknown): void {
  if (data === undefined) {
    res.writeHead(status).end()
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

/**
 * As the server's: started as root, becomes `user` with its supplementary
 * groups (the group that may write the document directories, docs/architecture.md 10.5).
 */
export function becomeUser(user: string | undefined): void {
  if (!user || process.getuid?.() !== 0) return
  const id = /^\d+$/.test(user) ? Number(user) : user
  initGroups(id)
  process.setgid!(id)
  process.setuid!(id)
}

interface Site {
  view: DocumentView
  spec: SiteSpec
  dev: SiteDevServer
  port: number
  /** Documents whose IR serve sent, and those waited for. */
  docs: Map<string, IRDocument>
  waiting: Map<string, ((doc: IRDocument) => void)[]>
}

export async function startAgentHost(options: AgentHostOptions): Promise<AgentHost> {
  const env = options.env ?? process.env
  const log = options.log ?? STDERR
  const token = readSecret(env, 'PRESMIUM_AGENT_HOST_TOKEN')
  if (!token) throw new Error('agent-host needs its token: set PRESMIUM_AGENT_HOST_TOKEN_FILE (or PRESMIUM_AGENT_HOST_TOKEN)')
  // Read: its children never get it, and from here on the process runs as the sandbox's user.
  if (env === process.env) {
    delete process.env.PRESMIUM_AGENT_HOST_TOKEN
    delete process.env.PRESMIUM_AGENT_HOST_TOKEN_FILE
  }
  becomeUser(options.user)
  // The sandbox's files stay writable for the document group (serve commits and reverts them, docs/architecture.md 10.5).
  if (options.user) process.umask(0o002)
  const config = readWorkspace(options.root)
  const { root } = config
  const listenHost = options.host ?? '127.0.0.1'
  const names = new Set([hostnameOf(listenHost), ...(options.hostnames ?? []).map(hostnameOf)])
  const state = join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'presmium', 'agent-host')
  mkdirSync(state, { recursive: true })

  // Each document's compiler here: its plugins (the operator's, D14), its Node services and executors.
  // It never runs code on its own: what runs, serve asks for.
  const compilations = new Map<string, Promise<Compilation>>()
  const compilerOptions = (runAll: boolean, gateway?: GatewayAccess): CompilerOptions => ({
    settings: config.settings,
    trust: 'shared',
    policy: true,
    scope: true,
    bundled: options.bundled,
    reserved: [],
    ...gateway ? { gateway } : {},
    execution: { env: 'serve', admit: runs => (runAll ? runs : []) },
  })
  const entryOf = (dir: string): string => {
    const found = listDocuments(config).find(doc => doc.dir === dir)
    if (!found) throw new HttpError(404, `no document ${JSON.stringify(dir)}`)
    return join(root, found.entry)
  }
  const compiled = (dir: string, fresh = false): Promise<Compilation> => {
    let known = compilations.get(dir)
    if (!known || fresh) {
      known = new Compiler(entryOf(dir), compilerOptions(false)).compile()
      known.catch(() => compilations.delete(dir))
      compilations.set(dir, known)
    }
    return known
  }
  const executorOf = async (dir: string, id: string) => {
    let compilation = await compiled(dir)
    let executor = compilation.executors.find(e => e.id === id)
    // An environment declared since: compiled again once.
    if (!executor) {
      compilation = await compiled(dir, true)
      executor = compilation.executors.find(e => e.id === id)
    }
    if (!executor) throw new HttpError(404, `no executor ${id} for ${dir}`)
    return { executor, compilation }
  }

  // The operator plugins (D14), loaded once: their services, and their browser parts on the sites' home pages.
  let operators: Promise<LoadedPlugin[]> | undefined
  const operatorsOf = () => operators ??= (async () => {
    const listed = operatorPlugins(config.settings)
    return (await loadPlugins(root, listed, { workspaceRoot: root, listed, bundled: options.bundled, policy: true })).plugins
  })()

  // What agent-host has: the services its operator plugins register (asked once).
  let info: Promise<AgentHostInfo> | undefined
  const describe = () => info ??= (async () => {
    const plugins = await operatorsOf()
    const found: AgentHostInfo = {}
    for (const loaded of plugins) {
      const contribute = loaded.plugin?.services
      if (!contribute) continue
      const ctx: NodeServiceContext = { deckDir: root, workspaceRoot: root, config: {}, settings: config.settings[pluginId(loaded)] ?? {}, trust: 'shared', secret: name => env[name], log }
      try {
        for (const [service, impl] of contribute.call(loaded.plugin, ctx)) {
          if (service.id === CHANGE_REVIEW.id) found.review = (impl as { engine: string }).engine
          if (service.id === PROCESS_SANDBOX.id) found.sandbox = (impl as { kind: string }).kind
          if (service.id === AGENT_RUNTIME.id) found.agent = { provider: (impl as { provider: string }).provider, ...(impl as { runtime?: string }).runtime ? { runtime: (impl as { runtime?: string }).runtime } : {} }
        }
      } catch (error) {
        log.warn(`plugin ${pluginId(loaded)}: services() failed: ${errorMessage(error)}`)
      }
    }
    return found
  })()

  // Workspace sites: the web renderer's dev site; a document's IR comes from serve.
  const sites = new Map<string, Site>()
  let renderer: ReturnType<typeof webRenderer> | undefined
  const createSite = async (spec: SiteSpec, view: DocumentView): Promise<{ id: string, port: number }> => {
    const id = randomUUID()
    const work = join(state, 'sites', id)
    const findings: Finding[] = []
    const ctx = siteContext({ root, outDir: work, workDir: work, plugins: servedPlugins(), home: homePlugins((await operatorsOf()).filter(loaded => loaded.plugin?.operator === true)), host: listenHost, findings, scoped: true })
    const site: Site = { view, spec, dev: undefined as unknown as SiteDevServer, port: 0, docs: new Map(), waiting: new Map() }
    // Loaded on the first site; one that failed to load is tried again with the next.
    renderer ??= webRenderer(root, options.bundled)
    renderer.catch(() => {
      renderer = undefined
    })
    site.dev = await (await renderer).devSite!(spec, ctx, dir => site.docs.has(dir)
      ? Promise.resolve(site.docs.get(dir)!)
      : new Promise<IRDocument>(resolve => site.waiting.set(dir, [...site.waiting.get(dir) ?? [], resolve])))
    site.port = Number(new URL(site.dev.url).port)
    sites.set(id, site)
    log.info(`site ${id} (${view}) at port ${site.port}`)
    return { id, port: site.port }
  }

  // Agent sessions (the assistant's runtime registered here) and reviews (deltabox), by id.
  interface OpenSession {
    session: AgentSession
    /** The agent's permission requests waiting for serve's answer. */
    approvals: Map<string, (allow: boolean) => void>
    /** Those not yet sent to serve, as `approval` events of the running prompt. */
    unsent: { id: string, request: ApprovalRequest }[]
  }
  const sessions = new Map<string, OpenSession>()
  const reviews = new Map<string, ChangeReview>()

  const service = async <T>(dir: string, token: ServiceToken<T>): Promise<T> => {
    const impl = (await compiled(dir)).service(token)
    if (!impl) throw new HttpError(501, `agent-host has no ${token.id} for ${dir}`)
    return impl
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!LOOPBACK.has(hostnameOf(req.headers.host)) && !names.has(hostnameOf(req.headers.host))) throw new HttpError(403, `Host ${req.headers.host ?? '(none)'} is not agent-host`)
    if (req.headers.origin !== undefined) throw new HttpError(403, 'agent-host takes no request from a browser')
    const given = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
    if (!sameSecret(given, token)) throw new HttpError(401, 'a valid token is needed')
    const url = new URL(req.url ?? '/', 'http://agent-host')
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const method = req.method ?? 'GET'
    if (parts[0] !== 'v1') throw new HttpError(404, 'not found')
    const [, area, id, action, extra] = parts

    if (area === 'info' && method === 'GET') return send(res, 200, await describe())

    if (area === 'documents' && id !== undefined && method === 'POST') {
      const input = await body(req)
      if (!isRecord(input)) throw new HttpError(400, 'a JSON object')
      if (action === 'run') {
        if (typeof input.executor !== 'string' || !isRecord(input.request)) throw new HttpError(400, '{ executor, request, env?, gateway? }')
        const { executor, compilation } = await executorOf(id, input.executor)
        const gateway = isRecord(input.gateway) && typeof input.gateway.url === 'string' && typeof input.gateway.token === 'string' ? input.gateway as unknown as GatewayAccess : undefined
        // The environment is agent-host's own (the `serve` rules, here), not one serve sends.
        const result = await executor.run(input.request as unknown as RunRequest, undefined, { ...compilation.runContext, ...gateway ? { gateway } : {} })
        return send(res, 200, result)
      }
      if (action === 'end-session') {
        if (typeof input.executor !== 'string' || typeof input.session !== 'string') throw new HttpError(400, '{ executor, session }')
        const { executor } = await executorOf(id, input.executor)
        await executor.endSession?.(input.session)
        return send(res, 204)
      }
      if (action === 'build') {
        // Code without a recording runs only when serve says so (`compile: trusted`); else the recordings stand.
        // The student view is compiled for the audience `student` (P-55): what it leaves out never runs; the scan
        // reads what the build wrote (dist/ holds the whole deck's builds as well), and its reader asked for it,
        // so it quotes nothing.
        const gateway = isRecord(input.gateway) ? input.gateway as unknown as GatewayAccess : undefined
        const student = input.view === 'student'
        const compiler = new Compiler(entryOf(id), { ...compilerOptions(input.run === 'all', gateway), ...student ? { audience: STUDENT } : {} })
        const compilation = await compiler.compile()
        const to = Array.isArray(input.to) ? input.to.filter((r): r is string => typeof r === 'string') : undefined
        const report = await build(compilation, { outDir: join(compilation.deckDir, 'dist'), ...to?.length ? { to } : {}, ...student ? { quote: false, scan: 'written' } : {} })
        return send(res, 200, { outputs: report.outputs.map(({ renderer: r, outDir }) => ({ renderer: r, outDir })), findings: report.findings })
      }
    }

    if (area === 'sites') {
      if (id === undefined && method === 'POST') {
        const input = await body(req)
        if (!isRecord(input) || !isRecord(input.site)) throw new HttpError(400, '{ site, view }')
        return send(res, 201, await createSite(input.site as unknown as SiteSpec, input.view === 'student' ? 'student' : 'full'))
      }
      const site = id === undefined ? undefined : sites.get(id)
      if (!site) throw new HttpError(404, 'no such site')
      if (action === undefined && method === 'PUT') {
        const input = await body(req)
        if (!isRecord(input) || !isRecord(input.site) || !Array.isArray(input.site.documents)) throw new HttpError(400, '{ site }')
        // In place: the site reads the list at each request.
        site.spec.documents.splice(0, site.spec.documents.length, ...input.site.documents as SiteSpec['documents'])
        for (const dir of [...site.docs.keys()]) if (!site.spec.documents.some(doc => doc.dir === dir)) site.docs.delete(dir)
        return send(res, 204)
      }
      if (action === 'documents' && extra !== undefined && method === 'PUT') {
        const doc = await body(req)
        if (!isRecord(doc) || !Array.isArray(doc.sections)) throw new HttpError(400, 'an IR document')
        const ir = doc as unknown as IRDocument
        const first = !site.docs.has(extra)
        site.docs.set(extra, ir)
        for (const resolve of site.waiting.get(extra) ?? []) resolve(ir)
        site.waiting.delete(extra)
        if (!first || site.spec.documents.some(d => d.dir === extra)) await site.dev.update(extra, ir)
        return send(res, 204)
      }
      if (action === undefined && method === 'DELETE') {
        sites.delete(id!)
        await site.dev.close()
        return send(res, 204)
      }
    }

    if (area === 'sessions') {
      if (id === undefined && method === 'POST') {
        const input = await body(req)
        if (!isRecord(input) || typeof input.document !== 'string' || !isRecord(input.member) || typeof input.cwd !== 'string') throw new HttpError(400, '{ document, mode, member, cwd, mcp?, model? }')
        const runtime = await service(input.document, AGENT_RUNTIME)
        const opened: OpenSession = { session: undefined as unknown as AgentSession, approvals: new Map(), unsent: [] }
        opened.session = await runtime.open({
          cwd: input.cwd,
          mode: input.mode === 'tutor' ? 'tutor' : 'author',
          member: input.member as unknown as Member,
          ...isRecord(input.mcp) ? { mcp: input.mcp as { url: string, token: string } } : {},
          ...isRecord(input.model) ? { model: input.model as unknown as GatewayAccess } : {},
          // The agent's permission requests go back to serve as `approval` events and wait for its answer.
          approve: request => new Promise<boolean>((resolve) => {
            const approval = randomUUID()
            opened.approvals.set(approval, resolve)
            opened.unsent.push({ id: approval, request })
          }),
        })
        const sessionId = randomUUID()
        sessions.set(sessionId, opened)
        return send(res, 201, { id: sessionId })
      }
      const entry = id === undefined ? undefined : sessions.get(id)
      if (!entry) throw new HttpError(404, 'no such session')
      if (action === 'prompt' && method === 'POST') {
        const request = await body(req)
        const controller = new AbortController()
        req.once('close', () => controller.abort())
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' })
        const write = (event: AgentEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`)
        const flush = setInterval(() => {
          while (entry.unsent.length > 0) {
            const { id: approval, request: asked } = entry.unsent.shift()!
            write({ type: 'approval', id: approval, request: asked })
          }
        }, 50)
        try {
          for await (const event of entry.session.prompt(request as Parameters<AgentSession['prompt']>[0], controller.signal)) write(event)
        } catch (error) {
          write({ type: 'error', message: errorMessage(error) })
        } finally {
          clearInterval(flush)
          res.end()
        }
        return
      }
      if (action === 'approvals' && extra !== undefined && method === 'POST') {
        const input = await body(req)
        const resolve = entry.approvals.get(extra)
        if (!resolve) throw new HttpError(404, 'no such approval')
        entry.approvals.delete(extra)
        resolve(isRecord(input) && input.allow === true)
        return send(res, 204)
      }
      if (action === 'cancel' && method === 'POST') {
        await entry.session.cancel()
        return send(res, 204)
      }
      if (action === undefined && method === 'DELETE') {
        sessions.delete(id!)
        for (const resolve of entry.approvals.values()) resolve(false)
        await entry.session.close()
        return send(res, 204)
      }
    }

    if (area === 'reviews') {
      if (id === undefined && method === 'POST') {
        const input = await body(req)
        if (!isRecord(input) || typeof input.document !== 'string' || typeof input.task !== 'string' || !isRecord(input.member)) throw new HttpError(400, '{ document, task, member }')
        const review = await (await service(input.document, CHANGE_REVIEW)).open({ document: input.document, task: input.task, member: input.member as unknown as Member })
        const reviewId = randomUUID()
        reviews.set(reviewId, review)
        return send(res, 201, { id: reviewId, root: review.root, visibility: review.visibility })
      }
      const review = id === undefined ? undefined : reviews.get(id)
      if (!review) throw new HttpError(404, 'no such review')
      if (action === 'step' && method === 'POST') {
        const input = await body(req)
        return send(res, 200, await review.step(isRecord(input) && typeof input.label === 'string' ? input.label : 'step', isRecord(input) && typeof input.tool === 'string' ? input.tool : undefined))
      }
      if (action === 'diff' && method === 'GET') return send(res, 200, await review.diff())
      if (action === 'accept' && method === 'POST') {
        const input = await body(req)
        return send(res, 200, await review.accept(isRecord(input) && Array.isArray(input.reject) ? input.reject.filter((p): p is string => typeof p === 'string') : []))
      }
      if (action === 'rollback' && method === 'POST') {
        await review.rollback()
        return send(res, 204)
      }
      if (action === undefined && method === 'DELETE') {
        reviews.delete(id!)
        await review.close()
        return send(res, 204)
      }
    }
    throw new HttpError(404, 'not found')
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500
      if (status === 500) log.error(`${req.method} ${req.url}: ${errorMessage(error)}`)
      if (res.headersSent) res.end()
      else send(res, status, { error: errorMessage(error) })
    })
  })
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 4330, listenHost, () => resolve((server.address() as AddressInfo).port))
  })
  const shown = listenHost === '0.0.0.0' || listenHost === '::' ? '127.0.0.1' : listenHost.includes(':') ? `[${listenHost}]` : listenHost
  return {
    url: `http://${shown}:${port}`,
    port,
    async close() {
      for (const { session } of sessions.values()) await session.close().catch(() => undefined)
      for (const review of reviews.values()) await review.close().catch(() => undefined)
      for (const site of sites.values()) await site.dev.close().catch(() => undefined)
      await new Promise<void>((done) => {
        server.close(() => done())
        server.closeAllConnections()
      })
    },
  }
}
