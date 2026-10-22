import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { build, Compiler, pluginLogger, runBlock, workspacePlugins } from '@lincyaw/compiler'
import type { Compilation, CompilerOptions } from '@lincyaw/compiler'
import { CHANGE_REVIEW, DOCUMENT_FILES, DOCUMENT_LOCKS, errorMessage, REVISIONS } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import type { ChangeReviewService, Finding, IRDocument, Logger, ServiceToken, SiteSpec } from '@lincyaw/kernel'
import { serverConfigKey, servedDocument, startServer } from '@lincyaw/server'
import type { DiagnosticStore, PresmiumServer, ServedDocument, ServedPlugin, ServerHost } from '@lincyaw/server'
import { CompileSession } from './compile-session.ts'
import { documentSummaries, listDocuments, readWorkspaceConfig } from './config.ts'
import { DocumentOperations, documentsDiff } from './document-operations.ts'
import type { DocumentsChange } from './document-operations.ts'
import { RequestError } from './errors.ts'
import { Git } from './git.ts'
import { DocumentLocks } from './locks.ts'
import { AgentSessionReviews } from './review/agent-session-reviews.ts'
import { createTaskReviewService } from './review/task-reviews.ts'
import { Revisions } from './revisions.ts'
import { WORKSPACE_ID, workspaceRoutesPlugin } from './routes.ts'
import { refreshDocumentVitePlugins, siteContext, siteDocument, siteIR, siteSpec, untranslatedFindings, webRenderer } from './site.ts'
import { SourceEditor } from './source-editor.ts'
import { createWorkbenchBackend } from './workbench-api.ts'
import type { WorkbenchBackend } from './workbench-api.ts'
import { localWriter } from './writer.ts'

