import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { DOCUMENT_ENTRY, fnv1a64, hasRole, isRecord, jsonResponse, problemResponse, PRODUCTION_AUDIO_AUTHORING, pushStream, SPEECH, sseResponse } from '@lincyaw/kernel'
import type { ChangesAnswer, CommitAnswer, CompileJob, DocumentsAnswer, JobsAnswer, Member, PresmiumNodePlugin, RequestContext, Route, SavedAnswer, ServerContribution, SourceTransactionAnswer, SourceTransactionChange } from '@lincyaw/kernel'
import { hasBearerToken } from '@lincyaw/server'
import { saveSummary } from '../domain/commit-message.ts'
import { documentSummaries, listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { documentsDiff } from './document-operations.ts'
import type { DocumentOperations, DocumentsChange } from './document-operations.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import { reviewRoutes } from './review/routes.ts'
import type { AgentSessionReviews } from './review/agent-session-reviews.ts'
import { MAX_SOURCE, MAX_SOURCE_CHANGES, validateDocumentSource } from './source-editor.ts'
import type { SourceEditor } from './source-editor.ts'
import { listTemplates } from './templates.ts'
import type { Jobs } from './jobs.ts'
import type { WorkbenchApi } from './workbench-api.ts'
import { documentEditorRoutes } from './document-editor.ts'
import type { DocumentEditor } from './document-editor.ts'
import { createDocumentAudioAuthoring } from './document-audio.ts'
import { documentImageRoutes } from './document-images.ts'
import { createDocumentTranscriptions, documentTranscriptionRoutes } from './document-transcription.ts'
import type { DocumentTranscriptions, ProductionAudioAuthoring, SpeechService } from '@lincyaw/kernel'
import { documentDirOf } from './writer.ts'
import { createDocumentHistory } from './document-history.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

export const WORKSPACE_ID = 'presmium.workspace'

/** Host-level author routes and compiled workspace routes retain the same launcher authorization. */
export function authorizeWorkspaceRoutes(routes: Record<string, Route>, launcherToken?: string): Record<string, Route> {
  if (!launcherToken) return routes
  return Object.fromEntries(Object.entries(routes).map(([key, route]) => [key, { ...route, handle: (request, ctx) => hasBearerToken(request, launcherToken) ? route.handle(request, ctx) : Promise.resolve(problemResponse(401, 'the workspace service\'s routes need its token: Authorization: Bearer <PRESMIUM_SERVICE_TOKEN>')) } satisfies Route]))
}

/** The workspace's routes; the history, the document operations and the reviews are there only in a git repository. */
export interface WorkspaceRoutesOptions {
  config: WorkspaceConfig
  editor: SourceEditor
  documentEditor: DocumentEditor
  locks: DocumentLocks
  revisions?: Revisions
  operations?: DocumentOperations
  reviews?: AgentSessionReviews
  documentsChanged(change: DocumentsChange): Promise<void> | void
  workbench?: WorkbenchApi
  jobs?: Jobs
  launcherToken?: string
  audio?: ProductionAudioAuthoring
  speech?: SpeechService
  /** Supplied by a workspace host so remounting contributions does not replace or cancel tasks. */
  transcriptions?: DocumentTranscriptions
  transcriptionAdoptionRoutes?: Record<string, Route>
  audioAuthoringRoutes?: Record<string, Route>
  historyRoutes?: Record<string, Route>
  authoringClientRoutes?: Record<string, Route>
  projectRoutes?: Record<string, Route>
}

function toRendererIds(body: unknown): string[] | undefined {
  if (!isRecord(body) || !Array.isArray(body.to)) return undefined
  const ids = body.to.filter((id): id is string => typeof id === 'string' && /^[\w.-]+$/.test(id))
  return ids.length > 0 ? ids : undefined
}

const NO_GIT = 'the workspace is not a git repository: run git init in it to use the document operations and the history'


function toChosenPaths(body: unknown, uncommitted: string[]): string[] {
  const asked = isRecord(body) && Array.isArray(body.paths) ? body.paths.filter((path): path is string => typeof path === 'string') : undefined
  return asked ? uncommitted.filter(path => asked.includes(path)) : uncommitted
}

function toSaveMessage(value: unknown): string {
  return typeof value === 'string' ? [...(value.trim().split(/\r?\n/)[0] ?? '').trim()].slice(0, 200).join('') : ''
}


export function workspaceRoutes(options: WorkspaceRoutesOptions): ServerContribution {
  const { config, editor, locks, revisions, operations, reviews, workbench } = options
  const listed = () => listDocuments(config).map(doc => doc.dir)
  const scopeOf = (ctx: RequestContext) => editor.scope(ctx.document)
  const uncommitted = async (ctx: RequestContext) => (revisions ? await revisions.uncommittedFiles(editor.roots(scopeOf(ctx))) : [])
  const withChosenChanges = async (request: Request, ctx: RequestContext, holder: string, work: (revisions: Revisions, paths: string[], member: Member, body: Record<string, unknown>) => Promise<Response>) => {
    if (request.method !== 'POST') return problemResponse(405, 'POST')
    if (!revisions) return problemResponse(409, NO_GIT)
    const body: unknown = await request.json().catch(() => ({}))
    const paths = toChosenPaths(body, (await uncommitted(ctx)).map(file => file.path))
    if (paths.length === 0) return problemResponse(409, 'no changes to take: every file is as committed')
    const claimed = locks.claimAll(paths.map(path => documentDirOf(config, path) ?? ''), holder)
    if ('holder' in claimed) throw lockedError(claimed.document, claimed.holder)
    try {
      return await work(revisions, paths, ctx.member, isRecord(body) ? body : {})
    } finally {
      claimed.release()
    }
  }
  const ownedHistory = options.historyRoutes ? undefined : createDocumentHistory({ config, editor, locks, revisions, changed: (before, after) => options.documentsChanged(documentsDiff(before, after)), reverted: (target, revision) => reviews?.reverted(target, revision) })
  const ownedTranscriptions = options.transcriptions ? undefined : createDocumentTranscriptions({ root: config.root, editor, audio: options.audio, speech: options.speech })
  const transcriptions = options.transcriptions ?? ownedTranscriptions!
  const ownedAudio = options.audioAuthoringRoutes ? undefined : createDocumentAudioAuthoring({ root: config.root, editor, revisions, audio: options.audio, reviewRequired: config.settings['presmium.assistant']?.review === 'required' })
  const routes: Record<string, Route> = {
    ...documentEditorRoutes({ root: config.root, editor, documentEditor: options.documentEditor, workbench }),
    ...(options.audioAuthoringRoutes ?? ownedAudio!.routes),
    ...documentImageRoutes({ root: config.root, editor, revisions }),
    ...documentTranscriptionRoutes(transcriptions),
    ...options.transcriptionAdoptionRoutes,
    documents: {
      role: 'reader',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method === 'GET') {
          const status = revisions ? await revisions.status(editor.roots(scopeOf(ctx))) : {}
          return jsonResponse({ title: config.title, documents: documentSummaries(config), templates: listTemplates(config), git: Boolean(revisions), ...status, single: config.singleDeck } satisfies DocumentsAnswer)
        }
        if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
        return problemResponse(409, 'project-plan-required')
      }),
    },
    ...(options.historyRoutes ?? ownedHistory!.routes),
    ...options.authoringClientRoutes,
    ...options.projectRoutes,
    'files': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        return jsonResponse(editor.files(scopeOf(ctx), ctx.member))
      }),
    },
    'source': {
      role: 'editor',
      maxBody: MAX_SOURCE * 3,
      handle: (request, ctx) => catchRequestErrors(async () => {
        const scope = scopeOf(ctx)
        if (request.method === 'GET') return jsonResponse(editor.read(scope, new URL(request.url).searchParams.get('path') ?? '', ctx.member))
        if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.path !== 'string' || typeof body.content !== 'string' || typeof body.base !== 'string') return problemResponse(400, '{ path, content, base: <the version opened>, message? }')
        const message = toSaveMessage(body.message)
        const commit = revisions && (async (path: string, lang: string | undefined) => (await revisions.ignores(path) ? undefined : revisions.commit({ files: [path], message: message || saveSummary(path, lang), origin: { kind: 'editor', member: ctx.member } })))
        return jsonResponse(await editor.save(scope, body.path, body.content, body.base, ctx.member, commit) satisfies SavedAnswer)
      }),
    },
    'source/create': {
      role: 'editor',
      maxBody: 8192,
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.path !== 'string') return problemResponse(400, '{ path: <new text file> }')
        return jsonResponse(await editor.create(scopeOf(ctx), body.path, ctx.member), 201)
      }),
    },
    'source/transaction': {
      role: 'editor',
      maxBody: MAX_SOURCE * 3 + 8192,
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || !Array.isArray(body.changes) || body.changes.length === 0 || body.changes.length > MAX_SOURCE_CHANGES || !body.changes.every(change => isRecord(change) && typeof change.path === 'string' && typeof change.content === 'string' && (change.base === null || (typeof change.base === 'string' && change.base.length > 0 && change.base.length <= 200)))) return problemResponse(400, '{ changes: [{ path, content, base: <the version opened, or null for a new file> }], message? }')
        const changes = body.changes as SourceTransactionChange[]
        const message = toSaveMessage(body.message)
        const history = revisions ? {
          run: <T>(work: () => Promise<T>) => revisions.transaction(work),
          commit: async (paths: string[], lang: string | undefined) => {
            const ignored = (await Promise.all(paths.map(async path => await revisions.ignores(path) ? path : undefined))).filter((path): path is string => path !== undefined)
            if (ignored.length) throw new RequestError(409, `a source transaction cannot record ignored files: ${ignored.join(', ')}`, { ignored })
            return revisions.commitWhileLocked({ paths, summary: message || saveSummary(paths[0]!, lang), body: '', origin: { kind: 'editor', member: ctx.member } })
          },
        } : undefined
        return jsonResponse(await editor.transaction(scopeOf(ctx), changes, ctx.member, history) satisfies SourceTransactionAnswer)
      }),
    },
    'changes': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        return jsonResponse({ files: await uncommitted(ctx) } satisfies ChangesAnswer)
      }),
    },
    'changes/commit': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(() => withChosenChanges(request, ctx, 'editor:commit', async (history, paths, member, body) => {
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : ''
        if (!message) return problemResponse(400, '{ message: what the change is, paths? }')
        for (const path of paths) {
          if (!path.endsWith(`/${DOCUMENT_ENTRY}`) && path !== DOCUMENT_ENTRY) continue
          const source = editor.read(scopeOf(ctx), path, member)
          validateDocumentSource(path, source.content)
        }
        const revision = await history.commit({ files: paths, message, origin: { kind: 'editor', member } })
        return jsonResponse({ ...revision ? { revision } : {}, paths } satisfies CommitAnswer)
      })),
    },
    ...workbench ? workbenchRoutes(workbench) : {},
    ...options.jobs ? jobRoutes(options.jobs, editor) : {},
    ...reviews ? reviewRoutes(reviews) : {},
    'changes/discard': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(() => withChosenChanges(request, ctx, 'editor:discard', async (history, paths) => {
        const before = listed()
        await history.discard(paths)
        await options.documentsChanged(documentsDiff(before, listed()))
        return jsonResponse({ paths } satisfies CommitAnswer)
      })),
    },
  }
  return { routes: authorizeWorkspaceRoutes(routes, options.launcherToken), close: async () => { await Promise.all([ownedTranscriptions?.close(), ownedAudio?.close(), ownedHistory?.close()]) } }
}

