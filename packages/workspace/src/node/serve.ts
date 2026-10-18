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
import { Reviews } from './review/reviews.ts'
import { Revisions } from './revisions.ts'
import { workspacePlugin } from './routes.ts'
import type { WorkspaceRoutes } from './routes.ts'
import { DocumentSession } from './session.ts'
import { siteContext, siteDocument, siteIR, siteSpec, untranslated, webRenderer } from './site.ts'

export interface ServeOptions {
  dir: string
  host?: string
  port?: number
  operatorDir?: string
  bundled?: string
  check?(compilation: Compilation): Promise<Finding[]>
  previewOrigins?: string[]
  env?: NodeJS.ProcessEnv
  approvalTimeoutMs?: number
  log?: Logger
}

export interface WorkspaceServer {
  url: string
  root: string
  mcp: { url: string, stateFile: string }
  close(): Promise<void>
}

const DISK_LOOK_MS = 1000

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
  const preview = { origins: options.previewOrigins ?? [] }

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
      for (const finding of untranslated(compilation, root)) {
        if (!compilation.doc.diagnostics.some(f => f.message === finding.message)) compilation.doc.diagnostics.push(finding)
      }
    })
    session.onCompile((compilation, changed) => {
      service?.compiled(dir, compilation, changed)
      void Promise.resolve(site?.update(dir, compilation)).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`))
    })
    sessions.set(dir, session)
    return session
  }

  const pluginOptions = (): CompilerOptions => ({
    workspaceRoot: root,
    settings: config.settings,
    services: [...services, ...hostServices],
    bundled: options.bundled,
    ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
    secret: name => env[name],
  })

  const spec: SiteSpec = siteSpec(config, docs().map(doc => siteDocument(doc)))
  const refreshSpec = (): DocumentsChange => {
    const now = docs()
    const before = spec.documents.map(doc => doc.dir)
    spec.documents.splice(0, spec.documents.length, ...now.map(doc => siteDocument(doc)))
    return { removed: before.filter(dir => !now.some(doc => doc.dir === dir)), added: now.map(doc => doc.dir).filter(dir => !before.includes(dir)) }
  }

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

  let lookedAt = 0
  const lookAtDisk = (): void => {
    if (Date.now() - lookedAt < DISK_LOOK_MS) return
    lookedAt = Date.now()
    const now = docs().map(doc => doc.dir)
    const known = spec.documents.map(doc => doc.dir)
    const change = { removed: known.filter(dir => !now.includes(dir)), added: now.filter(dir => !known.includes(dir)) }
    if (change.removed.length || change.added.length) void documentsChanged(change).catch((error: unknown) => log.warn(`the documents on disk changed, but the site did not follow: ${errorMessage(error)}`))
  }

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
      const outDir = join(stateDir(root, env), 'builds', encodeURIComponent(document) || '_')
      const report = await buildView(compilation, { to: buildOptions.to, outDir })
      return { outputs: report.outputs.map(({ renderer, outDir: written }) => ({ renderer, outDir: written })), findings: report.findings }
    },
    async run(document, target, signal) {
      await ready
      return runBlock(await sessionOf(document).ready(), target, signal)
    },
  }

  let operators: ReturnType<typeof workspacePlugins> | undefined
  let home: string | undefined
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
      const reviews = workspace?.reviews
      const service = <T>(token: ServiceToken<T>) => served.service(token) ?? (reviews && token.id === CHANGE_REVIEW.id ? reviews.service as T : undefined)
      return { ...served, service, plugins: [plugin(), ...served.plugins] }
    },
  })
  const running = server
  services = running.services
  service = workspaceService({ root, sessionOf, serverHost, url: () => running.url, preview, stateDir: stateDir(root, env), log })
  workspace = workspaceOf()
  hostServices = [
    ...workspace.revisions ? [[REVISIONS, workspace.revisions] as [ServiceToken<unknown>, unknown]] : [],
    [DOCUMENT_FILES, workspace.writer],
    [DOCUMENT_LOCKS, locks],
  ]
  await workspace.reviews?.recover(docs().map(doc => doc.dir))

  started()
  if (config.single) for (const { dir } of docs()) void sessionOf(dir).ready().catch(() => undefined)

  const compileFull = async (dir: string): Promise<IRDocument> => {
    const compilation = await sessionOf(dir).ready()
    return service!.siteDoc(compilation, siteIR(compilation))
  }
  try {
    site = await localSite({ root, spec, bundled: options.bundled, state: stateDir(root, env), compile: compileFull, siteDoc: (compilation, doc) => service!.siteDoc(compilation, doc), preview, log })
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
  siteDoc(compilation: Compilation, doc: IRDocument): IRDocument
  preview: { origins: string[] }
  log: Logger
}

async function localSite(options: LocalSiteOptions): Promise<SiteBackend> {
  const { root, spec, log } = options
  const renderer = await webRenderer(root, options.bundled)
  const findings: Finding[] = []
  const work = join(options.state, 'site', 'full')
  const ctx = siteContext({ root, outDir: work, workDir: work, findings })
  ctx.preview = options.preview
  const dev = await renderer.devSite!(spec, ctx, options.compile)
  const origin = new URL(dev.url).origin
  log.info(`the workspace site's dev router is at ${origin} (this machine only; pages reach it through serve)`)
  return {
    forward: () => origin,
    update: (dir, compilation) => dev.update(dir, options.siteDoc(compilation, siteIR(compilation))).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`)),
    documentsChanged: async () => {},
    close: () => dev.close(),
  }
}
