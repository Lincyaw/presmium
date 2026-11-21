import { isRecord, jsonResponse, pushStream, sseResponse } from '@lincyaw/kernel'
import type { Route, TreeOperation } from '@lincyaw/kernel'
import type { DocumentIndex } from './document-index.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { TreeOperations } from './tree-operations.ts'

const ID_MAX = 200
const QUERY_MAX = 200
const SEARCH_LIMIT = 20
const SEARCH_LIMIT_MAX = 100

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= ID_MAX
const isPlace = (value: unknown): value is string | null => value === null || isId(value)

/** The request body as a tree operation, or undefined when it is not one. */
export function treeOperationOf(body: unknown): TreeOperation | undefined {
  if (!isRecord(body) || typeof body.type !== 'string') return undefined
  const only = (...keys: string[]) => Object.keys(body).every(key => key === 'type' || keys.includes(key))
  const after = body.after === undefined || isPlace(body.after)
  switch (body.type) {
    case 'create': return only('title', 'parent', 'after') && typeof body.title === 'string' && body.title.length <= 1000 && isPlace(body.parent) && after ? { type: 'create', title: body.title, parent: body.parent, ...body.after !== undefined ? { after: body.after as string | null } : {} } : undefined
    case 'move': return only('id', 'parent', 'after') && isId(body.id) && isPlace(body.parent) && after ? { type: 'move', id: body.id, parent: body.parent, ...body.after !== undefined ? { after: body.after as string | null } : {} } : undefined
    case 'rename': return only('id', 'title') && isId(body.id) && typeof body.title === 'string' && body.title.length <= 1000 ? { type: 'rename', id: body.id, title: body.title } : undefined
    case 'duplicate': case 'trash': case 'restore': case 'purge': return only('id') && isId(body.id) ? { type: body.type, id: body.id } : undefined
    case 'embed-to-copy': return only('document', 'block') && isId(body.document) && isId(body.block) ? { type: 'embed-to-copy', document: body.document, block: body.block } : undefined
    default: return undefined
  }
}

/**
 * The document tree's routes (`docs/authoring-actions.md`): the tree with its trash, tree operations, a document's
 * references in both directions, search, a reference's preview card, a synced block's source, and `tree/events`, which
 * sends `{ type: 'tree' }` (event `tree`) whenever the tree or the trash changes.
 */
export function treeRoutes(index: DocumentIndex, operations: TreeOperations | undefined): Record<string, Route> {
  const params = (request: Request) => new URL(request.url).searchParams
  const required = (request: Request, name: string) => {
    const value = params(request).get(name)
    if (!isId(value)) throw new RequestError(400, `${name}-required`)
    return value
  }
  const optional = (request: Request, name: string) => {
    const value = params(request).get(name)
    if (value === null || value === '') return undefined
    if (!isId(value)) throw new RequestError(400, `${name}-invalid`)
    return value
  }
  const get = (handle: (request: Request) => unknown): Route => ({
    role: 'reader',
    handle: request => catchRequestErrors(async () => {
      if (request.method !== 'GET') throw new RequestError(405, 'GET')
      return jsonResponse(await handle(request))
    }),
  })
  return {
    'tree': get(() => index.tree()),
    'tree/operation': {
      role: 'editor',
      maxBody: 8192,
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        if (!operations) throw new RequestError(409, 'tree.unavailable')
        const operation = treeOperationOf(await request.json().catch(() => undefined))
        if (!operation) throw new RequestError(400, 'tree.operation-invalid')
        return jsonResponse(await operations.apply(operation, ctx.member))
      }),
    },
    'document/links': get(request => index.links(required(request, 'id'))),
    'documents/search': get((request) => {
      const query = params(request).get('q') ?? ''
      if (query.length > QUERY_MAX) throw new RequestError(400, 'q-too-long')
      const limit = Number(params(request).get('limit') ?? SEARCH_LIMIT)
      return index.search(query, Number.isInteger(limit) && limit > 0 ? Math.min(limit, SEARCH_LIMIT_MAX) : SEARCH_LIMIT)
    }),
    'document/preview': get(request => index.preview(required(request, 'id'), { ...optional(request, 'section') !== undefined ? { section: optional(request, 'section') } : {}, ...optional(request, 'block') !== undefined ? { block: optional(request, 'block') } : {} })),
    'embed/source': get(request => index.embedSource(required(request, 'document'), required(request, 'block'))),
    'tree/events': {
      role: 'reader',
      handle: async (request) => {
        if (request.method !== 'GET') return jsonResponse({ error: 'GET' }, 405)
        const stream = pushStream<{ event: string, data: { type: 'tree' } }>(push => index.subscribe(() => push({ event: 'tree', data: { type: 'tree' } })), { signal: request.signal })
        return sseResponse(stream, request.signal)
      },
    },
  }
}