function workbenchRoutes(workbench: WorkbenchApi): Record<string, Route> {
  return {
    'voice-capabilities': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        return jsonResponse(await workbench.voiceCapabilities(ctx.document, ctx.member, request.signal))
      }),
    },
    'voice-catalog': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        const params = new URL(request.url).searchParams
        return jsonResponse(await workbench.voiceCatalog(ctx.document, ctx.member, params.get('engine') || undefined, params.get('lang') || undefined, request.signal))
      }),
    },
    'ir': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        const ir = await workbench.ir(ctx.document)
        const capabilities = createHash('sha256').update(JSON.stringify([ir.sourceCapabilities ?? {}, ir.sourceFingerprints ?? {}, ir.authoring ?? {}])).digest('hex').slice(0, 8)
        const etag = `"${ir.revision}-${capabilities}"`
        if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-store' } })
        const response = jsonResponse(ir)
        response.headers.set('ETag', etag)
        response.headers.set('Cache-Control', 'no-store')
        return response
      }),
    },
    'ir/events': {
      role: 'editor',
      handle: async (request, ctx) => (request.method === 'GET' ? sseResponse(workbench.events(ctx.document, request.signal), request.signal) : problemResponse(405, 'GET')),
    },
    'preview': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        const params = new URL(request.url).searchParams
        const renderer = params.get('view') ?? undefined
        if (renderer !== undefined && renderer !== 'web' && renderer !== 'slides') return problemResponse(400, 'view must be web or slides')
        return jsonResponse(await workbench.preview(ctx.document, renderer, params.get('prefetch') === '1'))
      }),
    },
    'build': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        return jsonResponse(await workbench.build(ctx.document, toRendererIds(await request.json().catch(() => undefined))))
      }),
    },
    'check': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => (request.method === 'POST' ? jsonResponse(await workbench.check(ctx.document)) : problemResponse(405, 'POST'))),
    },
  }
}

