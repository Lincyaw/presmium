import { timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import { eventStream, errorMessage, isRecord, json, problem } from '@presmium/kernel'
import type { Member, PresmiumNodePlugin, RequestContext, Route, ServerContribution } from '@presmium/kernel'
import { bearer } from '@presmium/server'
import type { ChangesAnswer, CommitAnswer, DocumentOperation, DocumentsAnswer, RevertAnswer, RevisionsAnswer, SavedAnswer } from '../domain/api.ts'
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
    if (error instanceof RequestError) return json({ error: error.message, ...error.detail }, error.status)
    return problem(500, errorMessage(error))
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
    if (request.method !== 'POST') return problem(405, 'POST')
    if (!revisions) return problem(409, NO_GIT)
    const body: unknown = await request.json().catch(() => ({}))
    const paths = chosenPaths(body, (await uncommitted(ctx)).map(file => file.path))
    if (paths.length === 0) return problem(409, 'no changes to take: every file is as committed')
    const claimed = locks?.claimAll(paths.flatMap(path => documentDirOf(documents.config, path) ?? []), holder)
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
          return json({ title: documents.config.title, documents: documents.list(), templates: documents.templates(), git: Boolean(revisions), ...status, single: documents.config.single || options.document !== undefined } satisfies DocumentsAnswer)
        }
        if (request.method !== 'POST') return problem(405, 'GET or POST')
        if (options.document !== undefined) return problem(409, 'presmium dev serves one deck: the document operations are the workspace service\'s (presmium serve)')
        if (!ctx.member.roles.some(role => role === 'editor' || role === 'owner')) return problem(403, 'document operations need the role editor')
        if (!revisions) return problem(409, NO_GIT)
        const operation = operationOf(await request.json().catch(() => undefined))
        if (!operation) return problem(400, '{ op: create | rename | copy | delete, dir, to?, title?, template? }')
        return json(await documents.apply(operation, ctx.member))
      }),
    },
    revisions: {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problem(405, 'GET')
        if (!revisions) return json({ revisions: [] } satisfies RevisionsAnswer)
        const params = new URL(request.url).searchParams
        const limit = Number(params.get('limit'))
        const document = params.get('document') ?? ((options.document ?? ctx.document) || (documents.config.single ? '.' : undefined))
        return json({ revisions: await revisions.history({ ...document ? { document } : {}, ...params.get('task') ? { task: params.get('task')! } : {}, ...Number.isInteger(limit) && limit > 0 ? { limit } : {} }) } satisfies RevisionsAnswer)
      }),
    },
    'revisions/revert': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'POST') return problem(405, 'POST')
        if (!revisions) return problem(409, NO_GIT)
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.id !== 'string' || !/^[0-9a-f]{4,64}$/i.test(body.id)) return problem(400, '{ id: <commit> }')
        const claimed = locks?.claimAll(await revisions.documentsOf(body.id), 'revision:revert')
        if (claimed && 'holder' in claimed) throw lockedError(claimed.document, claimed.holder)
        try {
          const before = listed()
          const result = await revisions.revert(body.id, ctx.member)
          if (result.ok) {
            await options.documentsChanged?.(difference(before, listed()))
            const undone = trailers(result.revision.message)['Presmium-Revert']?.[0] ?? body.id
            void options.reviews?.reverted(undone, result.revision.id).catch(() => undefined)
          }
          return json(result satisfies RevertAnswer, result.ok ? 200 : 409)
        } finally {
          claimed?.release()
        }
      }),
    },
    'files': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problem(405, 'GET')
        return json(source.files(scopeOf(ctx), ctx.member))
      }),
    },
    'source': {
      role: 'editor',
      maxBody: MAX_SOURCE * 3,
      handle: (request, ctx) => answer(async () => {
        const scope = scopeOf(ctx)
        if (request.method === 'GET') return json(source.read(scope, new URL(request.url).searchParams.get('path') ?? '', ctx.member))
        if (request.method !== 'POST') return problem(405, 'GET or POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.path !== 'string' || typeof body.content !== 'string' || typeof body.base !== 'string') return problem(400, '{ path, content, base: <the version opened> }')
        return json({ version: await source.save(scope, body.path, body.content, body.base, ctx.member) } satisfies SavedAnswer)
      }),
    },
    'changes': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problem(405, 'GET')
        return json({ files: await uncommitted(ctx) } satisfies ChangesAnswer)
      }),
    },
    'changes/commit': {
      role: 'editor',
      handle: (request, ctx) => answer(() => onChanges(request, ctx, 'editor:commit', async (paths, member, body) => {
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : ''
        if (!message) return problem(400, '{ message: what the change is, paths? }')
        const revision = await revisions!.commit({ files: paths, message, origin: { kind: 'editor', member } })
        return json({ ...revision ? { revision } : {}, paths } satisfies CommitAnswer)
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
        return json({ paths } satisfies CommitAnswer)
      })),
    },
  }
  const { token } = options
  if (token) {
    for (const [key, route] of Object.entries(routes)) {
      routes[key] = { ...route, handle: (request, ctx) => (authorized(request, token) ? route.handle(request, ctx) : Promise.resolve(problem(401, 'the workspace service\'s routes need its token: Authorization: Bearer <PRESMIUM_SERVICE_TOKEN>'))) }
    }
  }
  return { routes, ...options.service ? { proxies: options.service.proxies } : {} }
}

function serviceRoutes(service: WorkspaceService): Record<string, Route> {
  return {
    'ir': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => (request.method === 'GET' ? json(await service.ir(ctx.document)) : problem(405, 'GET'))),
    },
    'ir/events': {
      role: 'editor',
      handle: async (request, ctx) => (request.method === 'GET' ? eventStream(service.events(ctx.document, request.signal), request.signal) : problem(405, 'GET')),
    },
    'preview': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => (request.method === 'GET' ? json(await service.preview(ctx.document)) : problem(405, 'GET'))),
    },
    'build': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'POST') return problem(405, 'POST')
        return json(await service.build(ctx.document, rendererIds(await request.json().catch(() => undefined))))
      }),
    },
    'check': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => (request.method === 'POST' ? json(await service.check(ctx.document)) : problem(405, 'POST'))),
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
