/**
 * `presmium serve` (P-120, docs/architecture.md section 10): the workspace
 * service. One command starts the server (`@presmium/server`, `serve` mode)
 * in front of the workspace site, whose documents compile on demand.
 *
 * LOCAL (this machine, no login): the one member is the local author
 * (owner); all code runs here (through the process sandbox where the host
 * has one), and the site's dev servers are this process's children.
 * SHARED (a login proxy is configured): serve runs none of the decks' code:
 * compile-time execution, builds and the site's dev servers run in
 * agent-host (the sandbox), with scoped gateway tokens; code without a
 * recording runs by `settings.presmium.exec.compile`; serve reads only the
 * workspace's files (`ReadScope`) and refuses a single-deck repository.
 * Readers get the static site built for students (D17, ./student-site.ts),
 * never a dev server; editors and owners the dev servers.
 *
 * Both modes load only the operator's plugins (D14): the packages listed in
 * `settings.presmium.workspace.plugins`, installed at the workspace root.
 *
 * The documents change in one place (`documentsChanged`, C-7): after a
 * document operation, an undo of the history, or a document made or taken
 * away on disk (seen at the next request of the site, F-10), the sessions and
 * approvals of the documents gone end, the server takes their contributions
 * down and those of the documents that came (`unmount`, F-40), the site's
 * list follows. A document's writers take its lock (`DOCUMENT_LOCKS`, F-09).
 * The MCP's builds never go into the document (F-51): in LOCAL mode they go
 * to serve's state directory, in SHARED mode to agent-host's.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildView, Compiler, loadPlugins, pluginId, pluginLogger, runBlock, workspacePlugins } from '@presmium/compiler'
import type { Compilation, CompilerOptions } from '@presmium/compiler'
import { AGENT_RUNTIME, CHANGE_REVIEW, DOCUMENT_FILES, DOCUMENT_LOCKS, errorMessage, REVISIONS } from '@presmium/kernel'
import type { Finding, IRDocument, Logger, Member, ServiceToken, SiteSpec } from '@presmium/kernel'
import { servedDocument, startServer } from '@presmium/server'
import type { DocumentView, PresmiumServer, ServedDocument, ServedPlugin, ServerHost } from '@presmium/server'
import { WORKSPACE_ID } from '../domain/api.ts'
import type { SiteState } from '../domain/api.ts'
import { mayEdit, rolesOf } from '../domain/members.ts'
import { AgentHostClient } from './agent-client.ts'
import { viewDocument } from './audience.ts'
import { listDocuments, readWorkspace } from './config.ts'
import { Documents, groupId, RequestError } from './documents.ts'
import type { DocumentsChange } from './documents.ts'
import { CompileApprovals, compileMode, runKey } from './execution.ts'
import { localWriter } from './files.ts'
import type { DocumentWriter } from './files.ts'
import { Git } from './git.ts'
import { DocumentLocks } from './locks.ts'
import { RemoteSite } from './remote-site.ts'
import { Revisions } from './revisions.ts'
import { workspacePlugin } from './routes.ts'
import type { WorkspaceRoutes } from './routes.ts'
import { DocumentSession } from './session.ts'
import { StudentSite } from './student-site.ts'
import { homePlugins, servedPlugins, siteContext, siteDocument, siteIR, siteSpec, untranslated, webRenderer } from './site.ts'

export interface ServeOptions {
  /** The workspace root, or a deck directory (a workspace of one document). */
  dir: string
  /** Default 127.0.0.1; another address needs a login proxy. */
  host?: string
  /** Default 4310. */
  port?: number
  trustProxyFrom?: string[]
  /** Started as root: the user to become once the token files are read. */
  user?: string
  /** The LOCAL operator directory (`--operator-dir`). */
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
  trust: 'local' | 'shared'
  root: string
  close(): Promise<void>
}

const OWN_SECRETS = ['PRESMIUM_GATEWAY_TOKEN', 'PRESMIUM_AGENT_HOST_TOKEN', 'PRESMIUM_PROXY_SECRET']
const isOwnSecret = (name: string) => OWN_SECRETS.some(own => name === own || name === `${own}_FILE`)

/** How often, at most, a request of the site looks for documents made or taken away on disk. */
const DISK_LOOK_MS = 1000

