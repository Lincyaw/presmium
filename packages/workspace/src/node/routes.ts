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
 *
 * The source editor's routes (P-124, ./source.ts): `files`, `source` (read
 * and save), and `changes` with its `commit` and `discard`, for editors and
 * owners, in the scope of the request's document (on the home page, every
 * document and the configuration). A commit or a discard holds the locks of
 * the documents it changes, as an undo does.
 *
 * In `presmium dev` (./dev.ts) every request is of the one deck
 * (`WorkspaceRoutes.document`), and there are no document operations.
 */
import { createRequire } from 'node:module'
import { errorMessage, isRecord, json, problem } from '@presmium/kernel'
import type { Member, PresmiumNodePlugin, RequestContext, Route, ServerContribution } from '@presmium/kernel'
import type { ChangesAnswer, CommitAnswer, DocumentOperation, DocumentsAnswer, RevertAnswer, RevisionsAnswer, SavedAnswer } from '../domain/api.ts'
import { WORKSPACE_ID } from '../domain/api.ts'
import { lockedError, RequestError } from './documents.ts'
import type { Documents, DocumentsChange } from './documents.ts'
import { documentDirOf } from './files.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import { MAX_SOURCE, SourceFiles } from './source.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

export interface WorkspaceRoutes {
  documents: Documents
  /** Undefined when the workspace is not a git repository: the operations and the history answer 409. */
  revisions?: Revisions
  /** The documents' locks (`DOCUMENT_LOCKS`); an undo takes them. */
  locks?: DocumentLocks
  /** The documents an undo took away or brought back (the server's sessions and the site follow, C-7). */
  documentsChanged?(change: DocumentsChange): Promise<void> | void
  /** `presmium dev`: the directory of its one deck, the document of every request (the server's is ''); no document operations. */
  document?: string
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

/** The paths a commit or a discard of the editor takes: those asked for among the files not committed, else all of them. */
function chosenPaths(body: unknown, uncommitted: string[]): string[] {
  const asked = isRecord(body) && Array.isArray(body.paths) ? body.paths.filter((path): path is string => typeof path === 'string') : undefined
  return asked ? uncommitted.filter(path => asked.includes(path)) : uncommitted
}

/** The server contribution of the workspace, mounted for every document (and for the home page, document ''). */
export function workspaceContribution(options: WorkspaceRoutes): ServerContribution {
  const { documents, revisions, locks } = options
  const listed = () => documents.list().map(doc => doc.dir)
  const source = new SourceFiles({ config: documents.config, writer: documents.writer, ...locks ? { locks } : {} })
  /** The scope of a request: its document's, or that of `presmium dev`'s deck. */
  const scopeOf = (ctx: RequestContext) => source.scope(options.document ?? ctx.document)
  const uncommitted = async (ctx: RequestContext) => (revisions ? await revisions.uncommittedFiles(source.roots(scopeOf(ctx))) : [])
  /** Runs `work` on the uncommitted files `body` names, holding the locks of their documents. */
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
          // The status bar counts the files of the page's scope not committed, as its changes list them.
          const status = revisions ? await revisions.status(source.roots(scopeOf(ctx))) : {}
          return json({ title: documents.config.title, documents: documents.list(), templates: documents.templates(), git: Boolean(revisions), ...status, single: documents.config.single || options.document !== undefined } satisfies DocumentsAnswer)
        }
        if (request.method !== 'POST') return problem(405, 'GET or POST')
        if (options.document !== undefined) return problem(409, 'presmium dev serves one deck: the document operations are the workspace service\'s (presmium serve)')
        // Readers list the documents only.
        if (!ctx.member.roles.some(role => role === 'editor' || role === 'owner')) return problem(403, 'document operations need the role editor')
        if (!revisions) return problem(409, NO_GIT)
        const operation = operationOf(await request.json().catch(() => undefined))
        if (!operation) return problem(400, '{ op: create | rename | copy | delete, dir, to?, title?, template? }')
        return json(await documents.apply(operation, ctx.member))
      }),
    },
    // The history is the editors' (its messages quote annotations, prompts and the agent's explanations; WP-91).
    revisions: {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problem(405, 'GET')
        if (!revisions) return json({ revisions: [] } satisfies RevisionsAnswer)
        const params = new URL(request.url).searchParams
        const limit = Number(params.get('limit'))
        // A document's page lists its own changes; the home page (document '') all of them; a single deck its own
        // (its directory may be one of a larger repository: presmium dev).
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
    'files': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problem(405, 'GET')
        return json(source.files(scopeOf(ctx), ctx.member))
      }),
    },
    'source': {
      role: 'editor',
      // The text as JSON, escaped: up to twice the file's size, and more.
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
    'changes/discard': {
      role: 'editor',
      handle: (request, ctx) => answer(() => onChanges(request, ctx, 'editor:discard', async (paths) => {
        const before = listed()
        await revisions!.discard(paths)
        // A document that was new goes with its files; one brought back by deleted files comes again.
        await options.documentsChanged?.(difference(before, listed()))
        return json({ paths } satisfies CommitAnswer)
      })),
    },
  }
  return { routes }
}

/** The workspace as a plugin of every served document: its routes only (its browser part is the site's own plugin). */
export function workspacePlugin(options: WorkspaceRoutes): PresmiumNodePlugin {
  return {
    id: WORKSPACE_ID,
    version,
    kernel: '^1.0.0',
    server: () => workspaceContribution(options),
  }
}
