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
 *
 * Both modes load only the operator's plugins (D14): the packages listed in
 * `settings.presmium.workspace.plugins`, installed at the workspace root.
 */
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { build, Compiler, loadPlugins, pluginId } from '@presmium/compiler'
import type { Compilation, CompilerOptions } from '@presmium/compiler'
import { AGENT_RUNTIME, CHANGE_REVIEW, errorMessage, irBlocks, REVISIONS } from '@presmium/kernel'
import type { Finding, IRDocument, Logger, Member, ServiceToken, SiteSpec } from '@presmium/kernel'
import { servedDocument, sharedSetup, startServer } from '@presmium/server'
import type { DocumentView, ServedDocument, ServedPlugin, ServerHost } from '@presmium/server'
import { WORKSPACE_ID } from '../domain/api.ts'
import { rolesOf } from '../domain/members.ts'
import { AgentHostClient } from './agent-client.ts'
import { initGroups } from './agent-host.ts'
import { viewDocument } from './audience.ts'
import { listDocuments, readWorkspace } from './config.ts'
import { Documents, RequestError } from './documents.ts'
import { CompileApprovals, compileMode } from './execution.ts'
import { Git } from './git.ts'
import { RemoteSite } from './remote-site.ts'
import { Revisions } from './revisions.ts'
import { workspacePlugin } from './routes.ts'
import type { WorkspaceRoutes } from './routes.ts'
import { DocumentSession } from './session.ts'
import { servedPlugins, siteContext, siteDocument, siteIR, siteSpec, webRenderer } from './site.ts'

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
  /** The plugins' checks of a compilation (the CLI's `presmium check`), for `ServerHost.check`. */
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

const STDERR: Logger = {
  debug: () => {},
  info: (...args) => console.error('[presmium serve]', ...args),
  warn: (...args) => console.error('[presmium serve]', ...args),
  error: (...args) => console.error('[presmium serve]', ...args),
}