/**
 * The document's builds and exports (`jobs`): `GET` what it can be made into and its jobs, `POST { target }` starts one;
 * `jobs/cancel` (`POST { id }`); `jobs/events`, each change of the document's jobs as it happens (SSE, event `job`).
 */
function jobRoutes(jobs: Jobs, editor: SourceEditor): Record<string, Route> {
  const own = (document: string, id: unknown) => {
    const job = typeof id === 'string' ? jobs.get(id) : undefined
    return job?.document === document ? job : undefined
  }
  return {
    'jobs': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method === 'GET') return jsonResponse({ targets: await jobs.targets(ctx.document), jobs: jobs.list(ctx.document) } satisfies JobsAnswer)
        if (request.method !== 'POST') return problemResponse(405, 'GET, POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.target !== 'string') return problemResponse(400, '{ target: a renderer or an export of the document }')
        if (!isRecord(body.source) || typeof body.source.version !== 'string' || !body.source.version || body.source.version.length > 128 || typeof body.source.fingerprint !== 'string' || !body.source.fingerprint || body.source.fingerprint.length > 128) return problemResponse(400, 'job-source-required')
        const source = editor.read(editor.scope(ctx.document), ctx.document ? `${ctx.document}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY, ctx.member)
        if (source.version !== body.source.version || fnv1a64(source.content) !== body.source.fingerprint) throw new RequestError(409, 'job-source-changed')
        return jsonResponse(await jobs.start(ctx.document, body.target, { version: body.source.version, fingerprint: body.source.fingerprint }))
      }),
    },
    'jobs/cancel': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        const body: unknown = await request.json().catch(() => undefined)
        const job = own(ctx.document, isRecord(body) ? body.id : undefined)
        return job ? jsonResponse(jobs.cancel(job.id)) : problemResponse(404, 'no such job of the document')
      }),
    },
    'jobs/events': {
      role: 'editor',
      handle: async (request, ctx) => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        const events = pushStream<{ event: string, data: CompileJob }>(push => jobs.subscribe((job) => {
          if (job.document === ctx.document) push({ event: 'job', data: job })
        }), { signal: request.signal })
        return sseResponse(events, request.signal)
      },
    },
  }
}

export function workspaceRoutesPlugin(options: WorkspaceRoutesOptions, borrowedRoutes?: Record<string, Route>): PresmiumNodePlugin {
  return {
    id: WORKSPACE_ID,
    version,
    kernel: '^1.0.0',
    server: ctx => borrowedRoutes ? { routes: borrowedRoutes } : workspaceRoutes({ ...options, audio: ctx.service(PRODUCTION_AUDIO_AUTHORING), speech: ctx.service(SPEECH) }),
  }
}