/** Where serve keeps what it generates for a workspace (the LOCAL site's projects, the MCP's builds): outside the workspace. */
function stateDir(root: string, env: NodeJS.ProcessEnv): string {
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache')
  const dir = join(base, 'presmium', 'serve', createHash('sha256').update(root).digest('hex').slice(0, 16))
  mkdirSync(dir, { recursive: true })
  return dir
}

/** The D14 refusals of `renderers.<id>.package`: loaded by the same policy as the deck's plugins, reported as `presmium.plugins` errors. */
async function rendererPackages(compilation: Compilation): Promise<Finding[]> {
  const packages = Object.values(compilation.doc.config.renderers).map(config => config.package).filter((name): name is string => typeof name === 'string')
  if (packages.length === 0) return []
  const { problems } = await loadPlugins(compilation.deckDir, packages, compilation.pluginSources)
  return problems.map(p => ({ checkId: 'presmium.plugins', severity: p.severity, message: p.message, source: { file: compilation.entry, line: 1 } }))
}

export async function serveWorkspace(options: ServeOptions): Promise<WorkspaceServer> {
  const env = options.env ?? process.env
  const log = options.log ?? pluginLogger('presmium serve')
  const config = readWorkspace(options.dir)
  const { root } = config
  const login = Boolean(env.PRESMIUM_PROXY_SECRET || env.PRESMIUM_PROXY_SECRET_FILE || options.trustProxyFrom?.length)
  const docs = () => listDocuments(config)
  if (login && (config.single || docs().some(doc => doc.dir === ''))) {
    throw new Error(`${root} is a single-deck repository (its root is a document): a presmium serve with a login (SHARED mode) supports only workspaces whose documents are in subdirectories, since the sandbox could write the workspace configuration and node_modules otherwise (docs/architecture.md 10.5); move the deck into a subdirectory, or serve it on this machine without a login`)
  }
  const sessions = new Map<string, DocumentSession>()
  const mode = compileMode(config.settings)
  const locks = new DocumentLocks()
  const check = options.check ?? (compilation => compilation.check())

  // Set once the server is up: the compilers need its services, the server needs the documents.
  let shared = false
  let services: [ServiceToken<unknown>, unknown][] = []
  let gateway: { url: string, token: string } | undefined
  let agentHost: AgentHostClient | undefined
  let hostServices: [ServiceToken<unknown>, unknown][] = []
  let approvals: CompileApprovals | undefined
  let site: SiteBackend | undefined
  let server: PresmiumServer | undefined
  /** The member a document's compilation acts for (who opened it), for the approval's requester. */
  const requester = new Map<string, Member>()

  const sessionOf = (dir: string): DocumentSession => {
    const known = sessions.get(dir)
    if (known) return known
    const document = docs().find(doc => doc.dir === dir)
    if (!document) throw new RequestError(404, `no document ${JSON.stringify(dir)}`)
    const session: DocumentSession = new DocumentSession(dir, new Compiler(join(root, document.entry), compilerOptions(dir, () => session)), log)
    session.onCompile(async (compilation) => {
      // The site has no translations of its documents: said where the document declares them.
      for (const finding of [...await rendererPackages(compilation), ...untranslated(compilation, root)]) {
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

  /** How a document's plugins are loaded (D14) and what their Node services get; also the home page's (`dir` ''). */
  const pluginOptions = (dir: string): CompilerOptions => ({
    // The workspace root as the configuration says, never as a document directory's git says (WP-91).
    workspaceRoot: root,
    settings: config.settings,
    trust: shared ? 'shared' : 'local',
    services: [...services, ...hostServices, ...agentServices(dir)],
    reserved: shared ? [AGENT_RUNTIME, CHANGE_REVIEW] : [],
    policy: true,
    scope: shared,
    bundled: options.bundled,
    ...!shared && options.operatorDir ? { operatorDir: options.operatorDir } : {},
    ...gateway ? { gateway } : {},
    secret: name => (isOwnSecret(name) ? undefined : env[name]),
  })

  /** The plugins a run of a document needs at the gateway: the executor's, and the provider of its environment. */
  const pluginsOf = (dir: string, executor: string): string[] => {
    const compilation = sessions.get(dir)?.latest
    const owner = compilation?.plugins.find(loaded => loaded.plugin?.executors?.some(e => e.id === executor))
    const environment = executor.startsWith('presmium.env.') ? compilation?.execute.environments?.[executor.slice('presmium.env.'.length)] : undefined
    const provider = environment && compilation?.plugins.find(loaded => loaded.plugin?.environments?.[environment.kind])
    return [owner, provider].flatMap(loaded => (loaded ? [pluginId(loaded)] : []))
  }

  // SHARED: nothing runs in serve's compilations; `admit` hands what may run to agent-host, which records it (WP-91).
  // `remote` is for `ServerHost.run` (MCP's run_code), which records nothing.
  const compilerOptions = (dir: string, session: () => DocumentSession): CompilerOptions => ({
    ...pluginOptions(dir),
    execution: shared && agentHost
      ? {
          env: 'serve',
          remote: agentHost.remote(dir, executor => pluginsOf(dir, executor), () => requester.get(dir)),
          admit: approvals!.admit(session, () => session().latest?.doc.meta.title ?? dir, () => session().latest?.doc.meta.lang, () => requester.get(dir)),
        }
      : { env: 'serve' },
  })

  /** In SHARED mode the agent runtime and the deltabox review are agent-host's, behind tokens the host keeps. */
  let agentInfo: Awaited<ReturnType<AgentHostClient['info']>> = {}
  const agentServices = (dir: string): [ServiceToken<unknown>, unknown][] => {
    if (!shared || !agentHost) return []
    return [
      ...agentInfo.agent ? [[AGENT_RUNTIME, agentHost.agentRuntime(agentInfo.agent, dir)] as [ServiceToken<unknown>, unknown]] : [],
      ...agentInfo.review ? [[CHANGE_REVIEW, agentHost.changeReview(agentInfo.review)] as [ServiceToken<unknown>, unknown]] : [],
    ]
  }

  /** The documents the site lists, kept in place: the site reads it at each request. */
  const spec: SiteSpec = siteSpec(config, docs().map(doc => siteDocument(doc)))
  const refreshSpec = (): DocumentsChange => {
    const now = docs()
    const before = spec.documents.map(doc => doc.dir)
    spec.documents.splice(0, spec.documents.length, ...now.map(doc => siteDocument(doc)))
    return { removed: before.filter(dir => !now.some(doc => doc.dir === dir)), added: now.map(doc => doc.dir).filter(dir => !before.includes(dir)) }
  }

  /**
   * The one way the documents change (C-7): the documents gone end their sessions and approvals; the
   * server takes down the contributions of those gone and of those that came (a document made again
   * gets its configuration then, F-40); the site's list follows (F-10). The list changes before the
   * first wait, so the request that told of the change sees it.
   */
  const documentsChanged = async (change: DocumentsChange): Promise<void> => {
    for (const dir of change.removed) {
      sessions.get(dir)?.close()
      sessions.delete(dir)
      approvals?.forget(dir)
      requester.delete(dir)
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

  /**
   * The repository, its history, the document writer, the document operations and the workspace's
   * routes: made once the server runs and the mode is known, as the user serve becomes (git refuses a
   * repository another user owns). In SHARED mode git runs isolated from what the sandbox may write,
   * and what is inside the document directories is written by agent-host, as the sandbox (WP-91).
   */
  const workspaceOf = (): { revisions?: Revisions, writer: DocumentWriter, plugin: ServedPlugin } => {
    const writer = shared && agentHost ? agentHost.writer() : localWriter(config)
    const group = env.PRESMIUM_DOCUMENTS_GROUP ? groupId(env.PRESMIUM_DOCUMENTS_GROUP) : undefined
    const git = Git.isRepository(root) ? new Git(root, shared) : undefined
    if (!git) log.warn(`${root} is not a git repository: editing, the document operations and the history are not available (run git init)`)
    const revisions = git ? new Revisions(git, { config, writer, ...group !== undefined ? { group } : {} }) : undefined
    const documents = new Documents({ config, git: git!, revisions: revisions!, writer, changed: documentsChanged, ...group !== undefined ? { group } : {}, locks })
    const routes: WorkspaceRoutes = {
      documents,
      ...revisions ? { revisions } : {},
      locks,
      documentsChanged,
      execution: dir => approvals?.state(dir, !shared) ?? { mode: 'local', notRun: [], pending: false },
      requestExecution(dir, member) {
        if (!approvals) return
        requester.set(dir, member)
        approvals.requestAgain(sessionOf(dir))
      },
      // A reader in SHARED mode has the static site built for students, which may be a build behind (D17).
      site: (dir, member) => (shared && !mayEdit(member.roles) ? site?.status?.(dir) : undefined) ?? { kind: 'live' },
    }
    return { ...revisions ? { revisions } : {}, writer, plugin: { id: WORKSPACE_ID, plugin: workspacePlugin(routes), config: {} } }
  }
  let workspace: ReturnType<typeof workspaceOf> | undefined
  const plugin = (): ServedPlugin => workspace!.plugin

  // Set once the server runs and the mode is known: no document compiles, and no route answers, before.
  let started!: () => void
  const ready = new Promise<void>(resolve => started = resolve)

  const serverHost: ServerHost = {
    async documents() {
      return docs().map(({ entry: _entry, ...doc }) => doc)
    },
    async compile(document, view: DocumentView = 'full') {
      await ready
      const compilation = await sessionOf(document).ready({ mayAsk: view === 'full' })
      const doc = viewDocument(compilation, view)
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
      const view = buildOptions.view ?? 'full'
      if (shared && agentHost) {
        const plugins = compilation.plugins.flatMap(loaded => (loaded.plugin?.gateway ? [pluginId(loaded)] : []))
        // Code without a recording runs in the build only when `compile: trusted`; allowed code has its recording already.
        return agentHost.build(document, { ...buildOptions.to ? { to: buildOptions.to } : {}, view, run: mode === 'trusted' ? 'all' : 'none' }, plugins, requester.get(document))
      }
      // Into serve's state directory, not the document: an agent's build is no change of the source to review (F-51).
      const outDir = join(stateDir(root, env), 'builds', encodeURIComponent(document) || '_', view)
      const report = await buildView(compilation, { to: buildOptions.to, view, outDir })
      return { outputs: report.outputs.map(({ renderer, outDir: written }) => ({ renderer, outDir: written })), findings: report.findings }
    },
    async run(document, target, signal) {
      await ready
      return runBlock(await sessionOf(document).ready(), target, signal)
    },
  }

  /**
   * The home page as the server serves it: the workspace's routes and those of the operator plugins
   * (`settings.presmium.workspace.plugins`, e.g. the assistant's, D14), with their Node services as a
   * document's compilation has them (the host's first). The home page is no document: the plugins'
   * routes get an empty directory of serve's, outside the workspace, as its deck directory and
   * workspace root (`home`), so no route of theirs reads or changes a file of the workspace there
   * (the documents are the workspace's routes' to list and create).
   */
  let operators: ReturnType<typeof workspacePlugins> | undefined
  let home: string | undefined
  // Loaded once the server runs and the mode is known (SHARED: agent-host's services in place of the plugins'),
  // as the user serve becomes.
  const operatorsOf = async () => {
    await ready
    home ??= mkdtempSync(join(tmpdir(), 'presmium-home-'))
    return operators ??= workspacePlugins(root, pluginOptions(''))
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
    }
  }

  // The approvals of the workspace configuration; in SHARED mode with `compile: approve`, `operate: allow`
  // would let any operate approval pass, the compile approval among them, which only `compile` decides.
  const policy = { ...config.approvals }
  if (login && mode === 'approve' && policy.operate === 'allow') {
    log.warn('approvals.operate: allow does not apply in SHARED mode with settings.presmium.exec.compile: approve; operate approvals are asked')
    policy.operate = 'ask'
  }

  // Started as root, the server becomes `user` with its groups (the group of the document directories, 10.5).
  server = await startServer({
    mode: 'serve',
    host: options.host,
    port: options.port,
    trustProxyFrom: options.trustProxyFrom,
    roles: identity => rolesOf(identity, config.members),
    forward: (member) => {
      lookAtDisk()
      return site?.forward(member.roles.some(role => role === 'editor' || role === 'owner') ? 'full' : 'student')
    },
    settings: config.settings,
    approvals: policy,
    ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
    user: options.user,
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
  // Read: the secrets leave this process's environment, so no child process inherits them.
  if (env === process.env) for (const name of Object.keys(process.env)) if (isOwnSecret(name)) delete process.env[name]
  shared = running.trust === 'shared'
  if (shared) log.warn('SHARED mode (a presmium serve with a login) is experimental until the security review of the shared deployment passes (docs/architecture.md 9.4)')
  services = running.services
  gateway = running.gateway
  // agent-host's access, read with the server's other secrets, once (as root, before it dropped privileges).
  if (shared) agentHost = new AgentHostClient(running.agentHost!, gateway, log)
  // Now as serve's user (the server dropped privileges once it read the token files).
  workspace = workspaceOf()
  hostServices = [
    ...workspace.revisions ? [[REVISIONS, workspace.revisions] as [ServiceToken<unknown>, unknown]] : [],
    [DOCUMENT_FILES, workspace.writer],
    [DOCUMENT_LOCKS, locks],
  ]
  if (shared) {
    const client = agentHost!
    approvals = new CompileApprovals(mode, () => running.control.approvals, async (dir, runs, member) => {
      const plugins = [...new Set(runs.flatMap(run => pluginsOf(dir, run.executor)))]
      const done = await client.record(dir, runs.map(runKey), plugins, member)
      log.info(`agent-host ran and recorded ${done.executed} of ${runs.length} code block${runs.length === 1 ? '' : 's'} of ${dir || '.'}`)
    }, log)
    agentInfo = await client.info().catch((error: unknown) => {
      log.warn(`agent-host did not say what it has: ${errorMessage(error)}`)
      return {}
    })
  }

  started()

  // The site: in LOCAL mode this process's dev servers; in SHARED mode agent-host's for editors and owners,
  // and the readers' static site.
  const compileFull = async (dir: string): Promise<IRDocument> => {
    const compilation = await sessionOf(dir).ready({ mayAsk: true })
    return siteIR(compilation, viewDocument(compilation, 'full'))
  }
  try {
    site = shared && agentHost
      ? await remoteSites(agentHost, spec, compileFull, new StudentSite({
          client: agentHost,
          spec,
          root,
          state: stateDir(root, env),
          compile: dir => sessionOf(dir).ready({ mayAsk: false }),
          latest: dir => sessions.get(dir)?.latest,
          plugins: dir => sessions.get(dir)?.latest?.plugins.flatMap(loaded => (loaded.plugin?.gateway ? [pluginId(loaded)] : [])) ?? [],
          log,
        }), log)
      : await localSite(root, spec, options.bundled, stateDir(root, env), compileFull, config.single ? {} : homePlugins((await operatorsOf()).plugins), log)
  } catch (error) {
    await running.close()
    if (home) rmSync(home, { recursive: true, force: true })
    throw error
  }

  return {
    url: running.url,
    trust: running.trust,
    root,
    async close() {
      for (const session of sessions.values()) session.close()
      await site?.close()
      await running.close()
      if (home) rmSync(home, { recursive: true, force: true })
    },
  }
}

interface SiteBackend {
  forward(view: DocumentView): string | undefined
  update(dir: string, compilation: Compilation): Promise<void> | void
  documentsChanged(removed: string[]): Promise<void>
  /** How a reader's pages are now (SHARED: the static site). */
  status?(dir: string): SiteState
  close(): Promise<void>
}

/** LOCAL: the web renderer's dev site in this process; the one member is the owner (full view). */
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
    update: (dir, compilation) => dev.update(dir, siteIR(compilation, viewDocument(compilation, 'full'))).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`)),
    // The dev site reads the list at each request: the documents no longer listed close there.
    documentsChanged: async () => {},
    close: () => dev.close(),
  }
}

/**
 * SHARED: the editors' and owners' site, a dev server in agent-host behind a router of serve's (see
 * ./remote-site.ts); the readers' site, static, built for students by agent-host and served by serve
 * (see ./student-site.ts, D17).
 */
async function remoteSites(client: AgentHostClient, spec: SiteSpec, compile: (dir: string) => Promise<IRDocument>, student: StudentSite, log: Logger): Promise<SiteBackend> {
  const full = new RemoteSite(client, spec, 'full', compile, log)
  const urls = { full: await full.url(), student: await student.url() }
  return {
    forward: view => urls[view],
    async update(dir, compilation) {
      student.compiled(dir)
      await full.update(dir, siteIR(compilation, viewDocument(compilation, 'full')))
    },
    async documentsChanged(removed) {
      student.documentsChanged(removed)
      await full.documentsChanged(removed)
    },
    status: dir => student.status(dir),
    async close() {
      await Promise.all([full.close(), student.close()])
    },
  }
}