export interface ServeOptions {
  dir: string
  listenAddress?: string
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

/** What the workspace keeps when it is a git repository: its revisions, the document operations and the reviews. */
interface WorkspaceHistory {
  revisions: Revisions
  operations: DocumentOperations
  agentSessionReviews: AgentSessionReviews
  taskReviews: ChangeReviewService
}

const DISK_LOOK_MS = 1000

function makeStateDir(root: string, env: NodeJS.ProcessEnv): string {
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache')
  const dir = join(base, 'presmium', 'serve', createHash('sha256').update(root).digest('hex').slice(0, 16))
  mkdirSync(dir, { recursive: true })
  return dir
}

export async function serveWorkspace(options: ServeOptions): Promise<WorkspaceServer> {
  const env = options.env ?? process.env
  const log = options.log ?? pluginLogger('presmium serve')
  const config = readWorkspaceConfig(options.dir)
  const { root } = config
  const stateDir = makeStateDir(root, env)
  const docs = () => listDocuments(config)
  const compileSessions = new Map<string, CompileSession>()
  const locks = new DocumentLocks()
  const writer = localWriter(config)
  const editor = new SourceEditor({ config, writer, locks })
  const check = options.check ?? (compilation => compilation.check())
  const launcherToken = env.PRESMIUM_SERVICE_TOKEN || undefined
  const preview = { origins: options.previewOrigins ?? [] }

  let serverServices: [ServiceToken<unknown>, unknown][] = []
  let workspaceServices: [ServiceToken<unknown>, unknown][] = []
  let site: WorkspaceSite | undefined
  let server: PresmiumServer | undefined
  let workbench: WorkbenchBackend | undefined
  let history: WorkspaceHistory | undefined
  let routesPlugin: ServedPlugin | undefined

  const compileSessionOf = (dir: string): CompileSession => {
    const known = compileSessions.get(dir)
    if (known) return known
    const document = docs().find(doc => doc.dir === dir)
    if (!document) throw new RequestError(404, `no document ${JSON.stringify(dir)}`)
    const session = new CompileSession(dir, new Compiler(join(root, document.entry), { ...compilerOptions(), priority: 'interactive', execution: { env: 'serve' } }), log)
    let configKey: string | undefined
    session.onCompile(async (compilation) => {
      const next = serverConfigKey(compilation)
      if (configKey !== undefined && configKey !== next) void server?.unmount(dir, { preserveFocus: true }).catch((error: unknown) => {
        log.error(`the previous server contributions of ${dir || '.'} did not close: ${errorMessage(error)}`)
      })
      configKey = next
      for (const finding of untranslatedFindings(compilation, root)) {
        if (!compilation.doc.diagnostics.some(f => f.message === finding.message)) compilation.doc.diagnostics.push(finding)
      }
    })
    session.onCompile((compilation, changed) => {
      server?.diagnostics.compiled(dir, compilation.doc, root, irRevision(compilation.doc))
      workbench?.compiled(dir, compilation, changed)
      void site?.update(dir, compilation).catch((error: unknown) => log.warn(`the site did not take ${dir}: ${errorMessage(error)}`))
    })
    session.onFailure(error => server?.diagnostics.failed(dir, errorMessage(error), { file: relative(root, session.compiler.entry).replace(/\\/g, '/') }))
    compileSessions.set(dir, session)
    return session
  }

  const compilerOptions = (): CompilerOptions => ({
    workspaceRoot: root,
    settings: config.settings,
    services: [...serverServices, ...workspaceServices],
    bundled: options.bundled,
    ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
    secret: name => env[name],
  })

  const spec: SiteSpec = siteSpec(config, docs().map(doc => siteDocument(doc)))
  const refreshSpec = (): DocumentsChange => {
    const before = spec.documents.map(doc => doc.dir)
    const now = docs()
    spec.documents.splice(0, spec.documents.length, ...now.map(doc => siteDocument(doc)))
    return documentsDiff(before, now.map(doc => doc.dir))
  }

  const documentsChanged = async (change: DocumentsChange): Promise<void> => {
    for (const dir of change.removed) {
      server?.diagnostics.forget(dir)
      compileSessions.get(dir)?.close()
      compileSessions.delete(dir)
    }
    const listed = refreshSpec()
    const removed = [...new Set([...change.removed, ...listed.removed])]
    for (const dir of new Set([...removed, ...change.added, ...listed.added])) await server?.unmount(dir)
    await workbench?.documentsRemoved(removed)
  }

  let lookedAt = 0
  const lookAtDisk = (): void => {
    if (Date.now() - lookedAt < DISK_LOOK_MS) return
    lookedAt = Date.now()
    const change = documentsDiff(spec.documents.map(doc => doc.dir), docs().map(doc => doc.dir))
    if (change.removed.length || change.added.length) void documentsChanged(change).catch((error: unknown) => log.warn(`the documents on disk changed, but the site did not follow: ${errorMessage(error)}`))
  }

  const openHistory = (): WorkspaceHistory | undefined => {
    if (!Git.isRepository(root)) {
      log.warn(`${root} is not a git repository: editing, the document operations and the history are not available (run git init)`)
      return undefined
    }
    const git = new Git(root)
    const revisions = new Revisions(git, { config, writer })
    return {
      revisions,
      operations: new DocumentOperations({ config, git, revisions, writer, changed: documentsChanged, locks }),
      agentSessionReviews: new AgentSessionReviews({ config, revisions, locks, files: writer, log }),
      taskReviews: createTaskReviewService({ config, locks, files: writer, log }),
    }
  }

  let started!: () => void
  const ready = new Promise<void>(resolve => started = resolve)

  const serverHost: ServerHost = {
    workspaceRoot: root,
    async readSource(path, member) {
      await ready
      return editor.read(editor.scope(''), path, member)
    },
    async documents() {
      return documentSummaries(config)
    },
    async compile(document) {
      await ready
      const { doc } = await compileSessionOf(document).ready()
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      await ready
      const session = compileSessionOf(document)
      const compilation = await session.ready()
      const findings = await check(compilation)
      if (session.latest === compilation) server?.diagnostics.replace({ document, origin: 'check' }, findings, { root, irRevision: irRevision(compilation.doc) })
      return [...compilation.doc.diagnostics, ...findings]
    },
    async build(document, buildOptions = {}) {
      await ready
      const compilation = await compileSessionOf(document).ready()
      const outDir = join(stateDir, 'builds', encodeURIComponent(document) || '_')
      const report = await build(compilation, { outDir, to: buildOptions.to })
      return { outputs: report.outputs.map(({ renderer, outDir: written }) => ({ renderer, outDir: written })), findings: report.findings }
    },
    async run(document, target, signal) {
      await ready
      return runBlock(await compileSessionOf(document).ready(), target, signal)
    },
  }

  let operators: ReturnType<typeof workspacePlugins> | undefined
  let home: string | undefined
  const loadOperatorPlugins = async () => {
    await ready
    home ??= mkdtempSync(join(tmpdir(), 'presmium-home-'))
    return operators ??= workspacePlugins(root, compilerOptions())
  }
  const homeDocument = async (): Promise<ServedDocument> => {
    const loaded = await loadOperatorPlugins()
    for (const problem of loaded.problems) log.warn(`the home page: ${problem.message}`)
    const own = (token: ServiceToken<unknown>) => [...serverServices, ...workspaceServices].find(([known]) => known.id === token.id)?.[1]
    return {
      deckDir: home!,
      workspaceRoot: home!,
      plugins: [routesPlugin!, ...loaded.plugins.flatMap(({ plugin: node }) => (node ? [{ id: node.id, plugin: node, config: {} }] : []))],
      service: <T>(token: ServiceToken<T>) => (own(token) ?? loaded.service(token)) as T | undefined,
      settings: config.settings,
      ...options.operatorDir ? { operatorDir: options.operatorDir } : {},
      home: true,
    }
  }

  const stateFile = join(stateDir, 'server.json')
  server = await startServer({
    mode: 'serve',
    listenAddress: options.listenAddress,
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
      if (dir === '' && !config.singleDeck) return await homeDocument()
      if (!docs().some(doc => doc.dir === dir)) return undefined
      const compilation = await compileSessionOf(dir).ready()
      const served = servedDocument(compilation)
      const taskReviews = history?.taskReviews
      const service = <T>(token: ServiceToken<T>) => served.service(token) ?? (taskReviews && token.id === CHANGE_REVIEW.id ? taskReviews as T : undefined)
      return { ...served, service, plugins: [routesPlugin!, ...served.plugins] }
    },
  })
  const running = server
  serverServices = running.services
  workbench = createWorkbenchBackend({ root, compileSessionOf, serverHost, diagnostics: running.diagnostics, url: () => running.url, preview, stateDir, log })
  history = openHistory()
  routesPlugin = {
    id: WORKSPACE_ID,
    plugin: workspaceRoutesPlugin({
      config,
      editor,
      locks,
      ...history ? { revisions: history.revisions, operations: history.operations, reviews: history.agentSessionReviews } : {},
      documentsChanged,
      workbench,
      ...launcherToken ? { launcherToken } : {},
    }),
    config: {},
  }
  workspaceServices = [
    ...history ? [[REVISIONS, history.revisions] as [ServiceToken<unknown>, unknown]] : [],
    [DOCUMENT_FILES, writer],
    [DOCUMENT_LOCKS, locks],
  ]
  try {
    await history?.agentSessionReviews.recover(docs().map(doc => doc.dir))
  } catch (error) {
    history?.agentSessionReviews.close()
    await workbench.close()
    await running.close()
    throw error
  }

