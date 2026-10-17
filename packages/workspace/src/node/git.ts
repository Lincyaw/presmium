/**
 * git for the workspace (docs/architecture.md 4.8, 10.7, section 11), as the
 * kernel says Presmium runs git (`gitConfigArgs`, `gitEnvironment`): the
 * repository's hooks and fsmonitor off, so no script of the repository runs
 * when the workspace commits or reverts; commits are not signed. One
 * operation at a time per workspace: the index is shared.
 *
 * In SHARED mode (`isolated`, WP-91) git reads nothing the sandbox could
 * have written and no configuration but the repository's own (no filter,
 * diff or merge driver a document names), the git directory and work tree
 * fixed as found from the workspace root when the server started (a `.git`
 * planted in a document directory is never discovered). serve only reads
 * the work tree; what a revert writes there goes through `DOCUMENT_FILES`
 * (./revisions.ts).
 */
import { execFile, execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { gitConfigArgs, gitEnvironment, isolatedGitProblem } from '@presmium/kernel'

/** A git command's end: its status, its output as bytes and its errors. */
export interface GitResult {
  code: number
  stdout: Buffer
  stderr: string
}

export class Git {
  readonly root: string
  readonly isolated: boolean
  /** The work tree's top and the git directory, as found from the root (real paths). */
  readonly top: string
  readonly gitDir: string
  #queue: Promise<unknown> = Promise.resolve()

  constructor(root: string, isolated = false) {
    this.root = root
    this.isolated = isolated
    const found = execFileSync('git', [...gitConfigArgs(false), 'rev-parse', '--show-toplevel', '--absolute-git-dir'], { cwd: root, encoding: 'utf8', env: gitEnvironment(process.env, isolated) }).trim().split('\n')
    this.top = realpathSync(found[0]!)
    this.gitDir = realpathSync(resolve(root, found[1]!))
    if (isolated) {
      const problem = isolatedGitProblem(execFileSync('git', ['version'], { encoding: 'utf8', env: gitEnvironment(process.env, true) }))
      if (problem) throw new Error(problem)
    }
  }

  /** Whether the root is a git work tree (the editing features need one). */
  static isRepository(root: string): boolean {
    try {
      return execFileSync('git', [...gitConfigArgs(false), 'rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitEnvironment(process.env, false) }).trim() === 'true'
    } catch {
      return false
    }
  }

  /** `git <args>` at the root, with these further variables (e.g. a temporary index), resolving with its end. */
  run(command: string[], env: Record<string, string> = {}): Promise<GitResult> {
    return new Promise((done) => {
      execFile('git', [...gitConfigArgs(this.isolated), ...command], {
        cwd: this.root,
        encoding: 'buffer',
        maxBuffer: 1 << 30,
        env: { ...gitEnvironment(process.env, this.isolated, { gitDir: this.gitDir, top: this.top }), ...env },
      }, (error, stdout, stderr) => {
        const code = !error ? 0 : typeof error.code === 'number' ? error.code : 1
        done({ code, stdout, stderr: stderr.toString('utf8') })
      })
    })
  }

  /** `git <args>`; throws with git's message on a non-zero exit. */
  async raw(command: string[], env?: Record<string, string>): Promise<string> {
    const result = await this.run(command, env)
    if (result.code !== 0) throw new Error(result.stderr.trim() || `git ${command[0]} exited with ${result.code}`)
    return result.stdout.toString('utf8')
  }

  /** `git <args>`, resolving with the exit status rather than throwing. */
  async attempt(command: string[], env?: Record<string, string>): Promise<{ ok: boolean, output: string }> {
    const result = await this.run(command, env)
    return { ok: result.code === 0, output: result.code === 0 ? result.stdout.toString('utf8') : `${result.stderr}${result.stdout.toString('utf8')}` }
  }

  /** Runs `work` after the operations queued before it, so two never share the index. */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work)
    this.#queue = next.catch(() => undefined)
    return next
  }
}
