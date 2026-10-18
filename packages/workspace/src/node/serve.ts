/**
 * `presmium serve` (P-120, docs/architecture.md section 10): the workspace
 * service, for the one user on this machine. One command starts the server
 * (`@presmium/server`, `serve` mode, which listens on this machine only) in
 * front of the workspace site, whose documents compile on demand. The one
 * member is the local author (owner); all code runs here (through the
 * process sandbox where the host has one), and the site's dev servers are
 * this process's children. A document loads the plugins its deck lists, as
 * in `presmium dev`; the operator's plugins
 * (`settings.presmium.workspace.plugins`, installed at the workspace root)
 * are on the home page and in every document.
 *
 * The documents change in one place (`documentsChanged`, C-7): after a
 * document operation, an undo of the history, or a document made or taken
 * away on disk (seen at the next request of the site, F-10), the sessions of
 * the documents gone end, the server takes their contributions
 * down and those of the documents that came (`unmount`, F-40), the site's
 * list follows. A document's writers take its lock (`DOCUMENT_LOCKS`, F-09).
 * The MCP's builds never go into the document (F-51): they go to serve's
 * state directory.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildView, Compiler, pluginLogger, runBlock, workspacePlugins } from '@presmium/compiler'
import type { Compilation, CompilerOptions } from '@presmium/compiler'
import { DOCUMENT_FILES, DOCUMENT_LOCKS, errorMessage, REVISIONS } from '@presmium/kernel'
import type { Finding, IRDocument, Logger, ServiceToken, SiteSpec } from '@presmium/kernel'
import { servedDocument, startServer } from '@presmium/server'
import type { PresmiumServer, ServedDocument, ServedPlugin, ServerHost } from '@presmium/server'
import { WORKSPACE_ID } from '../domain/api.ts'
import { listDocuments, readWorkspace } from './config.ts'
import { Documents, RequestError } from './documents.ts'
import type { DocumentsChange } from './documents.ts'
import { localWriter } from './files.ts'
import type { DocumentWriter } from './files.ts'
import { Git } from './git.ts'
import { DocumentLocks } from './locks.ts'
import { Revisions } from './revisions.ts'
import { workspacePlugin } from './routes.ts'
import type { WorkspaceRoutes } from './routes.ts'
import { DocumentSession } from './session.ts'
import { homePlugins, servedPlugins, siteContext, siteDocument, siteIR, siteSpec, untranslated, webRenderer } from './site.ts'

export interface ServeOptions {
  /** The workspace root, or a deck directory (a workspace of one document). */
  dir: string
  /** Default 127.0.0.1; an address of this machine only (`startServer` refuses another). */
  host?: string
  /** Default 4310. */
  port?: number
  /** The operator directory (`--operator-dir`). */
  operatorDir?: string
  /** Where Presmium's own packages installed with the CLI resolve from. */
  bundled?: string
  /** The plugins' checks of a compilation, for `ServerHost.check`; by default `Compilation.check()`, as `presmium check` runs them. */
  check?(compilation: Compilation): Promise<Finding[]>
  env?: NodeJS.ProcessEnv
  approvalTimeoutMs?: number
  log?: Logger
}

export interface WorkspaceServer {
  url: string
  root: string
  /** The MCP endpoint (`<url>/mcp`) and the state file (mode 0600, outside the workspace) that holds the process's token for it. */
  mcp: { url: string, stateFile: string }
  close(): Promise<void>
}

/** How often, at most, a request of the site looks for documents made or taken away on disk. */
const DISK_LOOK_MS = 1000

/** Where serve keeps what it generates for a workspace (the site's projects, the MCP's builds, the MCP token): outside the workspace. */
function stateDir(root: string, env: NodeJS.ProcessEnv): string {
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache')
  const dir = join(base, 'presmium', 'serve', createHash('sha256').update(root).digest('hex').slice(0, 16))
  mkdirSync(dir, { recursive: true })
  return dir
}

