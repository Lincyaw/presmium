import { execFile, execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { gitConfigArgs, gitEnvironment } from '@lincyaw/kernel'

export interface GitResult {
  code: number
  stdout: Buffer
  stderr: string
}

export class Git {
  readonly root: string
  readonly top: string
  #queue: Promise<unknown> = Promise.resolve()

  constructor(root: string) {
    this.root = root
    this.top = realpathSync(execFileSync('git', [...gitConfigArgs(), 'rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', env: gitEnvironment(process.env) }).trim())
  }

  static isRepository(root: string): boolean {
    try {
      return execFileSync('git', [...gitConfigArgs(), 'rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitEnvironment(process.env) }).trim() === 'true'
    } catch {
      return false
    }
  }

  static ignores(dir: string, path: string): boolean {
    try {
      execFileSync('git', [...gitConfigArgs(), 'check-ignore', '-q', '--', path], { cwd: dir, stdio: 'ignore', env: gitEnvironment(process.env) })
      return true
    } catch {
      return false
    }
  }

  run(command: string[], env: Record<string, string> = {}): Promise<GitResult> {
    return new Promise((done) => {
      execFile('git', [...gitConfigArgs(), ...command], {
        cwd: this.root,
        encoding: 'buffer',
        maxBuffer: 1 << 30,
        env: { ...gitEnvironment(process.env), ...env },
      }, (error, stdout, stderr) => {
        const code = !error ? 0 : typeof error.code === 'number' ? error.code : 1
        done({ code, stdout, stderr: stderr.toString('utf8') })
      })
    })
  }

  async raw(command: string[], env?: Record<string, string>): Promise<string> {
    const result = await this.run(command, env)
    if (result.code !== 0) throw new Error(result.stderr.trim() || `git ${command[0]} exited with ${result.code}`)
    return result.stdout.toString('utf8')
  }

  async attempt(command: string[], env?: Record<string, string>): Promise<{ ok: boolean, output: string }> {
    const result = await this.run(command, env)
    return { ok: result.code === 0, output: result.code === 0 ? result.stdout.toString('utf8') : `${result.stderr}${result.stdout.toString('utf8')}` }
  }

  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work)
    this.#queue = next.catch(() => undefined)
    return next
  }
}
