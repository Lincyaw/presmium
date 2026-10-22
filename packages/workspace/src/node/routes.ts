import { createRequire } from 'node:module'
import { hasRole, isRecord, jsonResponse, problemResponse, sseResponse } from '@lincyaw/kernel'
import type { ChangesAnswer, CommitAnswer, DocumentOperation, DocumentsAnswer, Member, PresmiumNodePlugin, RequestContext, RevertResult, RevisionsAnswer, Route, SavedAnswer, ServerContribution } from '@lincyaw/kernel'
import { hasBearerToken } from '@lincyaw/server'
import { REVERT_TRAILER, trailers } from '../domain/commit-message.ts'
import { documentSummaries, listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { documentsDiff } from './document-operations.ts'
import type { DocumentOperations, DocumentsChange } from './document-operations.ts'
import { catchRequestErrors } from './errors.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import { reviewRoutes } from './review/routes.ts'
import type { AgentSessionReviews } from './review/agent-session-reviews.ts'
import { MAX_SOURCE } from './source-editor.ts'
import type { SourceEditor } from './source-editor.ts'
import { listTemplates } from './templates.ts'
import type { WorkbenchApi } from './workbench-api.ts'
import { documentDirOf } from './writer.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

export const WORKSPACE_ID = 'presmium.workspace'

/** The workspace's routes; the history, the document operations and the reviews are there only in a git repository. */
export interface WorkspaceRoutesOptions {
  config: WorkspaceConfig
  editor: SourceEditor
  locks: DocumentLocks
  revisions?: Revisions
  operations?: DocumentOperations
  reviews?: AgentSessionReviews
  documentsChanged(change: DocumentsChange): Promise<void> | void
  workbench?: WorkbenchApi
  launcherToken?: string
}

function toRendererIds(body: unknown): string[] | undefined {
  if (!isRecord(body) || !Array.isArray(body.to)) return undefined
  const ids = body.to.filter((id): id is string => typeof id === 'string' && /^[\w.-]+$/.test(id))
  return ids.length > 0 ? ids : undefined
}

const NO_GIT = 'the workspace is not a git repository: run git init in it to use the document operations and the history'

function toDocumentOperation(body: unknown): DocumentOperation | undefined {
  if (!isRecord(body) || typeof body.dir !== 'string') return undefined
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined)
  const dir = body.dir.trim().replace(/^\/+|\/+$/g, '')
  switch (body.op) {
    case 'create': return { op: 'create', dir, ...text(body.title) ? { title: text(body.title) } : {}, ...text(body.template) ? { template: text(body.template) } : {} }
    case 'rename':
    case 'copy': return typeof body.to === 'string' ? { op: body.op, dir, to: body.to.trim().replace(/^\/+|\/+$/g, '') } : undefined
    case 'delete': return { op: 'delete', dir }
    default: return undefined
  }
}

function toChosenPaths(body: unknown, uncommitted: string[]): string[] {
  const asked = isRecord(body) && Array.isArray(body.paths) ? body.paths.filter((path): path is string => typeof path === 'string') : undefined
  return asked ? uncommitted.filter(path => asked.includes(path)) : uncommitted
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
  const routes: Record<string, Route> = {
    documents: {
      role: 'reader',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method === 'GET') {
          const status = revisions ? await revisions.status(editor.roots(scopeOf(ctx))) : {}
          return jsonResponse({ title: config.title, documents: documentSummaries(config), templates: listTemplates(config), git: Boolean(revisions), ...status, single: config.singleDeck } satisfies DocumentsAnswer)
        }
        if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
        if (!hasRole(ctx.member, 'editor')) return problemResponse(403, 'document operations need the role editor')
        if (!operations) return problemResponse(409, NO_GIT)
        const operation = toDocumentOperation(await request.json().catch(() => undefined))
        if (!operation) return problemResponse(400, '{ op: create | rename | copy | delete, dir, to?, title?, template? }')
        return jsonResponse(await operations.apply(operation, ctx.member))
      }),
    },
    revisions: {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        if (!revisions) return jsonResponse({ revisions: [] } satisfies RevisionsAnswer)
        const params = new URL(request.url).searchParams
        const limit = Number(params.get('limit'))
        const document = params.get('document') ?? (ctx.document || (config.singleDeck ? '.' : undefined))
        return jsonResponse({ revisions: await revisions.history({ ...document ? { document } : {}, ...params.get('task') ? { task: params.get('task')! } : {}, ...Number.isInteger(limit) && limit > 0 ? { limit } : {} }) } satisfies RevisionsAnswer)
      }),
    },
    'revisions/revert': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        if (!revisions) return problemResponse(409, NO_GIT)
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.id !== 'string' || !/^[0-9a-f]{4,64}$/i.test(body.id)) return problemResponse(400, '{ id: <commit> }')
        const claimed = locks.claimAll((await revisions.filesOf(body.id)).map(path => documentDirOf(config, path) ?? ''), 'revision:revert')
        if ('holder' in claimed) throw lockedError(claimed.document, claimed.holder)
        try {
          const before = listed()
          const result = await revisions.revert(body.id, ctx.member)
          if (result.ok) {
            await options.documentsChanged(documentsDiff(before, listed()))
            const undone = trailers(result.revision.message)[REVERT_TRAILER]?.[0] ?? body.id
            void reviews?.reverted(undone, result.revision.id).catch(() => undefined)
          }
          return jsonResponse(result satisfies RevertResult, result.ok ? 200 : 409)
        } finally {
          claimed.release()
        }
      }),
    },
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
        if (!isRecord(body) || typeof body.path !== 'string' || typeof body.content !== 'string' || typeof body.base !== 'string') return problemResponse(400, '{ path, content, base: <the version opened> }')
        return jsonResponse({ version: await editor.save(scope, body.path, body.content, body.base, ctx.member) } satisfies SavedAnswer)
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
        const revision = await history.commit({ files: paths, message, origin: { kind: 'editor', member } })
        return jsonResponse({ ...revision ? { revision } : {}, paths } satisfies CommitAnswer)
      })),
    },
    ...workbench ? workbenchRoutes(workbench) : {},
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
  const { launcherToken } = options
  if (launcherToken) {
    for (const [key, route] of Object.entries(routes)) {
      routes[key] = { ...route, handle: (request, ctx) => (hasBearerToken(request, launcherToken) ? route.handle(request, ctx) : Promise.resolve(problemResponse(401, 'the workspace service\'s routes need its token: Authorization: Bearer <PRESMIUM_SERVICE_TOKEN>'))) }
    }
  }
  return { routes, ...workbench ? { proxies: workbench.proxies } : {} }
}

function workbenchRoutes(workbench: WorkbenchApi): Record<string, Route> {
  return {
    'ir': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        const ir = await workbench.ir(ctx.document)
        const etag = `"${ir.revision}"`
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
        const renderer = new URL(request.url).searchParams.get('view') ?? undefined
        if (renderer !== undefined && renderer !== 'web' && renderer !== 'slides') return problemResponse(400, 'view must be web or slides')
        return jsonResponse(await workbench.preview(ctx.document, renderer))
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

export function workspaceRoutesPlugin(options: WorkspaceRoutesOptions): PresmiumNodePlugin {
  return {
    id: WORKSPACE_ID,
    version,
    kernel: '^1.0.0',
    server: () => workspaceRoutes(options),
  }
}
