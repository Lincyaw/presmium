import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gitConfigArgs, gitEnvironment } from '@lincyaw/kernel'

export interface GitResult {
  code: number
  stdout: Buffer
  stderr: string
}

export class Git {
  readonly root: string
  readonly top: string
  readonly localHistory: boolean
  readonly #environment: Record<string, string>
  /** The process environment for git, made once: copying `process.env` on every call held the event loop. */
  #base?: Record<string, string>
  #queue: Promise<unknown> = Promise.resolve()

  constructor(root: string, history?: { directory: string, top: string }) {
    this.root = root
    this.localHistory = Boolean(history)
    this.#environment = history ? { GIT_DIR: history.directory, GIT_WORK_TREE: history.top } : {}
    this.top = history ? realpathSync(history.top) : realpathSync(execFileSync('git', [...gitConfigArgs(), 'rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', env: gitEnvironment(process.env) }).trim())
  }

  static isRepository(root: string): boolean {
    try {
      return execFileSync('git', [...gitConfigArgs(), 'rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitEnvironment(process.env) }).trim() === 'true'
    } catch {
      return false
    }
  }

  /** Prepare a new, empty authoring workspace; existing content needs its own real history baseline. */
  static async initialize(root: string): Promise<void> {
    if (Git.isRepository(root) || existsSync(join(root, '.git'))) return
    if (readdirSync(root).some(name => name !== '.DS_Store')) return
    await promisify(execFile)('git', [...gitConfigArgs(), 'init', '--quiet', '--initial-branch=main'], { cwd: root, env: gitEnvironment(process.env) })
    const git = new Git(root)
    const tree = await git.run(['hash-object', '-w', '-t', 'tree', '--stdin'], {}, new Uint8Array())
    if (tree.code !== 0) throw new Error(tree.stderr)
    const commit = (await git.output(['-c', 'user.name=Presmium', '-c', 'user.email=workspace@presmium.invalid', 'commit-tree', tree.stdout.toString('utf8').trim(), '-m', 'Initialize workspace history'])).trim()
    const ref = (await git.output(['symbolic-ref', 'HEAD'])).trim()
    await git.output(['update-ref', ref, commit, '0'.repeat(commit.length)])
  }

  run(command: string[], env: Record<string, string> = {}, input?: Uint8Array): Promise<GitResult> {
    return new Promise((done) => {
      let inputError: Error | undefined
      const child = execFile('git', [...gitConfigArgs(), ...command], {
        cwd: this.root,
        encoding: 'buffer',
        maxBuffer: 1 << 30,
        env: { ...this.#base ??= { ...gitEnvironment(process.env), ...this.#environment }, ...env },
      }, (error, stdout, stderr) => {
        const code = inputError ? 1 : !error ? 0 : typeof error.code === 'number' ? error.code : 1
        done({ code, stdout, stderr: stderr.toString('utf8') + (inputError?.message ?? '') })
      })
      if (input !== undefined) {
        if (child.stdin) {
          child.stdin.on('error', error => { inputError = error; child.kill() })
          child.stdin.end(input)
        } else { inputError = new Error('git stdin is unavailable'); child.kill() }
      }
    })
  }

  /** The command's output; throws when it fails. */
  async output(command: string[], env?: Record<string, string>): Promise<string> {
    const result = await this.run(command, env)
    if (result.code !== 0) throw new Error(result.stderr.trim() || `git ${command[0]} exited with ${result.code}`)
    return result.stdout.toString('utf8')
  }

  /** Whether the command succeeded, with its output, or its error output when it failed. */
  async tryOutput(command: string[], env?: Record<string, string>): Promise<{ ok: boolean, output: string }> {
    const result = await this.run(command, env)
    return { ok: result.code === 0, output: result.code === 0 ? result.stdout.toString('utf8') : `${result.stderr}${result.stdout.toString('utf8')}` }
  }

  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work)
    this.#queue = next.catch(() => undefined)
    return next
  }
}
