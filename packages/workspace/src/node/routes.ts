/**
 * The workspace's routes under `/__presmium/presmium.workspace/` (docs/architecture.md
 * 10.2): the documents and their operations, and the revision history and
 * its reverts. The server checks the roles (`Route.role`): readers list the
 * documents; editors and owners change them and read the history.
 *
 * An undo holds the locks of the documents its commit changed (`DOCUMENT_LOCKS`,
 * F-09): while an agent's change task holds one, it is refused with 409, whose
 * answer names the lock (`LockedAnswer`), as a document operation's does. Once
 * done, the documents it took away or brought back are told to the server and
 * the site, as a document operation's are (C-7, F-10).
 */
import { errorMessage, isRecord, json, problem } from '@presmium/kernel'
import type { PresmiumNodePlugin, Route, ServerContribution } from '@presmium/kernel'
import type { DocumentOperation, DocumentsAnswer, RevertAnswer, RevisionsAnswer } from '../domain/api.ts'
import { WORKSPACE_ID } from '../domain/api.ts'
import { lockedError, RequestError } from './documents.ts'
import type { Documents, DocumentsChange } from './documents.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'

export interface WorkspaceRoutes {
  documents: Documents
  /** Undefined when the workspace is not a git repository: the operations and the history answer 409. */
  revisions?: Revisions
  /** The documents' locks (`DOCUMENT_LOCKS`); an undo takes them. */
  locks?: DocumentLocks
  /** The documents an undo took away or brought back (the server's sessions and the site follow, C-7). */
  documentsChanged?(change: DocumentsChange): Promise<void> | void
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

/** The documents that went and came between two listings. */
function difference(before: string[], after: string[]): DocumentsChange {
  return { removed: before.filter(dir => !after.includes(dir)), added: after.filter(dir => !before.includes(dir)) }
}

/** The server contribution of the workspace, mounted for every document (and for the home page, document ''). */
export function workspaceContribution(options: WorkspaceRoutes): ServerContribution {
  const { documents, revisions, locks } = options
  const listed = () => documents.list().map(doc => doc.dir)
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
        // Not while an agent's change task of a document the commit changed runs or waits for its review (F-09).
        const claimed = locks?.claimAll(await revisions.documentsOf(body.id), 'revision:revert')
        if (claimed && 'holder' in claimed) throw lockedError(claimed.document, claimed.holder)
        try {
          const before = listed()
          const result = await revisions.revert(body.id, ctx.member)
          if (result.ok) await options.documentsChanged?.(difference(before, listed()))
          return json(result satisfies RevertAnswer, result.ok ? 200 : 409)
        } finally {
          claimed?.release()
        }
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
