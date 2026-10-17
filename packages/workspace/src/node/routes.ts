/**
 * The workspace's routes under `/__presmium/presmium.workspace/` (docs/architecture.md
 * 10.2): the documents and their operations, the revision history and its
 * reverts, and the state of a document's compile-time execution with its
 * "request execution". The server checks the roles (`Route.role`): readers
 * list the documents; editors and owners change them and read the history.
 */
import { errorMessage, isRecord } from '@presmium/kernel'
import type { Member, PresmiumNodePlugin, Route, ServerContribution } from '@presmium/kernel'
import type { DocumentOperation, DocumentsAnswer, ExecutionState, RevertAnswer, RevisionsAnswer } from '../domain/api.ts'
import { WORKSPACE_ID } from '../domain/api.ts'
import { RequestError } from './documents.ts'
import type { Documents } from './documents.ts'
import type { Revisions } from './revisions.ts'

export interface WorkspaceRoutes {
  documents: Documents
  /** Undefined when the workspace is not a git repository: the operations and the history answer 409. */
  revisions?: Revisions
  /** The execution state of a document; undefined in a host without compile-time execution. */
  execution?(document: string): ExecutionState | undefined
  /** An editor asks again to run the code of a document that did not run. */
  requestExecution?(document: string, member: Member): Promise<void> | void
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function problem(status: number, message: string): Response {
  return json({ error: message }, status)
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
    if (error instanceof RequestError) return problem(error.status, error.message)
    return problem(500, errorMessage(error))
  }
}

/** The server contribution of the workspace, mounted for every document (and for the home page, document ''). */
export function workspaceContribution(options: WorkspaceRoutes): ServerContribution {
  const { documents, revisions } = options
  const routes: Record<string, Route> = {
    documents: {
      role: 'reader',
      handle: (request, ctx) => answer(async () => {
        if (request.method === 'GET') {
          return json({ documents: documents.list(), templates: documents.templates(), git: Boolean(revisions), single: documents.config.single } satisfies DocumentsAnswer)
        }
        if (request.method !== 'POST') return problem(405, 'GET or POST')
        // Readers list the documents only.
        if (!ctx.member.roles.some(role => role === 'editor' || role === 'owner')) return problem(403, 'document operations need the role editor')
        if (!revisions) return problem(409, NO_GIT)
        const operation = operationOf(await request.json().catch(() => undefined))
        if (!operation) return problem(400, '{ op: create | rename | copy | delete, dir, to?, title?, template? }')
        return json(await documents.apply(operation, ctx.member))
      }),
    },
    // The history is the editors' (its messages quote annotations, prompts and the agent's explanations, which a
    // reader, who sees the student view only, may not read; WP-91).
    revisions: {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problem(405, 'GET')
        if (!revisions) return json({ revisions: [] } satisfies RevisionsAnswer)
        const params = new URL(request.url).searchParams
        const limit = Number(params.get('limit'))
        // A document's page lists its own changes; the home page (document '') all of them.
        const document = params.get('document') ?? (ctx.document || undefined)
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
        const result = await revisions.revert(body.id, ctx.member)
        return json(result satisfies RevertAnswer, result.ok ? 200 : 409)
      }),
    },
    'execution': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method === 'GET') return json(options.execution?.(ctx.document) ?? { mode: 'local', notRun: [], pending: false })
        if (request.method !== 'POST') return problem(405, 'GET or POST')
        if (!options.requestExecution) return problem(404, 'this host has no compile-time execution to ask for')
        await options.requestExecution(ctx.document, ctx.member)
        return json(options.execution?.(ctx.document) ?? { mode: 'local', notRun: [], pending: false })
      }),
    },
  }
  return { routes }
}

/** The workspace as a plugin of every served document: its routes only (its browser part is the site's own plugin). */
export function workspacePlugin(options: WorkspaceRoutes): PresmiumNodePlugin {
  return {
    id: WORKSPACE_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    server: () => workspaceContribution(options),
  }
}
