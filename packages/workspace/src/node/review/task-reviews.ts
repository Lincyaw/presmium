import { join } from 'node:path'
import type { ChangeReviewService, DocumentFiles, Logger } from '@lincyaw/kernel'
import type { WorkspaceConfig } from '../config.ts'
import { lockedError } from '../locks.ts'
import type { DocumentLocks } from '../locks.ts'
import { GIT_ENGINE, openGitReview, recoverGitReview } from './git-review.ts'

export interface TaskReviewOptions {
  config: WorkspaceConfig
  locks: DocumentLocks
  files?: DocumentFiles
  log: Logger
}

/** CHANGE_REVIEW for plugins: the review of a task's changes to one document, which holds that document's lock. */
export function createTaskReviewService(options: TaskReviewOptions): ChangeReviewService {
  return {
    engine: GIT_ENGINE,
    open: async ({ document, task }) => {
      const release = options.locks.claim(document, `agent:${task}`)
      if (!release) throw lockedError(document, options.locks.holder(document)!)
      try {
        const review = await openGitReview({
          workspaceRoot: options.config.root,
          scopeDir: join(options.config.root, document),
          task,
          files: options.files,
          onRestore: paths => options.log.warn(`task ${task}: the agent changed the git directory, put back: ${paths.join(', ')}`),
          warn: message => options.log.warn(`task ${task}: ${message}`),
        })
        const finish = <Args extends unknown[], T>(work: (...args: Args) => Promise<T>) => async (...args: Args): Promise<T> => {
          const result = await work(...args)
          release()
          return result
        }
        return { ...review, accept: finish(review.accept), rollback: finish(review.rollback), close: finish(review.close) }
      } catch (error) {
        release()
        throw error
      }
    },
  }
}

/** Rolls back the changes of a task whose process ended while its review of the document was open. */
export async function rollBackLeftTaskReview(options: Pick<TaskReviewOptions, 'config' | 'files' | 'log'>, document: string): Promise<void> {
  const { config, log } = options
  const found = await recoverGitReview({ workspaceRoot: config.root, scopeDir: join(config.root, document), files: options.files, onRestore: paths => log.warn(`the git directory as a change task found it, put back: ${paths.join(', ')}`) })
  if (found) log.warn(`task ${found.task} was waiting for its review when the server ended: rolled back (${found.paths.join(', ') || 'no change'})`)
}
