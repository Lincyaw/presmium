import { createProjectAuthoring } from './projects.ts'
import { createDocumentHistory } from './document-history.ts'
import { createAuthoringClients } from './authoring-clients.ts'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { Compiler, pluginLogger, runBlock, workspacePlugins } from '@lincyaw/compiler'
import type { Compilation, CompilerOptions } from '@lincyaw/compiler'
import { CHANGE_REVIEW, DOCUMENT_FILES, DOCUMENT_LOCKS, DOCUMENT_VOICE_TASKS, errorMessage, PRODUCTION_AUDIO_AUTHORING, REVISIONS, SPEECH, VOICEOVER, VOICEOVER_EXECUTION } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import type { CanonicalSource, ChangeReviewService, Finding, IRDocument, Logger, ProductionAudioAuthoring, ServiceToken, SiteSpec, SpeechService } from '@lincyaw/kernel'
import { serverConfigKey, servedDocument, startServer } from '@lincyaw/server'
import type { DiagnosticStore, PresmiumServer, ServedDocument, ServedPlugin, ServerHost } from '@lincyaw/server'
import { CompileSession } from './compile-session.ts'
import { documentSummaries, listDocuments, readWorkspaceConfig } from './config.ts'
import { DocumentOperations, documentsDiff } from './document-operations.ts'
import type { DocumentsChange } from './document-operations.ts'
import { RequestError } from './errors.ts'
import { Git } from './git.ts'
import { createJobs, OUTPUTS_PATH } from './jobs.ts'
import { DocumentLocks } from './locks.ts'
import { AgentSessionReviews } from './review/agent-session-reviews.ts'
import { createTaskReviewService } from './review/task-reviews.ts'
import { Revisions } from './revisions.ts'
import { WORKSPACE_ID, authorizeWorkspaceRoutes, workspaceRoutes, workspaceRoutesPlugin } from './routes.ts'
import { refreshDocumentVitePlugins, siteContext, siteDocument, siteDocumentIR, siteSpec, untranslatedFindings, webRenderer } from './site.ts'
import { SourceEditor } from './source-editor.ts'
import { createDocumentEditor } from './document-editor.ts'
import type { DocumentEditor } from './document-editor.ts'
import { createDocumentTranscriptions } from './document-transcription.ts'
import { createTranscriptionAdoption } from './document-transcription-adoption.ts'
import { createDocumentAudioAuthoring } from './document-audio.ts'
import { createDocumentVoiceAuthoring } from './document-voice.ts'
import type { DocumentVoiceServices } from './document-voice.ts'
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
  git: Git
  revisions: Revisions
  operations: DocumentOperations
  agentSessionReviews: AgentSessionReviews
  taskReviews: ChangeReviewService
}