  started()

  const compileForSite = async (dir: string): Promise<IRDocument> => {
    const compilation = await compileSessionOf(dir).ready()
    refreshDocumentVitePlugins(spec, dir, compilation)
    return workbench!.stampPreviewRevision(compilation, siteIR(compilation))
  }
  try {
    site = await startWorkspaceSite({ root, spec, bundled: options.bundled, stateDir, compile: compileForSite, stampPreviewRevision: (compilation, doc) => workbench!.stampPreviewRevision(compilation, doc), diagnostics: running.diagnostics, preview, log })
  } catch (error) {
    await workbench.close()
    await running.close()
    if (home) rmSync(home, { recursive: true, force: true })
    throw error
  }

  return {
    url: running.url,
    root,
    mcp: { url: `${running.url}/mcp`, stateFile },
    async close() {
      history?.agentSessionReviews.close()
      for (const session of compileSessions.values()) session.close()
      await workbench?.close()
      await site?.close()
      await running.close()
      if (home) rmSync(home, { recursive: true, force: true })
    },
  }
}

interface WorkspaceSiteOptions {
  root: string
  spec: SiteSpec
  bundled?: string
  stateDir: string
  compile(dir: string): Promise<IRDocument>
  stampPreviewRevision(compilation: Compilation, doc: IRDocument): IRDocument
  preview: { origins: string[] }
  log: Logger
  diagnostics: DiagnosticStore
}

type WorkspaceSite = Awaited<ReturnType<typeof startWorkspaceSite>>

/** The workspace site's dev router in this process, which serve forwards the site's paths to. */
async function startWorkspaceSite(options: WorkspaceSiteOptions) {
  const { root, spec, log } = options
  const renderer = await webRenderer(root, options.bundled)
  const findings: Finding[] = []
  const work = join(options.stateDir, 'site', 'full')
  const ctx = siteContext({ root, outDir: work, workDir: work, findings })
  ctx.preview = options.preview
  const dev = await renderer.devSite!(spec, ctx, options.compile)
  const origin = new URL(dev.url).origin
  log.info(`the workspace site's dev router is at ${origin} (this machine only; pages reach it through serve)`)
  return {
    forward: (): string => origin,
    update: (dir: string, compilation: Compilation): Promise<void> => {
      refreshDocumentVitePlugins(spec, dir, compilation)
      const revision = irRevision(compilation.doc)
      return dev.update(dir, options.stampPreviewRevision(compilation, siteIR(compilation))).then(() => {
        if (options.diagnostics.irRevision(dir) === revision) options.diagnostics.clear(dir, 'preview', 'web')
      }, (error: unknown) => {
        const message = `the site did not take ${dir}: ${errorMessage(error)}`
        if (options.diagnostics.irRevision(dir) === revision) options.diagnostics.replace({ document: dir, origin: 'preview', renderer: 'web' }, [{ checkId: 'presmium.preview', severity: 'error', message }], { irRevision: revision })
        log.warn(message)
      })
    },
    close: (): Promise<void> => dev.close(),
  }
}
