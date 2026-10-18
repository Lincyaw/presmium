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
 *
 * The workspace service's interface for a workbench (./service.ts,
 * docs/design-dsh.md section 5) is in the workspace's routes. Headless
 * (`--headless`, what `presmium studio` starts), the pages load neither the
 * workspace's browser plugin nor the operator plugins' browser parts, the
 * home page is the documents' cards, and the documents' dev servers have
 * the preview agent for the workbench's origins (`--preview-origin`). With
 * `PRESMIUM_SERVICE_TOKEN` in its environment the workspace's routes ask
 * for that token.
 *
 * In a git repository the service reviews agents' changes
 * (./review/reviews.ts, WP-96c): the reviews of DeepSeek Harness sessions
 * through its routes, and the git review as `CHANGE_REVIEW` where no plugin
 * (deltabox) registers one, and as `GIT_REVIEW` for the assistant. When it
 * starts, it resumes the sessions' reviews a process left and rolls back a
 * crashed process's change task.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildView, Compiler, pluginLogger, runBlock, workspacePlugins } from '@presmium/compiler'
import type { Compilation, CompilerOptions } from '@presmium/compiler'
import { CHANGE_REVIEW, DOCUMENT_FILES, DOCUMENT_LOCKS, errorMessage, REVISIONS } from '@presmium/kernel'
import type { Finding, IRDocument, Logger, ServiceToken, SiteSpec } from '@presmium/kernel'
import { servedDocument, startServer } from '@presmium/server'
import type { PresmiumServer, ServedDocument, ServedPlugin, ServerHost } from '@presmium/server'
import { WORKSPACE_ID } from '../domain/api.ts'
import { listDocuments, readWorkspace } from './config.ts'
import { workspaceService } from './service.ts'
import type { Service } from './service.ts'
import { Documents, RequestError } from './documents.ts'
import type { DocumentsChange } from './documents.ts'
import { localWriter } from './files.ts'
import type { DocumentWriter } from './files.ts'
import { Git } from './git.ts'
import { DocumentLocks } from './locks.ts'
import { GIT_REVIEW, Reviews } from './review/reviews.ts'
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
  /** `--headless`: the service without its interface, for a workbench; its pages are previews. */
  headless?: boolean
  /** `--preview-origin`: the workbench's origins, to which the previews' agent talks (headless). */
  previewOrigins?: string[]
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
  const token = env.PRESMIUM_SERVICE_TOKEN || undefined
  const preview = options.headless ? { origins: options.previewOrigins ?? [] } : undefined

  // Set once the server is up: the compilers need its services, the server needs the documents.
  let services: [ServiceToken<unknown>, unknown][] = []
  let hostServices: [ServiceToken<unknown>, unknown][] = []
  let site: SiteBackend | undefined
  let server: PresmiumServer | undefined
  let service: Service | undefined

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
    session.onCompile((compilation, changed) => {
      service?.compiled(dir, compilation, changed)
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
    await service?.removed(removed)
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

  /** The repository, its history and reviews, the document writer, the document operations and the workspace's routes. */
  const workspaceOf = (): { revisions?: Revisions, reviews?: Reviews, writer: DocumentWriter, plugin: ServedPlugin } => {
    const writer = localWriter(config)
    const git = Git.isRepository(root) ? new Git(root) : undefined
    if (!git) log.warn(`${root} is not a git repository: editing, the document operations and the history are not available (run git init)`)
    const revisions = git ? new Revisions(git, { config, writer }) : undefined
    const reviews = revisions ? new Reviews({ config, revisions, locks, files: writer, log }) : undefined
    const documents = new Documents({ config, git: git!, revisions: revisions!, writer, changed: documentsChanged, locks })
    const routes: WorkspaceRoutes = { documents, ...revisions ? { revisions } : {}, locks, documentsChanged, ...service ? { service } : {}, ...token ? { token } : {}, ...reviews ? { reviews } : {} }
    return { ...revisions ? { revisions } : {}, ...reviews ? { reviews } : {}, writer, plugin: { id: WORKSPACE_ID, plugin: workspacePlugin(routes), config: {} } }
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
      // The workspace's git review is `CHANGE_REVIEW` where no plugin (deltabox) registers one.
      const reviews = workspace?.reviews
      const service = <T>(token: ServiceToken<T>) => served.service(token) ?? (reviews && token.id === CHANGE_REVIEW.id ? reviews.service as T : undefined)
      return { ...served, service, plugins: [plugin(), ...served.plugins] }
    },
  })
  const running = server
  services = running.services
  service = workspaceService({ root, sessionOf, serverHost, url: () => running.url, ...preview ? { preview } : {}, stateDir: stateDir(root, env), log })
  workspace = workspaceOf()
  hostServices = [
    ...workspace.revisions ? [[REVISIONS, workspace.revisions] as [ServiceToken<unknown>, unknown]] : [],
    ...workspace.reviews ? [[GIT_REVIEW, workspace.reviews.service] as [ServiceToken<unknown>, unknown]] : [],
    [DOCUMENT_FILES, workspace.writer],
    [DOCUMENT_LOCKS, locks],
  ]
  // Before anything answers: the sessions' reviews a process left wait for their authors again, a crashed
  // process's change task is rolled back.
  await workspace.reviews?.recover(docs().map(doc => doc.dir))

  started()
  // A single-deck repository compiles its document at once, as `presmium dev` does: its plugins load and say
  // what they say when they start (the assistant's status), without waiting for the first page.
  if (config.single) for (const { dir } of docs()) void sessionOf(dir).ready().catch(() => undefined)

  // The site: this process's dev servers.
  const compileFull = async (dir: string): Promise<IRDocument> => {
    const compilation = await sessionOf(dir).ready()
    return service!.siteDoc(compilation, siteIR(compilation))
  }
  try {
    // Headless, the pages have neither the workspace's browser plugin nor the operator plugins' browser parts.
    const home = config.single || options.headless ? {} : homePlugins((await operatorsOf()).plugins)
    site = await localSite({ root, spec, bundled: options.bundled, state: stateDir(root, env), compile: compileFull, siteDoc: (compilation, doc) => service!.siteDoc(compilation, doc), plugins: options.headless ? {} : servedPlugins(), home, preview, log })
  } catch (error) {
    await service?.close()
    await running.close()
    if (home) rmSync(home, { recursive: true, force: true })
    throw error
  }

  return {
    url: running.url,
    root,
    mcp: { url: `${running.url}/mcp`, stateFile },
    async close() {
      // The sessions' reviews stay for the next process (their records).
      workspace?.reviews?.close()
      for (const session of sessions.values()) session.close()
      await service?.close()
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

interface LocalSiteOptions {
  root: string
  spec: SiteSpec
  bundled?: string
  state: string
  compile(dir: string): Promise<IRDocument>
  /** A document's IR as the site's dev server gets it (with its revision for the previews). */
  siteDoc(compilation: Compilation, doc: IRDocument): IRDocument
  /** The site's own plugins (`servedPlugins`); none headless. */
  plugins: Record<string, string>
  /** The home page's plugins (`homePlugins`); none headless. */
  home: Record<string, string>
  /** Headless: the pages are previews for these origins (`RenderContext.preview`). */
  preview?: { origins: string[] }
  log: Logger
}

/** The web renderer's dev site in this process; the one member is the owner (full view). */
async function localSite(options: LocalSiteOptions): Promise<SiteBackend> {
  const { root, spec, log } = options
  const renderer = await webRenderer(root, options.bundled)
  const findings: Finding[] = []
  const work = join(options.state, 'site', 'full')
  const ctx = siteContext({ root, outDir: work, workDir: work, plugins: options.plugins, home: options.home, findings })
  if (options.preview) ctx.preview = options.preview
  const dev = await renderer.devSite!(spec, ctx, options.compile)
  const origin = new URL(dev.url).origin
  log.info(`the workspace site's dev router is at ${origin} (this machine only; pages reach it through serve)`)
  return {
    forward: () => origin,
    update: (dir, compilation) => dev.update(dir, options.siteDoc(compilation, siteIR(compilation))).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`)),
    // The dev site reads the list at each request: the documents no longer listed close there.
    documentsChanged: async () => {},
    close: () => dev.close(),
  }
}