/** Where serve keeps what it generates for a workspace (the LOCAL site's projects): outside the workspace. */
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
  const log = options.log ?? STDERR
  const config = readWorkspace(options.dir)
  const { root } = config
  const login = Boolean(env.PRESMIUM_PROXY_SECRET || env.PRESMIUM_PROXY_SECRET_FILE || options.trustProxyFrom?.length)
  const docs = () => listDocuments(config)
  if (login && (config.single || docs().some(doc => doc.dir === ''))) {
    throw new Error(`${root} is a single-deck repository (its root is a document): a presmium serve with a login (SHARED mode) supports only workspaces whose documents are in subdirectories, since the sandbox could write the workspace configuration and node_modules otherwise (docs/architecture.md 10.5); move the deck into a subdirectory, or serve it on this machine without a login`)
  }
  const sessions = new Map<string, DocumentSession>()
  const mode = compileMode(config.settings)

  // Set once the server is up: the compilers need its services, the server needs the documents.
  let shared = false
  let services: [ServiceToken<unknown>, unknown][] = []
  let gateway: { url: string, token: string } | undefined
  let agentHost: AgentHostClient | undefined
  let hostServices: [ServiceToken<unknown>, unknown][] = []
  let approvals: CompileApprovals | undefined
  let site: SiteBackend | undefined
  /** The member a document's compilation acts for (who opened it), for the approval's requester. */
  const requester = new Map<string, Member>()

  const sessionOf = (dir: string): DocumentSession => {
    const known = sessions.get(dir)
    if (known) return known
    const document = docs().find(doc => doc.dir === dir)
    if (!document) throw new RequestError(404, `no document ${JSON.stringify(dir)}`)
    const session: DocumentSession = new DocumentSession(dir, new Compiler(join(root, document.entry), compilerOptions(dir, () => session)), log)
    session.onCompile(async (compilation) => {
      for (const finding of await rendererPackages(compilation)) {
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

  const compilerOptions = (dir: string, session: () => DocumentSession): CompilerOptions => {
    const pluginsOf = (executor: string): string[] => {
      const compilation = session().latest
      const owner = compilation?.plugins.find(loaded => loaded.plugin?.executors?.some(e => e.id === executor))
      const environment = executor.startsWith('presmium.env.') ? compilation?.execute.environments?.[executor.slice('presmium.env.'.length)] : undefined
      const provider = environment && compilation?.plugins.find(loaded => loaded.plugin?.environments?.[environment.kind])
      return [owner, provider].flatMap(loaded => (loaded ? [pluginId(loaded)] : []))
    }
    return {
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
      execution: shared && agentHost
        ? {
            env: 'serve',
            remote: agentHost.remote(dir, pluginsOf, () => requester.get(dir)),
            ...mode === 'trusted' ? {} : { admit: approvals!.admit(session, () => session().latest?.doc.meta.title ?? dir, () => session().latest?.doc.meta.lang, () => requester.get(dir)) },
          }
        : { env: 'serve' },
    }
  }

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
  const refreshSpec = (): { removed: string[] } => {
    const now = docs()
    const before = spec.documents.map(doc => doc.dir)
    spec.documents.splice(0, spec.documents.length, ...now.map(doc => siteDocument(doc)))
    return { removed: before.filter(dir => !now.some(doc => doc.dir === dir)) }
  }

  /**
   * The repository, its history, the document operations and the workspace's routes: made once the
   * server runs, as the user serve becomes (git refuses a repository another user owns).
   */
  const workspaceOf = (): { revisions?: Revisions, plugin: ServedPlugin } => {
    const git = Git.isRepository(root) ? new Git(root) : undefined
    if (!git) log.warn(`${root} is not a git repository: editing, the document operations and the history are not available (run git init)`)
    const revisions = git ? new Revisions(git) : undefined
    const documents = new Documents(config, git!, revisions!, async ({ removed }) => {
      for (const dir of removed) {
        sessions.get(dir)?.close()
        sessions.delete(dir)
        approvals?.forget(dir)
      }
      const changed = refreshSpec()
      await site?.documentsChanged([...new Set([...removed, ...changed.removed])])
    }, env.PRESMIUM_DOCUMENTS_GROUP)
    const routes: WorkspaceRoutes = {
      documents,
      ...revisions ? { revisions } : {},
      execution: dir => approvals?.state(dir, !shared) ?? { mode: 'local', notRun: [], pending: false },
      requestExecution(dir, member) {
        if (!approvals) return
        requester.set(dir, member)
        approvals.requestAgain(sessionOf(dir))
      },
    }
    return { ...revisions ? { revisions } : {}, plugin: { id: WORKSPACE_ID, plugin: workspacePlugin(routes), config: {} } }
  }
  let workspace: ReturnType<typeof workspaceOf> | undefined
  const plugin = (): ServedPlugin => (workspace ??= workspaceOf()).plugin

  const serverHost: ServerHost = {
    async documents() {
      return docs().map(({ entry: _entry, ...doc }) => doc)
    },
    async compile(document, view: DocumentView = 'full') {
      const compilation = await sessionOf(document).ready({ mayAsk: view === 'full' })
      const doc = viewDocument(compilation, view)
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      const compilation = await sessionOf(document).ready()
      return [...compilation.doc.diagnostics, ...await options.check?.(compilation) ?? []]
    },
    async build(document, buildOptions = {}) {
      const compilation = await sessionOf(document).ready()
      if (shared && agentHost) {
        const plugins = compilation.plugins.flatMap(loaded => (loaded.plugin?.gateway ? [pluginId(loaded)] : []))
        // Code without a recording runs in the build only when `compile: trusted`; allowed code has its recording already.
        return agentHost.build(document, { ...buildOptions.to ? { to: buildOptions.to } : {}, view: buildOptions.view ?? 'full', run: mode === 'trusted' ? 'all' : 'none' }, plugins, requester.get(document))
      }
      const report = await build(compilation, { outDir: join(compilation.deckDir, 'dist'), to: buildOptions.to })
      return { outputs: report.outputs.map(({ renderer, outDir }) => ({ renderer, outDir })), findings: report.findings }
    },
    async run(document, target, signal) {
      const compilation = await sessionOf(document).ready()
      const section = compilation.doc.sections.find(s => s.id === target.section)
      const block = section && [...irBlocks(section.blocks)].find(b => b.id === target.block)
      if (!block || block.node.type !== 'code') throw new Error(`no code block ${target.section}/${target.block}`)
      return compilation.run(block.node, signal)
    },
  }

  const homeDocument = (): ServedDocument => ({
    deckDir: root,
    workspaceRoot: root,
    plugins: [plugin()],
    service: <T>(token: ServiceToken<T>) => [...services, ...hostServices].find(([own]) => own.id === token.id)?.[1] as T | undefined,
    settings: config.settings,
    ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
  })

  // The approvals of the workspace configuration; in SHARED mode with `compile: approve`, `operate: allow`
  // would let any operate approval pass, the compile approval among them, which only `compile` decides.
  const policy = { ...config.approvals }
  if (login && mode === 'approve' && policy.operate === 'allow') {
    log.warn('approvals.operate: allow does not apply in SHARED mode with settings.presmium.exec.compile: approve; operate approvals are asked')
    policy.operate = 'ask'
  }

  // SHARED: read here as well (token files only root can read; the server drops privileges once it read them).
  const setup = login ? sharedSetup(env) : undefined
  // Started as root: the user's own groups come along (the group of the document directories, 10.5).
  if (options.user && process.getuid?.() === 0) {
    const id = /^\d+$/.test(options.user) ? Number(options.user) : options.user
    initGroups(id)
  }
  const server = await startServer({
    mode: 'serve',
    host: options.host,
    port: options.port,
    trustProxyFrom: options.trustProxyFrom,
    roles: identity => rolesOf(identity, config.members),
    forward: member => site?.forward(member.roles.some(role => role === 'editor' || role === 'owner') ? 'full' : 'student'),
    settings: config.settings,
    approvals: policy,
    ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
    user: options.user,
    serverHost,
    env,
    ...options.approvalTimeoutMs ? { approvalTimeoutMs: options.approvalTimeoutMs } : {},
    log,
    async document(dir) {
      if (dir === '' && !config.single) return homeDocument()
      if (!docs().some(doc => doc.dir === dir)) return undefined
      const compilation = await sessionOf(dir).ready()
      const served = servedDocument(compilation)
      return { ...served, plugins: [plugin(), ...served.plugins] }
    },
  })
  // Read: the secrets leave this process's environment, so no child process inherits them.
  if (env === process.env) for (const name of Object.keys(process.env)) if (isOwnSecret(name)) delete process.env[name]
  shared = server.trust === 'shared'
  services = server.services
  gateway = server.gateway
  // Now as serve's user (the server dropped privileges once it read the token files).
  workspace ??= workspaceOf()
  hostServices = workspace.revisions ? [[REVISIONS, workspace.revisions]] : []
  if (shared) {
    approvals = new CompileApprovals(mode, () => server.control.approvals, log)
    agentHost = new AgentHostClient(setup!.agentHost, gateway, log)
    agentInfo = await agentHost.info().catch((error: unknown) => {
      log.warn(`agent-host did not say what it has: ${errorMessage(error)}`)
      return {}
    })
  }

  // The site: in LOCAL mode this process's dev servers; in SHARED mode agent-host's, one per view.
  const compileFor = (view: DocumentView, mayAsk: boolean) => async (dir: string): Promise<IRDocument> => {
    const compilation = await sessionOf(dir).ready({ mayAsk })
    return siteIR(compilation, viewDocument(compilation, view))
  }
  try {
    site = shared && agentHost
      ? await remoteSites(agentHost, spec, compileFor, log)
      : await localSite(root, spec, options.bundled, stateDir(root, env), compileFor('full', true), log)
  } catch (error) {
    await server.close()
    throw error
  }

  return {
    url: server.url,
    trust: server.trust,
    root,
    async close() {
      for (const session of sessions.values()) session.close()
      await site?.close()
      await server.close()
    },
  }
}

interface SiteBackend {
  forward(view: DocumentView): string | undefined
  update(dir: string, compilation: Compilation): Promise<void> | void
  documentsChanged(removed: string[]): Promise<void>
  close(): Promise<void>
}

/** LOCAL: the web renderer's dev site in this process; the one member is the owner (full view). */
async function localSite(root: string, spec: SiteSpec, bundled: string | undefined, state: string, compile: (dir: string) => Promise<IRDocument>, log: Logger): Promise<SiteBackend> {
  const renderer = await webRenderer(root, bundled)
  const findings: Finding[] = []
  const work = join(state, 'site', 'full')
  const ctx = siteContext({ root, outDir: work, workDir: work, plugins: servedPlugins(), findings })
  const dev = await renderer.devSite!(spec, ctx, compile)
  const origin = new URL(dev.url).origin
  return {
    forward: () => origin,
    update: (dir, compilation) => dev.update(dir, siteIR(compilation, viewDocument(compilation, 'full'))).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`)),
    documentsChanged: async () => {},
    close: () => dev.close(),
  }
}

/** SHARED: a site per view in agent-host, each behind a router of serve's (see ./remote-site.ts). */
async function remoteSites(client: AgentHostClient, spec: SiteSpec, compile: (view: DocumentView, mayAsk: boolean) => (dir: string) => Promise<IRDocument>, log: Logger): Promise<SiteBackend> {
  const views = {
    full: new RemoteSite(client, spec, 'full', compile('full', true), log),
    student: new RemoteSite(client, spec, 'student', compile('student', false), log),
  }
  const urls = { full: await views.full.url(), student: await views.student.url() }
  return {
    forward: view => urls[view],
    async update(dir, compilation) {
      await Promise.all((['full', 'student'] as const).map(view => views[view].update(dir, siteIR(compilation, viewDocument(compilation, view)))))
    },
    async documentsChanged(removed) {
      await Promise.all(Object.values(views).map(view => view.documentsChanged(removed)))
    },
    async close() {
      await Promise.all(Object.values(views).map(view => view.close()))
    },
  }
}

