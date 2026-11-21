import { execFile, execFileSync, fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gitConfigArgs, gitEnvironment } from '@lincyaw/kernel'

export interface GitResult {
  code: number
  stdout: Buffer
  stderr: string
}

/**
 * Starting a child process from a large process holds its event loop for milliseconds, tens of them on a busy machine.
 * The git commands are therefore started by a small process of their own (`git-runner.mjs`, started with the first
 * command); this process only exchanges messages with it. Should the runner be unavailable, commands start here, one
 * per turn of the event loop, so that several never add up to one long pause.
 */
interface RunRequest { args: string[], cwd: string, env: Record<string, string>, input?: Uint8Array, maxBuffer: number }
interface Runner { child: ChildProcess, pending: Map<number, { request: RunRequest, done(result: GitResult): void }> }
let runner: Runner | undefined, nextRequest = 0
const RUNNER = fileURLToPath(new URL('./git-runner.mjs', import.meta.url))

function startRunner(): Runner | undefined {
  if (runner) return runner
  let child: ChildProcess
  try { child = fork(RUNNER, [], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'inherit', 'ipc'], execArgv: [] }) }
  catch { return undefined }
  const started: Runner = { child, pending: new Map() }
  const idle = () => { if (!started.pending.size) { child.unref(); (child.channel as { unref?(): void } | undefined)?.unref?.() } }
  child.on('message', (message: { id: number, code: number, stdout: Uint8Array, stderr: string }) => {
    const waiting = started.pending.get(message.id)
    started.pending.delete(message.id)
    idle()
    waiting?.done({ code: message.code, stdout: Buffer.from(message.stdout.buffer, message.stdout.byteOffset, message.stdout.byteLength), stderr: message.stderr })
  })
  const lost = () => {
    if (runner === started) runner = undefined
    // Commands the runner took but did not answer run here instead.
    for (const { request, done } of started.pending.values()) void runHere(request).then(done)
    started.pending.clear()
  }
  child.on('exit', lost)
  child.on('error', lost)
  idle()
  return runner = started
}

let lastSpawn: Promise<void> = Promise.resolve()
function spawnTurn(): Promise<void> {
  const turn = lastSpawn.then(() => new Promise<void>(next => setImmediate(next)))
  lastSpawn = turn
  return turn
}

async function runHere(request: RunRequest): Promise<GitResult> {
  await spawnTurn()
  return new Promise((done) => {
    let inputError: Error | undefined
    const child = execFile('git', request.args, { cwd: request.cwd, encoding: 'buffer', maxBuffer: request.maxBuffer, env: request.env }, (error, stdout, stderr) => {
      const code = inputError ? 1 : !error ? 0 : typeof error.code === 'number' ? error.code : 1
      done({ code, stdout, stderr: stderr.toString('utf8') + (inputError?.message ?? '') })
    })
    if (request.input !== undefined) {
      if (child.stdin) {
        child.stdin.on('error', error => { inputError = error; child.kill() })
        child.stdin.end(request.input)
      } else { inputError = new Error('git stdin is unavailable'); child.kill() }
    }
  })
}

function runGit(request: RunRequest): Promise<GitResult> {
  const started = startRunner()
  if (!started?.child.connected) return runHere(request)
  return new Promise((done) => {
    const id = nextRequest++
    started.pending.set(id, { request, done })
    started.child.ref(); (started.child.channel as { ref?(): void } | undefined)?.ref?.()
    try { started.child.send({ id, ...request }) }
    catch { started.pending.delete(id); void runHere(request).then(done) }
  })
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
    return runGit({ args: [...gitConfigArgs(), ...command], cwd: this.root, maxBuffer: 1 << 30, env: { ...this.#base ??= { ...gitEnvironment(process.env), ...this.#environment }, ...env }, ...input !== undefined ? { input } : {} })
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
