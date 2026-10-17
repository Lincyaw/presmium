/**
 * git for the workspace (docs/architecture.md 4.8, 10.7, section 11): every
 * command runs with the repository's hooks and fsmonitor off
 * (`-c core.hooksPath=/dev/null -c core.fsmonitor=false`), so no script of
 * the repository runs when the workspace commits or reverts; commits are
 * not signed. One operation at a time per workspace: the index is shared.
 *
 * In SHARED mode (`isolated`, WP-91) git reads nothing the sandbox could
 * have written and no configuration but the repository's own: no system or
 * global configuration, no attributes but the repository's
 * `info/attributes` (those of the work tree are read from the empty tree:
 * no filter, diff or merge driver a document names), the git directory and
 * work tree fixed as found from the workspace root when the server started
 * (a `.git` planted in a document directory is never discovered), and no
 * inherited `GIT_*` variable. serve only reads the work tree; what a revert
 * writes there goes through `DOCUMENT_FILES` (./revisions.ts).
 */
import { execFile, execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/** The configuration every command of the workspace runs with. */
export const SAFE_CONFIG = ['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'commit.gpgSign=false', 'tag.gpgSign=false']

/** Further configuration in SHARED mode: no global attributes, nothing done in submodules. */
const ISOLATED_CONFIG = ['core.attributesFile=/dev/null', 'core.quotePath=false', 'submodule.recurse=false', 'diff.ignoreSubmodules=all']

/** The empty tree: SHARED reads the work tree's attributes from it, that is, none (`GIT_ATTR_SOURCE`). */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** The oldest git that honors `GIT_ATTR_SOURCE` (2.42) and has `merge-tree --write-tree --merge-base` (2.40). */
const ISOLATED_GIT = [2, 42]

const args = (config: string[]) => config.flatMap(entry => ['-c', entry])

/** The environment of git: this process's without its `GIT_*` variables; in SHARED mode without system or global configuration and the work tree's attributes. */
function environment(isolated: boolean, dirs?: { gitDir: string, top: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) if (!/^GIT_/i.test(name)) env[name] = value
  env.GIT_TERMINAL_PROMPT = '0'
  if (!isolated) return env
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_ATTR_SOURCE: EMPTY_TREE,
    ...dirs ? { GIT_DIR: dirs.gitDir, GIT_WORK_TREE: dirs.top } : {},
  }
}

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
    const found = execFileSync('git', [...args(SAFE_CONFIG), 'rev-parse', '--show-toplevel', '--absolute-git-dir'], { cwd: root, encoding: 'utf8', env: environment(isolated) }).trim().split('\n')
    this.top = realpathSync(found[0]!)
    this.gitDir = realpathSync(resolve(root, found[1]!))
    if (isolated) {
      const version = /(\d+)\.(\d+)/.exec(execFileSync('git', ['version'], { encoding: 'utf8', env: environment(true) }))
      const [major = 0, minor = 0] = version ? [Number(version[1]), Number(version[2])] : []
      if (major < ISOLATED_GIT[0]! || (major === ISOLATED_GIT[0] && minor < ISOLATED_GIT[1]!)) {
        throw new Error(`SHARED mode needs git ${ISOLATED_GIT.join('.')} or later (GIT_ATTR_SOURCE, merge-tree --merge-base); this is ${version?.[0] ?? 'unknown'}`)
      }
    }
  }

  /** Whether the root is a git work tree (the editing features need one). */
  static isRepository(root: string): boolean {
    try {
      return execFileSync('git', [...args(SAFE_CONFIG), 'rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: environment(false) }).trim() === 'true'
    } catch {
      return false
    }
  }

  /** `git <args>` at the root, with these further variables (e.g. a temporary index), resolving with its end. */
  run(command: string[], env: Record<string, string> = {}): Promise<GitResult> {
    return new Promise((done) => {
      execFile('git', [...args(SAFE_CONFIG), ...this.isolated ? args(ISOLATED_CONFIG) : [], ...command], {
        cwd: this.root,
        encoding: 'buffer',
        maxBuffer: 1 << 30,
        env: { ...environment(this.isolated, { gitDir: this.gitDir, top: this.top }), ...env },
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