interface AuthoringServices extends DocumentVoiceServices { audio?: ProductionAudioAuthoring }
interface NodeServiceLoad { key: string, promise: Promise<AuthoringServices>, controller: AbortController }

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
  const agentToolListeners = new Set<(document: string) => void>()
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
  let documentEditor: DocumentEditor | undefined
  let documentHistory: ReturnType<typeof createDocumentHistory> | undefined
  let projectAuthoring: ReturnType<typeof createProjectAuthoring> | undefined
  let authoringClients: ReturnType<typeof createAuthoringClients> | undefined
  let transcriptions: ReturnType<typeof createDocumentTranscriptions> | undefined
  let transcriptionAdoption: ReturnType<typeof createTranscriptionAdoption> | undefined
  let audioAuthoring: ReturnType<typeof createDocumentAudioAuthoring> | undefined
  let voiceAuthoring: ReturnType<typeof createDocumentVoiceAuthoring> | undefined
  let workspaceRoutesOwner: ReturnType<typeof workspaceRoutes> | undefined
  let routesPlugin: ServedPlugin | undefined
  // The builds and exports, as jobs the workbench and the AI start and follow.
  const jobs = createJobs({
    stateDir,
    url: () => server?.url ?? '',
    compilation: (dir, fresh) => fresh ? compileSessionOf(dir).recompile() : compileSessionOf(dir).ready(),
    revision: compilation => irRevision(compilation.doc),
    origins: preview.origins,
    log,
  })

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
      for (const listener of agentToolListeners) listener(dir)
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

  // Coalesce only in-flight discovery. A later read reassembles actual services and problems;
  // source edits or a repaired plugin cannot be hidden behind a retained capability cache.
  const nodeServiceLoads = new Map<string, NodeServiceLoad>()
  const nodeServicePending = new Set<NodeServiceLoad>()
  let authoringServicesClosed = false
  const authoringServices = (document: string, source: CanonicalSource): Promise<AuthoringServices> => {
    if (authoringServicesClosed) throw new RequestError(503, 'document-services-unavailable')
    const key = JSON.stringify(source), known = nodeServiceLoads.get(document)
    if (known?.key === key) return known.promise
    const selected = docs().find(doc => doc.dir === document)
    if (!selected) throw new RequestError(404, 'authoring-document-missing')
    const controller = new AbortController()
    const promise: Promise<AuthoringServices> = new Compiler(join(root, selected.entry), compilerOptions()).nodeServices({ signal: controller.signal }).then(loaded => {
      if (loaded.source.documentId !== source.documentId || loaded.source.version !== source.version || loaded.source.fingerprint !== source.fingerprint) throw new RequestError(409, 'document-version-changed')
      return { audio: loaded.service(PRODUCTION_AUDIO_AUTHORING), speech: loaded.service(SPEECH), voiceover: loaded.service(VOICEOVER), voiceoverExecution: loaded.service(VOICEOVER_EXECUTION), findings: loaded.findings }
    }).finally(() => { if (nodeServiceLoads.get(document) === load) nodeServiceLoads.delete(document); nodeServicePending.delete(load) })
    const load: NodeServiceLoad = { key, promise, controller }
    nodeServiceLoads.set(document, load)
    nodeServicePending.add(load)
    return promise
  }
  const closeAuthoring = async () => {
    authoringServicesClosed = true
    transcriptionAdoption?.close()
    for (const load of nodeServicePending) load.controller.abort()
    await Promise.all([projectAuthoring?.close(), transcriptions?.close(), audioAuthoring?.close(), voiceAuthoring?.close(), documentHistory?.close(), authoringClients?.close(), workspaceRoutesOwner?.close?.()])
    await Promise.allSettled([...nodeServicePending].map(load => load.promise))
    nodeServiceLoads.clear()
  }

  const spec: SiteSpec = siteSpec(config, docs().map(doc => siteDocument(doc)))
  const refreshSpec = (): DocumentsChange => {
    const retained = new Map(spec.documents.map(doc => [doc.dir, doc]))
    const before = [...retained.keys()]
    const now = docs()
    const listed = now.map(doc => {
      const summary = siteDocument(doc)
      const known = retained.get(doc.dir)
      if (!known) return summary
      // Undoing prose also refreshes the list: retain compiled document modules and translations.
      delete known.lang
      delete known.tags
      return Object.assign(known, summary)
    })
    spec.documents.splice(0, spec.documents.length, ...listed)
    return documentsDiff(before, now.map(doc => doc.dir))
  }

  const documentsChanged = async (change: DocumentsChange): Promise<void> => {
    for (const dir of change.removed) {
      server?.diagnostics.forget(dir)
      compileSessions.get(dir)?.close()
      compileSessions.delete(dir)
      for (const listener of agentToolListeners) listener(dir)
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
      git,
      agentSessionReviews: new AgentSessionReviews({ config, revisions, locks, files: writer, log }),
      taskReviews: createTaskReviewService({ config, locks, files: writer, log }),
    }
  }

  let started!: () => void
  const ready = new Promise<void>(resolve => started = resolve)

  const serverHost: ServerHost = {
    workspaceRoot: root,
    get authoring() { return documentEditor },
    get documentHistory() { return documentHistory?.service },
    get projectAuthoring() { return projectAuthoring?.service },
    get authoringClients() { return authoringClients?.service },
    get audioAuthoring() { return audioAuthoring?.service },
    get voiceAuthoring() { return voiceAuthoring?.service },
    get transcriptions() { return transcriptions },
    get transcriptionAdoption() { return transcriptionAdoption?.service },
    get routes() { return workspaceRoutesOwner?.routes ? { [WORKSPACE_ID]: workspaceRoutesOwner.routes, ...voiceAuthoring ? { 'presmium.lecture': authorizeWorkspaceRoutes(voiceAuthoring.routes, launcherToken) } : {} } : undefined },
    agentTools(document) {
      const compiled = (document === undefined ? [...compileSessions.values()] : [compileSessions.get(document)]).flatMap(session => session?.latest ? [session.latest] : [])
      const tools = new Map(compiled.flatMap(compilation => compilation.plugins.flatMap(loaded => loaded.plugin?.tools ?? [])).map(tool => [tool.name, tool]))
      return { tools: [...tools.values()], service: <T>(token: ServiceToken<T>) => compiled[0]?.service(token) }
    },
    watchAgentTools(listener) { agentToolListeners.add(listener); return () => { agentToolListeners.delete(listener) } },
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
      // As jobs, which the workbench shows: one a renderer, waited for.
      const targets = buildOptions.to ?? (await jobs.targets(document)).filter(target => target.kind === 'render').map(target => target.id)
      const ended = await Promise.all((await Promise.all(targets.map(target => jobs.start(document, target)))).map(job => jobs.wait(job.id)))
      const outputs = ended.filter(job => job.state === 'done').map(job => ({ renderer: job.target, outDir: jobs.directory(job) }))
      const findings: Finding[] = ended.flatMap(job => [
        ...job.state === 'failed' ? [{ checkId: 'presmium.render', severity: 'error' as const, message: `${job.target}: ${job.error ?? job.state}` }] : [],
        ...job.warnings.map(message => ({ checkId: 'presmium.render', severity: 'warning' as const, message })),
      ])
      return { outputs, findings }
    },
    jobs,
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
    forward: async (path) => {
      lookAtDisk()
      if (path.startsWith(OUTPUTS_PATH)) return await jobs.origin()
      if (!site) return undefined
      // Straight to the dev server of the path's document, not through the site's router: one hop less per module.
      try {
        return await site.target(path)
      } catch {
        return site.forward()
      }
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
  voiceAuthoring = createDocumentVoiceAuthoring({ editor, services: authoringServices, revision: document => { const latest = compileSessions.get(document)?.latest; return latest ? irRevision(latest.doc) : undefined } })
  workbench = createWorkbenchBackend({ root, compileSessionOf, serverHost, voices: voiceAuthoring.service, diagnostics: running.diagnostics, url: () => running.url, preview, log, warmSite: dir => site?.warm(dir) ?? Promise.resolve(), viewerPage: (dir, wait) => site?.app(dir, wait) ?? Promise.resolve(undefined) })
  history = openHistory()
  documentEditor = createDocumentEditor({ productionPlan: async (document, source) => { const audio = (await authoringServices(document, source)).audio; if (!audio) throw new RequestError(503, 'caption-production-unavailable'); return audio.readPlan({ source }) }, editor, revisions: history?.revisions, reviewRequired: config.settings['presmium.assistant']?.review === 'required' })
  projectAuthoring = createProjectAuthoring({ config, documentEditor, operations: history?.operations, revisions: history?.revisions, git: history?.git })
  authoringClients = createAuthoringClients(editor)
  documentHistory = createDocumentHistory({ config, editor, locks, revisions: history?.revisions, reviewRequired: config.settings['presmium.assistant']?.review === 'required', changed: (before, after) => documentsChanged(documentsDiff(before, after)), reverted: (target, revision) => history?.agentSessionReviews.reverted(target, revision) })
  transcriptions = createDocumentTranscriptions({ root, editor, services: authoringServices })
  transcriptionAdoption = createTranscriptionAdoption({ documentEditor, transcriptions })
  audioAuthoring = createDocumentAudioAuthoring({ root, editor, revisions: history?.revisions, services: authoringServices, reviewRequired: config.settings['presmium.assistant']?.review === 'required' })
  const routeOptions = {
      config,
      editor,
      documentEditor,
      transcriptions,
      transcriptionAdoptionRoutes: transcriptionAdoption.routes,
      audioAuthoringRoutes: audioAuthoring.routes,
      historyRoutes: documentHistory.routes,
      authoringClientRoutes: authoringClients.routes,
      projectRoutes: projectAuthoring.routes,
      locks,
      ...history ? { revisions: history.revisions, operations: history.operations, reviews: history.agentSessionReviews } : {},
      documentsChanged,
      workbench,
      jobs,
      ...launcherToken ? { launcherToken } : {},
  }
  workspaceRoutesOwner = workspaceRoutes(routeOptions)
  routesPlugin = { id: WORKSPACE_ID, plugin: workspaceRoutesPlugin(routeOptions, workspaceRoutesOwner.routes), config: {} }
  workspaceServices = [
    ...history ? [[REVISIONS, history.revisions] as [ServiceToken<unknown>, unknown]] : [],
    [DOCUMENT_FILES, writer],
    [DOCUMENT_LOCKS, locks],
    [DOCUMENT_VOICE_TASKS, voiceAuthoring.service],
  ]
  try {
    await history?.agentSessionReviews.recover(docs().map(doc => doc.dir))
  } catch (error) {
    history?.agentSessionReviews.close()
    await closeAuthoring()
    await workbench.close()
    await running.close()
    throw error
  }

  started()

  const compileForSite = async (dir: string): Promise<IRDocument> => {
    const compilation = await compileSessionOf(dir).ready()
    refreshDocumentVitePlugins(spec, dir, compilation)
    return workbench!.stampPreviewRevision(compilation, siteDocumentIR(compilation))
  }
  try {
    site = await startWorkspaceSite({ root, spec, bundled: options.bundled, stateDir, compile: compileForSite, stampPreviewRevision: (compilation, doc) => workbench!.stampPreviewRevision(compilation, doc), diagnostics: running.diagnostics, preview, log })
  } catch (error) {
    await closeAuthoring()
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
      await closeAuthoring()
      for (const session of compileSessions.values()) session.close()
      await jobs.close()
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
    target: (path: string): Promise<string> => dev.target?.(path) ?? Promise.resolve(origin),
    update: (dir: string, compilation: Compilation): Promise<void> => {
      refreshDocumentVitePlugins(spec, dir, compilation)
      const revision = irRevision(compilation.doc)
      return dev.update(dir, options.stampPreviewRevision(compilation, siteDocumentIR(compilation))).then(() => {
        if (options.diagnostics.irRevision(dir) === revision) options.diagnostics.clear(dir, 'preview', 'web')
      }, (error: unknown) => {
        const message = `the site did not take ${dir}: ${errorMessage(error)}`
        if (options.diagnostics.irRevision(dir) === revision) options.diagnostics.replace({ document: dir, origin: 'preview', renderer: 'web' }, [{ checkId: 'presmium.preview', severity: 'error', message }], { irRevision: revision })
        log.warn(message)
      })
    },
    warm: (dir: string): Promise<void> => dev.warm?.(dir) ?? Promise.resolve(),
    app: (dir: string, wait: boolean): Promise<string | undefined> => dev.app?.(dir, wait) ?? Promise.resolve(undefined),
    close: (): Promise<void> => dev.close(),
  }
}
