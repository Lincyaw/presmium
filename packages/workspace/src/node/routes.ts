import { timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import { errorMessage, isRecord, jsonResponse, problemResponse, sseResponse } from '@lincyaw/kernel'
import type { ChangesAnswer, CommitAnswer, DocumentOperation, DocumentsAnswer, Member, PresmiumNodePlugin, RequestContext, RevertResult, RevisionsAnswer, Route, SavedAnswer, ServerContribution } from '@lincyaw/kernel'
import { bearer } from '@lincyaw/server'
import { WORKSPACE_ID } from '../domain/api.ts'
import { trailers } from '../domain/revisions.ts'
import { lockedError, RequestError } from './documents.ts'
import type { Documents, DocumentsChange } from './documents.ts'
import { documentDirOf } from './files.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import { reviewRoutes } from './review/routes.ts'
import type { Reviews } from './review/reviews.ts'
import type { WorkspaceService } from './service.ts'
import { MAX_SOURCE, SourceFiles } from './source.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

export interface WorkspaceRoutes {
  documents: Documents
  revisions?: Revisions
  locks?: DocumentLocks
  documentsChanged?(change: DocumentsChange): Promise<void> | void
  document?: string
  service?: WorkspaceService
  token?: string
  reviews?: Reviews
}

function authorized(request: Request, token: string): boolean {
  const given = Buffer.from(bearer(request.headers.get('authorization')) ?? '')
  const own = Buffer.from(token)
  return given.length === own.length && timingSafeEqual(given, own)
}

function rendererIds(body: unknown): string[] | undefined {
  if (!isRecord(body) || !Array.isArray(body.to)) return undefined
  const ids = body.to.filter((id): id is string => typeof id === 'string' && /^[\w.-]+$/.test(id))
  return ids.length > 0 ? ids : undefined
}

const NO_GIT = 'the workspace is not a git repository: run git init in it to use the document operations and the history'

function operationOf(body: unknown): DocumentOperation | undefined {
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

async function answer(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse({ error: error.message, ...error.detail }, error.status)
    return problemResponse(500, errorMessage(error))
  }
}

function difference(before: string[], after: string[]): DocumentsChange {
  return { removed: before.filter(dir => !after.includes(dir)), added: after.filter(dir => !before.includes(dir)) }
}

function chosenPaths(body: unknown, uncommitted: string[]): string[] {
  const asked = isRecord(body) && Array.isArray(body.paths) ? body.paths.filter((path): path is string => typeof path === 'string') : undefined
  return asked ? uncommitted.filter(path => asked.includes(path)) : uncommitted
}

export function workspaceContribution(options: WorkspaceRoutes): ServerContribution {
  const { documents, revisions, locks } = options
  const listed = () => documents.list().map(doc => doc.dir)
  const source = new SourceFiles({ config: documents.config, writer: documents.writer, ...locks ? { locks } : {} })
  const scopeOf = (ctx: RequestContext) => source.scope(options.document ?? ctx.document)
  const uncommitted = async (ctx: RequestContext) => (revisions ? await revisions.uncommittedFiles(source.roots(scopeOf(ctx))) : [])
  const onChanges = async (request: Request, ctx: RequestContext, holder: string, work: (paths: string[], member: Member, body: Record<string, unknown>) => Promise<Response>) => {
    if (request.method !== 'POST') return problemResponse(405, 'POST')
    if (!revisions) return problemResponse(409, NO_GIT)
    const body: unknown = await request.json().catch(() => ({}))
    const paths = chosenPaths(body, (await uncommitted(ctx)).map(file => file.path))
    if (paths.length === 0) return problemResponse(409, 'no changes to take: every file is as committed')
    const claimed = locks?.claimAll(paths.map(path => documentDirOf(documents.config, path) ?? ''), holder)
    if (claimed && 'holder' in claimed) throw lockedError(claimed.document, claimed.holder)
    try {
      return await work(paths, ctx.member, isRecord(body) ? body : {})
    } finally {
      claimed?.release()
    }
  }
  const routes: Record<string, Route> = {
    documents: {
      role: 'reader',
      handle: (request, ctx) => answer(async () => {
        if (request.method === 'GET') {
          const status = revisions ? await revisions.status(source.roots(scopeOf(ctx))) : {}
          return jsonResponse({ title: documents.config.title, documents: documents.list(), templates: documents.templates(), git: Boolean(revisions), ...status, single: documents.config.single || options.document !== undefined } satisfies DocumentsAnswer)
        }
        if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
        if (options.document !== undefined) return problemResponse(409, 'presmium dev serves one deck: the document operations are the workspace service\'s (presmium serve)')
        if (!ctx.member.roles.some(role => role === 'editor' || role === 'owner')) return problemResponse(403, 'document operations need the role editor')
        if (!revisions) return problemResponse(409, NO_GIT)
        const operation = operationOf(await request.json().catch(() => undefined))
        if (!operation) return problemResponse(400, '{ op: create | rename | copy | delete, dir, to?, title?, template? }')
        return jsonResponse(await documents.apply(operation, ctx.member))
      }),
    },
    revisions: {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        if (!revisions) return jsonResponse({ revisions: [] } satisfies RevisionsAnswer)
        const params = new URL(request.url).searchParams
        const limit = Number(params.get('limit'))
        const document = params.get('document') ?? ((options.document ?? ctx.document) || (documents.config.single ? '.' : undefined))
        return jsonResponse({ revisions: await revisions.history({ ...document ? { document } : {}, ...params.get('task') ? { task: params.get('task')! } : {}, ...Number.isInteger(limit) && limit > 0 ? { limit } : {} }) } satisfies RevisionsAnswer)
      }),
    },
    'revisions/revert': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        if (!revisions) return problemResponse(409, NO_GIT)
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.id !== 'string' || !/^[0-9a-f]{4,64}$/i.test(body.id)) return problemResponse(400, '{ id: <commit> }')
        const claimed = locks?.claimAll((await revisions.filesOf(body.id)).map(path => documentDirOf(documents.config, path) ?? ''), 'revision:revert')
        if (claimed && 'holder' in claimed) throw lockedError(claimed.document, claimed.holder)
        try {
          const before = listed()
          const result = await revisions.revert(body.id, ctx.member)
          if (result.ok) {
            await options.documentsChanged?.(difference(before, listed()))
            const undone = trailers(result.revision.message)['Presmium-Revert']?.[0] ?? body.id
            void options.reviews?.reverted(undone, result.revision.id).catch(() => undefined)
          }
          return jsonResponse(result satisfies RevertResult, result.ok ? 200 : 409)
        } finally {
          claimed?.release()
        }
      }),
    },
    'files': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        return jsonResponse(source.files(scopeOf(ctx), ctx.member))
      }),
    },
    'source': {
      role: 'editor',
      maxBody: MAX_SOURCE * 3,
      handle: (request, ctx) => answer(async () => {
        const scope = scopeOf(ctx)
        if (request.method === 'GET') return jsonResponse(source.read(scope, new URL(request.url).searchParams.get('path') ?? '', ctx.member))
        if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.path !== 'string' || typeof body.content !== 'string' || typeof body.base !== 'string') return problemResponse(400, '{ path, content, base: <the version opened> }')
        return jsonResponse({ version: await source.save(scope, body.path, body.content, body.base, ctx.member) } satisfies SavedAnswer)
      }),
    },
    'source/create': {
      role: 'editor',
      maxBody: 8192,
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.path !== 'string') return problemResponse(400, '{ path: <new text file> }')
        return jsonResponse(await source.create(scopeOf(ctx), body.path, ctx.member), 201)
      }),
    },
    'changes': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        return jsonResponse({ files: await uncommitted(ctx) } satisfies ChangesAnswer)
      }),
    },
    'changes/commit': {
      role: 'editor',
      handle: (request, ctx) => answer(() => onChanges(request, ctx, 'editor:commit', async (paths, member, body) => {
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : ''
        if (!message) return problemResponse(400, '{ message: what the change is, paths? }')
        const revision = await revisions!.commit({ files: paths, message, origin: { kind: 'editor', member } })
        return jsonResponse({ ...revision ? { revision } : {}, paths } satisfies CommitAnswer)
      })),
    },
    ...options.service ? serviceRoutes(options.service) : {},
    ...options.reviews ? reviewRoutes(options.reviews, answer) : {},
    'changes/discard': {
      role: 'editor',
      handle: (request, ctx) => answer(() => onChanges(request, ctx, 'editor:discard', async (paths) => {
        const before = listed()
        await revisions!.discard(paths)
        await options.documentsChanged?.(difference(before, listed()))
        return jsonResponse({ paths } satisfies CommitAnswer)
      })),
    },
  }
  const { token } = options
  if (token) {
    for (const [key, route] of Object.entries(routes)) {
      routes[key] = { ...route, handle: (request, ctx) => (authorized(request, token) ? route.handle(request, ctx) : Promise.resolve(problemResponse(401, 'the workspace service\'s routes need its token: Authorization: Bearer <PRESMIUM_SERVICE_TOKEN>'))) }
    }
  }
  return { routes, ...options.service ? { proxies: options.service.proxies } : {} }
}

function serviceRoutes(service: WorkspaceService): Record<string, Route> {
  return {
    'ir': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        const ir = await service.ir(ctx.document)
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
      handle: async (request, ctx) => (request.method === 'GET' ? sseResponse(service.events(ctx.document, request.signal), request.signal) : problemResponse(405, 'GET')),
    },
    'preview': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problemResponse(405, 'GET')
        const view = new URL(request.url).searchParams.get('view') ?? undefined
        if (view !== undefined && view !== 'web' && view !== 'slides') return problemResponse(400, 'view must be web or slides')
        return jsonResponse(await service.preview(ctx.document, view))
      }),
    },
    'build': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'POST') return problemResponse(405, 'POST')
        return jsonResponse(await service.build(ctx.document, rendererIds(await request.json().catch(() => undefined))))
      }),
    },
    'check': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => (request.method === 'POST' ? jsonResponse(await service.check(ctx.document)) : problemResponse(405, 'POST'))),
    },
  }
}

export function workspacePlugin(options: WorkspaceRoutes): PresmiumNodePlugin {
  return {
    id: WORKSPACE_ID,
    version,
    kernel: '^1.0.0',
    server: () => workspaceContribution(options),
  }
}