export async function serveWorkspace(options: ServeOptions): Promise<WorkspaceServer> {
  const env = options.env ?? process.env
  const log = options.log ?? pluginLogger('presmium serve')
  const config = readWorkspace(options.dir)
  const { root } = config
  const docs = () => listDocuments(config)
  const sessions = new Map<string, DocumentSession>()
  const locks = new DocumentLocks()
  const check = options.check ?? (compilation => compilation.check())

  // Set once the server is up: the compilers need its services, the server needs the documents.
  let services: [ServiceToken<unknown>, unknown][] = []
  let hostServices: [ServiceToken<unknown>, unknown][] = []
  let site: SiteBackend | undefined
  let server: PresmiumServer | undefined

  const sessionOf = (dir: string): DocumentSession => {
    const known = sessions.get(dir)
    if (known) return known
    const document = docs().find(doc => doc.dir === dir)
    if (!document) throw new RequestError(404, `no document ${JSON.stringify(dir)}`)
    const session = new DocumentSession(dir, new Compiler(join(root, document.entry), { ...pluginOptions(), execution: { env: 'serve' } }), log)
    session.onCompile(async (compilation) => {
      // The site has no translations of its documents: said where the document declares them.
      for (const finding of untranslated(compilation, root)) {
        if (!compilation.doc.diagnostics.some(f => f.message === finding.message)) compilation.doc.diagnostics.push(finding)
      }
    })
    // Not awaited: the site may be starting this document's dev server from the compilation that calls it.
    session.onCompile((compilation) => {
      void Promise.resolve(site?.update(dir, compilation)).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`))
    })
    sessions.set(dir, session)
    return session
  }

  /** What a document's plugins and the home page's get: the workspace's settings, and the server's and the workspace's Node services. */
  const pluginOptions = (): CompilerOptions => ({
    // The workspace root as the configuration says, never as a document directory's git says (WP-91).
    workspaceRoot: root,
    settings: config.settings,
    services: [...services, ...hostServices],
    bundled: options.bundled,
    ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
    secret: name => env[name],
  })

  /** The documents the site lists, kept in place: the site reads it at each request. */
  const spec: SiteSpec = siteSpec(config, docs().map(doc => siteDocument(doc)))
  const refreshSpec = (): DocumentsChange => {
    const now = docs()
    const before = spec.documents.map(doc => doc.dir)
    spec.documents.splice(0, spec.documents.length, ...now.map(doc => siteDocument(doc)))
    return { removed: before.filter(dir => !now.some(doc => doc.dir === dir)), added: now.map(doc => doc.dir).filter(dir => !before.includes(dir)) }
  }

  /**
   * The one way the documents change (C-7): the documents gone end their sessions; the
   * server takes down the contributions of those gone and of those that came (a document made again
   * gets its configuration then, F-40); the site's list follows (F-10). The list changes before the
   * first wait, so the request that told of the change sees it.
   */
  const documentsChanged = async (change: DocumentsChange): Promise<void> => {
    for (const dir of change.removed) {
      sessions.get(dir)?.close()
      sessions.delete(dir)
    }
    const listed = refreshSpec()
    const removed = [...new Set([...change.removed, ...listed.removed])]
    for (const dir of new Set([...removed, ...change.added, ...listed.added])) await server?.unmount(dir)
    await site?.documentsChanged(removed)
  }

  /** Documents made or taken away on disk (an editor, a git pull): seen at a request of the site, at most once a second. */
  let lookedAt = 0
  const lookAtDisk = (): void => {
    if (Date.now() - lookedAt < DISK_LOOK_MS) return
    lookedAt = Date.now()
    const now = docs().map(doc => doc.dir)
    const known = spec.documents.map(doc => doc.dir)
    const change = { removed: known.filter(dir => !now.includes(dir)), added: now.filter(dir => !known.includes(dir)) }
    if (change.removed.length || change.added.length) void documentsChanged(change).catch((error: unknown) => log.warn(`the documents on disk changed, but the site did not follow: ${errorMessage(error)}`))
  }

  /** The repository, its history, the document writer, the document operations and the workspace's routes. */
  const workspaceOf = (): { revisions?: Revisions, writer: DocumentWriter, plugin: ServedPlugin } => {
    const writer = localWriter(config)
    const git = Git.isRepository(root) ? new Git(root) : undefined
    if (!git) log.warn(`${root} is not a git repository: editing, the document operations and the history are not available (run git init)`)
    const revisions = git ? new Revisions(git, { config, writer }) : undefined
    const documents = new Documents({ config, git: git!, revisions: revisions!, writer, changed: documentsChanged, locks })
    const routes: WorkspaceRoutes = { documents, ...revisions ? { revisions } : {}, locks, documentsChanged }
    return { ...revisions ? { revisions } : {}, writer, plugin: { id: WORKSPACE_ID, plugin: workspacePlugin(routes), config: {} } }
  }
  let workspace: ReturnType<typeof workspaceOf> | undefined
  const plugin = (): ServedPlugin => workspace!.plugin

  // Set once the server runs: no document compiles, and no route answers, before.
  let started!: () => void
  const ready = new Promise<void>(resolve => started = resolve)

  const serverHost: ServerHost = {
    async documents() {
      return docs().map(({ entry: _entry, ...doc }) => doc)
    },
    async compile(document) {
      await ready
      const { doc } = await sessionOf(document).ready()
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      await ready
      const compilation = await sessionOf(document).ready()
      return [...compilation.doc.diagnostics, ...await check(compilation)]
    },
    async build(document, buildOptions = {}) {
      await ready
      const compilation = await sessionOf(document).ready()
      // Into serve's state directory, not the document: an agent's build is no change of the source to review (F-51).
      const outDir = join(stateDir(root, env), 'builds', encodeURIComponent(document) || '_')
      const report = await buildView(compilation, { to: buildOptions.to, outDir })
      return { outputs: report.outputs.map(({ renderer, outDir: written }) => ({ renderer, outDir: written })), findings: report.findings }
    },
    async run(document, target, signal) {
      await ready
      return runBlock(await sessionOf(document).ready(), target, signal)
    },
  }

  /**
   * The home page as the server serves it: the workspace's routes and those of the operator plugins
   * (`settings.presmium.workspace.plugins`, e.g. the assistant's), with their Node services as a
   * document's compilation has them (the host's first). The home page is no document: the plugins'
   * routes get an empty directory of serve's, outside the workspace, as its deck directory and
   * workspace root (`home`), so no route of theirs reads or changes a file of the workspace there
   * (the documents are the workspace's routes' to list and create); `ServerContext.home` says so.
   */
  let operators: ReturnType<typeof workspacePlugins> | undefined
  let home: string | undefined
  // Loaded once the server runs, with its services.
  const operatorsOf = async () => {
    await ready
    home ??= mkdtempSync(join(tmpdir(), 'presmium-home-'))
    return operators ??= workspacePlugins(root, pluginOptions())
  }
  const homeDocument = async (): Promise<ServedDocument> => {
    const loaded = await operatorsOf()
    for (const problem of loaded.problems) log.warn(`the home page: ${problem.message}`)
    const own = (token: ServiceToken<unknown>) => [...services, ...hostServices].find(([known]) => known.id === token.id)?.[1]
    return {
      deckDir: home!,
      workspaceRoot: home!,
      plugins: [plugin(), ...loaded.plugins.flatMap(({ plugin: node }) => (node ? [{ id: node.id, plugin: node, config: {} }] : []))],
      service: <T>(token: ServiceToken<T>) => (own(token) ?? loaded.service(token)) as T | undefined,
      settings: config.settings,
      ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
      home: true,
    }
  }

  // The process's MCP token for the author's outside agents, as `presmium dev` writes it: here outside the workspace.
  const stateFile = join(stateDir(root, env), 'server.json')
  server = await startServer({
    mode: 'serve',
    host: options.host,
    port: options.port,
    stateFile,
    forward: () => {
      lookAtDisk()
      return site?.forward()
    },
    settings: config.settings,
    approvals: config.approvals,
    ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
    serverHost,
    env,
    ...options.approvalTimeoutMs ? { approvalTimeoutMs: options.approvalTimeoutMs } : {},
    log,
    async document(dir) {
      await ready
      if (dir === '' && !config.single) return await homeDocument()
      if (!docs().some(doc => doc.dir === dir)) return undefined
      const compilation = await sessionOf(dir).ready()
      const served = servedDocument(compilation)
      return { ...served, plugins: [plugin(), ...served.plugins] }
    },
  })
  const running = server
  services = running.services
  workspace = workspaceOf()
  hostServices = [
    ...workspace.revisions ? [[REVISIONS, workspace.revisions] as [ServiceToken<unknown>, unknown]] : [],
    [DOCUMENT_FILES, workspace.writer],
    [DOCUMENT_LOCKS, locks],
  ]

  started()
  // A single-deck repository compiles its document at once, as `presmium dev` does: its plugins load and say
  // what they say when they start (the assistant's status), without waiting for the first page.
  if (config.single) for (const { dir } of docs()) void sessionOf(dir).ready().catch(() => undefined)

  // The site: this process's dev servers.
  const compileFull = async (dir: string): Promise<IRDocument> => {
    const compilation = await sessionOf(dir).ready()
    return siteIR(compilation)
  }
  try {
    site = await localSite(root, spec, options.bundled, stateDir(root, env), compileFull, config.single ? {} : homePlugins((await operatorsOf()).plugins), log)
  } catch (error) {
    await running.close()
    if (home) rmSync(home, { recursive: true, force: true })
    throw error
  }

  return {
    url: running.url,
    root,
    mcp: { url: `${running.url}/mcp`, stateFile },
    async close() {
      for (const session of sessions.values()) session.close()
      await site?.close()
      await running.close()
      if (home) rmSync(home, { recursive: true, force: true })
    },
  }
}

interface SiteBackend {
  forward(): string | undefined
  update(dir: string, compilation: Compilation): Promise<void> | void
  documentsChanged(removed: string[]): Promise<void>
  close(): Promise<void>
}

/** The web renderer's dev site in this process; the one member is the owner (full view). */
async function localSite(root: string, spec: SiteSpec, bundled: string | undefined, state: string, compile: (dir: string) => Promise<IRDocument>, home: Record<string, string>, log: Logger): Promise<SiteBackend> {
  const renderer = await webRenderer(root, bundled)
  const findings: Finding[] = []
  const work = join(state, 'site', 'full')
  const ctx = siteContext({ root, outDir: work, workDir: work, plugins: servedPlugins(), home, findings })
  const dev = await renderer.devSite!(spec, ctx, compile)
  const origin = new URL(dev.url).origin
  log.info(`the workspace site's dev router is at ${origin} (this machine only; pages reach it through serve)`)
  return {
    forward: () => origin,
    update: (dir, compilation) => dev.update(dir, siteIR(compilation)).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`)),
    // The dev site reads the list at each request: the documents no longer listed close there.
    documentsChanged: async () => {},
    close: () => dev.close(),
  }
}
