/**
 * git for the workspace (docs/architecture.md 4.8, section 11): every
 * command runs with the repository's hooks and fsmonitor off
 * (`-c core.hooksPath=/dev/null -c core.fsmonitor=false`), so no script of
 * the repository runs when the workspace commits or reverts; commits are
 * not signed. One operation at a time per workspace: the index is shared.
 */
import { execFileSync } from 'node:child_process'
import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'

/** The configuration every command of the workspace runs with. */
export const SAFE_CONFIG = ['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'commit.gpgSign=false', 'tag.gpgSign=false']

export class Git {
  readonly root: string
  readonly #git: SimpleGit
  #queue: Promise<unknown> = Promise.resolve()

  constructor(root: string) {
    this.root = root
    this.#git = simpleGit({
      baseDir: root,
      config: SAFE_CONFIG,
      // The two settings that turn the repository's own scripts off: allowed because they are ours, constant.
      unsafe: { allowUnsafeHooksPath: true, allowUnsafeFsMonitor: true },
    })
  }

  /** Whether the root is a git work tree (the editing features need one). */
  static isRepository(root: string): boolean {
    try {
      return execFileSync('git', [...SAFE_CONFIG.flatMap(entry => ['-c', entry]), 'rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true'
    } catch {
      return false
    }
  }

  /** `git <args>`; throws with git's message on a non-zero exit. */
  raw(args: string[]): Promise<string> {
    return this.#git.raw(args)
  }

  /** `git <args>`, resolving with the exit status rather than throwing. */
  async attempt(args: string[]): Promise<{ ok: boolean, output: string }> {
    try {
      return { ok: true, output: await this.#git.raw(args) }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Runs `work` after the operations queued before it, so two never share the index. */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work)
    this.#queue = next.catch(() => undefined)
    return next
  }
}
