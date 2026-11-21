import { WORKSPACE_CONFIG } from '@lincyaw/compiler'
import { applyMigration, planMigration } from '@lincyaw/compiler/migrate'
import type { MigrationPlan } from '@lincyaw/compiler/migrate'
import { DOCUMENT_ENTRY, hasRole, jsonResponse } from '@lincyaw/kernel'
import type { Route, WorkspaceMigrationAnswer } from '@lincyaw/kernel'
import type { WorkspaceConfig } from './config.ts'
import type { DocumentsChange } from './document-operations.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'

const dirOf = (path: string) => path.split('/').slice(0, -1).join('/')
/** The document folder a migrated file belongs to: a translation belongs to its original. */
const ownerOf = (path: string) => dirOf(path).replace(/(^|\/)locales\/[^/]+$/, '').replace(/\/\.presmium\/freeze$|^\.presmium\/freeze$/, '')

/**
 * `POST workspace/migrate`, Studio's Upgrade: the migration of `presmium migrate`, recorded as one revision per
 * document (its rename, translations and content) and one for the workspace file.
 */
export function workspaceMigrateRoute(options: { config: WorkspaceConfig, locks: DocumentLocks, revisions?: Revisions, changed(change: DocumentsChange): Promise<void> | void }): Route {
  const { config, locks, revisions } = options
  return {
    role: 'owner', maxBody: 1024,
    handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method !== 'POST') throw new RequestError(405, 'POST')
      if (!hasRole(ctx.member, 'owner') || ctx.document !== '') throw new RequestError(403, 'workspace-migrate-forbidden')
      const release = await locks.acquire('', 'workspace:migrate')
      try {
        const run = async (): Promise<WorkspaceMigrationAnswer> => {
          const plan: MigrationPlan = planMigration(config.root)
          const groups = new Map<string, string[]>()
          const add = (path: string) => {
            const owner = path === WORKSPACE_CONFIG ? WORKSPACE_CONFIG : ownerOf(path)
            groups.set(owner, [...groups.get(owner) ?? [], path])
          }
          for (const { from, to } of plan.renames) { add(from); add(to) }
          for (const { path } of plan.writes) add(path)
          if (revisions) await revisions.checkpoint([...groups.values()].flat())
          applyMigration(plan)
          const revisionIds: string[] = []
          if (revisions) for (const [owner, paths] of groups) {
            const summary = owner === WORKSPACE_CONFIG ? `Upgrade ${WORKSPACE_CONFIG}` : `Upgrade ${owner ? `${owner}/` : ''}${DOCUMENT_ENTRY}`
            const revision = await revisions.commitWhileLocked({ paths, summary, body: 'Convert to the current document format (presmium migrate).', origin: { kind: 'document', member: ctx.member } })
            if (revision) revisionIds.push(revision.id)
          }
          return { documents: plan.documents.map(dirOf), workspaceFile: plan.workspaceFile, problems: plan.problems, revisions: revisionIds }
        }
        const answer = revisions ? await revisions.transaction(run) : await run()
        if (answer.documents.length) await options.changed({ removed: [], added: answer.documents })
        return jsonResponse(answer)
      } finally { release() }
    }),
  }
}
